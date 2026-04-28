/**
 * Single-File Component (.vue / .svelte) script + template extractor.
 *
 * Extracts the <script> block (with line offset preserved) so it can be
 * parsed by the existing JS/TS tree-sitter grammar. Template-side symbol
 * references are extracted via lightweight regex.
 *
 * Coverage realism:
 *  - <script> + <script setup>: full TS/JS symbol + edge extraction
 *  - <script context="module">: same (Svelte-specific)
 *  - Template refs: regex-based (e.g., @click="foo", :prop="bar", {{ baz }}, on:click={qux})
 *    Captures method/computed references but doesn't model template scoping.
 *  - Style block: ignored (CSS isn't part of the code graph).
 *
 * Why this design (vs. full Vue/Svelte tree-sitter grammar):
 *  - Avoids new WASM bundles + multi-grammar stitching complexity.
 *  - 80% of useful symbols live in <script>, which is plain TS/JS.
 *  - Template refs as regex is "good enough" for blast-radius queries
 *    (the goal of code-graph for refactoring).
 */

const SCRIPT_BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/**
 * Detect whether a script block is TypeScript.
 * Recognises lang="ts", lang='ts', lang=ts, type="text/typescript".
 */
function isTypescriptAttrs(attrs) {
  if (!attrs) return false;
  return /\blang\s*=\s*["']?(?:ts|typescript)\b/i.test(attrs)
      || /\btype\s*=\s*["']text\/typescript\b/i.test(attrs);
}

/**
 * Compute 1-based line number of a byte offset in `text`.
 */
function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Extract all <script> blocks with their language + line offset.
 * Returns array of { code, lang, lineOffset, byteStart, byteEnd }
 *   - code: raw script content
 *   - lang: 'typescript' | 'javascript'
 *   - lineOffset: 1-based line number where the script CONTENT starts
 *     (so symbol.startLine + lineOffset - 1 = original SFC line)
 */
export function extractScriptBlocks(source) {
  const blocks = [];
  let m;
  SCRIPT_BLOCK_RE.lastIndex = 0;
  while ((m = SCRIPT_BLOCK_RE.exec(source)) !== null) {
    const [full, attrs, code] = m;
    const codeStart = m.index + full.indexOf('>') + 1;
    const lineOffset = lineAt(source, codeStart);
    blocks.push({
      code,
      lang: isTypescriptAttrs(attrs) ? 'typescript' : 'javascript',
      lineOffset,
      byteStart: codeStart,
      byteEnd: codeStart + code.length,
    });
  }
  return blocks;
}

/**
 * Extract template-side symbol references via lightweight regex.
 * Returns array of { name, line } where line is 1-based in the original SFC.
 *
 * Patterns covered:
 *   Vue:    @click="foo"   :prop="bar"   v-on:click="qux"   v-bind:x="y"   {{ x }}   {{ x() }}   @click="x.y"
 *   Svelte: on:click={foo}   bind:value={bar}   {qux}   {qux()}
 *
 * Filters out language keywords + control-flow tokens; keeps identifiers.
 */
const KEYWORDS = new Set([
  'true', 'false', 'null', 'undefined', 'this', 'else', 'if', 'for', 'in', 'of',
  'and', 'or', 'not', 'return', 'await', 'async', 'new', 'typeof', 'void',
  'each', 'as', '$state', '$derived', '$effect', '$props', '$inspect',
]);

const TEMPLATE_REF_PATTERNS = [
  // Vue directive: @event="expr" or v-on:event="expr"
  /(?:@|v-on:)[\w.-]+\s*=\s*"([^"]+)"/g,
  /(?:@|v-on:)[\w.-]+\s*=\s*'([^']+)'/g,
  // Vue bind: :prop="expr" or v-bind:prop="expr"
  /(?::[\w-]+|v-bind:[\w-]+)\s*=\s*"([^"]+)"/g,
  // Vue interpolation {{ expr }}
  /\{\{\s*([^}]+?)\s*\}\}/g,
  // Svelte attr/event: on:event={expr}, bind:prop={expr}, prop={expr}
  /(?:on:|bind:)[\w-]+\s*=\s*\{([^}]+)\}/g,
  // Svelte interpolation: {expr} (in template area only — handled below by skipping <script>)
];

/**
 * Strip <script>...</script> blocks before scanning template refs
 * (so we don't pick up { } in JS code).
 */
function stripScripts(source) {
  return source.replace(SCRIPT_BLOCK_RE, (m) => '\n'.repeat((m.match(/\n/g) || []).length));
}

const IDENT_RE = /[A-Za-z_$][\w$]*/g;

export function extractTemplateRefs(source) {
  const stripped = stripScripts(source);
  const refs = [];
  const seen = new Set(); // dedupe by `name@line`

  for (const pat of TEMPLATE_REF_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(stripped)) !== null) {
      const expr = m[1];
      if (!expr) continue;
      const exprStart = m.index + m[0].indexOf(expr);
      const lineForExpr = lineAt(stripped, exprStart);
      // Pull identifiers from the expression
      IDENT_RE.lastIndex = 0;
      let id;
      while ((id = IDENT_RE.exec(expr)) !== null) {
        const name = id[0];
        if (KEYWORDS.has(name)) continue;
        if (/^\d/.test(name)) continue;
        const key = `${name}@${lineForExpr}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ name, line: lineForExpr });
      }
    }
  }
  // Svelte plain-text {expr} in template — only outside <script>
  // Match top-level braces (not preceded by quotes/equals)
  const SVELTE_INLINE_RE = /(^|[^"'=])\{\s*([A-Za-z_$][\w$.]*)(?:\s*\([^)]*\))?\s*\}/g;
  let m;
  while ((m = SVELTE_INLINE_RE.exec(stripped)) !== null) {
    const head = m[2];
    const name = head.split('.')[0];
    if (KEYWORDS.has(name) || /^\d/.test(name)) continue;
    const lineFor = lineAt(stripped, m.index + m[0].indexOf('{'));
    const key = `${name}@${lineFor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ name, line: lineFor });
  }
  return refs;
}
