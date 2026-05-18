// SQLite-backed code RAG with hybrid (FTS5 + semantic) search.
// Mirrors MemoryStore but for source code: per-file rows + per-chunk embeddings.
// Hash-based change detection skips unchanged files on re-index.

import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { Worker } from 'node:worker_threads';
import { hashFile } from './file-hash.mjs';
import { chunkCode, detectLanguage, estimateCodeTokens, isGraphIndexableLanguage } from './code-chunker.mjs';
import { parseSemanticAnchors } from './supervibe-semantic-anchor-index.mjs';
import { loadNodeSqliteDatabaseSync } from './node-sqlite-runtime.mjs';
import { classifyIndexPath, discoverSourceFiles, isGeneratedPath, looksMinifiedSymbolName, pruneCodeIndex } from './supervibe-index-policy.mjs';
import { applyCodeDbMigrations } from './supervibe-db-migrations.mjs';

export const CODE_GRAPH_EXTRACTOR_VERSION = 3;
export const CODE_RAG_CHUNK_METADATA_VERSION = 2;
export const CODE_RAG_ENTITY_METADATA_VERSION = 1;
const DEFAULT_LARGE_FILE_CHAR_THRESHOLD = 100_000;
const DEFAULT_CHUNK_TIMEOUT_MS = 30_000;
const DEFAULT_LARGE_FILE_THRESHOLD_BYTES = 128 * 1024;
const DEFAULT_LARGE_FILE_THRESHOLD_LINES = 2_500;
const DEFAULT_LARGE_FILE_CHUNK_LINES = 240;
const DEFAULT_LARGE_FILE_CHUNK_BYTES = 64 * 1024;
const DEFAULT_LARGE_FILE_MAX_SECONDS = 30;
const DEFAULT_GRAPH_EXTRACTION_LARGE_FILE_MODE = 'skip';
const DEFAULT_LARGE_FILE_FALLBACK_MODE = 'structural';
const DEFAULT_KNOWN_FAILED_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_SEMANTIC_CANDIDATE_LIMIT = 5000;

const EXTENSION_RESOLUTION = {
  typescript: ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'],
  tsx: ['.tsx', '.ts', '.d.ts', '.js', '.jsx', '/index.tsx', '/index.ts', '/index.js', '/index.jsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs', '/index.js', '/index.jsx'],
  jsx: ['.jsx', '.js', '/index.jsx', '/index.js'],
  python: ['.py', '/__init__.py'],
  go: ['.go'],
  php: ['.php'],
  ruby: ['.rb'],
  java: ['.java'],
  rust: ['.rs', '/mod.rs'],
};

const JS_LIKE_LANGUAGES = new Set(['typescript', 'tsx', 'javascript', 'jsx']);
let embeddingsModulePromise = null;

async function loadEmbeddingHelpers() {
  embeddingsModulePromise ||= (async () => await import('./embeddings.mjs'))();
  return embeddingsModulePromise;
}

function normalizeRelPath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function positiveInt(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.trunc(num) : fallback;
}

function boundedNonNegativeInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.trunc(num) : fallback;
}

function searchTermsForAnchors(query = '', maxTerms = 8) {
  const terms = String(query || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}_.\/-]+/gu) || [];
  return [...new Set(terms)]
    .filter((term) => term.length >= 3)
    .slice(0, maxTerms);
}

function escapeLikeTerm(term = '') {
  return String(term || '').replace(/[\\%_]/g, (match) => '\\' + match);
}
function redactIndexableSecrets(value = '') {
  let redacted = false;
  const text = String(value || '')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, () => {
      redacted = true;
      return '[REDACTED_SECRET]';
    })
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, () => {
      redacted = true;
      return '[REDACTED_AWS_KEY]';
    })
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, () => {
      redacted = true;
      return '[REDACTED_PRIVATE_KEY]';
    });
  return { text, redacted };
}

function nonNegativeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function resolveImportSource(importSource, fromRelPath, language, fileSet) {
  if (!importSource || isExternalImportSource(importSource, language)) return null;
  const candidates = [];
  const fromDir = dirname(fromRelPath);
  const base = importSource.startsWith('.')
    ? normalizeRelPath(relative('.', resolve(fromDir, importSource)))
    : resolveAliasedImportSource(importSource);
  if (!base) return null;

  candidates.push(base);
  for (const suffix of EXTENSION_RESOLUTION[language] || []) {
    candidates.push(`${base}${suffix}`);
  }
  for (const candidate of candidates.map(normalizeRelPath)) {
    if (fileSet.has(candidate)) return candidate;
  }
  return null;
}

function resolveAliasedImportSource(importSource) {
  const aliases = [
    ['@/', 'src/'],
    ['~/', 'src/'],
    ['@src/', 'src/'],
    ['src/', 'src/'],
    ['@app/', 'app/'],
    ['app/', 'app/'],
  ];
  for (const [prefix, replacement] of aliases) {
    if (importSource.startsWith(prefix)) return importSource.replace(prefix, replacement);
  }
  return importSource.includes('/') ? importSource : null;
}

function isExternalImportSource(importSource, language) {
  if (importSource.startsWith('.')) return false;
  if (JS_LIKE_LANGUAGES.has(language)) {
    if (importSource.startsWith('@/') || importSource.startsWith('~/') || importSource.startsWith('@src/') || importSource.startsWith('src/') || importSource.startsWith('@app/') || importSource.startsWith('app/')) {
      return false;
    }
    return true;
  }
  if (language === 'python') {
    return !importSource.startsWith('.') && !importSource.includes('.') && !importSource.includes('/');
  }
  return false;
}

function buildImportMapForFile({ content, relPath, language, fileSet }) {
  const mappings = new Map();
  if (!content) return mappings;
  const add = ({ localName, exportedName = localName, source }) => {
    if (!localName || !source) return;
    const sourceFile = resolveImportSource(source, relPath, language, fileSet);
    if (!sourceFile) return;
    const existing = mappings.get(localName) || [];
    existing.push({ localName, exportedName, source, sourceFile });
    mappings.set(localName, existing);
  };

  if (JS_LIKE_LANGUAGES.has(language)) {
    const importRe = /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]+)\})?\s*(?:\*\s+as\s+(\w+)\s*)?from\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRe.exec(content)) !== null) {
      const [, defaultImport, namedImports, namespaceImport, source] = match;
      if (defaultImport) add({ localName: defaultImport, exportedName: 'default', source });
      if (namespaceImport) add({ localName: namespaceImport, exportedName: '*', source });
      if (namedImports) {
        for (const rawName of namedImports.split(',')) {
          const part = rawName.trim().replace(/^type\s+/, '');
          if (!part) continue;
          const alias = part.match(/^(\w+)\s+as\s+(\w+)$/);
          add({
            localName: alias ? alias[2] : part,
            exportedName: alias ? alias[1] : part,
            source,
          });
        }
      }
    }
    const requireRe = /(?:const|let|var)\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRe.exec(content)) !== null) {
      add({ localName: match[1], exportedName: 'default', source: match[2] });
    }
  } else if (language === 'python') {
    const fromImportRe = /^\s*from\s+([.\w]+)\s+import\s+(.+)$/gm;
    let match;
    while ((match = fromImportRe.exec(content)) !== null) {
      const [, moduleName, names] = match;
      for (const rawName of names.split(',')) {
        const part = rawName.trim();
        const alias = part.match(/^(\w+)\s+as\s+(\w+)$/);
        add({
          localName: alias ? alias[2] : part,
          exportedName: alias ? alias[1] : part,
          source: pythonModuleToPath(moduleName, relPath),
        });
      }
    }
  } else if (language === 'rust') {
    const useRe = /^\s*use\s+([^;]+);/gm;
    let match;
    while ((match = useRe.exec(content)) !== null) {
      for (const entry of parseRustUseEntries(match[1], relPath)) {
        add(entry);
      }
    }
  } else if (language === 'php') {
    const useRe = /^\s*use\s+([^;]+);/gm;
    let match;
    while ((match = useRe.exec(content)) !== null) {
      const full = match[1].trim();
      const alias = full.match(/\s+as\s+(\w+)$/i);
      const clean = full.replace(/\s+as\s+\w+$/i, '');
      const localName = alias ? alias[1] : clean.split('\\').pop();
      const source = clean.replace(/\\/g, '/');
      add({ localName, exportedName: localName, source: `${source}.php` });
    }
  }

  return mappings;
}

function parseRustUseEntries(rawUse, fromRelPath) {
  const text = String(rawUse || '').trim();
  if (!text) return [];
  const entries = [];
  const brace = text.match(/^(.*)::\{(.+)\}$/s);
  if (brace) {
    const prefix = brace[1].trim();
    const names = brace[2].split(',').map((part) => part.trim()).filter(Boolean);
    for (const namePart of names) {
      if (namePart === 'self' || namePart === '*') continue;
      const alias = namePart.match(/^(\w+)\s+as\s+(\w+)$/);
      const exportedName = alias ? alias[1] : namePart;
      const localName = alias ? alias[2] : namePart;
      const source = rustModuleToPath(prefix, fromRelPath);
      if (source) entries.push({ localName, exportedName, source });
    }
    return entries;
  }

  const alias = text.match(/^(.*)::(\w+)\s+as\s+(\w+)$/);
  if (alias) {
    const source = rustModuleToPath(alias[1], fromRelPath);
    if (source) entries.push({ localName: alias[3], exportedName: alias[2], source });
    return entries;
  }

  const simple = text.match(/^(.*)::(\w+)$/);
  if (simple) {
    const source = rustModuleToPath(simple[1], fromRelPath);
    if (source) entries.push({ localName: simple[2], exportedName: simple[2], source });
    return entries;
  }

  return entries;
}

function rustModuleToPath(moduleName, fromRelPath) {
  const parts = String(moduleName || '').split('::').filter(Boolean);
  if (parts.length === 0) return null;
  const relParts = normalizeRelPath(fromRelPath).split('/').filter(Boolean);
  const fileDir = dirname(fromRelPath);
  const head = parts[0];

  if (head === 'crate') {
    const srcIndex = relParts.lastIndexOf('src');
    const crateRoot = srcIndex >= 0 ? relParts.slice(0, srcIndex + 1).join('/') : fileDir;
    const rest = parts.slice(1);
    return normalizeRelPath([crateRoot, ...rest].filter(Boolean).join('/'));
  }

  if (head === 'self') {
    return normalizeRelPath([fileDir, ...parts.slice(1)].filter(Boolean).join('/'));
  }

  if (head === 'super') {
    let base = fileDir;
    let index = 0;
    while (parts[index] === 'super') {
      base = dirname(base);
      index += 1;
    }
    return normalizeRelPath([base, ...parts.slice(index)].filter(Boolean).join('/'));
  }

  return normalizeRelPath([fileDir, ...parts].filter(Boolean).join('/'));
}

function pythonModuleToPath(moduleName, fromRelPath) {
  const dots = moduleName.match(/^\.+/)?.[0]?.length || 0;
  const clean = moduleName.replace(/^\.+/, '').replace(/\./g, '/');
  if (dots === 0) return clean;
  let base = dirname(fromRelPath);
  for (let i = 1; i < dots; i++) base = dirname(base);
  return clean ? `${base}/${clean}` : base;
}

