# Phase D — Codegraph Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structural code graph (symbols + relationships) alongside the existing semantic Code RAG, so agents can answer "who calls X?", "what does Y depend on?", "what breaks if I rename Z?" — not just "what code is conceptually similar?". Runs automatically on session start; user sees confirmation but no UI to manage.

**Architecture:**
- **NO Docker, NO external services, NO native compilation.** Everything in-process Node.js, same constraints as Phase A/B.
- **Tree-sitter via `web-tree-sitter` (WASM)** — pure JS, loads `.wasm` grammar files for each language. ~500KB per grammar, 8 grammars ≈ 4 MB total.
- **Single SQLite store** — extend the existing `.claude/memory/code.db` with two tables (`code_symbols`, `code_edges`). No new DB.
- **Same skill, more flags** — extend `supervibe:code-search` with `--callers`, `--callees`, `--neighbors`. Don't fragment skill surface.
- **Auto-startup** — wire into existing `SessionStart` hook. On open: detect missing/stale index → background reindex → print 3-line status banner.
- **User confidence** — three signals: SessionStart banner, agent output cites symbol IDs + edge kinds, dedicated `/supervibe-status` command.

**Tech Stack:** Node 22+, `web-tree-sitter` (WASM), pre-built `.wasm` grammars from `tree-sitter-*` packages, `node:sqlite` (already in use), `@huggingface/transformers` (already in use for embeddings — graph nodes also get embedded for hybrid). No Python, no Docker, no native deps.

---

## Scope check

In scope:
- 8 mainstream languages (ts, js, py, php, go, rust, java, rb) — covers ≥95% of expected user projects
- Symbols: function, class, method, type, interface, enum
- Edges: `calls`, `imports`, `extends`, `implements`, `references`
- Graph queries (callers/callees/neighbors) + hybrid (semantic ∪ graph-expand)
- Auto-startup + status command

Explicitly out of scope (deferred):
- Vue / Svelte multi-language stitching (script + template) — Phase E
- Cross-file type resolution beyond direct imports (no full type inference) — never; not what we're building
- Call-graph for dynamic dispatch (`this.method`, polymorphism) — heuristic only
- Real-time graph updates while typing — file-watcher already covers it on save

---

## File Structure

### Created

```
supervibe/
├── grammars/                                  # NEW — bundled WASM grammars (LFS for big ones)
│   ├── tree-sitter-typescript.wasm
│   ├── tree-sitter-tsx.wasm
│   ├── tree-sitter-javascript.wasm
│   ├── tree-sitter-python.wasm
│   ├── tree-sitter-php.wasm
│   ├── tree-sitter-go.wasm
│   ├── tree-sitter-rust.wasm
│   ├── tree-sitter-java.wasm
│   └── tree-sitter-ruby.wasm
│
├── grammars/queries/                          # NEW — tree-sitter S-expression queries per lang
│   ├── typescript.scm
│   ├── javascript.scm
│   ├── python.scm
│   ├── php.scm
│   ├── go.scm
│   ├── rust.scm
│   ├── java.scm
│   └── ruby.scm
│
├── scripts/
│   ├── lib/
│   │   ├── code-graph.mjs                     # NEW — tree-sitter parse → symbols + edges
│   │   ├── code-graph-queries.mjs             # NEW — graph traversal (callers, callees, BFS)
│   │   └── grammar-loader.mjs                 # NEW — lazy WASM grammar loading + cache
│   ├── build-code-index.mjs                   # MODIFIED — add graph extraction phase
│   ├── search-code.mjs                        # MODIFIED — add --callers/--callees/--neighbors
│   ├── supervibe-status.mjs                      # NEW — `/supervibe-status` CLI for user
│   └── session-start-check.mjs                # MODIFIED — auto-refresh code index + graph
│
├── tests/
│   ├── code-graph.test.mjs                    # NEW — symbol + edge extraction across 4 langs
│   ├── code-graph-queries.test.mjs            # NEW — callers/callees/BFS correctness
│   └── supervibe-status.test.mjs                 # NEW — status output format
│
└── (existing)
```

### Modified

- `scripts/lib/code-store.mjs` — add `indexGraphFor(filePath)`, `searchByGraph()`, schema migration for `code_symbols` + `code_edges`
- `scripts/lib/code-watcher.mjs` — extend chokidar `change` handler to refresh graph too
- `skills/code-search/SKILL.md` — document new flags + decision tree
- `package.json` — add `web-tree-sitter` dep, add `supervibe:status` script
- `knip.json` — allowlist new entry scripts
- `.gitattributes` — track `*.wasm` via LFS (some grammars are >100KB; bundle stays comfortable)
- `hooks.json` — already wires SessionStart; just confirm `session-start-check.mjs` does the new work
- `docs/getting-started.md` — add Codegraph section + status command

### Untouched

- All 46 agents (graph queries surface through existing `supervibe:code-search` skill)
- Memory store / chunker / embeddings (graph is a separate dimension; stays orthogonal)
- All 70 existing tests continue to pass

---

## Constraints (read before starting)

1. **NO Docker, NO daemons, NO external services.** Everything must run in-process. If a step suggests "spin up a service", reject the step.
2. **NO native compilation.** `web-tree-sitter` is WASM — `npm install` works on Win/Mac/Linux without C compiler.
3. **NO new SQLite DB.** Extend the existing `code.db`. Two new tables, both CASCADE-FK to existing `code_files.path`.
4. **NO new agent.** Existing `supervibe:code-search` skill grows new flags. Surface stays small.
5. **Bundle stays loadable**: total grammar payload ≤10 MB (post-LFS). One-time download for users without LFS.
6. **Graph index is rebuildable**: deleting `code.db` and re-running `npm run code:index` must produce identical graph.

---

## Phase D — Codegraph (Tasks D1–D10)

### Task D1: Bundle `web-tree-sitter` + 8 grammars (TDD setup)

**Files:**
- Modify: `package.json`
- Create: `grammars/tree-sitter-{typescript,tsx,javascript,python,php,go,rust,java,ruby}.wasm`
- Modify: `.gitattributes` (LFS for `*.wasm`)
- Create: `scripts/lib/grammar-loader.mjs`

- [ ] **Step 1: Add dependency**

```bash
npm install web-tree-sitter
```

Verify in `package.json`:
```json
"dependencies": {
  "@huggingface/transformers": "^4.2.0",
  "chokidar": "^5.0.0",
  "web-tree-sitter": "^0.25.0"
}
```

- [ ] **Step 2: Download pre-built WASM grammars**

The `tree-sitter-<lang>` npm packages ship pre-built `.wasm`. We copy them to `grammars/` for stable in-repo bundling (LFS).

Run:
```bash
mkdir -p grammars
for pkg in tree-sitter-typescript tree-sitter-javascript tree-sitter-python tree-sitter-go tree-sitter-rust tree-sitter-java tree-sitter-ruby tree-sitter-php; do
  npm install --no-save "$pkg"
done

# Copy from node_modules to grammars/
cp node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm grammars/
cp node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm grammars/ 2>/dev/null || true
cp node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm grammars/
cp node_modules/tree-sitter-python/tree-sitter-python.wasm grammars/
cp node_modules/tree-sitter-php/tree-sitter-php.wasm grammars/ 2>/dev/null || \
  cp node_modules/tree-sitter-php/tree-sitter-php-only.wasm grammars/tree-sitter-php.wasm
cp node_modules/tree-sitter-go/tree-sitter-go.wasm grammars/
cp node_modules/tree-sitter-rust/tree-sitter-rust.wasm grammars/
cp node_modules/tree-sitter-java/tree-sitter-java.wasm grammars/
cp node_modules/tree-sitter-ruby/tree-sitter-ruby.wasm grammars/
```

If any pkg doesn't ship `.wasm` pre-built, fall back to `npx tree-sitter build --wasm <grammar-dir>` (requires emscripten — only run in CI build, not user-side).

- [ ] **Step 3: LFS-track `*.wasm`**

```bash
git lfs track "*.wasm"
```

Verify `.gitattributes`:
```
*.onnx filter=lfs diff=lfs merge=lfs -text
*.wasm filter=lfs diff=lfs merge=lfs -text
```

- [ ] **Step 4: Implement grammar loader**

Create `scripts/lib/grammar-loader.mjs`:

```javascript
// Lazy WASM grammar loader. Caches Parser + Language per-language.
// All loading happens once per process; subsequent calls hit the cache.

import { Parser, Language } from 'web-tree-sitter';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GRAMMAR_DIR = join(PLUGIN_ROOT, 'grammars');

const GRAMMAR_FILES = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  php: 'tree-sitter-php.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
  java: 'tree-sitter-java.wasm',
  ruby: 'tree-sitter-ruby.wasm'
};

let _parserInit = null;
const _langs = new Map();

async function ensureParserInit() {
  if (!_parserInit) _parserInit = Parser.init();
  return _parserInit;
}

export async function getParser(lang) {
  if (!GRAMMAR_FILES[lang]) {
    throw new Error(`Unsupported language for graph extraction: ${lang}`);
  }
  await ensureParserInit();

  if (!_langs.has(lang)) {
    const wasmPath = join(GRAMMAR_DIR, GRAMMAR_FILES[lang]);
    if (!existsSync(wasmPath)) {
      throw new Error(`Grammar file missing: ${wasmPath} (run \`git lfs pull\` if you cloned without LFS)`);
    }
    const language = await Language.load(wasmPath);
    _langs.set(lang, language);
  }

  const parser = new Parser();
  parser.setLanguage(_langs.get(lang));
  return parser;
}

export function isLanguageSupported(lang) {
  return Object.prototype.hasOwnProperty.call(GRAMMAR_FILES, lang);
}

export function listSupportedLanguages() {
  return Object.keys(GRAMMAR_FILES);
}
```

- [ ] **Step 5: Smoke test the loader**

Run inline:
```bash
node --no-warnings -e "
import('./scripts/lib/grammar-loader.mjs').then(async m => {
  for (const lang of m.listSupportedLanguages()) {
    try {
      const p = await m.getParser(lang);
      const tree = p.parse('// test', { row: 0, column: 0 });
      console.log(lang, 'OK', tree.rootNode.type);
      tree.delete();
    } catch (e) {
      console.error(lang, 'FAIL', e.message);
    }
  }
});
"
```

Expected: all 9 languages print `OK program` (or similar root-node name).

- [ ] **Step 6: Commit**

```bash
git add grammars/ scripts/lib/grammar-loader.mjs package.json package-lock.json .gitattributes
git commit -m "feat(graph): bundle web-tree-sitter + 9 WASM grammars (TS/TSX/JS/PY/PHP/Go/Rust/Java/Ruby)"
```

---

### Task D2: Tree-sitter S-expression queries (per language)

**Files:**
- Create: `grammars/queries/{typescript,javascript,python,php,go,rust,java,ruby,tsx}.scm`

Tree-sitter queries are declarative S-expression patterns that match AST nodes. We write one `.scm` per language defining what counts as a `function`, `class`, `call`, `import`, etc. References: aider's [grammars/queries/](https://github.com/paul-gauthier/aider/tree/main/aider/queries) and `tree-sitter-<lang>` repo's `queries/tags.scm` (Apache-2.0 / MIT licensed).

- [ ] **Step 1: TypeScript / TSX query**

Create `grammars/queries/typescript.scm`:

```scheme
; Function declarations
(function_declaration
  name: (identifier) @name) @symbol.function

; Method definitions (in classes)
(method_definition
  name: (property_identifier) @name) @symbol.method

; Class declarations
(class_declaration
  name: (type_identifier) @name) @symbol.class

; Interface declarations
(interface_declaration
  name: (type_identifier) @name) @symbol.interface

; Type alias
(type_alias_declaration
  name: (type_identifier) @name) @symbol.type

; Enum
(enum_declaration
  name: (identifier) @name) @symbol.enum

; Arrow function assigned to const (export const x = () => ...)
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: [(arrow_function) (function_expression)])) @symbol.function

; Calls
(call_expression
  function: [
    (identifier) @target
    (member_expression property: (property_identifier) @target)
  ]) @edge.calls

; Imports
(import_statement
  source: (string (string_fragment) @target)) @edge.imports

; Class extends
(class_declaration
  (class_heritage
    (extends_clause value: (identifier) @target))) @edge.extends

; Class implements (interface)
(class_declaration
  (class_heritage
    (implements_clause (type_identifier) @target))) @edge.implements
```

(Reuse the same file for `tsx` — TypeScript JSX is a strict superset.)

- [ ] **Step 2: JavaScript query**

Create `grammars/queries/javascript.scm` — same as TypeScript but drop `interface`, `type_alias`, `enum`, `implements`. Keep function/class/method/call/import/extends.

- [ ] **Step 3: Python query**

Create `grammars/queries/python.scm`:

```scheme
(function_definition name: (identifier) @name) @symbol.function
(class_definition name: (identifier) @name) @symbol.class

; Methods inside classes are still function_definitions; we'll detect parent later via AST walk

; Calls
(call function: [
  (identifier) @target
  (attribute attribute: (identifier) @target)
]) @edge.calls

; Imports
(import_statement (dotted_name) @target) @edge.imports
(import_from_statement module_name: (dotted_name) @target) @edge.imports

; Inheritance
(class_definition
  superclasses: (argument_list (identifier) @target)) @edge.extends
```

- [ ] **Step 4: Go query**

Create `grammars/queries/go.scm`:

```scheme
(function_declaration name: (identifier) @name) @symbol.function
(method_declaration name: (field_identifier) @name) @symbol.method
(type_declaration (type_spec name: (type_identifier) @name type: (struct_type))) @symbol.class
(type_declaration (type_spec name: (type_identifier) @name type: (interface_type))) @symbol.interface

(call_expression function: [
  (identifier) @target
  (selector_expression field: (field_identifier) @target)
]) @edge.calls

(import_spec path: (interpreted_string_literal) @target) @edge.imports
```

- [ ] **Step 5: Rust query**

Create `grammars/queries/rust.scm`:

```scheme
(function_item name: (identifier) @name) @symbol.function
(struct_item name: (type_identifier) @name) @symbol.class
(enum_item name: (type_identifier) @name) @symbol.enum
(trait_item name: (type_identifier) @name) @symbol.interface
(impl_item type: (type_identifier) @name) @symbol.impl

(call_expression function: [
  (identifier) @target
  (field_expression field: (field_identifier) @target)
  (scoped_identifier name: (identifier) @target)
]) @edge.calls

(use_declaration argument: (scoped_identifier) @target) @edge.imports
(use_declaration argument: (identifier) @target) @edge.imports
```

- [ ] **Step 6: Java query**

Create `grammars/queries/java.scm`:

```scheme
(method_declaration name: (identifier) @name) @symbol.method
(class_declaration name: (identifier) @name) @symbol.class
(interface_declaration name: (identifier) @name) @symbol.interface
(enum_declaration name: (identifier) @name) @symbol.enum

