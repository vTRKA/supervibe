// Lazy WASM grammar loader for tree-sitter-based code graph extraction.
// Pure JS — uses web-tree-sitter (WASM bytecode runs via Node's built-in WebAssembly).
// No native compilation. No Docker. No external services.
//
// Robustness:
//   - Detects missing or truncated WASM grammar files
//   - Per-language graceful fallback: if grammar broken, mark lang broken,
//     graph extraction for that language returns empty (semantic RAG still works)
//   - Caches Parser+Language per process

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

// Smallest legit WASM grammar in our set is tree-sitter-go (~213KB).
// 50KB threshold is safely below the smallest bundled grammar.
const MIN_WASM_BYTES = 50_000;

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
      return { ok: false, reason: 'truncated', size };
    }
  } catch (err) {
    return { ok: false, reason: 'stat-failed', err: err.message };
  }
  return { ok: true };
}

/**
 * Lazy-load and return the Language object for a given lang key.
 * @throws Error if grammar file unusable.
 */
export async function getLanguage(lang) {
  if (!GRAMMAR_FILES[lang]) {
    throw new Error(`Unsupported language for graph extraction: ${lang}`);
  }
  if (_brokenLangs.has(lang)) {
    throw new Error(`Grammar for ${lang} is unusable (missing or truncated). Reinstall Supervibe.`);
  }

  await ensureParserInit();

  if (!_langs.has(lang)) {
    const wasmPath = join(GRAMMAR_DIR, GRAMMAR_FILES[lang]);
    const check = isWasmFileUsable(wasmPath);
    if (!check.ok) {
      _brokenLangs.add(lang);
      if (check.reason === 'truncated') _pointerLangs.add(lang);
      if (process.env.SUPERVIBE_VERBOSE === '1') {
        console.warn(`[supervibe/grammar] ${lang} grammar unusable: ${check.reason}${check.size ? ` (${check.size}B)` : ''}. Reinstall Supervibe.`);
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

  return _langs.get(lang);
}

/**
 * Get a parser for the given language. Lazy-loads on first call.
 * Returns the Parser; use getLanguage(lang) separately if you need to build a Query.
 * @throws Error if language unsupported or grammar file unusable
 */
export async function getParser(lang) {
  const language = await getLanguage(lang);
  const parser = new Parser();
  parser.setLanguage(language);
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