function selectBestEdgeTarget({ edge, candidates, importMap, fromLanguage, langByFile }) {
  if (candidates.length === 1) return candidates[0];
  const imports = importMap.get(edge.toName) || [];
  const fromDir = dirname(edge.fromPath);
  const scored = candidates.map((candidate) => {
    let score = 0;
    if (candidate.path === edge.fromPath) score += 100;
    const imported = imports.find((entry) =>
      entry.sourceFile === candidate.path &&
      (entry.exportedName === candidate.name || entry.localName === candidate.name || entry.exportedName === 'default' || entry.exportedName === '*')
    );
    if (imported) score += 90;
    if (dirname(candidate.path) === fromDir) score += 25;
    if (langByFile.get(candidate.path) === fromLanguage) score += 10;
    if (edge.edgeKind === 'calls' && ['function', 'method'].includes(candidate.kind)) score += 20;
    if (edge.edgeKind === 'references' && ['component', 'function', 'class'].includes(candidate.kind)) score += 20;
    if (['extends', 'implements'].includes(edge.edgeKind) && ['class', 'interface', 'type', 'trait', 'struct'].includes(candidate.kind)) score += 20;
    return { candidate, score };
  }).sort((a, b) => b.score - a.score || a.candidate.path.localeCompare(b.candidate.path));

  const [best, second] = scored;
  if (!best) return null;
  if (best.score >= 80 && (!second || best.score > second.score)) return best.candidate;
  if (best.score >= 45 && (!second || best.score - second.score >= 20)) return best.candidate;
  return null;
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function inferChunkFileRole(relPath = '') {
  const normalized = normalizeRelPath(relPath).toLowerCase();
  const name = basename(normalized);
  if (normalized.startsWith('tests/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) return 'test';
  if (normalized.startsWith('agents/')) return 'agent';
  if (normalized.startsWith('skills/')) return 'skill';
  if (normalized.startsWith('rules/')) return 'rule';
  if (normalized.startsWith('commands/')) return 'command';
  if (normalized.startsWith('templates/')) return 'template';
  if (normalized.startsWith('references/')) return 'reference';
  if (normalized.startsWith('questionnaires/')) return 'questionnaire';
  if (normalized.startsWith('confidence-rubrics/')) return 'rubric';
  if (normalized.startsWith('hooks/')) return 'hook';
  if (normalized === 'registry.yaml' || normalized === 'registry.yml') return 'registry';
  if (normalized.startsWith('scripts/') || normalized.startsWith('bin/')) return 'script';
  if (normalized.startsWith('docs/') || normalized.endsWith('.md') || normalized.endsWith('.mdx')) return 'docs';
  if (
    normalized.startsWith('.github/') ||
    normalized.startsWith('.codex/') ||
    normalized.endsWith('.json') ||
    normalized.endsWith('.yaml') ||
    normalized.endsWith('.yml') ||
    normalized.endsWith('.toml') ||
    normalized.endsWith('.ini') ||
    /(^|\/)(package|tsconfig|jsconfig|eslint|prettier|vitest|vite|playwright|jest)\b/.test(normalized)
  ) {
    return 'config';
  }
  return 'source';
}

function inferChunkArtifactType(relPath = '', fileRole = '') {
  if (fileRole === 'test') return 'test-code';
  if (fileRole === 'docs') return 'documentation';
  if (fileRole === 'config') return 'configuration';
  if (fileRole === 'registry') return 'supervibe-registry';
  if (['agent', 'skill', 'rule', 'command', 'template', 'reference', 'questionnaire', 'rubric', 'hook'].includes(fileRole)) return `supervibe-${fileRole}`;
  if (fileRole === 'script') return 'automation-script';
  return 'source-code';
}

function extractChunkHeading(chunk = {}, relPath = '') {
  const name = String(chunk.name || '').trim();
  if (name) return String(chunk.kind || 'symbol') === 'block' ? name : `${chunk.kind || 'symbol'}:${name}`;
  const text = String(chunk.text || '');
  const markdownHeading = text.match(/^[ \t]{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();
  if (markdownHeading) return markdownHeading.slice(0, 160);
  const symbol = extractSymbolHints(chunk)[0];
  if (symbol) return symbol;
  return basename(normalizeRelPath(relPath));
}

function extractSymbolHints(chunk = {}) {
  const hints = [];
  const add = (value) => {
    const clean = String(value || '').trim();
    if (!clean || hints.includes(clean)) return;
    hints.push(clean);
  };
  add(chunk.name);
  const text = String(chunk.text || '');
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?(?:class|interface|type|enum|trait|struct)\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\b(?:def|fn)\s+([A-Za-z_][\w]*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      add(match[1]);
      if (hints.length >= 12) return hints;
    }
  }
  return hints.slice(0, 12);
}

function buildChunkMetadata({ relPath, chunk, indexStatus = 'full' } = {}) {
  const fileRole = inferChunkFileRole(relPath);
  return {
    fileRole,
    heading: extractChunkHeading(chunk, relPath),
    symbolHintsJson: JSON.stringify(extractSymbolHints(chunk)),
    artifactType: inferChunkArtifactType(relPath, fileRole),
    freshness: indexStatus === 'partial' ? 'partial' : 'current',
    metadataVersion: CODE_RAG_CHUNK_METADATA_VERSION,
  };
}

function stableEntityId(parts = []) {
  const seed = parts.map((part) => String(part ?? '')).join(':');
  return createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

function chunkEntityId({ relPath, chunkIdx }) {
  return normalizeRelPath(relPath) + '#chunk:' + chunkIdx;
}

function pathStem(relPath = '') {
  return basename(normalizeRelPath(relPath)).replace(/\.(?:mdx?|json|ya?ml)\.tpl$/i, '').replace(/\.(?:mdx?|ya?ml|json|mjs|cjs|jsx?|tsx?|py|php|rs|go|java|rb)$/i, '');
}

function entityFromPath(relPath = '', fileRole = 'source') {
  const normalized = normalizeRelPath(relPath);
  if (fileRole === 'command') return { type: 'command', name: pathStem(normalized) };
  if (fileRole === 'agent') return { type: 'agent', name: pathStem(normalized) };
  if (fileRole === 'skill') {
    const parts = normalized.split('/').filter(Boolean);
    const skillName = parts.length >= 2 ? parts[1] : pathStem(normalized);
    return { type: 'skill', name: skillName };
  }
  if (fileRole === 'rule') return { type: 'rule', name: pathStem(normalized) };
  if (['template', 'reference', 'questionnaire', 'rubric', 'hook'].includes(fileRole)) return { type: fileRole, name: pathStem(normalized) };
  const lower = normalized.toLowerCase();
  if (lower === 'package.json') return { type: 'package', name: 'package.json' };
  if (lower === 'registry.yaml' || lower === 'registry.yml') return { type: 'registry', name: basename(normalized) };
  if (lower.startsWith('schemas/')) return { type: 'schema', name: pathStem(normalized) };
  return null;
}

function extractHeadingEntities(chunk = {}) {
  const text = String(chunk.text || '');
  return [...text.matchAll(/^[ \t]{0,3}#{1,6}\s+(.+)$/gm)]
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function buildChunkEntities({ relPath, chunkIdx, chunk, metadata, indexFingerprint = '' } = {}) {
  const fileRole = metadata?.fileRole || inferChunkFileRole(relPath);
  const heading = metadata?.heading || extractChunkHeading(chunk, relPath);
  const symbolHints = parseJsonStringArray(metadata?.symbolHintsJson);
  const entities = [];
  const add = ({ type, name, confidence = 0.75, derivationSource = 'generated' }) => {
    const cleanType = String(type || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    if (!cleanType || !cleanName) return;
    const entityId = cleanType + ':' + stableEntityId([relPath, cleanType, cleanName]);
    if (entities.some((entry) => entry.entityType === cleanType && entry.entityId === entityId)) return;
    entities.push({
      chunkId: chunkEntityId({ relPath, chunkIdx }),
      path: normalizeRelPath(relPath),
      chunkIdx,
      entityType: cleanType,
      entityId,
      entityName: cleanName.slice(0, 200),
      sourcePath: normalizeRelPath(relPath),
      startLine: Number(chunk?.startLine || 1),
      endLine: Number(chunk?.endLine || chunk?.startLine || 1),
      heading: heading || '',
      confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
      derivationSource,
      indexFingerprint,
      metadataVersion: CODE_RAG_ENTITY_METADATA_VERSION,
    });
  };

  const pathEntity = entityFromPath(relPath, fileRole);
  if (pathEntity) add({ ...pathEntity, confidence: 0.95, derivationSource: 'path-role' });

  if (heading) add({ type: (fileRole === 'source' || fileRole === 'script') ? 'heading' : fileRole + '-heading', name: heading, confidence: 0.8, derivationSource: 'chunk-heading' });
  for (const item of extractHeadingEntities(chunk)) add({ type: 'heading', name: item, confidence: 0.72, derivationSource: 'markdown-heading' });
  for (const symbol of symbolHints) {
    const type = ['source', 'script', 'test'].includes(fileRole) ? 'symbol' : fileRole + '-symbol';
    add({ type, name: symbol, confidence: 0.82, derivationSource: 'symbol-hint' });
  }

  return entities;
}

function insertDerivedChunkEntities(db, { relPath, chunkIdx, chunk, metadata, indexFingerprint = '' } = {}) {
  const entities = buildChunkEntities({ relPath, chunkIdx, chunk, metadata, indexFingerprint });
  if (entities.length === 0) return 0;
  const insert = db.prepare([
    'INSERT OR REPLACE INTO code_chunk_entities (',
    'chunk_id, path, chunk_idx, entity_type, entity_id, entity_name, source_path,',
    'start_line, end_line, heading, confidence, derivation_source, index_fingerprint, metadata_version',
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ].join(' '));
  for (const entity of entities) {
    insert.run(
      entity.chunkId,
      entity.path,
      entity.chunkIdx,
      entity.entityType,
      entity.entityId,
      entity.entityName,
      entity.sourcePath,
      entity.startLine,
      entity.endLine,
      entity.heading,
      entity.confidence,
      entity.derivationSource,
      entity.indexFingerprint,
      entity.metadataVersion,
    );
  }
  return entities.length;
}

function buildGeneratedAnchorsFromEntities(db, relPath = '') {
  let rows = [];
  try {
    rows = db.prepare([
      'SELECT entity_type AS entityType, entity_name AS entityName, entity_id AS entityId,',
      'MIN(start_line) AS startLine, MIN(end_line) AS endLine, MAX(heading) AS heading,',
      'MAX(confidence) AS confidence, MIN(derivation_source) AS derivationSource',
      'FROM code_chunk_entities WHERE path = ? GROUP BY entity_id',
      'ORDER BY confidence DESC, startLine ASC LIMIT 32'
    ].join(' ')).all(normalizeRelPath(relPath));
  } catch {
    rows = [];
  }
  return rows
    .filter((row) => Number(row.confidence || 0) >= 0.7)
    .map((row) => {
      const entityType = String(row.entityType || 'entity');
      const entityName = String(row.entityName || '').trim();
      const anchorId = 'derived-' + stableEntityId([relPath, row.entityId || entityType, entityName, row.startLine || 1]);
      return {
        anchorId,
        filePath: normalizeRelPath(relPath),
        symbolName: /symbol|command|agent|skill|rule|schema|package|registry|template|reference|questionnaire|rubric|hook/.test(entityType) ? entityName : null,
        visibility: ['symbol', 'command', 'agent', 'skill', 'rule', 'schema', 'package', 'registry', 'template', 'reference', 'questionnaire', 'rubric', 'hook'].includes(entityType) ? 'public' : 'internal',
        responsibility: ('Generated ' + entityType + ' anchor: ' + entityName).slice(0, 240),
        invariants: [],
        verificationRefs: [],
        startLine: Number(row.startLine || 1),
        endLine: Number(row.endLine || row.startLine || 1),
        source: 'derived-entity',
      };
    });
}

function parseJsonStringArray(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function isConfigOnlyGraphPath(relPath = '') {
  const name = basename(String(relPath).replace(/\\/g, '/')).toLowerCase();
  return (
    /\.config\.[cm]?[jt]sx?$/.test(name) ||
    /^(next|vite|vitest|jest|playwright|eslint|prettier|postcss|tailwind|commitlint|lint-staged|knip|astro|svelte|nuxt)\.config\./.test(name) ||
    /^(babel|renovate)\.config\./.test(name)
  );
}

const COMMON_EXTERNAL_EDGE_NAMES = new Set([
  'array', 'object', 'string', 'number', 'boolean', 'promise', 'map', 'set', 'date', 'regexp', 'json', 'math', 'console',
  'push', 'pop', 'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every', 'includes', 'join', 'split', 'slice',
  'trim', 'replace', 'match', 'test', 'parse', 'stringify', 'keys', 'values', 'entries', 'assign', 'from', 'resolve',
  'reject', 'then', 'catch', 'finally', 'log', 'error', 'warn', 'info', 'readfile', 'writefile',
]);

function isActionableGraphEdgeName(name = '') {
  const value = String(name || '').trim();
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) return false;
  if (COMMON_EXTERNAL_EDGE_NAMES.has(value.toLowerCase())) return false;
  return true;
}

function deadlineExceededError(phase, relPath) {
  const error = new Error(`index deadline exceeded during ${phase}${relPath ? ` for ${relPath}` : ''}`);
  error.code = 'SUPERVIBE_INDEX_DEADLINE_EXCEEDED';
  error.phase = phase;
  error.relPath = relPath;
  return error;
}

async function maybeTestPhaseHook(phase) {
  if (process.env.SUPERVIBE_INDEX_TEST_THROW_PHASE === phase) {
    throw new Error(`SUPERVIBE_INDEX_TEST_THROW_PHASE ${phase}`);
  }
  if (process.env.SUPERVIBE_INDEX_TEST_DELAY_PHASE === phase) {
    const delayMs = Number(process.env.SUPERVIBE_INDEX_TEST_DELAY_MS || 0);
    if (Number.isFinite(delayMs) && delayMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  }
}

function fileTimeoutError({ phase, relPath, timeoutMs }) {
  const error = new Error(`${phase} timed out after ${timeoutMs}ms for ${relPath}`);
  error.code = 'SUPERVIBE_INDEX_FILE_TIMEOUT';
  error.phase = phase;
  error.relPath = relPath;
  error.timeoutMs = timeoutMs;
  return error;
}

async function chunkCodeInWorker(code, absPath, { options, timeoutMs, relPath } = {}) {
  return await new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(new URL('./code-chunk-worker.mjs', import.meta.url), {
      workerData: { code, filePath: absPath, options },
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate().catch(() => {});
      rejectWorker(fileTimeoutError({ phase: 'chunking', relPath, timeoutMs }));
    }, timeoutMs);

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    worker.once('message', (message) => {
      if (message?.ok) {
        finish(resolveWorker, message.chunks || []);
        return;
      }
      const err = new Error(message?.error?.message || 'chunk worker failed');
      err.name = message?.error?.name || 'Error';
      err.code = message?.error?.code || 'SUPERVIBE_INDEX_CHUNK_WORKER_FAILED';
      err.phase = 'chunking';
      err.relPath = relPath;
      if (message?.error?.stack) err.stack = message.error.stack;
      finish(rejectWorker, err);
    });
    worker.once('error', (error) => {
      error.phase ||= 'chunking';
      error.relPath ||= relPath;
      finish(rejectWorker, error);
    });
    worker.once('exit', (code) => {
      if (settled || code === 0) return;
      const error = new Error(`chunk worker exited with code ${code}`);
      error.code = 'SUPERVIBE_INDEX_CHUNK_WORKER_EXIT';
      error.phase = 'chunking';
      error.relPath = relPath;
      finish(rejectWorker, error);
    });
  });
}

function rustStructuralBoundary(line = '') {
  const text = String(line || '');
  const patterns = [
    { kind: 'module', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\b/ },
    { kind: 'macro', re: /^\s*macro_rules!\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+([A-Za-z_]\w*)\b/ },
    { kind: 'function-or-class', re: /^\s*(?:pub(?:\([^)]*\))?\s+)?impl(?:\s*<[^>]+>)?\s+([A-Za-z_]\w*)?/ },
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern.re);
    if (match) return { kind: pattern.kind, name: match[1] || null };
  }
  return null;
}

function lineCountOf(content = '') {
  return String(content || '').split('\n').length;
}

function partialIndexError({ relPath, reason = 'large file source indexing stopped before EOF', timeoutMs = 0 } = {}) {
  const error = new Error(reason);
  error.code = 'SUPERVIBE_INDEX_PARTIAL_FILE';
  error.phase = 'chunking';
  error.relPath = relPath;
  error.timeoutMs = timeoutMs;
  return error;
}

function recommendedLargeFileAction(status) {
  if (status === 'partial-row') {
    return 'source row is partial; rerun source-only repair to complete it, or lower chunk size if the file repeatedly times out';
  }
  return 'rerun source-only repair after resolving the file-specific failure';
}

export class CodeStore {
  constructor(projectRoot, opts = {}) {
    this.projectRoot = projectRoot;
    this.dbDir = join(projectRoot, '.supervibe', 'memory');
    this.dbPath = join(this.dbDir, 'code.db');
    this.failedFilesPath = join(this.dbDir, 'failed_files.json');
    this.db = null;
    this.useEmbeddings = opts.useEmbeddings !== false;
    this.useGraph = opts.useGraph !== false;
    this.largeFileCharThreshold = positiveInt(
      opts.largeFileCharThreshold ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_BYTES,
      DEFAULT_LARGE_FILE_CHAR_THRESHOLD,
    );
    this.largeFileThresholdBytes = positiveInt(
      opts.largeFileThresholdBytes
        ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_THRESHOLD_BYTES
        ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_BYTES,
      DEFAULT_LARGE_FILE_THRESHOLD_BYTES,
    );
    this.largeFileThresholdLines = positiveInt(
      opts.largeFileThresholdLines ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_THRESHOLD_LINES,
      DEFAULT_LARGE_FILE_THRESHOLD_LINES,
    );
    this.largeFileChunkLines = positiveInt(
      opts.largeFileChunkLines ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_CHUNK_LINES,
      DEFAULT_LARGE_FILE_CHUNK_LINES,
    );
    this.largeFileChunkBytes = positiveInt(
      opts.largeFileChunkBytes ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_CHUNK_BYTES,
      DEFAULT_LARGE_FILE_CHUNK_BYTES,
    );
    this.largeFileMaxSeconds = nonNegativeNumber(
      opts.largeFileMaxSeconds ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_MAX_SECONDS,
      DEFAULT_LARGE_FILE_MAX_SECONDS,
    );
    this.largeFileFallbackMode = String(
      opts.largeFileFallbackMode ?? process.env.SUPERVIBE_INDEX_LARGE_FILE_FALLBACK_MODE ?? DEFAULT_LARGE_FILE_FALLBACK_MODE,
    ).trim() || DEFAULT_LARGE_FILE_FALLBACK_MODE;
    this.graphExtractionLargeFileMode = String(
      opts.graphExtractionLargeFileMode
        ?? process.env.SUPERVIBE_INDEX_GRAPH_LARGE_FILE_MODE
        ?? DEFAULT_GRAPH_EXTRACTION_LARGE_FILE_MODE,
    ).trim().toLowerCase() || DEFAULT_GRAPH_EXTRACTION_LARGE_FILE_MODE;
    this.knownFailedTtlSeconds = nonNegativeNumber(
      opts.knownFailedTtl ?? opts.knownFailedTtlSeconds ?? process.env.SUPERVIBE_INDEX_KNOWN_FAILED_TTL_SECONDS,
      DEFAULT_KNOWN_FAILED_TTL_SECONDS,
    );
    this.chunkTimeoutMs = positiveInt(
      opts.chunkTimeoutMs ?? process.env.SUPERVIBE_INDEX_CHUNK_TIMEOUT_MS,
      DEFAULT_CHUNK_TIMEOUT_MS,
    );
  }

  async init() {
    if (!existsSync(this.dbDir)) {
      await mkdir(this.dbDir, { recursive: true });
    }
    const DatabaseSync = await loadNodeSqliteDatabaseSync('Code RAG and code graph');
    this.db = new DatabaseSync(this.dbPath);
    // WAL mode: allow concurrent readers + one writer (e.g. watcher + manual code:index)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
    applyCodeDbMigrations(this.db, { dbPath: this.dbPath });
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_files (
        path TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        indexed_at TEXT NOT NULL,
        graph_version INTEGER NOT NULL DEFAULT 0,
        index_status TEXT NOT NULL DEFAULT 'full',
        chunking_strategy TEXT NOT NULL DEFAULT 'standard',
        chunk_count INTEGER NOT NULL DEFAULT 0,
        indexed_bytes INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_code_files_lang ON code_files(language);

      CREATE TABLE IF NOT EXISTS code_chunks (
        path TEXT NOT NULL,
        chunk_idx INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        token_count INTEGER NOT NULL,
        embedding BLOB,
        file_role TEXT NOT NULL DEFAULT 'source',
        heading TEXT,
        symbol_hints_json TEXT NOT NULL DEFAULT '[]',
        artifact_type TEXT NOT NULL DEFAULT 'source-code',
        freshness TEXT NOT NULL DEFAULT 'current',
        metadata_version INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(path, chunk_idx),
        FOREIGN KEY(path) REFERENCES code_files(path) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_code_chunks_path ON code_chunks(path);
      CREATE INDEX IF NOT EXISTS idx_code_chunks_kind ON code_chunks(kind);

      CREATE TABLE IF NOT EXISTS code_chunk_entities (
        chunk_id TEXT NOT NULL,
        path TEXT NOT NULL,
        chunk_idx INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        source_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        heading TEXT,
        confidence REAL NOT NULL,
        derivation_source TEXT NOT NULL,
        index_fingerprint TEXT NOT NULL,
        metadata_version INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(chunk_id, entity_type, entity_id, derivation_source),
        FOREIGN KEY(path, chunk_idx) REFERENCES code_chunks(path, chunk_idx) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chunk_entities_path ON code_chunk_entities(path);
      CREATE INDEX IF NOT EXISTS idx_chunk_entities_chunk ON code_chunk_entities(path, chunk_idx);
      CREATE INDEX IF NOT EXISTS idx_chunk_entities_type_name ON code_chunk_entities(entity_type, entity_name);
      CREATE INDEX IF NOT EXISTS idx_chunk_entities_entity_id ON code_chunk_entities(entity_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(
        path UNINDEXED,
        chunk_idx UNINDEXED,
        chunk_text,
        name,
        tokenize='unicode61'
      );

      -- Code graph: symbols + edges (Phase D)
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
        FOREIGN KEY(from_id) REFERENCES code_symbols(id) ON DELETE CASCADE
      );
      -- Uniqueness across (from, target-name, kind, optional resolved id):
      -- expressions in PRIMARY KEY are SQLite-forbidden, but allowed in UNIQUE INDEX.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_uniq
        ON code_edges(from_id, to_name, kind, COALESCE(to_id, ''));
      CREATE INDEX IF NOT EXISTS idx_edge_to_name ON code_edges(to_name);
      CREATE INDEX IF NOT EXISTS idx_edge_to_id ON code_edges(to_id);
      CREATE INDEX IF NOT EXISTS idx_edge_kind ON code_edges(kind);

      CREATE TABLE IF NOT EXISTS code_semantic_anchors (
        anchor_id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        symbol_name TEXT,
        visibility TEXT NOT NULL,
        responsibility TEXT,
        invariants_json TEXT NOT NULL,
        verification_refs_json TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        source TEXT NOT NULL,
        FOREIGN KEY(path) REFERENCES code_files(path) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_anchor_path ON code_semantic_anchors(path);
      CREATE INDEX IF NOT EXISTS idx_anchor_path_range ON code_semantic_anchors(path, start_line, end_line);
      CREATE INDEX IF NOT EXISTS idx_anchor_symbol ON code_semantic_anchors(symbol_name);
    `);
    ensureColumn(this.db, "code_files", "graph_version", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "code_files", "index_status", "TEXT NOT NULL DEFAULT 'full'");
    ensureColumn(this.db, "code_files", "chunking_strategy", "TEXT NOT NULL DEFAULT 'standard'");
    ensureColumn(this.db, "code_files", "chunk_count", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "code_files", "indexed_bytes", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(this.db, "code_chunks", "file_role", "TEXT NOT NULL DEFAULT 'source'");
    ensureColumn(this.db, "code_chunks", "heading", "TEXT");
    ensureColumn(this.db, "code_chunks", "symbol_hints_json", "TEXT NOT NULL DEFAULT '[]'");
    ensureColumn(this.db, "code_chunks", "artifact_type", "TEXT NOT NULL DEFAULT 'source-code'");
    ensureColumn(this.db, "code_chunks", "freshness", "TEXT NOT NULL DEFAULT 'current'");
    ensureColumn(this.db, "code_chunks", "metadata_version", `INTEGER NOT NULL DEFAULT ${CODE_RAG_CHUNK_METADATA_VERSION}`);
    this.ensureChunkEntitySchema();
    return this;
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

  ensureChunkEntitySchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_chunk_entities (
        chunk_id TEXT NOT NULL,
        path TEXT NOT NULL,
        chunk_idx INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        source_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        heading TEXT,
        confidence REAL NOT NULL,
        derivation_source TEXT NOT NULL,
        index_fingerprint TEXT NOT NULL,
        metadata_version INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(chunk_id, entity_type, entity_id, derivation_source)
      );
      CREATE INDEX IF NOT EXISTS idx_chunk_entities_path ON code_chunk_entities(path);
      CREATE INDEX IF NOT EXISTS idx_chunk_entities_chunk ON code_chunk_entities(path, chunk_idx);
      CREATE INDEX IF NOT EXISTS idx_chunk_entities_type_name ON code_chunk_entities(entity_type, entity_name);
      CREATE INDEX IF NOT EXISTS idx_chunk_entities_entity_id ON code_chunk_entities(entity_id);
    `);
  }

  toRel(absPath) {
    return relative(this.projectRoot, absPath).split(sep).join('/');
  }

  fileHasMissingEmbeddings(relPath) {
    if (!this.useEmbeddings) return false;
    try {
      const row = this.db.prepare(`
        SELECT COUNT(*) AS totalChunks,
               SUM(CASE WHEN embedding IS NULL THEN 1 ELSE 0 END) AS missingEmbeddings
        FROM code_chunks
        WHERE path = ?
      `).get(normalizeRelPath(relPath));
      return Number(row?.totalChunks || 0) > 0 && Number(row?.missingEmbeddings || 0) > 0;
    } catch {
      return false;
    }
  }

  fileHasStaleChunkMetadata(relPath) {
    try {
      const row = this.db.prepare(`
        SELECT COUNT(*) AS n
        FROM code_chunks
        WHERE path = ?
          AND (metadata_version < ?
            OR file_role IS NULL OR file_role = ''
            OR artifact_type IS NULL OR artifact_type = ''
            OR freshness IS NULL OR freshness = ''
            OR heading IS NULL OR heading = '')
      `).get(normalizeRelPath(relPath), CODE_RAG_CHUNK_METADATA_VERSION);
      return Number(row?.n || 0) > 0;
    } catch {
      return false;
    }
  }

  fileHasStaleChunkEntities(relPath) {
    try {
      const row = this.db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM code_chunks WHERE path = ?) AS totalChunks,
          (SELECT COUNT(DISTINCT cc.path || '#' || cc.chunk_idx) FROM code_chunks cc JOIN code_chunk_entities cce ON cce.path = cc.path AND cce.chunk_idx = cc.chunk_idx WHERE cc.path = ?) AS linkedChunks,
          (SELECT COUNT(*) FROM code_chunk_entities WHERE path = ? AND metadata_version < ?) AS staleEntities
      `).get(normalizeRelPath(relPath), normalizeRelPath(relPath), normalizeRelPath(relPath), CODE_RAG_ENTITY_METADATA_VERSION);
      return Number(row?.totalChunks || 0) > 0
        && (Number(row?.linkedChunks || 0) < Number(row?.totalChunks || 0) || Number(row?.staleEntities || 0) > 0);
    } catch {
      return false;
    }
  }

  /** Index a single file. Skips if hash unchanged (idempotent). */
  async indexFile(absPath, { force = false, onProgress = null, current = 0, total = 0, shouldStop = null } = {}) {
    const policy = classifyIndexPath(absPath, { rootDir: this.projectRoot });
    if (!policy.included) return { skipped: policy.reason };
    const lang = policy.language || detectLanguage(absPath);
    const relPath = this.toRel(absPath);
    let activePhase = 'file-start';
    const emit = (phase, extra = {}) => onProgress?.({
      phase,
      current,
      total,
      path: relPath,
      ...extra,
    });
    const enter = async (phase, extra = {}) => {
      activePhase = phase;
      if (shouldStop?.()) throw deadlineExceededError(phase, relPath);
      emit(phase, extra);
      await maybeTestPhaseHook(phase);
      if (shouldStop?.()) throw deadlineExceededError(phase, relPath);
    };

    try {
      let fileStats;
      await enter('reading');
      try { fileStats = await stat(absPath); }
      catch (err) {
        if (err.code === 'ENOENT') {
          await this.removeFile(absPath);
          return { skipped: 'file-deleted' };
        }
        throw err;
      }

      await enter('hashing');
      const hash = await hashFile(absPath);
      const existing = this.db.prepare('SELECT content_hash, graph_version FROM code_files WHERE path = ?').get(relPath);
      const existingGraphVersion = Number(existing?.graph_version || 0);
      const graphEligible = isGraphIndexableLanguage(lang);
      const preserveGraphWhenDisabled = !this.useGraph && existing && existing.content_hash === hash && existingGraphVersion > 0;
      const graphStale = this.useGraph && graphEligible && existingGraphVersion !== CODE_GRAPH_EXTRACTOR_VERSION;
      const embeddingStale = existing && existing.content_hash === hash && this.fileHasMissingEmbeddings(relPath);
      const chunkMetadataStale = existing && existing.content_hash === hash && this.fileHasStaleChunkMetadata(relPath);
      const chunkEntityStale = existing && existing.content_hash === hash && this.fileHasStaleChunkEntities(relPath);
      if (existing && existing.content_hash === hash && !force && !graphStale && !embeddingStale && !chunkMetadataStale && !chunkEntityStale) {
        return { skipped: 'unchanged' };
      }

      const largeByBytes = Number(fileStats?.size || 0) >= this.largeFileThresholdBytes;
      let content = null;
      let lines = 0;
      let largeByLines = false;

      if (!largeByBytes) {
        try { content = await readFile(absPath, 'utf8'); }
        catch (err) {
          if (err.code === 'ENOENT') {
            await this.removeFile(absPath);
            return { skipped: 'file-deleted' };
          }
          throw err;
        }
        lines = lineCountOf(content);
        largeByLines = lines >= this.largeFileThresholdLines;
      }

      if (existing && existing.content_hash === hash && !force && !embeddingStale && !chunkMetadataStale && !chunkEntityStale) {
        // Hash unchanged, but extractor/query semantics may have changed across
        // plugin versions. Rebuild only graph rows while preserving RAG chunks.
        if (graphStale) {
          if (this.shouldSkipLargeFileGraphExtraction({ fileSizeBytes: Number(fileStats?.size || 0), lineCount: lines })) {
            return { skipped: 'unchanged-graph-skipped-large-file', ...this.skipLargeFileGraphExtraction(relPath) };
          }
          try {
            await enter('graph-extraction');
            const result = await this.indexGraphFor(absPath, content ?? await readFile(absPath, 'utf8'));
            this.markGraphCurrent(relPath);
            return { skipped: 'unchanged-graph-reindexed', ...result };
          } catch (err) {
            if (process.env.SUPERVIBE_VERBOSE === '1') {
              console.warn(`[code-graph] failed to reindex unchanged ${relPath}: ${err.message}`);
            }
          }
        }
        return { skipped: 'unchanged' };
      }

      const largeFile = largeByBytes || largeByLines;
      if (largeFile) {
        const result = await this.indexLargeFileSource(absPath, {
          relPath,
          lang,
          hash,
          fileSizeBytes: Number(fileStats?.size || 0),
          initialLineCount: lines,
          emit,
          enter,
          shouldStop,
          preserveGraph: preserveGraphWhenDisabled,
          preservedGraphVersion: existingGraphVersion,
        });

        if (this.useGraph && graphEligible && !result.partial) {
          if (this.shouldSkipLargeFileGraphExtraction({
            fileSizeBytes: Number(fileStats?.size || 0),
            lineCount: result.lineCount || lines,
          })) {
            this.skipLargeFileGraphExtraction(relPath);
          } else {
            try {
              await enter('graph-extraction');
              await this.indexGraphFor(absPath, content ?? await readFile(absPath, 'utf8'));
              this.markGraphCurrent(relPath);
            } catch (err) {
              if (process.env.SUPERVIBE_VERBOSE === '1') {
                console.warn(`[code-graph] failed for ${relPath}: ${err.message}`);
              }
            }
          }
        } else if (!this.useGraph && !preserveGraphWhenDisabled) {
          this.clearGraphFor(relPath);
        }
        return result;
      }

      if (content === null) {
        try { content = await readFile(absPath, 'utf8'); }
        catch (err) {
          if (err.code === 'ENOENT') {
            await this.removeFile(absPath);
            return { skipped: 'file-deleted' };
          }
          throw err;
        }
        lines = lineCountOf(content);
      }

      this.db.prepare('DELETE FROM code_chunk_entities WHERE path = ?').run(relPath);
      this.db.prepare('DELETE FROM code_chunks WHERE path = ?').run(relPath);
      this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);

      const chunkerMode = !this.useEmbeddings || content.length > this.largeFileCharThreshold ? 'approximate' : 'exact';
      await enter('chunking', { chunkerMode });
      const chunkOptions = {
        tokenMode: chunkerMode,
        largeFileCharThreshold: this.largeFileCharThreshold,
        shouldStop,
      };
      let chunks;
      try {
        chunks = content.length > this.largeFileCharThreshold
          ? await chunkCodeInWorker(content, absPath, {
              options: {
                tokenMode: chunkerMode,
                largeFileCharThreshold: this.largeFileCharThreshold,
              },
              timeoutMs: this.chunkTimeoutMs,
              relPath,
            })
          : await chunkCode(content, absPath, chunkOptions);
      } catch (err) {
        err.indexMetadata ||= {
          status: 'missing-row',
          sizeBytes: Number(fileStats?.size || Buffer.byteLength(content, 'utf8')),
          lineCount: lines,
          lineCountIsPartial: false,
          chunkingStrategy: chunkerMode,
          timeoutMs: err.timeoutMs || (err.code === 'SUPERVIBE_INDEX_FILE_TIMEOUT' ? this.chunkTimeoutMs : 0),
          chunksWritten: 0,
          recommendedAction: recommendedLargeFileAction('missing-row'),
        };
        throw err;
      }

      await enter('db-write');
      const indexedBytes = Number(fileStats?.size || Buffer.byteLength(content, 'utf8'));
      if (preserveGraphWhenDisabled) {
        this.db.prepare(`
          UPDATE code_files
          SET language = ?, content_hash = ?, line_count = ?, indexed_at = datetime('now'), graph_version = ?,
              index_status = 'full', chunking_strategy = ?, chunk_count = ?, indexed_bytes = ?
          WHERE path = ?
        `).run(lang, hash, lines, existingGraphVersion, chunkerMode, chunks.length, indexedBytes, relPath);
      } else {
        this.db.prepare(`
          INSERT OR REPLACE INTO code_files (
            path, language, content_hash, line_count, indexed_at, graph_version,
            index_status, chunking_strategy, chunk_count, indexed_bytes
          )
          VALUES (?, ?, ?, ?, datetime('now'), 0, 'full', ?, ?, ?)
        `).run(relPath, lang, hash, lines, chunkerMode, chunks.length, indexedBytes);
      }

      const insertChunk = this.db.prepare(`
        INSERT INTO code_chunks (
          path, chunk_idx, chunk_text, kind, name, start_line, end_line, token_count, embedding,
          file_role, heading, symbol_hints_json, artifact_type, freshness, metadata_version
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFTS = this.db.prepare(`
        INSERT INTO code_chunks_fts (path, chunk_idx, chunk_text, name) VALUES (?, ?, ?, ?)
      `);

      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const safeChunk = redactIndexableSecrets(c.text);
        let embeddingBuf = null;
        if (this.useEmbeddings) {
          await enter('embeddings', { chunk: i + 1, chunks: chunks.length });
          try {
            const { embed, vectorToBuffer } = await loadEmbeddingHelpers();
            const vec = await embed(safeChunk.text, 'passage');
            embeddingBuf = vectorToBuffer(vec);
          } catch {}
        }
        const metadata = buildChunkMetadata({
          relPath,
          chunk: { ...c, text: safeChunk.text },
          indexStatus: 'full',
        });
        insertChunk.run(
          relPath,
          i,
          safeChunk.text,
          c.kind,
          c.name || null,
          c.startLine,
          c.endLine,
          c.tokens || 0,
          embeddingBuf,
          metadata.fileRole,
          metadata.heading,
          metadata.symbolHintsJson,
          metadata.artifactType,
          metadata.freshness,
          metadata.metadataVersion,
        );
        await enter('fts-write', { chunk: i + 1, chunks: chunks.length });
        insertFTS.run(relPath, i, safeChunk.text, c.name || '');
        insertDerivedChunkEntities(this.db, {
          relPath,
          chunkIdx: i,
          chunk: { ...c, text: safeChunk.text },
          metadata,
          indexFingerprint: hash,
        });
      }

      // Phase D: also extract code graph (symbols + edges) for this file.
      // Failure here is non-fatal — graph stays empty for this file, semantic RAG still works.
      if (this.useGraph) {
        try {
          await enter('graph-extraction');
          await this.indexGraphFor(absPath, content);
          this.markGraphCurrent(relPath);
        } catch (err) {
          if (process.env.SUPERVIBE_VERBOSE === '1') {
            console.warn(`[code-graph] failed for ${relPath}: ${err.message}`);
          }
        }
      } else if (!preserveGraphWhenDisabled) {
        this.clearGraphFor(relPath);
      }

      return { indexed: true, chunks: chunks.length };
    } catch (err) {
      err.phase ||= activePhase;
      err.relPath ||= relPath;
      throw err;
    }
  }

  async indexLargeFileSource(absPath, {
    relPath,
    lang,
    hash,
    fileSizeBytes = 0,
    initialLineCount = 0,
    emit = null,
    enter = null,
    shouldStop = null,
    preserveGraph = false,
    preservedGraphVersion = 0,
  } = {}) {
    const structuralRust = lang === 'rust' && this.largeFileFallbackMode !== 'line-window';
    const chunkingStrategy = structuralRust ? 'large-file-rust-structural' : 'large-file-line-window';
    const deadlineMs = this.largeFileMaxSeconds > 0 ? this.largeFileMaxSeconds * 1000 : 0;
    const deadlineAt = deadlineMs > 0 ? Date.now() + deadlineMs : 0;
    let chunkIndex = 0;
    let lineNo = 0;
    let bytesScanned = 0;
    let currentLines = [];
    let currentStartLine = 1;
    let currentBytes = 0;
    let currentKind = 'block';
    let currentName = null;
    let partialError = null;

    await enter?.('chunking', {
      chunkerMode: 'large-file',
      chunkingStrategy,
      timeoutMs: deadlineMs,
    });

    this.db.prepare('DELETE FROM code_chunk_entities WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_chunks WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);
    if (!preserveGraph) this.clearGraphFor(relPath);

    await enter?.('db-write', {
      chunkerMode: 'large-file',
      chunkingStrategy,
      indexStatus: 'partial',
    });
    if (preserveGraph) {
      this.db.prepare(`
        UPDATE code_files
        SET language = ?, content_hash = ?, line_count = ?, indexed_at = datetime('now'), graph_version = ?,
            index_status = 'partial', chunking_strategy = ?, chunk_count = 0, indexed_bytes = 0
        WHERE path = ?
      `).run(lang, hash, initialLineCount || 0, preservedGraphVersion, chunkingStrategy, relPath);
    } else {
      this.db.prepare(`
        INSERT OR REPLACE INTO code_files (
          path, language, content_hash, line_count, indexed_at, graph_version,
          index_status, chunking_strategy, chunk_count, indexed_bytes
        )
        VALUES (?, ?, ?, ?, datetime('now'), 0, 'partial', ?, 0, 0)
      `).run(relPath, lang, hash, initialLineCount || 0, chunkingStrategy);
    }

    const insertChunk = this.db.prepare(`
      INSERT INTO code_chunks (
        path, chunk_idx, chunk_text, kind, name, start_line, end_line, token_count, embedding,
        file_role, heading, symbol_hints_json, artifact_type, freshness, metadata_version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFTS = this.db.prepare(`
      INSERT INTO code_chunks_fts (path, chunk_idx, chunk_text, name) VALUES (?, ?, ?, ?)
    `);
    const updateFileProgress = this.db.prepare(`
      UPDATE code_files
      SET line_count = ?, chunk_count = ?, indexed_bytes = ?, index_status = ?, indexed_at = datetime('now')
      WHERE path = ?
    `);

    const failPartial = (reason, timeoutMs = 0) => {
      const error = partialIndexError({ relPath, reason, timeoutMs });
      error.indexMetadata = {
        status: 'partial-row',
        sizeBytes: fileSizeBytes,
        lineCount: lineNo,
        lineCountIsPartial: true,
        bytesScanned,
        chunkingStrategy,
        timeoutMs,
        chunksWritten: chunkIndex,
        recommendedAction: recommendedLargeFileAction('partial-row'),
      };
      return error;
    };

    const flush = async () => {
      const chunkText = redactIndexableSecrets(currentLines.join('\n').trim()).text;
      if (!chunkText) {
        currentLines = [];
        currentBytes = 0;
        currentStartLine = lineNo + 1;
        currentKind = 'block';
        currentName = null;
        return;
      }
      const endLine = currentStartLine + currentLines.length - 1;
      let chunksToWrite = [{
        kind: currentKind,
        name: currentName,
        text: chunkText,
        startLine: currentStartLine,
        endLine,
        tokens: estimateCodeTokens(chunkText),
      }];
      if (estimateCodeTokens(chunkText) > 300 || this.useEmbeddings) {
        const subChunks = await chunkCode(chunkText, relPath, {
          tokenMode: 'approximate',
          targetTokens: 250,
          overlapTokens: 16,
          shouldStop,
        });
        if (subChunks.length > 0) {
          chunksToWrite = subChunks
            .map((chunk) => ({
              kind: chunk.kind || currentKind,
              name: chunk.name || currentName,
              text: String(chunk.text || '').trim(),
              startLine: currentStartLine + Math.max(0, Number(chunk.startLine || 1) - 1),
              endLine: currentStartLine + Math.max(0, Number(chunk.endLine || chunk.startLine || 1) - 1),
              tokens: Number(chunk.tokens || estimateCodeTokens(chunk.text || '')),
            }))
            .filter((chunk) => chunk.text.length > 0);
        }
      }

      for (const chunk of chunksToWrite) {
        let embeddingBuf = null;
        if (this.useEmbeddings) {
          await enter?.('embeddings', {
            chunk: chunkIndex + 1,
            chunks: null,
            chunkerMode: 'large-file',
            chunkingStrategy,
            indexStatus: 'partial',
          });
          try {
            const { embed, vectorToBuffer } = await loadEmbeddingHelpers();
            embeddingBuf = vectorToBuffer(await embed(chunk.text, 'passage'));
          } catch {}
        }
        const metadata = buildChunkMetadata({ relPath, chunk, indexStatus: 'partial' });
        insertChunk.run(
          relPath,
          chunkIndex,
          chunk.text,
          chunk.kind,
          chunk.name || null,
          chunk.startLine,
          chunk.endLine,
          chunk.tokens,
          embeddingBuf,
          metadata.fileRole,
          metadata.heading,
          metadata.symbolHintsJson,
          metadata.artifactType,
          metadata.freshness,
          metadata.metadataVersion,
        );
        insertFTS.run(relPath, chunkIndex, chunk.text, chunk.name || '');
        insertDerivedChunkEntities(this.db, {
          relPath,
          chunkIdx: chunkIndex,
          chunk,
          metadata,
          indexFingerprint: hash,
        });
        chunkIndex += 1;
        emit?.('fts-write', {
          chunk: chunkIndex,
          chunks: null,
          chunkerMode: 'large-file',
          chunkingStrategy,
          indexStatus: 'partial',
        });

        const stopAfter = Number(process.env.SUPERVIBE_INDEX_TEST_LARGE_FILE_STOP_AFTER_CHUNKS || 0);
        if (Number.isFinite(stopAfter) && stopAfter > 0 && chunkIndex >= stopAfter) {
          throw failPartial(`test hook stopped large-file chunking after ${chunkIndex} chunk(s)`);
        }
      }

      updateFileProgress.run(lineNo, chunkIndex, bytesScanned, 'partial', relPath);
      currentLines = [];
      currentBytes = 0;
      currentStartLine = lineNo + 1;
      currentKind = 'block';
      currentName = null;
    };

    try {
      const input = createReadStream(absPath, { encoding: 'utf8' });
      const lines = createInterface({ input, crlfDelay: Infinity });
      for await (const line of lines) {
        lineNo += 1;
        bytesScanned += Buffer.byteLength(line, 'utf8') + 1;

        if (shouldStop?.()) {
          throw failPartial('global index deadline reached during large-file chunking');
        }
        if (deadlineAt > 0 && Date.now() >= deadlineAt) {
          throw failPartial(`large-file chunking timed out after ${deadlineMs}ms`, deadlineMs);
        }

        const boundary = structuralRust ? rustStructuralBoundary(line) : null;
        if (boundary && currentLines.length > 0) {
          await flush();
        }
        if (currentLines.length === 0) {
          currentStartLine = lineNo;
          currentKind = boundary?.kind || 'block';
          currentName = boundary?.name || null;
        } else if (boundary && !currentName) {
          currentKind = boundary.kind;
          currentName = boundary.name;
        }

        currentLines.push(line);
        currentBytes += Buffer.byteLength(line, 'utf8') + 1;

        if (currentLines.length >= this.largeFileChunkLines || currentBytes >= this.largeFileChunkBytes) {
          await flush();
        }
      }
      await flush();
    } catch (error) {
      partialError = error;
    }

    if (partialError) {
      if (chunkIndex === 0) {
        partialError.indexMetadata ||= {
          status: 'missing-row',
          sizeBytes: fileSizeBytes,
          lineCount: lineNo,
          lineCountIsPartial: true,
          bytesScanned,
          chunkingStrategy,
          timeoutMs: partialError.timeoutMs || deadlineMs,
          chunksWritten: 0,
          recommendedAction: recommendedLargeFileAction('missing-row'),
        };
        throw partialError;
      }
      updateFileProgress.run(lineNo, chunkIndex, bytesScanned, 'partial', relPath);
      return {
        indexed: true,
        partial: true,
        chunks: chunkIndex,
        phase: 'chunking',
        error: partialError,
        failureMetadata: {
          status: 'partial-row',
          sizeBytes: fileSizeBytes,
          lineCount: lineNo,
          lineCountIsPartial: true,
          bytesScanned,
          chunkingStrategy,
          timeoutMs: partialError.timeoutMs || 0,
          chunksWritten: chunkIndex,
          recommendedAction: recommendedLargeFileAction('partial-row'),
        },
      };
    }

    updateFileProgress.run(lineNo, chunkIndex, fileSizeBytes || bytesScanned, 'full', relPath);
    return {
      indexed: true,
      chunks: chunkIndex,
      partial: false,
      lineCount: lineNo,
      chunkingStrategy,
    };
  }

  markGraphCurrent(relPath) {
    this.db.prepare('UPDATE code_files SET graph_version = ? WHERE path = ?')
      .run(CODE_GRAPH_EXTRACTOR_VERSION, relPath);
  }

  clearGraphFor(relPath) {
    this.db.prepare(`
      DELETE FROM code_edges
      WHERE from_id IN (SELECT id FROM code_symbols WHERE path = ?)
         OR to_id IN (SELECT id FROM code_symbols WHERE path = ?)
    `).run(relPath, relPath);
    this.db.prepare('DELETE FROM code_symbols WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_semantic_anchors WHERE path = ?').run(relPath);
  }

  shouldSkipLargeFileGraphExtraction({ fileSizeBytes = 0, lineCount = 0 } = {}) {
    if (!this.useGraph) return false;
    if (this.graphExtractionLargeFileMode !== 'skip') return false;
    return Number(fileSizeBytes || 0) >= this.largeFileThresholdBytes
      || Number(lineCount || 0) >= this.largeFileThresholdLines;
  }

  skipLargeFileGraphExtraction(relPath) {
    this.clearGraphFor(relPath);
    this.markGraphCurrent(relPath);
    return {
      symbolsAdded: 0,
      edgesAdded: 0,
      anchorsAdded: 0,
      graphSkipped: 'large-file',
    };
  }

  /**
   * Extract symbols + edges via tree-sitter and persist to code_symbols/code_edges.
   * Idempotent: clears prior rows for this file via FK CASCADE on code_files re-insert.
   */
  async indexGraphFor(absPath, content) {
    const { extractGraph } = await import('./code-graph.mjs');
    const relPath = this.toRel(absPath);

    // Clear old graph rows explicitly; do not rely on host SQLite FK settings.
    this.clearGraphFor(relPath);

    const { symbols, edges } = await extractGraph(content, relPath);
    if (symbols.length === 0 && edges.length === 0) {
      const anchors = this.indexSemanticAnchorsFor(relPath, content);
      return { symbolsAdded: 0, edgesAdded: 0, anchorsAdded: anchors.anchorsAdded };
    }

    const insSym = this.db.prepare(`
      INSERT INTO code_symbols (id, path, kind, name, start_line, end_line, parent_id, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of symbols) {
      try {
        insSym.run(s.id, s.path, s.kind, s.name, s.startLine, s.endLine, s.parentId || null, s.signature || null);
      } catch {
        // Same id collisions (e.g. two arrow funcs at same line) — skip duplicates
      }
    }

    const insEdge = this.db.prepare(`
      INSERT OR IGNORE INTO code_edges (from_id, to_id, to_name, kind)
      VALUES (?, ?, ?, ?)
    `);
    for (const e of edges) {
      // Skip edges whose fromId isn't a real symbol (avoid FK error)
      // Synthetic '<module>' fromIds are dropped — top-level imports are still represented
      // via to_name without a symbol source.
      const fromExists = this.db.prepare('SELECT 1 FROM code_symbols WHERE id = ?').get(e.fromId);
      if (!fromExists) continue;
      try {
        insEdge.run(e.fromId, e.toId, e.toName, e.kind);
      } catch {}
    }

    const anchorResult = this.indexSemanticAnchorsFor(relPath, content);

    return { symbolsAdded: symbols.length, edgesAdded: edges.length, anchorsAdded: anchorResult.anchorsAdded };
  }

  indexSemanticAnchorsFor(relPath, content) {
    this.db.prepare('DELETE FROM code_semantic_anchors WHERE path = ?').run(relPath);
    const anchors = [
      ...parseSemanticAnchors(content, { filePath: relPath }),
      ...buildGeneratedAnchorsFromEntities(this.db, relPath),
    ];
    if (anchors.length === 0) return { anchorsAdded: 0 };
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO code_semantic_anchors (
        anchor_id, path, symbol_name, visibility, responsibility, invariants_json,
        verification_refs_json, start_line, end_line, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const anchor of anchors) {
      insert.run(
        anchor.anchorId,
        anchor.filePath,
        anchor.symbolName || null,
        anchor.visibility,
        anchor.responsibility || null,
        JSON.stringify(anchor.invariants || []),
        JSON.stringify(anchor.verificationRefs || []),
        anchor.startLine,
        anchor.endLine,
        anchor.source || 'comment',
      );
    }
    return { anchorsAdded: anchors.length };
  }

  /**
   * Resolve toId for unresolved edges with file/import-aware scoring.
   *
   * This deliberately leaves ambiguous edges unresolved instead of linking to
   * the first same-name symbol. False graph confidence is worse than a missing
   * edge for agents doing impact analysis.
   *
   * @returns number of edges that became resolved
   */
  resolveAllEdges({ onProgress = null, progressEvery = 1000 } = {}) {
    if (!this.useGraph) return 0;
    const files = this.db.prepare('SELECT path, language FROM code_files').all();
    const fileSet = new Set(files.map((f) => f.path));
    const langByFile = new Map(files.map((f) => [f.path, f.language]));
    const importMapCache = new Map();
    const symbolLookup = this.db.prepare(`
      SELECT id, path, kind, name, start_line AS startLine
      FROM code_symbols
      WHERE name = ?
      ORDER BY path, start_line
    `);
    const edgeRows = this.db.prepare(`
      SELECT e.rowid AS rowid, e.from_id AS fromId, e.to_name AS toName, e.kind AS edgeKind,
             s.path AS fromPath
      FROM code_edges e
      JOIN code_symbols s ON s.id = e.from_id
      WHERE e.to_id IS NULL
    `).all();
    const update = this.db.prepare('UPDATE code_edges SET to_id = ? WHERE rowid = ?');
    let resolved = 0;
    const total = edgeRows.length;
    onProgress?.({ phase: 'resolving-edges', current: 0, total, resolved });

    const getImportMap = (relPath) => {
      if (importMapCache.has(relPath)) return importMapCache.get(relPath);
      const language = langByFile.get(relPath) || detectLanguage(relPath);
      const absPath = join(this.projectRoot, relPath);
      let content = '';
      try { content = readFileSync(absPath, 'utf8'); } catch {}
      const map = buildImportMapForFile({
        content,
        relPath,
        language,
        fileSet,
      });
      importMapCache.set(relPath, map);
      return map;
    };

    for (const [index, edge] of edgeRows.entries()) {
      const candidates = symbolLookup.all(edge.toName);
      if (candidates.length > 0) {
        const target = selectBestEdgeTarget({
          edge,
          candidates,
          importMap: getImportMap(edge.fromPath),
          fromLanguage: langByFile.get(edge.fromPath),
          langByFile,
        });
        if (target) {
          update.run(target.id, edge.rowid);
          resolved++;
        }
      }
      const current = index + 1;
      if (current === total || current % progressEvery === 0) {
        onProgress?.({ phase: 'resolving-edges', current, total, resolved });
      }
    }
    return resolved;
  }

  /** Walk project directory, index all supported files. */
  async indexAll(rootDir, { onProgress = null, force = false, shouldStop = null, verbose = false } = {}) {
    const inventory = await discoverSourceFiles(rootDir);
    const counts = { indexed: 0, skipped: 0, errors: 0, discovered: inventory.files.length, pruned: 0, processed: 0, bounded: false };
    onProgress?.({ phase: 'discovered', total: inventory.files.length });
    for (const [index, file] of inventory.files.entries()) {
      if (shouldStop?.()) {
        counts.bounded = true;
        break;
      }
      onProgress?.({
        phase: 'file-start',
        current: index + 1,
        total: inventory.files.length,
        path: file.relPath,
        indexed: counts.indexed,
        skipped: counts.skipped,
        errors: counts.errors,
      });
      try {
        const result = await this.indexFile(file.absPath, {
          force,
          onProgress,
          current: index + 1,
          total: inventory.files.length,
          shouldStop,
        });
        if (result.indexed) counts.indexed++;
        else counts.skipped++;
        if (result.partial) {
          counts.errors++;
          await this.recordFailedFile({
            absPath: file.absPath,
            phase: result.phase || 'chunking',
            error: result.error,
            verbose,
            metadata: result.failureMetadata,
          });
        } else if (result.indexed) {
          await this.clearFailedFile(file.absPath);
        }
      } catch (err) {
        if (err.code === 'SUPERVIBE_INDEX_DEADLINE_EXCEEDED') {
          counts.bounded = true;
          break;
        }
        counts.errors++;
        await this.recordFailedFile({ absPath: file.absPath, phase: err.phase || 'file', error: err, verbose, metadata: err.indexMetadata });
      }
      counts.processed = index + 1;
      onProgress?.({
        phase: 'file',
        current: index + 1,
        total: inventory.files.length,
        path: file.relPath,
        indexed: counts.indexed,
        skipped: counts.skipped,
        errors: counts.errors,
      });
      if (shouldStop?.()) {
        counts.bounded = true;
        break;
      }
    }
    if (!counts.bounded) {
      const prune = await this.pruneToInventory(inventory, rootDir);
      counts.pruned = prune.removed;
      onProgress?.({ phase: 'resolving-edges', total: inventory.files.length });
      // Phase D: resolve cross-file edges after full pass
      counts.edgesResolved = this.resolveAllEdges({ onProgress });
    } else {
      counts.edgesResolved = 0;
      onProgress?.({ phase: 'bounded-timeout', current: counts.processed, total: inventory.files.length, ...counts });
    }
    onProgress?.({ phase: 'done', total: inventory.files.length, ...counts });
    return counts;
  }

  async pruneToInventory(inventory, rootDir = this.projectRoot) {
    return pruneCodeIndex(this, inventory, rootDir);
  }

  /** Index a specific list of absolute file paths (lazy mode). */
  async indexFiles(absPaths, { onProgress = null, force = false, shouldStop = null, verbose = false } = {}) {
    const counts = { indexed: 0, skipped: 0, errors: 0, discovered: absPaths.length, processed: 0, bounded: false };
    onProgress?.({ phase: 'discovered', total: absPaths.length });
    for (const [index, absPath] of absPaths.entries()) {
      if (shouldStop?.()) {
        counts.bounded = true;
        break;
      }
      onProgress?.({
        phase: 'file-start',
        current: index + 1,
        total: absPaths.length,
        path: this.toRel(absPath),
        indexed: counts.indexed,
        skipped: counts.skipped,
        errors: counts.errors,
      });
      try {
        const r = await this.indexFile(absPath, {
          force,
          onProgress,
          current: index + 1,
          total: absPaths.length,
          shouldStop,
        });
        if (r.indexed) counts.indexed++; else counts.skipped++;
        if (r.partial) {
          counts.errors++;
          await this.recordFailedFile({
            absPath,
            phase: r.phase || 'chunking',
            error: r.error,
            verbose,
            metadata: r.failureMetadata,
          });
        } else if (r.indexed) {
          await this.clearFailedFile(absPath);
        }
      } catch (err) {
        if (err.code === 'SUPERVIBE_INDEX_DEADLINE_EXCEEDED') {
          counts.bounded = true;
          break;
        }
        counts.errors++;
        await this.recordFailedFile({ absPath, phase: err.phase || 'file', error: err, verbose, metadata: err.indexMetadata });
      }
      counts.processed = index + 1;
      onProgress?.({
        phase: 'file',
        current: index + 1,
        total: absPaths.length,
        path: this.toRel(absPath),
        indexed: counts.indexed,
        skipped: counts.skipped,
        errors: counts.errors,
      });
      if (shouldStop?.()) {
        counts.bounded = true;
        break;
      }
    }
    if (!counts.bounded) {
      onProgress?.({ phase: 'resolving-edges', total: absPaths.length });
      counts.edgesResolved = this.resolveAllEdges({ onProgress });
    } else {
      counts.edgesResolved = 0;
      onProgress?.({ phase: 'bounded-timeout', current: counts.processed, total: absPaths.length, ...counts });
    }
    onProgress?.({ phase: 'done', total: absPaths.length, ...counts });
    return counts;
  }

  async removeFile(absPath) {
    const relPath = this.toRel(absPath);
    this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_chunk_entities WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_chunks WHERE path = ?').run(relPath);
    this.clearGraphFor(relPath);
    this.db.prepare('DELETE FROM code_files WHERE path = ?').run(relPath);
  }

  async recordFailedFile({ absPath, phase = 'file', error, verbose = false, metadata = null } = {}) {
    const relPath = normalizeRelPath(absPath ? this.toRel(absPath) : error?.relPath);
    const existing = await this.readFailedFilesReport();
    const files = existing.files.filter((item) => item.path !== relPath);
    const extra = {
      ...(error?.indexMetadata || {}),
      ...(metadata || {}),
    };
    if (absPath && !extra.sizeBytes) {
      try {
        const fileStats = await stat(absPath);
        extra.sizeBytes = Number(fileStats.size || 0);
      } catch {}
    }
    files.push({
      path: relPath,
      phase,
      status: extra.status || undefined,
      errorName: error?.name || 'Error',
      message: error?.message || String(error || 'unknown error'),
      stack: verbose ? (error?.stack || '') : undefined,
      ...extra,
      failedAt: new Date().toISOString(),
    });
    await mkdir(dirname(this.failedFilesPath), { recursive: true });
    await writeFile(this.failedFilesPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      files,
    }, null, 2));
  }

  async clearFailedFile(absPath) {
    const relPath = normalizeRelPath(absPath ? this.toRel(absPath) : "");
    if (!relPath) return;
    const existing = await this.readFailedFilesReport();
    const files = existing.files.filter((item) => item.path !== relPath);
    if (files.length === existing.files.length) return;
    await mkdir(dirname(this.failedFilesPath), { recursive: true });
    await writeFile(this.failedFilesPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      files,
    }, null, 2));
  }
  async readFailedFilesReport() {
    try {
      const raw = await readFile(this.failedFilesPath, 'utf8');
      const parsed = JSON.parse(raw);
      return { files: Array.isArray(parsed.files) ? parsed.files : [] };
    } catch {
      return { files: [] };
    }
  }

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

  getChunkMetadataHealth() {
    const requiredColumns = [
      'file_role',
      'heading',
      'symbol_hints_json',
      'artifact_type',
      'freshness',
      'metadata_version',
    ];
    const columns = this.db.prepare('PRAGMA table_info(code_chunks)').all().map((row) => row.name);
    const missingColumns = requiredColumns.filter((column) => !columns.includes(column));
    const totalChunks = this.db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get().n;
    if (missingColumns.length > 0) {
      return {
        pass: false,
        status: 'columns-missing',
        version: CODE_RAG_CHUNK_METADATA_VERSION,
        totalChunks,
        missingColumns,
        rebuildRequired: true,
      };
    }
    const staleRows = this.db.prepare(`
      SELECT COUNT(*) AS n
      FROM code_chunks
      WHERE metadata_version < ?
         OR file_role IS NULL OR file_role = ''
         OR artifact_type IS NULL OR artifact_type = ''
         OR freshness IS NULL OR freshness = ''
         OR heading IS NULL OR heading = ''
    `).get(CODE_RAG_CHUNK_METADATA_VERSION).n;
    return {
      pass: staleRows === 0,
      status: staleRows === 0 ? 'current' : 'rebuild-recommended',
      version: CODE_RAG_CHUNK_METADATA_VERSION,
      totalChunks,
      staleRows,
      missingColumns: [],
      rebuildRequired: staleRows > 0,
    };
  }

  getEmbeddingHealth() {
    const totalChunks = Number(this.db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get().n || 0);
    const embeddedChunks = Number(this.db.prepare('SELECT COUNT(*) AS n FROM code_chunks WHERE embedding IS NOT NULL').get().n || 0);
    const coverage = totalChunks === 0 ? 1 : embeddedChunks / totalChunks;
    return {
      totalChunks,
      embeddedChunks,
      missingEmbeddings: Math.max(0, totalChunks - embeddedChunks),
      coverage,
      semanticActive: embeddedChunks > 0,
      status: totalChunks === 0 ? 'empty' : embeddedChunks === 0 ? 'semantic-unavailable' : coverage >= 0.9 ? 'semantic-active' : 'partial-semantic',
      repairCommand: 'node scripts/build-code-index.mjs --root . --resume --embeddings-only --max-files 100 --health',
    };
  }

  getChunkEntityHealth() {
    const totalChunks = Number(this.db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get().n || 0);
    let totalEntities = 0;
    let linkedChunks = 0;
    let staleRows = 0;
    try {
      totalEntities = Number(this.db.prepare('SELECT COUNT(*) AS n FROM code_chunk_entities').get().n || 0);
      linkedChunks = Number(this.db.prepare("SELECT COUNT(DISTINCT cc.path || '#' || cc.chunk_idx) AS n FROM code_chunks cc JOIN code_chunk_entities cce ON cce.path = cc.path AND cce.chunk_idx = cc.chunk_idx").get().n || 0);
      staleRows = Number(this.db.prepare('SELECT COUNT(*) AS n FROM code_chunk_entities WHERE metadata_version < ?').get(CODE_RAG_ENTITY_METADATA_VERSION).n || 0);
    } catch {
      return { pass: false, status: 'table-missing', totalChunks, totalEntities: 0, linkedChunks: 0, coverage: 0, staleRows: 0, version: CODE_RAG_ENTITY_METADATA_VERSION, rebuildRequired: true };
    }
    const coverage = totalChunks === 0 ? 1 : linkedChunks / totalChunks;
    return {
      pass: totalChunks === 0 || (linkedChunks >= totalChunks && staleRows === 0),
      status: totalChunks === 0 ? 'empty' : staleRows > 0 ? 'stale' : linkedChunks === 0 ? 'missing-links' : linkedChunks >= totalChunks ? 'linked' : 'partial-links',
      totalChunks,
      totalEntities,
      linkedChunks,
      coverage,
      staleRows,
      version: CODE_RAG_ENTITY_METADATA_VERSION,
      rebuildRequired: staleRows > 0 || (totalChunks > 0 && linkedChunks < totalChunks),
    };
  }

  getSemanticAnchorHealth() {
    let totalAnchors = 0;
    let derivedAnchors = 0;
    let filesWithAnchors = 0;
    try {
      totalAnchors = Number(this.db.prepare('SELECT COUNT(*) AS n FROM code_semantic_anchors').get().n || 0);
      derivedAnchors = Number(this.db.prepare("SELECT COUNT(*) AS n FROM code_semantic_anchors WHERE source = 'derived-entity'").get().n || 0);
      filesWithAnchors = Number(this.db.prepare('SELECT COUNT(DISTINCT path) AS n FROM code_semantic_anchors').get().n || 0);
    } catch {
      return { pass: false, status: 'table-missing', totalAnchors: 0, derivedAnchors: 0, filesWithAnchors: 0 };
    }
    return {
      pass: totalAnchors > 0,
      status: totalAnchors > 0 ? 'present' : 'missing',
      totalAnchors,
      derivedAnchors,
      filesWithAnchors,
    };
  }

  getRetrievalLaneHealth() {
    try {
      const rows = this.db.prepare([
        'SELECT cc.file_role AS fileRole, cc.artifact_type AS artifactType, cf.language AS language,',
        'COUNT(DISTINCT cc.path) AS files,',
        "COUNT(DISTINCT cc.path || '#' || cc.chunk_idx) AS chunks,",
        "COUNT(DISTINCT CASE WHEN cc.embedding IS NOT NULL THEN cc.path || '#' || cc.chunk_idx END) AS embeddedChunks,",
        'COUNT(DISTINCT e.entity_id) AS entities',
        'FROM code_chunks cc JOIN code_files cf ON cf.path = cc.path',
        'LEFT JOIN code_chunk_entities e ON e.path = cc.path AND e.chunk_idx = cc.chunk_idx',
        'GROUP BY cc.file_role, cc.artifact_type, cf.language ORDER BY chunks DESC'
      ].join(' ')).all();
      return rows.map((row) => ({
        fileRole: row.fileRole || 'source',
        artifactType: row.artifactType || 'source-code',
        language: row.language || 'unknown',
        files: Number(row.files || 0),
        chunks: Number(row.chunks || 0),
        embeddedChunks: Number(row.embeddedChunks || 0),
        entities: Number(row.entities || 0),
      }));
    } catch {
      return [];
    }
  }

  maintain({ vacuum = false } = {}) {
    const started = Date.now();
    this.db.exec('PRAGMA optimize;');
    if (vacuum) this.db.exec('VACUUM;');
    return {
      optimized: true,
      vacuumed: Boolean(vacuum),
      durationMs: Date.now() - started,
    };
  }

  /**
   * Per-language health: indexed files vs files with extracted symbols.
   * Useful for status command — detects broken grammar queries.
   */
  getGrammarHealth() {
    const rows = this.db.prepare(`
      SELECT cf.language AS lang,
             COUNT(DISTINCT cf.path) AS files,
             COUNT(DISTINCT s.path) AS files_with_symbols,
             GROUP_CONCAT(DISTINCT cf.path) AS paths
      FROM code_files cf
      LEFT JOIN code_symbols s ON s.path = cf.path
      GROUP BY cf.language
      ORDER BY files DESC
    `).all();
    return rows.map(r => {
      const graphEligible = isGraphIndexableLanguage(r.lang);
      const paths = String(r.paths || '').split(',').filter(Boolean);
      const configOnly = !graphEligible || (paths.length > 0 && paths.every(isConfigOnlyGraphPath));
      const coverage = !graphEligible ? 1 : (r.files === 0 ? 1 : r.files_with_symbols / r.files);
      return {
        language: r.lang,
        files: r.files,
        filesWithSymbols: r.files_with_symbols,
        graphEligible,
        configOnly,
        healthy: r.files === 0 || r.files_with_symbols > 0 || configOnly,
        coverage,
        reason: !graphEligible
          ? `retrieval-only ${r.lang} file(s) are excluded from CodeGraph symbol coverage`
          : r.files > 0 && r.files_with_symbols === 0
            ? configOnly
              ? `zero symbols extracted for ${r.files} indexed config-only ${r.lang} file(s)`
              : `zero symbols extracted for ${r.files} indexed ${r.lang} file(s)`
            : 'symbols extracted',
      };
    });
  }

  getGraphHealthMetrics({ topSymbolLimit = 30 } = {}) {
    const fileRows = this.db.prepare('SELECT path, language, graph_version AS graphVersion FROM code_files').all();
    const totalFiles = fileRows.length;
    const graphEligiblePaths = new Set(fileRows.filter((row) => isGraphIndexableLanguage(row.language)).map((row) => row.path));
    const retrievalOnlyFiles = Math.max(0, totalFiles - graphEligiblePaths.size);
    const symbolPathRows = this.db.prepare('SELECT DISTINCT path FROM code_symbols').all();
    const filesWithSymbols = symbolPathRows.filter((row) => graphEligiblePaths.has(row.path)).length;
    const generatedIndexedFiles = fileRows.map((row) => row.path).filter(isGeneratedPath).length;
    const graphVersionStaleRows = fileRows
      .filter((row) => graphEligiblePaths.has(row.path) && Number(row.graphVersion || 0) !== CODE_GRAPH_EXTRACTOR_VERSION)
      .map((row) => row.path)
      .sort();
    const totalEdges = this.db.prepare('SELECT COUNT(*) AS n FROM code_edges').get().n;
    const resolvedEdges = this.db.prepare('SELECT COUNT(*) AS n FROM code_edges WHERE to_id IS NOT NULL').get().n;
    const edgeRows = this.db.prepare('SELECT to_id AS toId, to_name AS toName, kind FROM code_edges').all();
    const symbolNameCounts = new Map(this.db.prepare('SELECT name, COUNT(*) AS n FROM code_symbols GROUP BY name').all().map((row) => [row.name, Number(row.n || 0)]));
    let deterministic = 0;
    let deterministicResolved = 0;
    let actionableUnresolved = 0;
    let ignored = 0;
    let ambiguous = 0;
    let missingSymbol = 0;
    for (const edge of edgeRows) {
      if (!isActionableGraphEdgeName(edge.toName)) {
        ignored += 1;
        continue;
      }
      const candidates = symbolNameCounts.get(edge.toName) || 0;
      if (candidates === 1) {
        deterministic += 1;
        if (edge.toId) deterministicResolved += 1;
        else actionableUnresolved += 1;
      } else if (candidates > 1) {
        ambiguous += 1;
      } else {
        missingSymbol += 1;
      }
    }
    const topSymbols = this.db.prepare(`
      SELECT s.name AS name, COUNT(DISTINCT e.rowid) + COUNT(DISTINCT inbound.rowid) AS degree
      FROM code_symbols s
      LEFT JOIN code_edges e ON e.from_id = s.id
      LEFT JOIN code_edges inbound ON inbound.to_id = s.id
      GROUP BY s.id
      ORDER BY degree DESC, s.name ASC
      LIMIT ?
    `).all(topSymbolLimit).map((row) => row.name);
    const minifiedTopSymbols = [...new Set(topSymbols.filter(looksMinifiedSymbolName))];

    return {
      symbolNameQuality: {
        topSymbols,
        minifiedTopSymbols,
        minifiedTopSymbolRatio: topSymbols.length === 0 ? 0 : minifiedTopSymbols.length / topSymbols.length,
      },
      sourceFileSymbolCoverage: {
        files: graphEligiblePaths.size,
        totalIndexedFiles: totalFiles,
        retrievalOnlyFiles,
        filesWithSymbols,
        generatedIndexedFiles,
        coverage: graphEligiblePaths.size === 0 ? 1 : filesWithSymbols / graphEligiblePaths.size,
      },
      graphVersionStaleRows,
      eligibleProjectEdges: {
        deterministic,
        resolved: deterministicResolved,
        unresolved: actionableUnresolved,
        ignored,
        ambiguous,
        missingSymbol,
        totalObserved: totalEdges,
        rate: deterministic === 0 ? 1 : deterministicResolved / deterministic,
      },
      unresolvedImportRate: {
        unresolved: Math.max(0, totalEdges - resolvedEdges),
        total: totalEdges,
        rate: totalEdges === 0 ? 0 : (totalEdges - resolvedEdges) / totalEdges,
      },
      crossResolvedEdges: {
        resolved: resolvedEdges,
        total: totalEdges,
        rate: totalEdges === 0 ? 1 : resolvedEdges / totalEdges,
      },
    };
  }
  /** Hybrid search: FTS5 keyword + entity/anchor expansion + semantic cosine (max-over-chunks per file) -> RRF. */
  async search({ query, language = null, kind = null, limit = 10, semantic = true, queryVector = null } = {}) {
    if (!query || !query.trim()) return [];

    const escapedTerms = query.trim().split(/\s+/).map(t => '"' + t.replace(/"/g, '""') + '"');
    const escapedQuery = escapedTerms.join(' ');
    let sql = `
      SELECT cf.path AS path, cf.language AS language, cf.line_count AS line_count,
             cc.chunk_idx AS chunk_idx, cc.chunk_text AS chunk_text, cc.kind AS kind, cc.name AS name,
             cc.start_line AS start_line, cc.end_line AS end_line, cc.embedding AS embedding,
             cc.file_role AS file_role, cc.heading AS heading, cc.symbol_hints_json AS symbol_hints_json,
             cc.artifact_type AS artifact_type, cc.freshness AS freshness, cc.metadata_version AS metadata_version,
             bm25(code_chunks_fts) AS bm25
      FROM code_chunks_fts
      JOIN code_chunks cc ON cc.path = code_chunks_fts.path AND cc.chunk_idx = code_chunks_fts.chunk_idx
      JOIN code_files cf ON cf.path = cc.path
      WHERE code_chunks_fts MATCH ?
    `;
    const params = [escapedQuery];
    if (language) { sql += ' AND cf.language = ?'; params.push(language); }
    if (kind) { sql += ' AND cc.kind = ?'; params.push(kind); }
    sql += ' ORDER BY bm25 LIMIT ?';
    params.push(limit * 3);

    const runFts = (ftsQuery) => this.db.prepare(sql).all(ftsQuery, ...params.slice(1));
    let rows;
    let ftsMode = 'fts';
    try { rows = runFts(params[0]); }
    catch { rows = []; }
    if (rows.length === 0 && escapedTerms.length > 1) {
      try {
        rows = runFts(escapedTerms.join(' OR '));
        ftsMode = rows.length > 0 ? 'fts-relaxed' : ftsMode;
      } catch {
        rows = [];
      }
    }

    const k = 60;
    const lexicalRows = [];
    rows.forEach((row, index) => {
      lexicalRows.push({
        ...row,
        retrievalMode: ftsMode,
        score: 1 / (k + index + 1),
      });
    });

    const entityRows = this._loadEntityAnchorCandidates({ query, language, kind, limit: Math.max(limit * 10, 50) });
    entityRows.forEach((row, index) => {
      lexicalRows.push({
        ...row,
        retrievalMode: 'entity-anchor',
        score: 1 / (k + rows.length + index + 1),
      });
    });
    const expandedRows = this._dedupeRowsByChunk(lexicalRows);

    if (!semantic || !this.useEmbeddings) {
      return this._aggregateByFile(expandedRows, limit);
    }

    let queryVec;
    let embeddingHelpers;
    try {
      embeddingHelpers = await loadEmbeddingHelpers();
      queryVec = queryVector || await embeddingHelpers.embed(query, 'query');
    }
    catch { return this._aggregateByFile(expandedRows, limit); }

    const semanticCandidateLimit = boundedNonNegativeInt(process.env.SUPERVIBE_SEMANTIC_CANDIDATE_LIMIT, DEFAULT_SEMANTIC_CANDIDATE_LIMIT);
    const semanticRows = this._loadSemanticCandidates({ language, kind, limit: semanticCandidateLimit });
    for (const r of semanticRows) {
      r.semanticScore = r.embedding ? embeddingHelpers.cosineSimilarity(queryVec, embeddingHelpers.bufferToVector(r.embedding)) : 0;
    }
    semanticRows.sort((a, b) => b.semanticScore - a.semanticScore);

    if (expandedRows.length === 0) {
      return this._aggregateByFile(
        semanticRows
          .filter((r) => r.semanticScore > 0)
          .slice(0, Math.max(limit * 3, limit))
          .map((r, index) => ({
            ...r,
            score: 1 / (k + index + 1),
            retrievalMode: 'semantic',
          })),
        limit
      );
    }

    const lexicalRanks = new Map(expandedRows.map((r, i) => [`${r.path}#${r.chunk_idx}`, i + 1]));
    const semRanks = new Map(semanticRows.map((r, i) => [`${r.path}#${r.chunk_idx}`, i + 1]));
    const semanticByKey = new Map(semanticRows.map((r) => [`${r.path}#${r.chunk_idx}`, r]));
    const combined = new Map();

    for (const r of expandedRows) {
      const key = `${r.path}#${r.chunk_idx}`;
      const semanticRow = semanticByKey.get(key);
      const semanticScore = semanticRow?.semanticScore || (r.embedding ? embeddingHelpers.cosineSimilarity(queryVec, embeddingHelpers.bufferToVector(r.embedding)) : 0);
      const retrievalMode = r.retrievalMode === 'entity-anchor'
        ? (semanticScore > 0 ? 'entity-anchor+semantic' : 'entity-anchor')
        : (semanticScore > 0 ? 'hybrid' : r.retrievalMode);
      combined.set(key, {
        ...r,
        semanticScore,
        score: 1 / (k + (lexicalRanks.get(key) || 1000)) + 1 / (k + (semRanks.get(key) || 1000)),
        retrievalMode,
      });
    }

    for (const [index, r] of semanticRows.slice(0, Math.max(limit * 3, limit)).entries()) {
      const key = `${r.path}#${r.chunk_idx}`;
      if (combined.has(key)) continue;
      combined.set(key, {
        ...r,
        score: 1 / (k + index + 1),
        retrievalMode: 'semantic',
      });
    }

    const mergedRows = [...combined.values()].sort((a, b) => b.score - a.score);
    return this._aggregateByFile(mergedRows, limit);
  }

  _dedupeRowsByChunk(rows = []) {
    const byChunk = new Map();
    for (const row of rows) {
      const key = `${row.path}#${row.chunk_idx}`;
      const existing = byChunk.get(key);
      if (!existing || Number(row.score || 0) > Number(existing.score || 0)) {
        byChunk.set(key, row);
      }
    }
    return [...byChunk.values()].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  _loadEntityAnchorCandidates({ query, language = null, kind = null, limit = 100 } = {}) {
    const terms = searchTermsForAnchors(query, 6);
    if (terms.length === 0) return [];
    const normalizedLimit = positiveInt(process.env.SUPERVIBE_ENTITY_ANCHOR_CANDIDATE_LIMIT || limit, 100);
    const perLaneLimit = Math.max(normalizedLimit * 2, 20);
    const chunkKeys = new Map();
    const addKey = (path, chunkIdx) => {
      const normalizedPath = normalizeRelPath(path);
      const index = Number(chunkIdx);
      if (!normalizedPath || !Number.isFinite(index)) return;
      chunkKeys.set(normalizedPath + '#' + index, { path: normalizedPath, chunkIdx: index });
    };

    const entityStmt = this.db.prepare(`
      SELECT path, chunk_idx AS chunkIdx
      FROM code_chunk_entities
      WHERE entity_name = ? COLLATE NOCASE
         OR entity_id = ? COLLATE NOCASE
         OR entity_name LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR entity_id LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR entity_name LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR entity_id LIKE ? ESCAPE '\\' COLLATE NOCASE
      ORDER BY confidence DESC, path, chunk_idx
      LIMIT ?
    `);
    const anchorStmt = this.db.prepare(`
      SELECT path, start_line AS startLine, end_line AS endLine
      FROM code_semantic_anchors
      WHERE symbol_name = ? COLLATE NOCASE
         OR anchor_id = ? COLLATE NOCASE
         OR symbol_name LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR anchor_id LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR responsibility LIKE ? ESCAPE '\\' COLLATE NOCASE
      ORDER BY path, start_line
      LIMIT ?
    `);
    const anchorChunkStmt = this.db.prepare(`
      SELECT chunk_idx AS chunkIdx
      FROM code_chunks
      WHERE path = ? AND start_line <= ? AND end_line >= ?
      ORDER BY chunk_idx
      LIMIT 3
    `);

    try {
      for (const term of terms) {
        if (chunkKeys.size >= normalizedLimit) break;
        const escaped = escapeLikeTerm(term);
        const prefix = escaped + '%';
        const contains = '%' + escaped + '%';
        for (const row of entityStmt.all(term, term, prefix, prefix, contains, contains, perLaneLimit)) {
          addKey(row.path, row.chunkIdx);
          if (chunkKeys.size >= normalizedLimit) break;
        }
        if (chunkKeys.size >= normalizedLimit) break;
        for (const anchor of anchorStmt.all(term, term, prefix, prefix, contains, perLaneLimit)) {
          for (const row of anchorChunkStmt.all(anchor.path, Number(anchor.endLine || anchor.startLine || 1), Number(anchor.startLine || 1))) {
            addKey(anchor.path, row.chunkIdx);
            if (chunkKeys.size >= normalizedLimit) break;
          }
          if (chunkKeys.size >= normalizedLimit) break;
        }
      }
    } catch {
      return [];
    }

    const rows = [];
    const chunkStmt = this.db.prepare(`
      SELECT cf.path AS path, cf.language AS language, cf.line_count AS line_count,
             cc.chunk_idx AS chunk_idx, cc.chunk_text AS chunk_text, cc.kind AS kind, cc.name AS name,
             cc.start_line AS start_line, cc.end_line AS end_line, cc.embedding AS embedding,
             cc.file_role AS file_role, cc.heading AS heading, cc.symbol_hints_json AS symbol_hints_json,
             cc.artifact_type AS artifact_type, cc.freshness AS freshness, cc.metadata_version AS metadata_version,
             0 AS bm25
      FROM code_chunks cc
      JOIN code_files cf ON cf.path = cc.path
      WHERE cc.path = ? AND cc.chunk_idx = ?
        ${language ? 'AND cf.language = ?' : ''}
        ${kind ? 'AND cc.kind = ?' : ''}
      LIMIT 1
    `);
    for (const key of chunkKeys.values()) {
      const params = [key.path, key.chunkIdx];
      if (language) params.push(language);
      if (kind) params.push(kind);
      const row = chunkStmt.get(...params);
      if (row) rows.push(row);
      if (rows.length >= normalizedLimit) break;
    }
    return rows;
  }

  _loadSemanticCandidates({ language = null, kind = null, limit = 0 } = {}) {
    let sql = `
      SELECT cf.path AS path, cf.language AS language, cf.line_count AS line_count,
             cc.chunk_idx AS chunk_idx, cc.chunk_text AS chunk_text, cc.kind AS kind, cc.name AS name,
             cc.start_line AS start_line, cc.end_line AS end_line, cc.embedding AS embedding,
             cc.file_role AS file_role, cc.heading AS heading, cc.symbol_hints_json AS symbol_hints_json,
             cc.artifact_type AS artifact_type, cc.freshness AS freshness, cc.metadata_version AS metadata_version,
             0 AS bm25
      FROM code_chunks cc
      JOIN code_files cf ON cf.path = cc.path
      WHERE cc.embedding IS NOT NULL
    `;
    const params = [];
    if (language) { sql += ' AND cf.language = ?'; params.push(language); }
    if (kind) { sql += ' AND cc.kind = ?'; params.push(kind); }
    sql += ' ORDER BY cf.path, cc.chunk_idx';
    const normalizedLimit = boundedNonNegativeInt(limit, 0);
    if (normalizedLimit > 0) {
      sql += ' LIMIT ?';
      params.push(normalizedLimit);
    }
    try { return this.db.prepare(sql).all(...params); }
    catch { return []; }
  }
  _aggregateByFile(rows, limit) {
    const byFile = new Map();
    for (const r of rows) {
      const score = r.score ?? -Math.abs(r.bm25 || 0);
      const existing = byFile.get(r.path);
      const existingScore = existing ? (existing.score ?? -Math.abs(existing.bm25 || 0)) : -Infinity;
      if (!existing || score > existingScore) {
        byFile.set(r.path, r);
      }
    }
    return [...byFile.values()].slice(0, limit).map(r => ({
      file: r.path,
      language: r.language,
      lineCount: r.line_count,
      kind: r.kind,
      name: r.name,
      startLine: r.start_line,
      endLine: r.end_line,
      snippet: r.chunk_text.slice(0, 400),
      score: r.score || 0,
      semantic: r.semanticScore || 0,
      bm25: Math.abs(r.bm25 || 0),
      retrievalMode: r.retrievalMode || 'fts',
      generatedSource: isGeneratedPath(r.path),
      metadata: {
        fileRole: r.file_role || 'source',
        heading: r.heading || '',
        symbolHints: parseJsonStringArray(r.symbol_hints_json),
        artifactType: r.artifact_type || inferChunkArtifactType(r.path, r.file_role || 'source'),
        freshness: r.freshness || 'current',
        metadataVersion: Number(r.metadata_version || 0),
      },
      scoreComponents: {
        bm25: Math.abs(r.bm25 || 0),
        semantic: r.semanticScore || 0,
        rrf: r.score || 0,
      },
    }));
  }
}