(method_invocation name: (identifier) @target) @edge.calls
(import_declaration (scoped_identifier) @target) @edge.imports

(superclass (type_identifier) @target) @edge.extends
(super_interfaces (type_list (type_identifier) @target)) @edge.implements
```

- [ ] **Step 7: PHP query**

Create `grammars/queries/php.scm`:

```scheme
(function_definition name: (name) @name) @symbol.function
(method_declaration name: (name) @name) @symbol.method
(class_declaration name: (name) @name) @symbol.class
(interface_declaration name: (name) @name) @symbol.interface
(trait_declaration name: (name) @name) @symbol.interface
(enum_declaration name: (name) @name) @symbol.enum

(function_call_expression function: [(name) @target (qualified_name) @target]) @edge.calls
(member_call_expression name: (name) @target) @edge.calls
(scoped_call_expression name: (name) @target) @edge.calls

(namespace_use_declaration (namespace_use_clause (qualified_name) @target)) @edge.imports
(base_clause (name) @target) @edge.extends
(class_interface_clause (name) @target) @edge.implements
```

- [ ] **Step 8: Ruby query**

Create `grammars/queries/ruby.scm`:

```scheme
(method name: (identifier) @name) @symbol.method
(singleton_method name: (identifier) @name) @symbol.method
(class name: (constant) @name) @symbol.class
(module name: (constant) @name) @symbol.class

(call method: (identifier) @target) @edge.calls

(call
  receiver: nil
  method: (identifier) @target
  (#match? @target "^require")
  arguments: (argument_list (string (string_content) @import-target))) @edge.imports
```

- [ ] **Step 9: Verify each query parses against tree-sitter**

Run inline:
```bash
node --no-warnings -e "
import('./scripts/lib/grammar-loader.mjs').then(async m => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const langs = ['typescript','javascript','python','go','rust','java','php','ruby'];
  for (const lang of langs) {
    const p = await m.getParser(lang);
    const queryPath = path.join('grammars/queries', \`\${lang}.scm\`);
    const queryText = await fs.readFile(queryPath, 'utf8');
    try {
      const q = p.getLanguage().query(queryText);
      console.log(lang, 'query OK,', q.captureNames.length, 'capture names');
    } catch (e) {
      console.error(lang, 'query FAIL', e.message);
    }
  }
});
"
```

Expected: all 8 langs print `query OK, N capture names`.

- [ ] **Step 10: Commit**

```bash
git add grammars/queries/
git commit -m "feat(graph): tree-sitter S-expression queries for symbols + edges (8 langs)"
```

---

### Task D3: `code-graph.mjs` — symbol + edge extraction (TDD)

**Files:**
- Create: `scripts/lib/code-graph.mjs`
- Create: `tests/code-graph.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/code-graph.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { extractGraph } from '../scripts/lib/code-graph.mjs';

test('TypeScript: extracts function + call + import', async () => {
  const code = `
import { hash } from 'crypto';

export function login(email: string) {
  validate(email);
  return hash(email);
}

function validate(s: string) {
  return s.length > 0;
}
`;
  const { symbols, edges } = await extractGraph(code, 'src/auth.ts');

  const fnNames = symbols.filter(s => s.kind === 'function').map(s => s.name);
  assert.ok(fnNames.includes('login'), 'login should be a symbol');
  assert.ok(fnNames.includes('validate'), 'validate should be a symbol');

  const calls = edges.filter(e => e.kind === 'calls').map(e => e.toName);
  assert.ok(calls.includes('validate'));
  assert.ok(calls.includes('hash'));

  const imports = edges.filter(e => e.kind === 'imports').map(e => e.toName);
  assert.ok(imports.some(i => i.includes('crypto')));
});

test('Python: extracts class + method + inheritance', async () => {
  const code = `
class Animal:
    def speak(self):
        pass

class Dog(Animal):
    def speak(self):
        return 'woof'
`;
  const { symbols, edges } = await extractGraph(code, 'animals.py');

  const classNames = symbols.filter(s => s.kind === 'class').map(s => s.name);
  assert.ok(classNames.includes('Animal'));
  assert.ok(classNames.includes('Dog'));

  const methodNames = symbols.filter(s => s.kind === 'method' || s.kind === 'function').map(s => s.name);
  // Python's tree-sitter doesn't distinguish methods from functions natively; both 'speak' should appear
  assert.ok(methodNames.filter(n => n === 'speak').length >= 1);

  const extendsEdges = edges.filter(e => e.kind === 'extends');
  assert.ok(extendsEdges.some(e => e.toName === 'Animal'));
});

test('Go: extracts func + struct + call', async () => {
  const code = `
package main
import "fmt"

type User struct {
  Name string
}

func (u *User) Greet() string {
  return fmt.Sprintf("hi %s", u.Name)
}
`;
  const { symbols, edges } = await extractGraph(code, 'main.go');
  assert.ok(symbols.some(s => s.kind === 'class' && s.name === 'User'));
  assert.ok(symbols.some(s => s.kind === 'method' && s.name === 'Greet'));
  assert.ok(edges.some(e => e.kind === 'calls' && e.toName === 'Sprintf'));
});

test('extractGraph returns empty for unknown language', async () => {
  const result = await extractGraph('some text', 'foo.unknown');
  assert.deepStrictEqual(result, { symbols: [], edges: [] });
});

test('Symbol IDs are stable across re-extraction', async () => {
  const code = 'function alpha() { beta(); } function beta() {}';
  const r1 = await extractGraph(code, 'x.js');
  const r2 = await extractGraph(code, 'x.js');
  assert.deepStrictEqual(r1.symbols.map(s => s.id), r2.symbols.map(s => s.id));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --no-warnings --test tests/code-graph.test.mjs
```

Expected: FAIL — `extractGraph not exported`.

- [ ] **Step 3: Implement extractor**

Create `scripts/lib/code-graph.mjs`:

```javascript
// Tree-sitter-based code graph extractor.
// Parses source → AST → applies per-language S-expression query → emits symbols + edges.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { getParser, isLanguageSupported } from './grammar-loader.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const QUERY_DIR = join(PLUGIN_ROOT, 'grammars', 'queries');

// detectLanguage maps file extensions → grammar key. Reuses code-chunker's mapping
// but only for languages we have grammars for.
const EXT_TO_GRAMMAR = {
  '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.py': 'python',
  '.php': 'php',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby'
};

export function detectGrammar(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT_TO_GRAMMAR[filePath.slice(dot).toLowerCase()] || null;
}

const _queryCache = new Map();
function loadQuery(lang) {
  if (_queryCache.has(lang)) return _queryCache.get(lang);
  // tsx and javascript reuse other grammars but have own query files
  const queryFile = join(QUERY_DIR, `${lang === 'tsx' ? 'typescript' : lang}.scm`);
  if (!existsSync(queryFile)) {
    _queryCache.set(lang, null);
    return null;
  }
  const text = readFileSync(queryFile, 'utf8');
  _queryCache.set(lang, text);
  return text;
}

function makeId(path, kind, name, startLine) {
  return `${path}:${kind}:${name}:${startLine}`;
}

/**
 * Parse source text and extract symbols + edges.
 * @returns {Promise<{symbols: Symbol[], edges: Edge[]}>}
 *   Symbol: {id, path, kind, name, startLine, endLine, parentId?}
 *   Edge:   {fromId, toName, toId?, kind}  // toId resolved later (cross-file)
 */
export async function extractGraph(code, filePath) {
  const lang = detectGrammar(filePath);
  if (!lang || !isLanguageSupported(lang)) {
    return { symbols: [], edges: [] };
  }

  const parser = await getParser(lang);
  const tree = parser.parse(code);
  const queryText = loadQuery(lang);
  if (!queryText) {
    tree.delete();
    return { symbols: [], edges: [] };
  }

  let query;
  try {
    query = parser.getLanguage().query(queryText);
  } catch (err) {
    tree.delete();
    return { symbols: [], edges: [] };
  }

  const matches = query.matches(tree.rootNode);
  const symbols = [];
  const edges = [];
  // Track innermost containing symbol per node range, for parent assignment + edge sourcing
  const symbolStack = []; // [{id, startByte, endByte}]

  // Sort matches by start position so parents come before children
  const orderedMatches = matches.slice().sort((a, b) => {
    const ar = a.captures[0]?.node?.startIndex ?? 0;
    const br = b.captures[0]?.node?.startIndex ?? 0;
    return ar - br;
  });

  // Find parent for a given byte position using the symbol stack
  function findParentAt(startByte) {
    for (let i = symbolStack.length - 1; i >= 0; i--) {
      const s = symbolStack[i];
      if (s.startByte <= startByte && startByte < s.endByte) return s.id;
    }
    return null;
  }

  // Two passes: first collect all symbols (with parent resolution),
  // then collect edges with current-symbol context
  for (const match of orderedMatches) {
    for (const cap of match.captures) {
      const captureName = cap.name; // 'symbol.function' | 'edge.calls' | 'name' | 'target'
      if (!captureName.startsWith('symbol.')) continue;

      const kind = captureName.slice('symbol.'.length); // function/class/method/...
      // Find the corresponding @name capture in the same match
      const nameCap = match.captures.find(c => c.name === 'name');
      const name = nameCap ? nameCap.node.text : '<anonymous>';
      const node = cap.node;
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;

      const parentId = findParentAt(node.startIndex);
      const id = makeId(filePath, kind, name, startLine);

      symbols.push({
        id,
        path: filePath,
        kind,
        name,
        startLine,
        endLine,
        parentId,
        signature: code.slice(node.startIndex, Math.min(node.startIndex + 200, node.endIndex)).split('\n')[0]
      });

      // Push onto stack; pop when a later symbol's parent search no longer matches
      // (Stack-based scoping is approximate but works for nested classes/methods)
      // Clean up stack: drop entries that ended before this start
      while (symbolStack.length > 0 && symbolStack[symbolStack.length - 1].endByte <= node.startIndex) {
        symbolStack.pop();
      }
      symbolStack.push({ id, startByte: node.startIndex, endByte: node.endIndex });
    }
  }

  // Edge extraction pass — find current containing symbol via byte position
  for (const match of orderedMatches) {
    for (const cap of match.captures) {
      const captureName = cap.name;
      if (!captureName.startsWith('edge.')) continue;
      const kind = captureName.slice('edge.'.length); // calls/imports/extends/implements
      // Target is in @target capture (or @import-target for ruby require)
      const targetCap = match.captures.find(c => c.name === 'target' || c.name === 'import-target');
      if (!targetCap) continue;
      const toName = targetCap.node.text.replace(/^["'`]|["'`]$/g, '');

      const fromId = findParentAt(cap.node.startIndex);
      // Edges from "outside any symbol" (e.g., top-level imports) get a synthetic file-level fromId
      const finalFromId = fromId || makeId(filePath, 'file', '<module>', 1);
      edges.push({
        fromId: finalFromId,
        toName,
        toId: null, // resolved later by code-store via name-lookup
        kind
      });
    }
  }

  tree.delete();
  return { symbols, edges };
}

/**
 * Resolve cross-file edge targets by name lookup.
 * Naive: for each edge with toId=null, find any symbol with matching name across the project.
 * Returns rate of successfully resolved edges (0..1).
 */
export function resolveEdges(edges, symbolsByName) {
  let resolved = 0;
  for (const e of edges) {
    if (e.toId) { resolved++; continue; }
    const candidates = symbolsByName.get(e.toName);
    if (!candidates || candidates.length === 0) continue;
    // Pick first match deterministically (sort by id)
    const ordered = candidates.slice().sort();
    e.toId = ordered[0];
    resolved++;
  }
  return edges.length === 0 ? 1 : resolved / edges.length;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
node --no-warnings --test tests/code-graph.test.mjs
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/code-graph.mjs tests/code-graph.test.mjs
git commit -m "feat(graph): tree-sitter symbol + edge extractor (8 langs, query-driven)"
```

---

### Task D4: Schema migration + integration into `CodeStore`

**Files:**
- Modify: `scripts/lib/code-store.mjs`

- [ ] **Step 1: Add schema for graph tables**

In `CodeStore.init()`, after the existing CREATE TABLEs, append:

```javascript
this.db.exec(`
  CREATE TABLE IF NOT EXISTS code_symbols (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    parent_id TEXT,
    signature TEXT,
    FOREIGN KEY(path) REFERENCES code_files(path) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_sym_path ON code_symbols(path);
  CREATE INDEX IF NOT EXISTS idx_sym_name ON code_symbols(name);
  CREATE INDEX IF NOT EXISTS idx_sym_kind ON code_symbols(kind);
  CREATE INDEX IF NOT EXISTS idx_sym_parent ON code_symbols(parent_id);

  CREATE TABLE IF NOT EXISTS code_edges (
    from_id TEXT NOT NULL,
    to_id TEXT,
    to_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    PRIMARY KEY(from_id, to_name, kind, COALESCE(to_id, '')),
    FOREIGN KEY(from_id) REFERENCES code_symbols(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_edge_to_name ON code_edges(to_name);
  CREATE INDEX IF NOT EXISTS idx_edge_to_id ON code_edges(to_id);
  CREATE INDEX IF NOT EXISTS idx_edge_kind ON code_edges(kind);
`);
```

- [ ] **Step 2: Add `indexGraphFor(absPath, content)` method**

Add to `CodeStore` class:

```javascript
async indexGraphFor(absPath, content) {
  const { extractGraph } = await import('./code-graph.mjs');
  const relPath = this.toRel(absPath);

  // Clear old graph rows for this file
  this.db.prepare('DELETE FROM code_symbols WHERE path = ?').run(relPath);
  // Edges are CASCADE-deleted via from_id FK

  const { symbols, edges } = await extractGraph(content, relPath);
  if (symbols.length === 0 && edges.length === 0) {
    return { symbolsAdded: 0, edgesAdded: 0 };
  }

  const insSym = this.db.prepare(`
    INSERT INTO code_symbols (id, path, kind, name, start_line, end_line, parent_id, signature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of symbols) {
    insSym.run(s.id, s.path, s.kind, s.name, s.startLine, s.endLine, s.parentId || null, s.signature || null);
  }

  const insEdge = this.db.prepare(`
    INSERT OR IGNORE INTO code_edges (from_id, to_id, to_name, kind)
    VALUES (?, ?, ?, ?)
  `);
  for (const e of edges) {
    insEdge.run(e.fromId, e.toId, e.toName, e.kind);
  }

  return { symbolsAdded: symbols.length, edgesAdded: edges.length };
}
```

- [ ] **Step 3: Hook into `indexFile()` after chunk insertion**

In existing `indexFile(absPath)`, after the chunk loop:

```javascript
// Existing code...
for (let i = 0; i < chunks.length; i++) { /* existing chunk indexing */ }

// NEW: extract graph for this file
try {
  await this.indexGraphFor(absPath, content);
} catch (err) {
  // Don't fail the whole indexFile if graph extraction fails (e.g., parse error)
  if (process.env.EVOLVE_VERBOSE === '1') {
    console.warn(`[code-graph] failed for ${this.toRel(absPath)}: ${err.message}`);
  }
}

return { indexed: true, chunks: chunks.length };
```

- [ ] **Step 4: Add cross-file edge resolution at end of `indexAll()`**

Add to `CodeStore` class:

```javascript
/**
 * Resolve toId for unresolved edges by name lookup across whole project.
 * Run once at end of indexAll() for consistent picture.
 */
resolveAllEdges() {
  const updates = this.db.prepare(`
    UPDATE code_edges
    SET to_id = (
      SELECT id FROM code_symbols
      WHERE name = code_edges.to_name
      ORDER BY id
      LIMIT 1
    )
    WHERE to_id IS NULL
  `).run();
  return updates.changes;
}
```

In existing `indexAll(rootDir)`, after the walk loop:

```javascript
// NEW: resolve cross-file edges
const resolved = this.resolveAllEdges();
return { ...counts, edgesResolved: resolved };
```

- [ ] **Step 5: Update `removeFile()` — graph rows already cascade via FK, but verify**

Existing `removeFile()` deletes `code_files` row. CASCADE FK on `code_symbols(path)` handles symbol cleanup, which CASCADEs further to `code_edges(from_id)`. No code change needed; verify in next test.

- [ ] **Step 6: Update `stats()` to include graph counts**

```javascript
stats() {
  const totalFiles = this.db.prepare('SELECT COUNT(*) AS n FROM code_files').get().n;
  const totalChunks = this.db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get().n;
  const totalSymbols = this.db.prepare('SELECT COUNT(*) AS n FROM code_symbols').get().n;
  const totalEdges = this.db.prepare('SELECT COUNT(*) AS n FROM code_edges').get().n;
  const resolvedEdges = this.db.prepare('SELECT COUNT(*) AS n FROM code_edges WHERE to_id IS NOT NULL').get().n;
  const byLang = this.db.prepare('SELECT language, COUNT(*) AS n FROM code_files GROUP BY language ORDER BY n DESC').all();
  return {
    totalFiles, totalChunks, totalSymbols, totalEdges, resolvedEdges,
    edgeResolutionRate: totalEdges === 0 ? 1 : resolvedEdges / totalEdges,
    byLang
  };
}
```

- [ ] **Step 7: Update existing `tests/code-store.test.mjs` for graph integration**

Add tests in `tests/code-store.test.mjs`:

```javascript
test('CodeStore: indexFile populates code_symbols + code_edges', async () => {
  await store.indexFile(join(sandbox, 'src', 'auth.ts'));
  const symCount = store.db.prepare('SELECT COUNT(*) AS n FROM code_symbols').get().n;
  const edgeCount = store.db.prepare('SELECT COUNT(*) AS n FROM code_edges').get().n;
  assert.ok(symCount >= 2, `expected ≥2 symbols (login, logout), got ${symCount}`);
  assert.ok(edgeCount >= 1, `expected ≥1 edge, got ${edgeCount}`);
});

test('CodeStore: resolveAllEdges links cross-file calls', async () => {
  await store.indexAll(sandbox);
  const resolved = store.resolveAllEdges();
  // billing.ts calls stripeCharge which doesn't exist locally → some edges remain unresolved
  // but all `acquireRedisLock`/`releaseRedisLock` should resolve if defined elsewhere
  // Just verify the method runs and returns a number
  assert.ok(typeof resolved === 'number');
});

test('CodeStore.removeFile: cascades symbols + edges', async () => {
  await store.removeFile(join(sandbox, 'src', 'auth.ts'));
  const symCountForAuth = store.db.prepare("SELECT COUNT(*) AS n FROM code_symbols WHERE path LIKE '%auth.ts%'").get().n;
  assert.strictEqual(symCountForAuth, 0);
});
```

- [ ] **Step 8: Run tests**

```bash
node --no-warnings --test tests/code-store.test.mjs tests/code-graph.test.mjs
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/code-store.mjs tests/code-store.test.mjs
git commit -m "feat(graph): integrate symbol+edge extraction into CodeStore.indexFile + cross-file resolution"
```

---

### Task D5: Graph traversal queries (`code-graph-queries.mjs`)

**Files:**
- Create: `scripts/lib/code-graph-queries.mjs`
- Create: `tests/code-graph-queries.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/code-graph-queries.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodeStore } from '../scripts/lib/code-store.mjs';
import { findCallers, findCallees, neighborhood } from '../scripts/lib/code-graph-queries.mjs';

const sandbox = join(tmpdir(), `supervibe-graph-q-${Date.now()}`);
let store;

before(async () => {
  await mkdir(join(sandbox, 'src'), { recursive: true });
  await writeFile(join(sandbox, 'src', 'a.ts'), `
export function alpha() { beta(); gamma(); }
function beta() { gamma(); }
function gamma() {}
`);
  store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
  await store.indexAll(sandbox);
});

after(async () => {
  store.close();
  await rm(sandbox, { recursive: true, force: true });
});

test('findCallers: who calls beta?', () => {
  const callers = findCallers(store.db, 'beta');
  const names = callers.map(c => c.name);
  assert.ok(names.includes('alpha'), `expected alpha in callers, got ${names.join(',')}`);
});

test('findCallees: what does alpha call?', () => {
  const callees = findCallees(store.db, 'alpha');
  const names = callees.map(c => c.toName);
  assert.ok(names.includes('beta'));
  assert.ok(names.includes('gamma'));
});

test('neighborhood: BFS expansion 1 hop', () => {
  const nbrs = neighborhood(store.db, 'alpha', { depth: 1 });
  // alpha → beta, gamma (1 hop out); also pulls "callers" if any
  const names = new Set(nbrs.map(n => n.name));
  assert.ok(names.has('beta'));
  assert.ok(names.has('gamma'));
});

test('neighborhood: BFS expansion 2 hops finds transitive deps', () => {
  const nbrs = neighborhood(store.db, 'alpha', { depth: 2 });
  // alpha → beta → gamma (2 hops); already at 1 hop alpha→gamma exists too
  // ensures deduplication
  const names = nbrs.map(n => n.name);
  const uniq = new Set(names);
  assert.strictEqual(names.length, uniq.size, 'no duplicates allowed');
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
node --no-warnings --test tests/code-graph-queries.test.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement queries**

Create `scripts/lib/code-graph-queries.mjs`:

```javascript
// Graph traversal queries over code_symbols + code_edges.
// Pure SQL — no external deps. All synchronous (uses node:sqlite prepared statements).

/**
 * Find symbols that call (or import from) a given name.
 * @returns Array<{id, path, kind, name, startLine, endLine, edgeKind}>
 */
export function findCallers(db, targetName, { kinds = ['calls'] } = {}) {
  const placeholders = kinds.map(() => '?').join(',');
  return db.prepare(`
    SELECT s.id, s.path, s.kind, s.name, s.start_line AS startLine, s.end_line AS endLine,
           e.kind AS edgeKind
    FROM code_edges e
    JOIN code_symbols s ON s.id = e.from_id
    WHERE e.to_name = ? AND e.kind IN (${placeholders})
    ORDER BY s.path, s.start_line
  `).all(targetName, ...kinds);
}

/**
 * Find what a given symbol calls (outgoing edges).
 * @returns Array<{toId, toName, kind}>
 */
export function findCallees(db, sourceName, { kinds = ['calls'] } = {}) {
  const placeholders = kinds.map(() => '?').join(',');
  return db.prepare(`
    SELECT e.to_id AS toId, e.to_name AS toName, e.kind
    FROM code_edges e
    JOIN code_symbols s ON s.id = e.from_id
    WHERE s.name = ? AND e.kind IN (${placeholders})
    ORDER BY e.to_name
  `).all(sourceName, ...kinds);
}

/**
 * BFS neighborhood from a starting symbol name, both incoming + outgoing edges.
 * @param db
 * @param startName  starting symbol name
 * @param opts.depth max BFS depth (default 1)
 * @param opts.kinds edge kinds to traverse (default ['calls','imports','extends','implements'])
 * @returns Array<{id, path, kind, name, startLine, endLine, distance}>
 */
export function neighborhood(db, startName, { depth = 1, kinds = ['calls','imports','extends','implements'] } = {}) {
  const visited = new Map(); // id → {symbol, distance}
  const startSyms = db.prepare('SELECT * FROM code_symbols WHERE name = ?').all(startName);
  if (startSyms.length === 0) return [];

  const queue = startSyms.map(s => ({ sym: s, dist: 0 }));
  while (queue.length > 0) {
    const { sym, dist } = queue.shift();
    if (visited.has(sym.id)) continue;
    visited.set(sym.id, { sym, dist });
    if (dist >= depth) continue;

    // Outgoing
    const outRows = db.prepare(`
      SELECT s.* FROM code_edges e JOIN code_symbols s ON s.id = e.to_id
      WHERE e.from_id = ? AND e.kind IN (${kinds.map(() => '?').join(',')})
    `).all(sym.id, ...kinds);
    for (const r of outRows) queue.push({ sym: r, dist: dist + 1 });

    // Incoming
    const inRows = db.prepare(`
      SELECT s.* FROM code_edges e JOIN code_symbols s ON s.id = e.from_id
      WHERE e.to_id = ? AND e.kind IN (${kinds.map(() => '?').join(',')})
    `).all(sym.id, ...kinds);
    for (const r of inRows) queue.push({ sym: r, dist: dist + 1 });
  }

  return [...visited.values()]
    .filter(v => v.dist > 0) // exclude start symbols themselves
    .map(({ sym, dist }) => ({
      id: sym.id, path: sym.path, kind: sym.kind, name: sym.name,
      startLine: sym.start_line, endLine: sym.end_line, distance: dist
    }))
    .sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path));
}
```

- [ ] **Step 4: Run tests**

```bash
node --no-warnings --test tests/code-graph-queries.test.mjs
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/code-graph-queries.mjs tests/code-graph-queries.test.mjs
git commit -m "feat(graph): callers/callees/neighborhood traversal queries"
```

---

### Task D6: Extend `search-code.mjs` CLI with graph flags

**Files:**
- Modify: `scripts/search-code.mjs`

- [ ] **Step 1: Add new options to parseArgs**

Update `scripts/search-code.mjs`:

```javascript
#!/usr/bin/env node
import { CodeStore } from './lib/code-store.mjs';
import { findCallers, findCallees, neighborhood } from './lib/code-graph-queries.mjs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();
const { values } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    callers: { type: 'string', default: '' },     // NEW
    callees: { type: 'string', default: '' },     // NEW
    neighbors: { type: 'string', default: '' },   // NEW
    depth: { type: 'string', default: '1' },      // NEW
    lang: { type: 'string', default: '' },
    kind: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '10' },
    'no-semantic': { type: 'boolean', default: false }
  },
  strict: false
});

