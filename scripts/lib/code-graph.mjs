// Tree-sitter-based code graph extractor.
// Parses source → AST → applies per-language S-expression query → emits symbols + edges.
// Pure JS via web-tree-sitter (WASM). No native deps.

import { Query } from 'web-tree-sitter';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { getParser, getLanguage, isLanguageSupported } from './grammar-loader.mjs';
import { extractScriptBlocks, extractTemplateRefs } from './sfc-extractor.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const QUERY_DIR = join(PLUGIN_ROOT, 'grammars', 'queries');

// Maps file extensions → grammar key.
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

// Single-File Component formats — handled via sfc-extractor (script parsed
// with embedded JS/TS grammar; template refs via lightweight regex).
const SFC_EXTENSIONS = new Set(['.vue', '.svelte']);

export function detectGrammar(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return null;
  return EXT_TO_GRAMMAR[filePath.slice(dot).toLowerCase()] || null;
}

export function isSfcFile(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return false;
  return SFC_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

const _queryTextCache = new Map();
function loadQueryText(lang) {
  // tsx reuses typescript query; .jsx reuses javascript (already in EXT_TO_GRAMMAR mapping)
  const key = lang === 'tsx' ? 'typescript' : lang;
  if (_queryTextCache.has(key)) return _queryTextCache.get(key);
  const queryFile = join(QUERY_DIR, `${key}.scm`);
  if (!existsSync(queryFile)) {
    _queryTextCache.set(key, null);
    return null;
  }
  const text = readFileSync(queryFile, 'utf8');
  _queryTextCache.set(key, text);
  return text;
}

const _queryObjectCache = new Map();
async function getCompiledQuery(lang) {
  const key = lang === 'tsx' ? 'typescript' : lang;
  if (_queryObjectCache.has(key)) return _queryObjectCache.get(key);
  const text = loadQueryText(lang);
  if (!text) return null;
  const language = await getLanguage(lang);
  try {
    const q = new Query(language, text);
    _queryObjectCache.set(key, q);
    return q;
  } catch {
    _queryObjectCache.set(key, null);
    return null;
  }
}

function makeId(path, kind, name, startLine) {
  return `${path}:${kind}:${name}:${startLine}`;
}

/**
 * Parse source text and extract symbols + edges.
 * @returns {Promise<{symbols: Symbol[], edges: Edge[]}>}
 *   Symbol: {id, path, kind, name, startLine, endLine, parentId?, signature, tokens?}
 *   Edge:   {fromId, toName, toId?, kind}  // toId resolved later (cross-file)
 */
export async function extractGraph(code, filePath) {
  // SFC (.vue/.svelte): extract script blocks, parse each with TS/JS grammar,
  // adjust line numbers + add template-ref edges. See sfc-extractor.mjs.
  if (isSfcFile(filePath)) {
    return extractGraphFromSfc(code, filePath);
  }

  const lang = detectGrammar(filePath);
  if (!lang || !isLanguageSupported(lang)) {
    return { symbols: [], edges: [] };
  }

  let parser;
  try {
    parser = await getParser(lang);
  } catch {
    return { symbols: [], edges: [] };
  }

  const tree = parser.parse(code);
  if (!tree) return { symbols: [], edges: [] };

  const query = await getCompiledQuery(lang);
  if (!query) {
    if (typeof tree.delete === 'function') tree.delete();
    return { symbols: [], edges: [] };
  }

  const matches = query.matches(tree.rootNode);
  const symbols = [];
  const edges = [];
  const symbolStack = []; // [{id, startByte, endByte}]

  // Sort matches by start position so parents come before children.
  const orderedMatches = matches.slice().sort((a, b) => {
    const ar = a.captures[0]?.node?.startIndex ?? 0;
    const br = b.captures[0]?.node?.startIndex ?? 0;
    return ar - br;
  });

  function findParentAt(startByte) {
    for (let i = symbolStack.length - 1; i >= 0; i--) {
      const s = symbolStack[i];
      if (s.startByte <= startByte && startByte < s.endByte) return s.id;
    }
    return null;
  }

  // Pass 1: collect symbols (resolves parents via stack)
  for (const match of orderedMatches) {
    for (const cap of match.captures) {
      const captureName = cap.name;
      if (!captureName.startsWith('symbol.')) continue;

      const kind = captureName.slice('symbol.'.length);
      const nameCap = match.captures.find(c => c.name === 'name');
      const name = nameCap ? nameCap.node.text : '<anonymous>';
      const node = cap.node;
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;

      // Drop stack entries that ended before this start
      while (symbolStack.length > 0 && symbolStack[symbolStack.length - 1].endByte <= node.startIndex) {
        symbolStack.pop();
      }
      const parentId = findParentAt(node.startIndex);
      const id = makeId(filePath, kind, name, startLine);

      const sigSrc = code.slice(node.startIndex, Math.min(node.startIndex + 200, node.endIndex));
      const signature = sigSrc.split('\n')[0];

      symbols.push({
        id,
        path: filePath,
        kind,
        name,
        startLine,
        endLine,
        parentId,
        signature,
        tokens: 0  // populated by caller if needed
      });

      symbolStack.push({ id, startByte: node.startIndex, endByte: node.endIndex });
    }
  }

  // Pass 2: collect edges with current containing symbol via byte position
  // (rebuild stack walking matches in order again)
  symbolStack.length = 0;
  // Index symbols by start byte for parent lookup
  const symStartIndex = new Map();
  // Build byte→id stack again by walking ordered matches
  for (const match of orderedMatches) {
    for (const cap of match.captures) {
      if (!cap.name.startsWith('symbol.')) continue;
      const node = cap.node;
      const kind = cap.name.slice('symbol.'.length);
      const nameCap = match.captures.find(c => c.name === 'name');
      const name = nameCap ? nameCap.node.text : '<anonymous>';
      const startLine = node.startPosition.row + 1;
      symStartIndex.set(node.startIndex, makeId(filePath, kind, name, startLine));
    }
  }

  // Build a sorted list of symbol byte ranges for parent lookup
  const symRanges = symbols
    .map(s => ({ id: s.id, startByte: code.split('\n').slice(0, s.startLine - 1).join('\n').length, endByte: -1 }))
    .sort((a, b) => a.startByte - b.startByte);
  // Actually compute endByte from symbols directly via tree node — re-parse positions:
  // Simpler: use the orderedMatches loop again to track stack as in pass 1.
  symbolStack.length = 0;

  for (const match of orderedMatches) {
    // Process symbols in this match first (push onto stack)
    for (const cap of match.captures) {
      if (!cap.name.startsWith('symbol.')) continue;
      const node = cap.node;
      while (symbolStack.length > 0 && symbolStack[symbolStack.length - 1].endByte <= node.startIndex) {
        symbolStack.pop();
      }
      const kind = cap.name.slice('symbol.'.length);
      const nameCap = match.captures.find(c => c.name === 'name');
      const name = nameCap ? nameCap.node.text : '<anonymous>';
      const startLine = node.startPosition.row + 1;
      symbolStack.push({
        id: makeId(filePath, kind, name, startLine),
        startByte: node.startIndex,
        endByte: node.endIndex
      });
    }

    // Then process edges in this match
    for (const cap of match.captures) {
      if (!cap.name.startsWith('edge.')) continue;
      const kind = cap.name.slice('edge.'.length);
      const targetCap = match.captures.find(c => c.name === 'target' || c.name === 'import-target');
      if (!targetCap) continue;
      const toName = targetCap.node.text.replace(/^["'`]|["'`]$/g, '');

      // Drop stack entries that ended before this edge
      while (symbolStack.length > 0 && symbolStack[symbolStack.length - 1].endByte <= cap.node.startIndex) {
        symbolStack.pop();
      }
      const fromId = symbolStack.length > 0
        ? symbolStack[symbolStack.length - 1].id
        : makeId(filePath, 'file', '<module>', 1);

      edges.push({
        fromId,
        toName,
        toId: null,
        kind
      });
    }
  }

  if (typeof tree.delete === 'function') tree.delete();
  return { symbols, edges };
}

// Note: cross-file edge resolution is performed in CodeStore via SQL
// (UPDATE code_edges SET to_id = ... lookup), not here. extractGraph
// always returns toId=null; CodeStore.resolveAllEdges() fills them.

/**
 * Vue / Svelte SFC graph extraction.
 *
 * Pipeline:
 *   1. Find every <script> block via sfc-extractor → get { code, lang, lineOffset }
 *   2. Run extractGraphFromCode() on each script block (synthetic file path so
 *      grammar dispatch picks the right TS/JS query)
 *   3. Re-base symbols' startLine/endLine + edge fromId by lineOffset
 *      (so they map to the original SFC line numbers)
 *   4. Add template-side reference edges via extractTemplateRefs() — these are
 *      `references` edges from the file's <module> to each referenced identifier
 *
 * Limitations (documented):
 *   - Template scoping not modeled (e.g., v-for item shadows methods)
 *   - <style> blocks ignored (CSS not part of code graph)
 *   - Multiple <script> blocks (e.g., Svelte's `<script context="module">`
 *     + setup) are concatenated by independent extraction passes; symbols from
 *     each block keep their original block's line offset.
 */
async function extractGraphFromSfc(code, filePath) {
  const blocks = extractScriptBlocks(code);
  const symbols = [];
  const edges = [];

  for (const block of blocks) {
    if (!isLanguageSupported(block.lang)) continue;

    // Synthetic path so detectGrammar resolves to the right grammar.
    // Use the original SFC path + a marker, but the EXT_TO_GRAMMAR lookup
    // happens off the synthetic ext.
    const syntheticExt = block.lang === 'typescript' ? '.ts' : '.js';
    const syntheticPath = `${filePath}__script${syntheticExt}`;

    const sub = await extractGraph(block.code, syntheticPath);

    // Re-base line numbers: block.lineOffset is the 1-based line of the FIRST
    // content line of the script, so newSymbol.startLine = oldStart + offset - 1.
    const offset = block.lineOffset - 1;
    for (const s of sub.symbols) {
      const reID = makeId(filePath, s.kind, s.name, s.startLine + offset);
      symbols.push({
        ...s,
        id: reID,
        path: filePath,
        startLine: s.startLine + offset,
        endLine: s.endLine + offset,
        parentId: s.parentId
          ? s.parentId.replace(syntheticPath, filePath).replace(
              /:(\d+)$/,
              (_, n) => `:${parseInt(n, 10) + offset}`
            )
          : null,
      });
    }
    for (const e of sub.edges) {
      // Re-base fromId line number + path
      const newFrom = e.fromId
        .replace(syntheticPath, filePath)
        .replace(/:(\d+)$/, (_, n) => `:${parseInt(n, 10) + offset}`);
      edges.push({ ...e, fromId: newFrom });
    }
  }

  // Add template-side reference edges. Each ref is a `references` edge from
  // the SFC's module-level scope to the named identifier.
  const moduleId = makeId(filePath, 'file', '<module>', 1);
  const refs = extractTemplateRefs(code);
  for (const ref of refs) {
    edges.push({
      fromId: moduleId,
      toName: ref.name,
      toId: null,
      kind: 'references',
    });
  }

  return { symbols, edges };
}