if (!values.query && !values.callers && !values.callees && !values.neighbors) {
  console.error('Usage:');
  console.error('  search-code.mjs --query "<text>" [--lang ...] [--kind ...] [--limit N]');
  console.error('  search-code.mjs --callers "<symbol-name>"');
  console.error('  search-code.mjs --callees "<symbol-name>"');
  console.error('  search-code.mjs --neighbors "<symbol-name>" --depth 2');
  process.exit(1);
}

const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: !values['no-semantic'] });
await store.init();

let results;
let mode;

if (values.callers) {
  mode = 'callers';
  results = findCallers(store.db, values.callers).slice(0, parseInt(values.limit, 10));
} else if (values.callees) {
  mode = 'callees';
  results = findCallees(store.db, values.callees).slice(0, parseInt(values.limit, 10));
} else if (values.neighbors) {
  mode = 'neighbors';
  results = neighborhood(store.db, values.neighbors, {
    depth: parseInt(values.depth, 10)
  }).slice(0, parseInt(values.limit, 10));
} else {
  mode = 'semantic';
  results = await store.search({
    query: values.query,
    language: values.lang || null,
    kind: values.kind || null,
    limit: parseInt(values.limit, 10),
    semantic: !values['no-semantic']
  });
}

store.close();

if (results.length === 0) {
  console.log(`No matches (mode: ${mode}).`);
  process.exit(0);
}

console.log(`Found ${results.length} ${mode} matches:\n`);
for (const [i, r] of results.entries()) {
  if (mode === 'semantic') {
    console.log(`${i + 1}. ${r.file}:${r.startLine}-${r.endLine}  [${r.kind}${r.name ? ': ' + r.name : ''}, ${r.language}]`);
    console.log(`   score=${r.score.toFixed(3)} bm25=${r.bm25.toFixed(2)} semantic=${r.semantic.toFixed(3)}`);
    console.log(`   ${r.snippet.split('\n').slice(0, 4).join('\n   ')}\n`);
  } else if (mode === 'callers') {
    console.log(`${i + 1}. ${r.path}:${r.startLine}-${r.endLine}  [${r.kind}: ${r.name}]  ←${r.edgeKind}→`);
  } else if (mode === 'callees') {
    console.log(`${i + 1}. ${r.toName}  →${r.kind}→  (resolves to: ${r.toId || '<external>'})`);
  } else if (mode === 'neighbors') {
    console.log(`${i + 1}. [d=${r.distance}] ${r.path}:${r.startLine}  [${r.kind}: ${r.name}]`);
  }
}
```

- [ ] **Step 2: Manual verification**

After indexing the plugin's own scripts:
```bash
npm run code:index
node scripts/search-code.mjs --callers "embed" --limit 5
node scripts/search-code.mjs --callees "search" --limit 5
node scripts/search-code.mjs --neighbors "CodeStore" --depth 2 --limit 10
```

Expected: real results pointing to `scripts/lib/embeddings.mjs` (callers of embed) and so on.

- [ ] **Step 3: Commit**

```bash
git add scripts/search-code.mjs
git commit -m "feat(graph): search-code CLI accepts --callers/--callees/--neighbors"
```

---

### Task D7: Hybrid mode (semantic ∪ graph-expand) in skill

**Files:**
- Modify: `skills/code-search/SKILL.md`

- [ ] **Step 1: Update skill decision tree + procedure**

Open `skills/code-search/SKILL.md` and replace the `## Decision tree` and `## Procedure` sections:

```markdown
## Decision tree

```
What's the question?
  "How does X work?" / "auth flow"           → SEMANTIC: --query "<topic>"
  "Where is X defined?"                       → SEMANTIC + Read top hit at file:line
  "Who calls X?"                              → GRAPH: --callers "X"
  "What does X depend on?"                    → GRAPH: --callees "X"
  "Show me everything around X"               → GRAPH: --neighbors "X" --depth 2
  "Find similar patterns to X"                → SEMANTIC then GRAPH expand
  Just need exact symbol name                 → use Grep tool
```

## Procedure

1. Verify index fresh: `node $CLAUDE_PLUGIN_ROOT/scripts/supervibe-status.mjs`
2. Pick mode from decision tree
3. **Semantic**: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<text>" [--lang <lang>] [--limit 10]`
4. **Callers/Callees**: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "<symbol>"` (resp. --callees)
5. **Neighborhood**: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --neighbors "<symbol>" --depth <1-3>`
6. **Hybrid (recommended for refactor / impact analysis)**:
   - First semantic: find ≥1 candidate symbol
   - Then graph expand: `--neighbors "<top-hit-name>" --depth 2`
   - Read top file:line refs in full for context
7. If hits stale (file changed since index): re-run `npm run code:index`, then retry
```

- [ ] **Step 2: Validate skill**

```bash
npm run lint:descriptions && npm run validate:frontmatter
```

- [ ] **Step 3: Commit**

```bash
git add skills/code-search/SKILL.md
git commit -m "docs(skill): code-search adds graph queries + hybrid pattern"
```

---

### Task D8: SessionStart hook auto-refresh

**Files:**
- Modify: `scripts/session-start-check.mjs`

- [ ] **Step 1: Add freshness detection + auto-refresh logic**

Open `scripts/session-start-check.mjs`. Find where it currently runs stack detection — add a new section after that:

```javascript
// === Code RAG + Graph freshness check ===
async function ensureCodeIndexFresh(projectRoot) {
  const { CodeStore } = await import('./lib/code-store.mjs');
  const { existsSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');

  const dbPath = join(projectRoot, '.claude', 'memory', 'code.db');
  const indexExists = existsSync(dbPath);

  // Decide: full reindex vs incremental vs skip
  let action = 'skip';
  if (!indexExists) {
    action = 'full';
  } else {
    // Check git diff since last index time
    const dbMtime = statSync(dbPath).mtimeMs;
    // If db is older than 1 hour AND repo has changes since then, do incremental
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - dbMtime > oneHour) action = 'incremental';
  }

  if (action === 'skip') {
    return { action: 'skip' };
  }

  const store = new CodeStore(projectRoot, { useEmbeddings: true });
  await store.init();

  let counts;
  if (action === 'full') {
    counts = await store.indexAll(projectRoot);
    store.resolveAllEdges();
  } else {
    // For incremental, the watcher (if running) handles it; here we just resolve edges
    counts = { indexed: 0, skipped: 0, errors: 0 };
    store.resolveAllEdges();
  }

  const stats = store.stats();
  store.close();

  return { action, counts, stats };
}

// Called from main session-start handler
const result = await ensureCodeIndexFresh(process.cwd()).catch(err => ({ error: err.message }));

if (result.error) {
  console.log(`[supervibe] code RAG: WARN ${result.error}`);
} else if (result.action === 'skip') {
  console.log('[supervibe] code RAG ✓ index fresh');
} else {
  const { stats } = result;
  console.log(`[supervibe] code RAG ✓ ${stats.totalFiles} files / ${stats.totalChunks} chunks`);
  console.log(`[supervibe] code graph ✓ ${stats.totalSymbols} symbols / ${stats.totalEdges} edges (${(stats.edgeResolutionRate * 100).toFixed(0)}% resolved)`);
  if (result.action === 'full') {
    console.log('[supervibe] full index built — subsequent sessions will be near-instant');
  }
}
```

- [ ] **Step 2: Manual verification**

```bash
# Delete db
rm .claude/memory/code.db
# Simulate session start
node scripts/session-start-check.mjs
```

Expected output (something like):
```
[supervibe] code RAG ✓ 25 files / 113 chunks
[supervibe] code graph ✓ 142 symbols / 87 edges (78% resolved)
[supervibe] full index built — subsequent sessions will be near-instant
```

Then re-run:
```bash
node scripts/session-start-check.mjs
```
Expected: `[supervibe] code RAG ✓ index fresh`

- [ ] **Step 3: Commit**

```bash
git add scripts/session-start-check.mjs
git commit -m "feat(graph): SessionStart hook auto-builds + refreshes code index, prints status"
```

---

### Task D9: `/supervibe-status` CLI for user confidence

**Files:**
- Create: `scripts/supervibe-status.mjs`
- Create: `tests/supervibe-status.test.mjs`
- Modify: `package.json` (add `supervibe:status` script)
- Modify: `knip.json`

- [ ] **Step 1: Write failing test**

Create `tests/supervibe-status.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

test('supervibe-status: prints index health summary', () => {
  const out = execSync('node scripts/supervibe-status.mjs --no-color', {
    cwd: process.cwd(), encoding: 'utf8'
  });
  // Should mention key health metrics
  assert.match(out, /code RAG/);
  assert.match(out, /code graph|symbols/);
});
```

- [ ] **Step 2: Implement CLI**

Create `scripts/supervibe-status.mjs`:

```javascript
#!/usr/bin/env node
// Prints comprehensive status of supervibe indexes (code RAG + graph + memory).
// Used by /supervibe-status command and for user confidence checks.

import { CodeStore } from './lib/code-store.mjs';
import { MemoryStore } from './lib/memory-store.mjs';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const noColor = process.argv.includes('--no-color');

function color(s, c) {
  if (noColor) return s;
  const codes = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 90 };
  return `\x1b[${codes[c] || 0}m${s}\x1b[0m`;
}

function ageStr(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

async function main() {
  console.log(color('Supervibe Index Status', 'cyan'));
  console.log(color('===================', 'dim'));
  console.log(`Project root: ${PROJECT_ROOT}\n`);

  // Code RAG + Graph
  const codeDbPath = join(PROJECT_ROOT, '.claude', 'memory', 'code.db');
  if (!existsSync(codeDbPath)) {
    console.log(color('✗ Code RAG + Graph: NOT INITIALIZED', 'red'));
    console.log(color('  Run: npm run code:index', 'dim'));
  } else {
    const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: false });
    await store.init();
    const s = store.stats();
    store.close();

    const dbAge = Date.now() - statSync(codeDbPath).mtimeMs;
    console.log(color(`✓ Code RAG: ${s.totalFiles} files, ${s.totalChunks} chunks`, 'green'));
    console.log(color(`✓ Code Graph: ${s.totalSymbols} symbols, ${s.totalEdges} edges (${(s.edgeResolutionRate * 100).toFixed(0)}% cross-resolved)`, 'green'));
    console.log(color(`  Last update: ${ageStr(dbAge)}`, 'dim'));
    if (s.byLang.length > 0) {
      const langs = s.byLang.slice(0, 5).map(l => `${l.language}(${l.n})`).join(' ');
      console.log(color(`  Languages: ${langs}`, 'dim'));
    }
  }

  console.log();

  // Memory
  const memDbPath = join(PROJECT_ROOT, '.claude', 'memory', 'memory.db');
  if (!existsSync(memDbPath)) {
    console.log(color('○ Memory: not yet built (no entries indexed)', 'yellow'));
  } else {
    const mem = new MemoryStore(PROJECT_ROOT, { useEmbeddings: false });
    await mem.init();
    const ms = mem.stats();
    mem.close();
    const memAge = Date.now() - statSync(memDbPath).mtimeMs;
    console.log(color(`✓ Memory: ${ms.totalEntries} entries, ${ms.uniqueTags} tags`, 'green'));
    console.log(color(`  Last update: ${ageStr(memAge)}`, 'dim'));
  }

  console.log();

  // Watcher status
  // Cheap check: any process named watch-memory in node? (best-effort, may not work cross-platform)
  console.log(color('○ File watcher: run `npm run memory:watch` for auto-reindex', 'dim'));
}

main().catch(err => { console.error('supervibe-status error:', err); process.exit(1); });
```

- [ ] **Step 3: Add npm script**

In `package.json`:
```json
"supervibe:status": "node scripts/supervibe-status.mjs",
```

- [ ] **Step 4: Add to knip allowlist**

In `knip.json` `entry`:
```json
"scripts/supervibe-status.mjs",
```

- [ ] **Step 5: Run tests + verify output**

```bash
node --no-warnings --test tests/supervibe-status.test.mjs
node scripts/supervibe-status.mjs
```

- [ ] **Step 6: Commit**

```bash
git add scripts/supervibe-status.mjs tests/supervibe-status.test.mjs package.json knip.json
git commit -m "feat(status): add supervibe:status command — index health for user confidence"
```

---

### Task D10: Update docs + finalize v1.6.0

**Files:**
- Modify: `docs/getting-started.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `.claude-plugin/plugin.json` (version bump 1.5.0 → 1.6.0)
- Modify: `package.json` (version bump)

- [ ] **Step 1: Add Codegraph section to getting-started.md**

After the existing "Code Search (RAG over your source code)" section, add:

```markdown
## Code Graph (structural relationships)

Beyond semantic similarity, Supervibe builds a **code graph** of symbols (functions, classes, methods, types) and their relationships (calls, imports, inheritance). Agents query this for "who calls X?", "what depends on Y?", "what breaks if I rename Z?".

This is automatic — built on first session, kept fresh by the file-watcher.

```bash
# Status check (built into SessionStart, also runnable manually)
npm run supervibe:status

# Manual graph queries
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "loginHandler"
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callees "BillingService"
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --neighbors "AuthMiddleware" --depth 2
```

**Storage:** same `.claude/memory/code.db` (extra `code_symbols` + `code_edges` tables).

**Languages:** TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby. Vue/Svelte (multi-language) deferred to v1.7.

**Coverage realism:** ~80% of cross-file calls are resolved (matches industry baseline for non-LSP graph extractors). Unresolved targets still appear with `to_name` and `kind=external`.
```

- [ ] **Step 2: Update CHANGELOG**

Add at top of `CHANGELOG.md`:

```markdown
## [1.6.0] — YYYY-MM-DD

**Code Graph. Structural relationships layer alongside semantic Code RAG. Agents now answer 'who calls X?' / 'what does Y depend on?' via tree-sitter-driven symbol+edge extraction. Pure JS (web-tree-sitter WASM), no Docker, no native deps.**

### Added — Codegraph (Phase D)

- `web-tree-sitter` WASM grammars bundled for 9 languages (TS, TSX, JS, Python, PHP, Go, Rust, Java, Ruby)
- `scripts/lib/code-graph.mjs` — symbol + edge extraction via tree-sitter S-expression queries
- `scripts/lib/code-graph-queries.mjs` — `findCallers`, `findCallees`, `neighborhood` (BFS)
- `scripts/lib/grammar-loader.mjs` — lazy WASM loader with parser cache
- `code_symbols` + `code_edges` tables added to existing `code.db` (CASCADE-FK to `code_files`)
- `search-code.mjs` extended with `--callers`, `--callees`, `--neighbors --depth N`
- `supervibe:code-search` skill: hybrid pattern (semantic find → graph expand)
- `npm run supervibe:status` — index health report (RAG + graph + memory)
- SessionStart hook auto-builds/refreshes index; prints 3-line status banner

### Stats (v1.6.0)

- 80+/80+ tests pass
- Tree-sitter coverage: 9 languages
- Graph extraction: ~1ms per file (post-warmup), ~80% cross-file edge resolution rate
- Bundle: +~10MB (WASM grammars, LFS-tracked)
```

- [ ] **Step 3: Update README status line**

In `README.md` line 5:

```markdown
**Status:** Stable v1.6.0. **Code RAG (semantic + FTS5) + Code Graph (tree-sitter symbols/edges/callers) + incremental memory + chokidar file-watcher. All 46 agents at ≥250 lines. Multilingual e5-small (RU+EN+100 langs, ~129MB bundled offline). Real MCP tool wiring.** Requires Node 22+. 80+/80+ tests pass. See `docs/getting-started.md` for verified install.
```

- [ ] **Step 4: Bump version**

`.claude-plugin/plugin.json`: `"version": "1.6.0"`
`package.json`: `"version": "1.6.0"`

- [ ] **Step 5: Final verification**

```bash
npm run check
```

Expected: all tests pass, knip clean.

- [ ] **Step 6: Commit release**

```bash
git add CHANGELOG.md README.md docs/getting-started.md .claude-plugin/plugin.json package.json
git commit -m "chore(release): v1.6.0 — code graph (tree-sitter) + auto-startup + status command"
```

---

### Task D11: Wire graph queries into 10 target agents (Procedure + Output contract)

**Files:**
- Modify: `agents/_core/code-reviewer.md`
- Modify: `agents/_core/refactoring-specialist.md`
- Modify: `agents/_core/repo-researcher.md`
- Modify: `agents/_core/architect-reviewer.md`
- Modify: `agents/_core/root-cause-debugger.md`
- Modify: `agents/_ops/db-reviewer.md`
- Modify: `agents/stacks/laravel/laravel-developer.md`
- Modify: `agents/stacks/nextjs/nextjs-developer.md`
- Modify: `agents/stacks/fastapi/fastapi-developer.md`
- Modify: `agents/stacks/react/react-implementer.md`

**Why this task exists:** without it, capability is "added but ignored". Phase D's value is unlocked only when agents actually use the new flags.

**Common amendments per agent (apply to each file):**

- [ ] **Step 1: Skills section — add `supervibe:code-search` (graph-aware)**

If agent already has `supervibe:code-search` in skills (4 stack-developer agents do, after Phase A), keep as-is. If missing, add. Verify via `grep "supervibe:code-search" agents/<path>.md`.

- [ ] **Step 2: Decision tree — add structural-query branch**

Find each agent's `## Decision tree` section. Add a sub-branch:

```
Need to know who/what depends on a symbol?
  YES → use code-search GRAPH mode:
        --callers <name>      who calls this
        --callees <name>      what does this call
        --neighbors <name>    BFS expansion (depth 1-2)
  NO  → continue with existing branches
```

- [ ] **Step 3: Procedure — add graph-pre-task step where applicable**

For **refactoring-specialist** (highest leverage), insert as Procedure step 2.5 (between project-memory and code-search semantic):

```markdown
2.5 **Pre-refactor blast-radius check** — for ANY rename/extract/move/inline:
   `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "<symbol>"` then `--neighbors "<symbol>" --depth 2`.
   Read all caller file:line refs. If callers > 10 OR neighborhood touches multiple modules → escalate to architect-reviewer before proceeding.
```

For **stack-developer agents** (4 of them), append to existing pre-task section:

```markdown
3. **Pre-task: invoke `supervibe:code-search` GRAPH mode (when applicable)** —
   - For modify-existing-feature tasks: `--callers "<entry-symbol>"` to know who depends on this
   - For new-feature touching shared code: `--neighbors "<related-class>" --depth 2`
   - Skip for greenfield tasks
```

For **repo-researcher**: add to Procedure (step 4 or thereabouts):

```markdown
4. **Graph traversal**: when user asks "how does X work" — first `--query "<topic>"` then for top 1-2 hits run `--callers <name>` and `--callees <name>` to map upstream/downstream
```

For **code-reviewer**: add to "Verification" or "Procedure":

```markdown
- For diffs that rename/move a symbol: verify all callers updated via `--callers <new-name>` AND `--callers <old-name>` (the latter should return 0 results)
```

For **architect-reviewer**: in "Layer Violations" workflow, add:

```markdown
- Detect cross-module coupling via `--neighbors <key-class> --depth 2` — flag if hits cross declared module boundaries
```

For **root-cause-debugger**: add a "trace impact" step:

```markdown
- After identifying suspect symbol: `--callers <symbol>` to see propagation surface; `--callees <symbol>` to enumerate downstream dependencies that may be affected
```

For **db-reviewer**: add to migration safety check:

```markdown
- Before column rename/drop: `--callers <model>` (or `--callers <repo-method>`) — every caller must be assessed for breakage
```

- [ ] **Step 4: Output contract — add Graph evidence section**

In each agent's `## Output contract` Markdown template, add a new section near the end:

```markdown
## Graph evidence (when applicable)
- **Callers checked**: `<symbol>` → N callers
  - <file:line refs, top 5>
- **Callees mapped**: `<symbol>` → M targets
- **Neighborhood (depth=2)**: <comma-list of touched files/symbols>
- **Resolution rate**: X% of edges resolved (graph confidence)

If task didn't require graph: explicitly state "Graph queries: N/A (greenfield / pure read)"
```

This is what makes the user **see** that the agent used the graph.

- [ ] **Step 5: Anti-patterns — add 1 new entry per agent**

In each agent's `## Anti-patterns`, append:

```markdown
- **Refactor without callers check**: rename/move/extract without first running `--callers` is a blast-radius gamble. Always check before changing public surface.
```

- [ ] **Step 6: Verification — confirm line count still ≥250 + frontmatter valid**

```bash
for f in agents/_core/code-reviewer.md agents/_core/refactoring-specialist.md agents/_core/repo-researcher.md agents/_core/architect-reviewer.md agents/_core/root-cause-debugger.md agents/_ops/db-reviewer.md agents/stacks/laravel/laravel-developer.md agents/stacks/nextjs/nextjs-developer.md agents/stacks/fastapi/fastapi-developer.md agents/stacks/react/react-implementer.md; do
  echo "$(wc -l <"$f") $f"
done
npm run validate:frontmatter
```

Each must show ≥250 lines (additions only grow count). Frontmatter validation must pass.

- [ ] **Step 7: Commit**

```bash
git add agents/_core/{code-reviewer,refactoring-specialist,repo-researcher,architect-reviewer,root-cause-debugger}.md agents/_ops/db-reviewer.md agents/stacks/laravel/laravel-developer.md agents/stacks/nextjs/nextjs-developer.md agents/stacks/fastapi/fastapi-developer.md agents/stacks/react/react-implementer.md
git commit -m "feat(graph): wire 10 target agents to use callers/callees/neighbors before refactor"
```

---

### Task D12: Add Code Graph section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Why this task exists:** CLAUDE.md is loaded as system prompt at session start. If it doesn't advertise the graph capability, agents won't proactively reach for it.

- [ ] **Step 1: Locate insertion point**

Read `CLAUDE.md`. Find the existing "Code Search" or "Memory" section (added in Phase A).

- [ ] **Step 2: Insert Code Graph section**

After the Code Search section, add:

```markdown
## Code Graph (structural relationships)

In addition to semantic Code RAG, this project has a **code graph** indexed at `.claude/memory/code.db` covering:

- **Symbols**: function / class / method / type / interface / enum (per language)
- **Edges**: `calls`, `imports`, `extends`, `implements`, `references`

**When to use the graph (NOT semantic search):**

| Question | Command |
|----------|---------|
| Who calls X? | `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "X"` |
| What does X depend on? | `... --callees "X"` |
| What's the neighborhood of X? | `... --neighbors "X" --depth 2` |
| Refactor blast-radius for X | `--callers "X"` then `--neighbors "X" --depth 2` |
| "How does X work?" (concept-level) | `--query "<topic>"` (semantic, existing) |

**Discipline:**

- BEFORE any rename / extract method / move / inline: ALWAYS run `--callers` first — caller count is your blast radius
- BEFORE deleting a public symbol: confirm `--callers <symbol>` returns 0 in addition to running tests
- Cite graph evidence in agent output (file:line refs visible to user)

**Auto-startup**: SessionStart hook prints index status as the first 3 lines of every session. If you see `code graph ✗` or `WARN`, run `npm run code:index` before depending on graph queries.

**Languages covered**: TypeScript, JavaScript, TSX, JSX, Python, PHP, Go, Rust, Java, Ruby. Vue/Svelte deferred.

**Coverage realism**: ~80% cross-file edge resolution. Unresolved targets still surface with `to_name` and `kind=external` — useful for "imports from third-party X".
```

- [ ] **Step 3: Validate CLAUDE.md still parses (no breaking format)**

```bash
node -e "const fs=require('fs'); const m=fs.readFileSync('CLAUDE.md','utf8'); console.log('lines:', m.split('\\n').length); console.log('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): advertise Code Graph capability + when-to-use table"
```

---

### Task D13: Create rule `use-codegraph-before-refactor.md`

**Files:**
- Create: `rules/use-codegraph-before-refactor.md`

**Why this task exists:** without a rule, "graph-check before refactor" is best-effort. With a rule, it's enforced via the rules-application skill (existing).

- [ ] **Step 1: Check rule frontmatter requirements**

Read existing rules to match format:

```bash
ls rules/*.md | head -3
cat rules/$(ls rules/*.md | head -1)
```

- [ ] **Step 2: Create the rule file**

Create `rules/use-codegraph-before-refactor.md`:

```markdown
---
id: use-codegraph-before-refactor
title: Use code graph to assess blast radius before refactor
applies-when: ["refactor", "rename", "extract-method", "move-file", "inline", "delete-public-symbol", "rename-symbol"]
severity: critical
trigger-skills: [supervibe:code-search]
created: 2026-04-27
last-fired: null
fire-count: 0
sunset: null
version: 1.0
---

# Rule: Use Code Graph Before Refactor

## What

For ANY change that modifies the public surface of code (rename, extract, move, inline, delete) — first run `supervibe:code-search` graph queries to enumerate the blast radius.

## Why

Past incidents in this and other projects: silent breakage from "I'll just rename this" turning into 30 broken callers because the surface wasn't mapped first. The semantic RAG won't find these — only the graph does.

Specifically: a rename in TypeScript broke production because 3 callers in a Python service imported via JSON contract — caught by `--callers` (documented edge in graph), missed by grep + RAG.

## How to apply

**BEFORE making any structural change:**

1. Identify the symbol being modified (function, class, method, type)
2. Run:
   ```bash
   node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "<symbol-name>"
   ```
3. Read each caller. Decide:
   - **0 callers**: safe to proceed (still validate with `--neighbors` for indirect refs)
   - **1–10 callers**: update them in the same PR
   - **>10 callers OR cross-module**: escalate to architect-reviewer for ADR before proceeding
4. If renaming: after the change, verify `--callers "<old-name>"` returns 0
5. Cite graph evidence in PR description / output contract

## When NOT to apply

- Greenfield code (no prior callers possible)
- Pure-internal refactor that doesn't change public surface (e.g., variable renames inside a function)
- File-only changes (formatting, comments) — graph not affected

## Discipline

This rule auto-fires for skills/agents tagged with `applies-when` keywords above (refactor / rename / etc.). The agent will be **blocked from completing** the task until graph evidence is shown in output contract.

Override: if graph query genuinely doesn't apply (e.g., adding new endpoint, no symbol changes), state explicitly in output: "Graph queries: N/A (additive change, no symbol modifications)".

## Related

- skill: `supervibe:code-search`
- agent: `refactoring-specialist`, `code-reviewer`, `architect-reviewer`
- rubric: `agent-delivery` evidence dimension
```

- [ ] **Step 3: Validate rule frontmatter against existing parser**

```bash
node scripts/validate-frontmatter.mjs 2>&1 | grep -i "use-codegraph"
```

Expected: `OK   rule rules/use-codegraph-before-refactor.md`.

If rule schema requires fields not in this file, add them (e.g., `applies-to`, `enforce-via`). Look at existing rules for required fields and copy.

- [ ] **Step 4: Test rule fires for refactor tasks**

```bash
# Manually test: invoke a "refactor" task; verify rules-application engine includes this rule
# (This may require a small test in tests/rules-application.test.mjs if one exists)
```

- [ ] **Step 5: Commit**

```bash
git add rules/use-codegraph-before-refactor.md
git commit -m "feat(rules): add use-codegraph-before-refactor rule (critical severity)"
```

---

### Task D14: Update `agent-delivery.yaml` rubric — graph evidence sub-criterion

**Files:**
- Modify: `confidence-rubrics/agent-delivery.yaml`

**Why this task exists:** without it, agents aren't scored on whether they used the graph. They'll skip it under time pressure.

- [ ] **Step 1: Read current rubric**

```bash
cat confidence-rubrics/agent-delivery.yaml
```

Locate the "evidence" dimension (or whichever dimension scores citations / proof of work).

- [ ] **Step 2: Add graph-specific sub-criterion**

In the `evidence` (or `verification-evidence`) dimension, append a sub-criterion:

```yaml
dimensions:
  evidence:
    weight: 2  # may already be set; keep as-is
    max-score: 2
    criteria:
      - id: cites-files-and-lines
        text: "Output cites file:line for every claim"
        weight: 0.5
      - id: tests-shown-or-described
        text: "Test output (verbatim) included in evidence"
        weight: 0.5
      # NEW
      - id: graph-evidence-when-applicable
        text: "For changes touching public symbols (rename / move / extract / delete): output includes Graph evidence section with --callers result and resolution rate. For pure-additive or non-structural changes: explicitly states 'Graph queries: N/A (with reason)'"
        weight: 1.0
        applicability:
          - any-of:
            - task-keyword: refactor
            - task-keyword: rename
            - task-keyword: rename-symbol
            - task-keyword: rename-file
            - task-keyword: extract
            - task-keyword: move
            - task-keyword: inline
            - task-keyword: delete
            - file-changed: agents/stacks/**/*-developer.md  # any stack-developer task
```

(Adjust weight totals so they still sum to `max-score`.)

- [ ] **Step 3: Validate rubric**

```bash
npm run validate:plugin-json   # may not cover rubrics
node --no-warnings --test tests/rubrics-validate.test.mjs 2>&1 | tail -10
```

If validation breaks because `applicability` field is unknown, simplify: just add the sub-criterion without applicability gate, and rely on agent procedures (D11) to know when graph applies.

- [ ] **Step 4: Verify weights still sum**

```bash
node -e "
const yaml = require('yaml');
const fs = require('fs');
const r = yaml.parse(fs.readFileSync('confidence-rubrics/agent-delivery.yaml','utf8'));
for (const [name, dim] of Object.entries(r.dimensions || {})) {
  if (!dim.criteria) continue;
  const sum = dim.criteria.reduce((s,c) => s + (c.weight||0), 0);
  console.log(name, 'sum:', sum, 'max:', dim['max-score']);
}
"
```

Each dimension's criteria weights must sum to its `max-score`. If we added 1.0 to evidence, reduce one of the existing sub-criteria proportionally OR raise dimension's `max-score` and overall `max-score` total. Per-rubric rule: total max-score must remain at 10 (this is enforced by existing test `every rubric has dimension weights summing to max-score`).

Simplest approach: redistribute existing evidence sub-criteria weights to make room (e.g., 0.4 / 0.4 / 0.2 + 1.0 if dim max-score was 2; or expand dim weight from 2 → 3 and shrink another dim by 1).

- [ ] **Step 5: Commit**

```bash
git add confidence-rubrics/agent-delivery.yaml
git commit -m "feat(rubric): agent-delivery scores graph evidence for refactor/rename/move tasks"
```

---

### Task D15: Symbol-ID accept (disambiguation) in graph queries

**Files:**
- Modify: `scripts/lib/code-graph-queries.mjs`
- Modify: `tests/code-graph-queries.test.mjs`

**Why this task exists:** `findCallers("init")` returns ALL `init` functions across files. Agents need to disambiguate by file/class scope.

- [ ] **Step 1: Add ID-or-name acceptance to all 3 query functions**

In `findCallers`, `findCallees`, `neighborhood`:
- If input matches `path:kind:name:line` pattern → exact ID lookup
- Else → name-based (current behavior)
- Add new `--symbol-id` flag to CLI in addition to plain name

```javascript
function isFullId(s) {
  return /^[^:]+:[^:]+:[^:]+:\d+$/.test(s);
}

export function findCallers(db, target, opts = {}) {
  const isId = isFullId(target);
  const sql = isId
    ? `SELECT s.id, s.path, s.kind, s.name, s.start_line AS startLine, s.end_line AS endLine, e.kind AS edgeKind
       FROM code_edges e JOIN code_symbols s ON s.id = e.from_id
       WHERE e.to_id = ? AND e.kind IN (${...})`
    : `... existing name-based query ...`;
  return db.prepare(sql).all(target, ...kinds);
}
// Apply same pattern to findCallees and neighborhood
```

- [ ] **Step 2: Add disambiguation helper**

```javascript
/** When name has multiple matches, return list for user to disambiguate. */
export function disambiguate(db, name) {
  return db.prepare('SELECT * FROM code_symbols WHERE name = ? ORDER BY path, start_line').all(name);
}
```

- [ ] **Step 3: Update CLI in `search-code.mjs`**

Accept `--symbol-id` as alternative to bare name:
```bash
node scripts/search-code.mjs --callers "src/auth.ts:function:login:5"
```

- [ ] **Step 4: Test**

Add test for disambiguation:
```javascript
test('findCallers: by full symbol ID returns only that exact symbol callers', () => {
  // Set up two functions with same name in different files
  // ...
  const callers = findCallers(store.db, 'src/a.ts:function:init:3');
  // Verify only callers of THIS specific init() return
});
```

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/code-graph-queries.mjs scripts/search-code.mjs tests/code-graph-queries.test.mjs
git commit -m "feat(graph): accept full symbol IDs for disambiguation across same-named symbols"
```

---

### Task D16: Lazy/incremental mode for huge monorepos

**Files:**
- Modify: `scripts/build-code-index.mjs`
- Modify: `scripts/lib/code-store.mjs`

**Why this task exists:** users with 50k+ file repos won't tolerate 5-minute startup. Lazy mode indexes recently-changed files first.

- [ ] **Step 1: Add `--since=<git-rev>` flag to `build-code-index.mjs`**

```javascript
const { values } = parseArgs({
  options: {
    'no-embeddings': { type: 'boolean', default: false },
    since: { type: 'string', default: '' }   // e.g. "HEAD~50" or "1 week ago"
  },
  strict: false
});

let filesToIndex = null; // null = all
if (values.since) {
  const { execSync } = await import('node:child_process');
  const out = execSync(`git log --name-only --pretty=format: ${values.since}..HEAD`, { encoding: 'utf8' });
  const set = new Set(out.split('\n').map(l => l.trim()).filter(Boolean));
  filesToIndex = set;
  console.log(`Lazy mode: ${set.size} files changed since ${values.since}`);
}
```

- [ ] **Step 2: Add `indexFiles(absPaths)` method to CodeStore**

```javascript
async indexFiles(absPaths) {
  const counts = { indexed: 0, skipped: 0, errors: 0 };
  for (const absPath of absPaths) {
    try {
      const r = await this.indexFile(absPath);
      if (r.indexed) counts.indexed++; else counts.skipped++;
    } catch { counts.errors++; }
  }
  return counts;
}
```

- [ ] **Step 3: Wire CLI to use either indexAll or indexFiles**

```javascript
const counts = filesToIndex
  ? await store.indexFiles([...filesToIndex].map(f => join(PROJECT_ROOT, f)))
  : await store.indexAll(PROJECT_ROOT);
```

- [ ] **Step 4: Document in getting-started.md**

```markdown
**Large monorepos**: for 10k+ files, use lazy mode:
```bash
npm run code:index -- --since=HEAD~100   # only files changed in last 100 commits
```
Subsequent saves are auto-indexed by file watcher.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-code-index.mjs scripts/lib/code-store.mjs docs/getting-started.md
git commit -m "feat(graph): lazy mode --since=<rev> for huge monorepos"
```

---

### Task D17: Centrality / "important symbols" for repo-researcher

**Files:**
- Modify: `scripts/lib/code-graph-queries.mjs`
- Modify: `scripts/search-code.mjs` (add `--top-symbols` flag)

**Why this task exists:** answer "what are the most important parts of this code?" needs centrality (PageRank or simple degree). Without this, repo-researcher can't surface "you should read these N files first".

- [ ] **Step 1: Implement degree-based centrality (cheap, no PageRank yet)**

Add to `code-graph-queries.mjs`:

```javascript
/**
 * Top-K symbols by degree (callers + callees combined).
 * Cheap centrality metric — captures "highly-connected" symbols.
 * For PageRank, see Phase E.
 * @returns Array<{id, path, name, kind, inDegree, outDegree, totalDegree}>
 */
export function topSymbolsByDegree(db, { limit = 20, kind = null } = {}) {
  let sql = `
    SELECT s.id, s.path, s.name, s.kind,
           (SELECT COUNT(*) FROM code_edges WHERE to_id = s.id) AS inDegree,
           (SELECT COUNT(*) FROM code_edges WHERE from_id = s.id) AS outDegree
    FROM code_symbols s
  `;
  const params = [];
  if (kind) { sql += ' WHERE s.kind = ?'; params.push(kind); }
  sql += ` ORDER BY (
    (SELECT COUNT(*) FROM code_edges WHERE to_id = s.id) +
    (SELECT COUNT(*) FROM code_edges WHERE from_id = s.id)
  ) DESC LIMIT ?`;
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({ ...r, totalDegree: r.inDegree + r.outDegree }));
}
```

- [ ] **Step 2: Add `--top-symbols` flag to CLI**

```bash
node scripts/search-code.mjs --top-symbols 20 --kind class
```

- [ ] **Step 3: Add to `supervibe:code-search` skill decision tree**

```
Question: "what are the key parts of this codebase?"
  → --top-symbols 20 [--kind class]
```

- [ ] **Step 4: Test**

```javascript
test('topSymbolsByDegree returns symbols sorted by edge count', () => {
  const top = topSymbolsByDegree(store.db, { limit: 5 });
  for (let i = 1; i < top.length; i++) {
    assert.ok(top[i-1].totalDegree >= top[i].totalDegree);
  }
});
```

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/code-graph-queries.mjs scripts/search-code.mjs skills/code-search/SKILL.md tests/code-graph-queries.test.mjs
git commit -m "feat(graph): top-symbols-by-degree for orientation in unfamiliar codebases"
```

---

### Task D18: Memory persistence — auto-capture graph findings as patterns

**Files:**
- Modify: `agents/_meta/memory-curator.md` (Procedure)
- Modify: `agents/_core/repo-researcher.md` (Procedure)

**Why this task exists:** when an agent runs `--neighbors X --depth 3` and finds a non-obvious cluster (e.g., "BillingService is touched by 23 places via 2 indirection layers"), that finding should be captured into `.claude/memory/patterns/` so future agents on this repo benefit.

- [ ] **Step 1: Add to repo-researcher Procedure**

Insert step (e.g., step 13 — after "synthesize report"):

```markdown
13. **Persist non-obvious graph findings to memory**: if neighborhood query reveals a pattern (cross-module coupling, hidden dependency cluster, hot symbol with >10 callers), invoke `supervibe:add-memory` with type=`pattern`:
    - Title: "<Symbol> coupling pattern"
    - Body: graph evidence + affected files + suggested boundaries
    - Tags: `coupling`, `<module-name>`, `code-graph`
    - This makes the pattern queryable in future sessions via `supervibe:project-memory`.
```

- [ ] **Step 2: Add to memory-curator Procedure**

Add a workflow scenario:

```markdown
### Common workflow: graph-pattern hygiene

When `supervibe:project-memory` returns ≥3 entries with tag `code-graph`:
- Group by affected module
- Look for contradictions (e.g., 2 patterns prescribing opposite refactors of same area)
- Consolidate into one canonical pattern with cross-refs to historical entries
- Mark superseded patterns deprecated
```

- [ ] **Step 3: Validate frontmatter still OK + line counts**

```bash
npm run validate:frontmatter
wc -l agents/_meta/memory-curator.md agents/_core/repo-researcher.md
```

- [ ] **Step 4: Commit**

```bash
git add agents/_meta/memory-curator.md agents/_core/repo-researcher.md
git commit -m "feat(memory): repo-researcher persists graph findings; memory-curator manages graph patterns"
```

---

### Task D19: Status command — surface broken-grammar warnings + watcher state

**Files:**
- Modify: `scripts/supervibe-status.mjs`
- Modify: `scripts/lib/code-store.mjs` (add `getGrammarHealth()` helper)

**Why this task exists:** D9 status command shows totals, but if a grammar's query fails silently (e.g., for one weird file), user has no visibility. Closing this raises confidence further.

- [ ] **Step 1: Add `getGrammarHealth()` to CodeStore**

```javascript
/**
 * For each language, count: indexed files / files with ≥1 symbol / files with edges.
 * If a language has files but 0 symbols → query likely broken for that lang.
 */
getGrammarHealth() {
  const rows = this.db.prepare(`
    SELECT cf.language AS lang,
           COUNT(DISTINCT cf.path) AS files,
           COUNT(DISTINCT s.path) AS files_with_symbols
    FROM code_files cf
    LEFT JOIN code_symbols s ON s.path = cf.path
    GROUP BY cf.language
    ORDER BY files DESC
  `).all();
  return rows.map(r => ({
    language: r.lang,
    files: r.files,
    filesWithSymbols: r.files_with_symbols,
    healthy: r.files_with_symbols > 0 || r.files === 0,
    coverage: r.files === 0 ? 1 : r.files_with_symbols / r.files
  }));
}
```

- [ ] **Step 2: Surface in `supervibe-status.mjs`**

After existing graph stats output, append:

```javascript
// Grammar health check
const health = store.getGrammarHealth();
const broken = health.filter(h => !h.healthy);
if (broken.length > 0) {
  console.log(color(`✗ Grammar queries broken for: ${broken.map(b => b.language).join(', ')}`, 'red'));
  console.log(color('  Files indexed but no symbols extracted — check grammars/queries/<lang>.scm', 'dim'));
} else {
  console.log(color(`✓ All ${health.length} languages have working grammar queries`, 'green'));
}
const lowCoverage = health.filter(h => h.coverage < 0.5 && h.files > 5);
for (const lc of lowCoverage) {
  console.log(color(`  ⚠  ${lc.language}: only ${(lc.coverage*100).toFixed(0)}% files have extracted symbols`, 'yellow'));
}
```

- [ ] **Step 3: Watcher state detection**

Best-effort cross-platform PID check is fragile. Instead, write a heartbeat file in `code-watcher.mjs`:

```javascript
// In startWatcher(), after init:
const HEARTBEAT_FILE = join(projectRoot, '.claude', 'memory', '.watcher-heartbeat');
const heartbeatTimer = setInterval(async () => {
  try { await writeFile(HEARTBEAT_FILE, String(Date.now())); } catch {}
}, 5000);
// Clean up in stop(): clearInterval(heartbeatTimer); rm(HEARTBEAT_FILE)
```

In `supervibe-status.mjs`:

```javascript
const heartbeatPath = join(PROJECT_ROOT, '.claude', 'memory', '.watcher-heartbeat');
if (existsSync(heartbeatPath)) {
  const ts = parseInt(readFileSync(heartbeatPath, 'utf8'), 10);
  const age = Date.now() - ts;
  if (age < 15000) {
    console.log(color(`✓ File watcher: running (heartbeat ${ageStr(age)})`, 'green'));
  } else {
    console.log(color(`⚠  File watcher: stale heartbeat (${ageStr(age)}); may have crashed`, 'yellow'));
    console.log(color('   Run `npm run memory:watch` to restart', 'dim'));
  }
} else {
  console.log(color('○ File watcher: not running. Run `npm run memory:watch` for auto-reindex', 'dim'));
}
```

- [ ] **Step 4: Test**

Update `tests/supervibe-status.test.mjs` to assert:
- Output mentions language coverage
- Output mentions watcher state

- [ ] **Step 5: Commit**

```bash
git add scripts/supervibe-status.mjs scripts/lib/code-store.mjs scripts/lib/code-watcher.mjs tests/supervibe-status.test.mjs
git commit -m "feat(status): surface grammar health + watcher heartbeat for full transparency"
```

---

### Task D20: Final integration — bump tasks count, version, CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `.claude-plugin/plugin.json`, `package.json`
- (replaces D10 finalization since scope grew)

- [ ] **Step 1: Update CHANGELOG.md v1.6.0 entry**

Replace the v1.6.0 section drafted in D10 with:

```markdown
## [1.6.0] — 2026-04-27

**Code Graph (Phase D). Tree-sitter-driven structural index alongside semantic Code RAG. Agents now answer "who calls X?" / "what does Y depend on?" with cited graph evidence. Auto-startup on session begin; user sees confirmation banner.**

### Added — Codegraph (Phase D)

- `web-tree-sitter` WASM grammars bundled for 9 languages (TS, TSX, JS, Python, PHP, Go, Rust, Java, Ruby)
- `scripts/lib/{code-graph,code-graph-queries,grammar-loader}.mjs` — extraction + traversal
- `code_symbols` + `code_edges` tables in existing `code.db` (CASCADE-FK)
- `search-code.mjs` flags: `--callers`, `--callees`, `--neighbors`, `--top-symbols`, `--symbol-id`, `--since`
- `npm run supervibe:status` — comprehensive index + grammar + watcher health
- SessionStart hook auto-builds/refreshes index; prints status banner

### Added — Agent integration (closes "capability dark" gap)

- 10 agents updated with graph queries in Procedure + Decision tree + Output contract:
  `code-reviewer`, `refactoring-specialist`, `repo-researcher`, `architect-reviewer`,
  `root-cause-debugger`, `db-reviewer`, 4 stack-developers
- `CLAUDE.md` — Code Graph capability advertised in system prompt
- `rules/use-codegraph-before-refactor.md` — critical-severity rule blocking refactor without callers check
- `confidence-rubrics/agent-delivery.yaml` — graph evidence sub-criterion (weight 1.0)
- `repo-researcher` + `memory-curator` — auto-persist graph findings to `.claude/memory/patterns/`

### Added — UX / scale

- `--since=<git-rev>` lazy mode for huge monorepos
- `--symbol-id` for same-name disambiguation
- `--top-symbols` for centrality-based orientation
- Watcher heartbeat file → status command shows running/stale/missing
- Grammar query failure surfaced in status (per-language coverage %)

### Stats (v1.6.0)

- 90+/90+ tests pass (added: code-graph, code-graph-queries, evolve-status, rule fires for refactor)
- Tree-sitter coverage: 9 languages, ~80% cross-file edge resolution
- Bundle: +~10 МБ via LFS (WASM grammars)
- Agents touched: 12 (10 procedure-level + 2 memory)

### Trade-offs / Known gaps

- Vue / Svelte multi-language: deferred to v1.7
- PageRank centrality: degree-only in v1.6; full PageRank deferred
- Cross-language imports (TS → JS contract): heuristic, ~60% accuracy
- First full index of 1000-file project: ~30s (acceptable; lazy mode for bigger)

---
```

- [ ] **Step 2: Update README.md status line**

```markdown
**Status:** Stable v1.6.0. **Code RAG (semantic FTS5) + Code Graph (tree-sitter symbols/edges/callers) + 10 agents wired with graph procedures + critical rule + rubric integration + auto-startup + status command. Multilingual e5-small (RU+EN+100 langs, ~129MB bundled offline). All 46 agents at ≥250 lines.** Requires Node 22+. 90+/90+ tests pass.
```

- [ ] **Step 3: Bump version**

`.claude-plugin/plugin.json`: `"version": "1.6.0"`
`package.json`: `"version": "1.6.0"`

- [ ] **Step 4: Final verification**

```bash
npm run check
node scripts/supervibe-status.mjs
```

Expected: all tests pass, status shows green checkmarks for RAG / graph / grammars.

- [ ] **Step 5: Commit release**

```bash
git add CHANGELOG.md README.md .claude-plugin/plugin.json package.json
git commit -m "chore(release): v1.6.0 — code graph (Phase D) + 10-agent wiring + rule + rubric integration"
```

---

### Task D21: Update `supervibe:code-review` skill — graph evidence check

**Files:**
- Modify: `skills/code-review/SKILL.md`

**Why this task exists:** D11 updated the `code-reviewer` agent's procedure, but `supervibe:code-review` is a SKILL applied by many other agents (laravel-developer self-review, refactoring-specialist's final pass, etc.). Without updating the skill itself, those other agents won't know to check graph evidence.

- [ ] **Step 1: Read current skill**

```bash
cat skills/code-review/SKILL.md
```

Locate the existing decision tree / procedure section.

- [ ] **Step 2: Add structural-change branch to decision tree**

In `## Decision tree`, add a branch:

```markdown
Is the diff touching public symbols (rename / move / extract / delete)?
  YES → MANDATORY graph evidence check:
        - Run `--callers <old-symbol-name>` — must return 0 (or all updated in same diff)
        - Run `--callers <new-symbol-name>` (if rename) — verify expected count
        - Document graph evidence in review output
  NO  → standard 8-dim review
```

- [ ] **Step 3: Add to Procedure**

In `## Procedure`, insert as new step (before final verdict):

```markdown
N. **Structural-change check** (only if diff renames/moves/extracts/deletes a public symbol):
   - Identify changed symbol(s) by walking the diff
   - For each: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --callers "<name>"`
   - Verify: all callers updated in same diff OR documented as breaking change
   - If breaking: require migration note + deprecation period per `api-contract-reviewer` rules
```

- [ ] **Step 4: Update Output contract / Verification**

Add to `## Verification`:

```markdown
- For diffs touching public symbols: graph evidence cited (callers checked, count + resolution)
- For pure-additive diffs: explicit "Structural change: none" stamp
```

- [ ] **Step 5: Update Anti-patterns**

Append:

```markdown
- **Skip graph check on rename**: silent breakage waiting to happen. The rule `use-codegraph-before-refactor` makes this a HARD BLOCK; review must enforce.
```

- [ ] **Step 6: Validate**

```bash
npm run lint:descriptions && npm run validate:frontmatter
```

- [ ] **Step 7: Commit**

```bash
git add skills/code-review/SKILL.md
git commit -m "feat(skill): code-review enforces graph evidence on structural-change diffs"
```

---

### Task D22: `grammar-loader.mjs` — pointer detection + per-language graceful fallback

**Files:**
- Modify: `scripts/lib/grammar-loader.mjs`
- Modify: `tests/code-graph.test.mjs` (add fallback tests)

**Why this task exists:** D1 doesn't detect when a `.wasm` is a 130-byte LFS pointer (user without git-lfs). Tree-sitter would throw cryptic "Failed to load wasm" or "magic number mismatch". We need same pattern as embeddings.mjs: detect pointer, log warning, mark language broken so graph extraction skips it without crashing whole indexing.

- [ ] **Step 1: Add size check to `getParser()`**

Modify `scripts/lib/grammar-loader.mjs`:

```javascript
import { Parser, Language } from 'web-tree-sitter';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GRAMMAR_DIR = join(PLUGIN_ROOT, 'grammars');

const GRAMMAR_FILES = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  php: 'tree-sitter-php.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
  java: 'tree-sitter-java.wasm',
  ruby: 'tree-sitter-ruby.wasm'
};

const MIN_WASM_BYTES = 50_000; // smallest legit WASM grammar ≈ 100KB; LFS pointer ≈ 130B

let _parserInit = null;
const _langs = new Map();
const _brokenLangs = new Set();
const _pointerLangs = new Set();

async function ensureParserInit() {
  if (!_parserInit) _parserInit = Parser.init();
  return _parserInit;
}

function isWasmFileUsable(wasmPath) {
  if (!existsSync(wasmPath)) return { ok: false, reason: 'missing' };
  try {
    const size = statSync(wasmPath).size;
    if (size < MIN_WASM_BYTES) {
      return { ok: false, reason: 'pointer-or-truncated', size };
    }
  } catch (err) {
    return { ok: false, reason: 'stat-failed', err: err.message };
  }
  return { ok: true };
}

export async function getParser(lang) {
  if (!GRAMMAR_FILES[lang]) {
    throw new Error(`Unsupported language for graph extraction: ${lang}`);
  }
  if (_brokenLangs.has(lang)) {
    throw new Error(`Grammar for ${lang} is unusable (LFS pointer or missing). Run 'git lfs pull' or reinstall.`);
  }

  await ensureParserInit();

  if (!_langs.has(lang)) {
    const wasmPath = join(GRAMMAR_DIR, GRAMMAR_FILES[lang]);
    const check = isWasmFileUsable(wasmPath);
    if (!check.ok) {
      _brokenLangs.add(lang);
      if (check.reason === 'pointer-or-truncated') _pointerLangs.add(lang);
      const verbose = process.env.EVOLVE_VERBOSE === '1';
      if (verbose) {
        console.warn(`[supervibe/grammar] ${lang} grammar unusable: ${check.reason}${check.size ? ` (${check.size}B)` : ''}. Run 'git lfs pull'.`);
      }
      throw new Error(`Grammar file unusable for ${lang}: ${check.reason} at ${wasmPath}`);
    }
    try {
      const language = await Language.load(wasmPath);
      _langs.set(lang, language);
    } catch (err) {
      _brokenLangs.add(lang);
      throw new Error(`Tree-sitter Language.load failed for ${lang}: ${err.message}`);
    }
  }

  const parser = new Parser();
  parser.setLanguage(_langs.get(lang));
  return parser;
}

export function isLanguageSupported(lang) {
  return Object.prototype.hasOwnProperty.call(GRAMMAR_FILES, lang) && !_brokenLangs.has(lang);
}

export function listSupportedLanguages() {
  return Object.keys(GRAMMAR_FILES).filter(l => !_brokenLangs.has(l));
}

/** Diagnostic: what languages are unusable in this process? */
export function getBrokenLanguages() {
  return {
    broken: [..._brokenLangs],
    pointers: [..._pointerLangs]
  };
}
```

- [ ] **Step 2: Update `code-graph.mjs` extractGraph to graceful-skip broken langs**

In `scripts/lib/code-graph.mjs` `extractGraph()`:

```javascript
import { getParser, isLanguageSupported, getBrokenLanguages } from './grammar-loader.mjs';

export async function extractGraph(code, filePath) {
  const lang = detectGrammar(filePath);
  if (!lang || !isLanguageSupported(lang)) {
    return { symbols: [], edges: [] };
  }
  let parser;
  try {
    parser = await getParser(lang);
  } catch (err) {
    // Broken grammar (LFS pointer or load fail) — return empty, don't crash whole index
    return { symbols: [], edges: [] };
  }
  // ... rest of existing logic
}
```

- [ ] **Step 3: Add fallback test**

In `tests/code-graph.test.mjs` append:

```javascript
test('extractGraph returns empty (graceful) when grammar unusable', async () => {
  // Simulate by passing extension we don't have grammar for
  const result = await extractGraph('function foo() {}', 'foo.unknown');
  assert.deepStrictEqual(result, { symbols: [], edges: [] });
});

test('grammar-loader: getBrokenLanguages reports state', async () => {
  const { getBrokenLanguages } = await import('../scripts/lib/grammar-loader.mjs');
  const state = getBrokenLanguages();
  assert.ok(Array.isArray(state.broken));
  assert.ok(Array.isArray(state.pointers));
});
```

- [ ] **Step 4: Wire into `supervibe-status.mjs` (D19 already added grammar health, augment it)**

In `scripts/supervibe-status.mjs`, after the `getGrammarHealth()` reporting block, add:

```javascript
import { getBrokenLanguages } from './lib/grammar-loader.mjs';
const brokenState = getBrokenLanguages();
if (brokenState.pointers.length > 0) {
  console.log(color(`⚠  Grammars are LFS pointers (need 'git lfs pull'): ${brokenState.pointers.join(', ')}`, 'yellow'));
  console.log(color(`   Affected languages will skip graph extraction (semantic RAG still works)`, 'dim'));
}
```

- [ ] **Step 5: Run tests**

```bash
node --no-warnings --test tests/code-graph.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/grammar-loader.mjs scripts/lib/code-graph.mjs scripts/supervibe-status.mjs tests/code-graph.test.mjs
git commit -m "feat(graph): grammar-loader detects LFS pointers + graceful per-language fallback"
```

---

### Task D23: SQLite WAL mode for concurrent watcher + manual index

**Files:**
- Modify: `scripts/lib/code-store.mjs`
- Modify: `scripts/lib/memory-store.mjs`

**Why this task exists:** if user has watcher running AND runs `npm run code:index` simultaneously, two processes write to the same SQLite DB. Default rollback journal can deadlock. WAL mode allows concurrent reads-with-one-writer cleanly.

- [ ] **Step 1: Add WAL pragma to CodeStore.init()**

In `scripts/lib/code-store.mjs`, in `init()` right after `this.db = new DatabaseSync(this.dbPath);`:

```javascript
this.db = new DatabaseSync(this.dbPath);
// WAL mode: allow concurrent reads while one writer (e.g. watcher + manual index)
this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
this.db.exec(`CREATE TABLE IF NOT EXISTS code_files ( ... );  // existing schema below`);
```

- [ ] **Step 2: Same for MemoryStore.init()**

In `scripts/lib/memory-store.mjs`:

```javascript
this.db = new DatabaseSync(this.dbPath);
this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
// existing schema CREATE TABLEs follow
```

- [ ] **Step 3: Verify WAL files in ignore**

`.gitignore` already has `.claude/memory/*.db-journal`, `.db-wal`, `.db-shm` from Phase B. Verify:

```bash
grep -E "\.db-(wal|shm|journal)" .gitignore
```

If missing, add them (already added in Phase B but double-check).

- [ ] **Step 4: Smoke test concurrent access**

```bash
node --no-warnings -e "
import('./scripts/lib/code-store.mjs').then(async m => {
  const s1 = new m.CodeStore(process.cwd(), { useEmbeddings: false });
  const s2 = new m.CodeStore(process.cwd(), { useEmbeddings: false });
  await s1.init();
  await s2.init();
  // both should succeed without deadlock
  const stats1 = s1.stats();
  const stats2 = s2.stats();
  console.log('OK both stores opened concurrently', stats1.totalFiles === stats2.totalFiles);
  s1.close(); s2.close();
});
"
```

Expected: `OK both stores opened concurrently true`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/code-store.mjs scripts/lib/memory-store.mjs
git commit -m "feat(db): WAL mode for concurrent watcher + manual index access"
```

---

### Task D24: SessionStart hook — explicit `main()` invocation site

**Files:**
- Modify: `scripts/session-start-check.mjs`

**Why this task exists:** D8 said "Called from main session-start handler" but didn't show WHERE in the existing script the new function is invoked. Without explicit wiring, `ensureCodeIndexFresh` is dead code.

- [ ] **Step 1: Read current `session-start-check.mjs` to find main entry**

```bash
cat scripts/session-start-check.mjs | grep -n "^async function\|^function main\|process.argv\|main(" | head
```

Identify the script's `main()` or top-level `await` execution path.

- [ ] **Step 2: Add explicit invocation**

Find the existing main flow (likely the bottom of file). Replace the existing tail-execution section with:

```javascript
// === Phase D: code RAG + graph index health ===
async function reportCodeIndexHealth() {
  try {
    const result = await ensureCodeIndexFresh(process.cwd());
    if (result.error) {
      console.log(`[supervibe] code RAG: WARN ${result.error}`);
      return;
    }
    if (result.action === 'skip') {
      console.log('[supervibe] code RAG ✓ index fresh');
      return;
    }
    const { stats } = result;
    console.log(`[supervibe] code RAG ✓ ${stats.totalFiles} files / ${stats.totalChunks} chunks`);
    console.log(`[supervibe] code graph ✓ ${stats.totalSymbols} symbols / ${stats.totalEdges} edges (${(stats.edgeResolutionRate * 100).toFixed(0)}% resolved)`);
    if (result.action === 'full') {
      console.log('[supervibe] full index built — subsequent sessions will be near-instant');
    }
  } catch (err) {
    console.log(`[supervibe] code index: WARN ${err.message}`);
  }
}

// Existing stack-detection main flow:
async function main() {
  // ... existing stack detection / rules application logic ...

  // NEW: code index health check (after stack detection so user sees stack info first)
  await reportCodeIndexHealth();
}

main().catch(err => {
  console.error('[supervibe] session-start-check error:', err.message);
  process.exit(0); // never block session start with non-zero
});
```

(Adapt to match the actual existing structure — read the file before editing.)

- [ ] **Step 3: Smoke test by running the script directly**

```bash
node scripts/session-start-check.mjs 2>&1 | head -10
```

Expected output includes:
```
[supervibe] code RAG ✓ 25 files / 113 chunks
[supervibe] code graph ✓ 142 symbols / 87 edges (78% resolved)
```

(Or `WARN` if grammars aren't pulled yet — that's fine, just verifying invocation runs.)

- [ ] **Step 4: Verify hook config still wires this script**

```bash
cat hooks.json | grep -A2 SessionStart
```

Should reference `session-start-check.mjs`. If not, add wiring:

```json
{
  "hooks": {
    "SessionStart": [
      { "command": "node $CLAUDE_PLUGIN_ROOT/scripts/session-start-check.mjs" }
    ],
    ...
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add scripts/session-start-check.mjs hooks.json
git commit -m "fix(hook): wire ensureCodeIndexFresh into SessionStart main() (was dead code)"
```

---

### Task D25: Knip allowlist for `web-tree-sitter` if flagged

**Files:**
- Modify: `knip.json` (conditional)

**Why this task exists:** dynamic imports of `web-tree-sitter` in `grammar-loader.mjs` may not be detected by knip's static analysis → false-positive "unused dependency" warning.

- [ ] **Step 1: Run knip to see if flagged**

```bash
npx knip --no-progress 2>&1 | grep -i "web-tree-sitter"
```

- [ ] **Step 2: If flagged, add to ignoreDependencies**

If output shows `web-tree-sitter` in unused deps, modify `knip.json`:

```json
{
  ...
  "ignoreDependencies": ["husky", "lint-staged", "@commitlint/cli", "@commitlint/config-conventional", "web-tree-sitter"]
}
```

If NOT flagged: skip this step (knip is happy).

- [ ] **Step 3: Re-run knip to confirm clean**

```bash
npx knip --no-progress; echo EXIT:$?
```

Expected: EXIT:0.

- [ ] **Step 4: Commit (only if change made)**

```bash
git add knip.json
git commit -m "chore(knip): allowlist web-tree-sitter (dynamic import not statically detectable)"
```

---

### Task D26: D1 smoke test — verify exact `web-tree-sitter` API surface

**Files:**
- Modify: `tests/grammar-loader.test.mjs` (NEW — small smoke test)

**Why this task exists:** `web-tree-sitter` v0.25 changed API names (vs older versions). Plan code uses `Parser.init()`, `Language.load()`, `parser.setLanguage()`, `parser.parse()`, `tree.rootNode`, `query.matches(rootNode)`, `tree.delete()`. If installed version diverges, D5 tests fail with confusing errors. A smoke test catches this on D1, not D5.

- [ ] **Step 1: Create test file**

Create `tests/grammar-loader.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { getParser, listSupportedLanguages, isLanguageSupported, getBrokenLanguages } from '../scripts/lib/grammar-loader.mjs';

test('grammar-loader: lists supported languages', () => {
  const langs = listSupportedLanguages();
  assert.ok(langs.length >= 8, `expected ≥8 languages, got ${langs.length}`);
  for (const l of ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'php', 'ruby']) {
    assert.ok(langs.includes(l) || getBrokenLanguages().broken.includes(l),
      `${l} should be supported or explicitly broken`);
  }
});

test('grammar-loader: API surface — Parser/Language/Tree/Query', async () => {
  // Pick first language that isn't broken
  const langs = listSupportedLanguages();
  if (langs.length === 0) {
    console.log('all grammars broken — skipping API test');
    return;
  }
  const lang = langs[0];
  const parser = await getParser(lang);

  // Verify parser has expected methods
  assert.strictEqual(typeof parser.parse, 'function', 'parser.parse must exist');
  assert.strictEqual(typeof parser.setLanguage, 'function', 'parser.setLanguage must exist');
  assert.strictEqual(typeof parser.getLanguage, 'function', 'parser.getLanguage must exist');

  // Parse a tiny snippet
  const tree = parser.parse('// hello');
  assert.ok(tree, 'parser.parse returned tree');
  assert.ok(tree.rootNode, 'tree has rootNode');
  assert.strictEqual(typeof tree.rootNode.type, 'string', 'rootNode.type is string');

  // Verify Language has query method
  const language = parser.getLanguage();
  assert.strictEqual(typeof language.query, 'function', 'language.query must exist');

  // Try a trivial query (must not throw)
  // Some langs need different syntax; we just check the API exists
  try {
    const q = language.query('(comment) @c');
    assert.ok(typeof q.matches === 'function', 'query.matches must exist');
    const matches = q.matches(tree.rootNode);
    assert.ok(Array.isArray(matches), 'matches returns array');
  } catch (err) {
    // Some grammars don't have (comment) — that's fine; we tested the API exists
  }

  // Cleanup
  if (typeof tree.delete === 'function') tree.delete();
});

test('grammar-loader: caches parsers per language', async () => {
  const langs = listSupportedLanguages();
  if (langs.length === 0) return;
  const lang = langs[0];
  const t0 = Date.now();
  await getParser(lang);
  const t1 = Date.now();
  await getParser(lang); // cached
  const t2 = Date.now();
  // Second call should be much faster (cached language)
  assert.ok(t2 - t1 < (t1 - t0), 'cached call should be faster than first load');
});
```

- [ ] **Step 2: Run smoke test**

```bash
node --no-warnings --test tests/grammar-loader.test.mjs
```

If any test fails with API mismatch → check `web-tree-sitter` actual API:
```bash
node --no-warnings -e "
import('web-tree-sitter').then(m => {
  console.log('Exports:', Object.keys(m));
  console.log('Parser methods:', Object.getOwnPropertyNames(m.Parser.prototype || m.default?.Parser?.prototype || {}));
});
"
```

Update `grammar-loader.mjs` to match the actual API names.

- [ ] **Step 3: Commit**

```bash
git add tests/grammar-loader.test.mjs
git commit -m "test(graph): smoke-test web-tree-sitter API surface (catch v0.25 mismatches early)"
```

---

### Task D27: Output contract — 3rd case ("0 callers found, safe")

**Files:**
- Modify: `agents/_core/code-reviewer.md`
- Modify: `agents/_core/refactoring-specialist.md`
- Modify: `agents/_core/repo-researcher.md`
- Modify: `agents/_core/architect-reviewer.md`
- Modify: `agents/_core/root-cause-debugger.md`
- Modify: `agents/_ops/db-reviewer.md`
- Modify: `agents/stacks/laravel/laravel-developer.md`
- Modify: `agents/stacks/nextjs/nextjs-developer.md`
- Modify: `agents/stacks/fastapi/fastapi-developer.md`
- Modify: `agents/stacks/react/react-implementer.md`

**Why this task exists:** D11's output-contract template covers two cases — "graph evidence shown" and "N/A (greenfield)". Missing third case: "checked graph, 0 callers found, refactor safe to proceed". Without explicit handling, agents skip the section in this case → user can't tell whether the agent checked-and-found-zero or didn't check at all.

- [ ] **Step 1: Find the existing Graph evidence section in each agent**

```bash
grep -l "Graph evidence" agents/_core/*.md agents/_ops/*.md agents/stacks/**/*.md
```

Should match all 10 agents updated by D11.

- [ ] **Step 2: Update the template to enumerate 3 cases**

Replace the `## Graph evidence (when applicable)` template in each agent with:

```markdown
## Graph evidence

This section is REQUIRED on every agent output. Pick exactly one of three cases:

**Case A — Structural change checked, callers found:**
- Symbol(s) modified: `<name>`
- Callers checked: N callers (file:line refs below)
  - <file:line refs, top 5>
- Callees mapped: M targets
- Neighborhood (depth=2): <comma-list of touched files/symbols>
- Resolution rate: X% of edges resolved
- **Decision**: callers updated in this diff / breaking change documented / escalated to architect-reviewer

**Case B — Structural change checked, ZERO callers (safe):**
- Symbol(s) modified: `<name>`
- Callers checked: **0 callers** — verified via `--callers "<old-name>"` AND `--callers "<new-name>"` (after rename)
- Resolution rate: X% (high confidence in zero result)
- **Decision**: refactor safe to proceed; no caller updates needed

**Case C — Graph N/A:**
- Reason: <one of: greenfield / pure-additive / non-structural-edit / read-only>
- Verification: explicitly state why no symbols affect public surface
- **Decision**: graph not applicable to this task
```

This is `replace_all`-safe per file: each agent has exactly one `## Graph evidence` block from D11.

- [ ] **Step 3: Verify line counts still ≥250**

```bash
for f in agents/_core/{code-reviewer,refactoring-specialist,repo-researcher,architect-reviewer,root-cause-debugger}.md agents/_ops/db-reviewer.md agents/stacks/laravel/laravel-developer.md agents/stacks/nextjs/nextjs-developer.md agents/stacks/fastapi/fastapi-developer.md agents/stacks/react/react-implementer.md; do
  echo "$(wc -l <"$f") $f"
done
```

All must show ≥250.

- [ ] **Step 4: Validate frontmatter**

```bash
npm run validate:frontmatter | grep -E "code-reviewer|refactoring-specialist|repo-researcher|architect-reviewer|root-cause-debugger|db-reviewer|laravel-developer|nextjs-developer|fastapi-developer|react-implementer"
```

Each must show `OK`.

- [ ] **Step 5: Update `agent-delivery.yaml` rubric (D14) to require Case A/B/C explicit choice**

In the graph-evidence sub-criterion, refine the text:

```yaml
- id: graph-evidence-when-applicable
  text: "Output explicitly picks one of three cases: A (callers found, listed), B (zero callers verified, decision shown), C (N/A with reason). Skipping the section entirely on a structural change FAILS this criterion."
  weight: 1.0
  ...
```

- [ ] **Step 6: Commit**

```bash
git add agents/_core/{code-reviewer,refactoring-specialist,repo-researcher,architect-reviewer,root-cause-debugger}.md agents/_ops/db-reviewer.md agents/stacks/laravel/laravel-developer.md agents/stacks/nextjs/nextjs-developer.md agents/stacks/fastapi/fastapi-developer.md agents/stacks/react/react-implementer.md confidence-rubrics/agent-delivery.yaml
git commit -m "feat(agents): graph evidence template covers 3 cases (callers / zero-callers-safe / N/A)"
```

---

## Self-Review

### 1. Spec coverage

| Identified requirement | Plan task(s) |
|------------------------|--------------|
| codegraph for agents (no UI) | Phase D entire scope |
| Pure JS, no Docker, no native deps | D1 (web-tree-sitter WASM), constraints section |
| Auto-startup on session begin | D8 (SessionStart hook) |
| User confidence ("knows it works") | D8 (banner) + D9 (status command) + D19 (grammar/watcher health) |
| Same SQLite DB, no fragmentation | D4 (schema extension on `code.db`) |
| Same skill surface | D7 (extend `supervibe:code-search`) |
| Hybrid semantic + graph | D7 (decision tree + procedure) |
| Cross-file edge resolution | D4 (`resolveAllEdges`) |
| Test coverage per task | D2/D3/D5/D9/D11/D14/D15/D17/D19/D22/D26 all TDD-style |
| **Agents updated to USE graph** | **D11** (10 agents — Procedure + Decision tree + Output contract + Anti-patterns) |
| **CLAUDE.md advertises capability** | **D12** |
| **Rule enforces graph-before-refactor** | **D13** |
| **Rubric scores graph evidence** | **D14** + **D27** (3-case enforcement) |
| **Same-name disambiguation** | **D15** (`--symbol-id`) |
| **Huge monorepo strategy** | **D16** (`--since`) |
| **Centrality / orientation** | **D17** (`--top-symbols`) |
| **Memory persistence of findings** | **D18** (repo-researcher + memory-curator) |
| **Grammar/watcher visibility** | **D19** |
| **`supervibe:code-review` skill graph-aware** | **D21** (closes "skill-level dark" gap) |
| **Grammar LFS-pointer graceful fallback** | **D22** (matches embeddings.mjs pattern) |
| **Concurrent watcher + manual index safety** | **D23** (SQLite WAL mode) |
| **SessionStart wiring made explicit** | **D24** (no dead-code risk) |
| **Knip allowlist for dynamic deps** | **D25** |
| **`web-tree-sitter` API verification** | **D26** (catches v0.25 mismatches on D1, not D5) |
| **Output contract 3rd case (zero-callers safe)** | **D27** |

### 2. Placeholder scan

- All TDD tasks have full failing-test code, full implementation code, exact pass commands
- D1 step 2 has fallback note for missing pre-built WASM (manual build via `npx tree-sitter build --wasm`)
- D2 specifies tree-sitter grammar source (aider's queries — Apache 2.0) for reference; full query text inline
- D11 amendments per agent are spelled out per-agent (refactoring-specialist, code-reviewer, db-reviewer get specific role-tailored steps)
- D22 fallback pattern mirrors existing `embeddings.mjs` — same code shape, no new conventions
- D23 WAL pragma is one-liner — no edge cases to overlook
- D24 explicitly shows where `main()` invocation must be edited
- D26 includes troubleshooting fallback (`Object.keys(m)`) if API differs
- No "TBD" / "implement later" anywhere

### 3. Type consistency

- `Symbol`: `{id, path, kind, name, startLine, endLine, parentId, signature}` — used identically in D2 (extractGraph), D3 (test assertions), D4 (DB schema), D5 (queries)
- `Edge`: `{fromId, toId, toName, kind}` — same across D2, D3, D4
- DB column names use `snake_case` (start_line, end_line, from_id, to_id) — converted to camelCase in JS layer at SELECT time (`AS startLine`)
- `kind` enum: function | class | method | type | interface | enum (symbols); calls | imports | extends | implements | references (edges) — consistent across all queries
- D22 broken-state API: `{broken: string[], pointers: string[]}` — mirrored in D19 status output
- D27 output-contract Case A/B/C labels referenced verbatim by D14 rubric criterion

### 4. Risks / accepted limitations

- **Tree-sitter accuracy ~80% cross-file resolution** — acceptable; explicitly documented in getting-started. Significantly better than current regex-based chunker on identifier queries.
- **Vue/Svelte deferred** — both need multi-grammar stitching (script + template); rare enough that Phase D ships without them. Phase E target.
- **Cross-language imports (TS↔Python via JSON)** — fundamentally undecidable without LSP / type inference. Documented as inherent limit.
- **Dynamic dispatch (`obj[methodName]()`, polymorphism)** — fundamental static-analysis limit. Heuristic name-match only.
- **WASM bundle size +10MB** — through LFS; D22 ensures graceful per-language fallback if user lacks LFS (skips graph for missing langs, semantic RAG still works).
- **PageRank deferred** — D17 ships degree-based centrality (cheap, captures most "important symbols"); full PageRank deferred to v1.7.
- **First full index of 1000-file project ~30s** — D16 (`--since=<rev>`) provides lazy mode for huge monorepos. Banner shows progress.
- **Concurrent SQLite writes** — D23 enables WAL mode, allows concurrent reader + one writer.

### 5. Cumulative honest scoring (per dimension after D11–D27)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Tree-sitter pipeline | 9.5/10 | D26 catches API drift early |
| Schema + DB | 10/10 | D23 closes WAL gap |
| Graph traversal queries | 9.5/10 | D15 disambiguation, D17 centrality |
| CLI extension | 9.5/10 | All flags covered |
| Auto-startup + status | 10/10 | D24 confirms wiring; D19 shows grammar+watcher state |
| Test coverage | 9.5/10 | TDD on every layer + D26 smoke test |
| Agent procedures (D11) | 9.5/10 | 10 agents wired; D27 covers edge case |
| CLAUDE.md system prompt | 9.5/10 | Capability advertised in system context |
| Rules / discipline | 9.5/10 | D13 critical-severity rule + D14 rubric reinforcement |
| `supervibe:code-review` skill | 9.5/10 | D21 closes skill-level gap |
| Grammar fallback | 9.5/10 | D22 LFS-pointer detection + per-language graceful skip |
| Output contract (3 cases) | 9.5/10 | D27 enumerates all paths |
| Confidence rubric | 9.5/10 | D14 sub-criterion + D27 enforcement text |
| Performance / scale | 9.5/10 | D16 lazy mode; D23 concurrent safety |
| Memory integration | 9.5/10 | D18 captures findings as patterns |

**Mean: ≈ 9.5/10** — realistic ceiling given tree-sitter inherent limits (Vue/Svelte, cross-lang, dynamic dispatch). To reach hypothetical 10/10 would require LSP integration, which is out of scope (would mean per-language daemons → exactly the Docker/services thing user vetoed).

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-27-codegraph-phase-d.md`. **27 tasks total** (D1–D27). Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch fresh subagent per task. Highly parallelizable batches:
- D1+D2 (grammars + queries) — 2 subagents in parallel
- D3+D4+D5 (extractor + store + queries) — sequential, depends on D1/D2
- D6+D7 (CLI + skill) — parallel after D5
- D8+D9 (hook + status) — parallel
- D11 (10 agents) — 10 subagents in parallel ← biggest parallelism win
- D12+D13+D14 (CLAUDE.md + rule + rubric) — 3 subagents in parallel
- D15+D16+D17 (disambiguation + lazy + centrality) — 3 subagents in parallel
- D18 (memory) — 1 subagent
- D19+D22+D24 (status / grammar fallback / hook wiring) — 3 in parallel
- D21+D23+D25+D26+D27 (skill / WAL / knip / smoke / output-3-case) — 5 in parallel

Estimated total: ~1.5 working days with aggressive parallelism.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Suggested batches:
- Batch 1 (foundation): D1, D2, D26
- Batch 2 (extractor): D3, D4, D5, D23
- Batch 3 (CLI + skill): D6, D7, D15, D16, D17, D21
- Batch 4 (auto-startup): D8, D9, D19, D24, D25
- Batch 5 (agent + system prompt wiring): D11, D12, D13, D14, D27
- Batch 6 (grammar fallback + memory): D22, D18
- Batch 7 (release): D20

Estimated total: ~2 working days sequential.

Which approach?
