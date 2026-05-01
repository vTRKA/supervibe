import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { detectLanguage } from './code-chunker.mjs';
import { classifyPrivacyPath } from './supervibe-privacy-policy.mjs';

const DEFAULT_SOURCE_ROOTS = [
  'src',
  'src-tauri',
  'app',
  'lib',
  'scripts',
  'commands',
  'skills',
  'agents',
  'rules',
  'tests',
  'packages',
];

export const GENERATED_DIRS = new Set([
  'dist',
  'dist-check',
  'build',
  'out',
  '.next',
  'coverage',
  '.turbo',
  'target',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.supervibe',
  'vendor',
  '__pycache__',
  'venv',
  '.venv',
]);

const SKIP_FILE_PATTERNS = [
  /\.min\.(js|css)$/i,
  /\.bundle\./i,
  /\.test\./i,
  /\.spec\./i,
  /\.d\.ts$/i,
];

export function normalizeRelPath(path = '') {
  return String(path).replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isGeneratedPath(path = '') {
  const segments = normalizeRelPath(path).split('/').filter(Boolean);
  return segments.some((segment) => GENERATED_DIRS.has(segment));
}

export function looksMinifiedSymbolName(name = '') {
  if (!name || typeof name !== 'string') return false;
  if (name.length === 1) return true;
  if (/^_[A-Za-z0-9]$/.test(name)) return true;
  if (/^[A-Z][a-zA-Z]$/.test(name)) return true;
  return /^[a-z]{2}$/.test(name);
}

function toPolicyRelPath(path, rootDir = process.cwd()) {
  const abs = isAbsolute(path) ? path : join(rootDir, path);
  return normalizeRelPath(relative(rootDir, abs).split(sep).join('/'));
}

export function classifyIndexPath(path, { rootDir = process.cwd() } = {}) {
  const relPath = toPolicyRelPath(path, rootDir);
  const segments = relPath.split('/').filter(Boolean);
  const fileName = segments.at(-1) || '';
  const privacy = classifyPrivacyPath(relPath);
  if (!privacy.indexAllowed && ['generated', 'binary', 'archive', 'secret-like', 'local-config'].includes(privacy.classification)) {
    return { included: false, relPath, language: null, reason: `privacy:${privacy.classification}` };
  }
  const generatedSegment = segments.find((segment) => GENERATED_DIRS.has(segment));
  if (generatedSegment) {
    return { included: false, relPath, language: null, reason: `generated-dir:${generatedSegment}` };
  }
  const skippedSegment = segments.find((segment) => SKIP_DIRS.has(segment) || (segment.startsWith('.') && segment !== '.'));
  if (skippedSegment) {
    return { included: false, relPath, language: null, reason: `skip-dir:${skippedSegment}` };
  }
  const skippedPattern = SKIP_FILE_PATTERNS.find((pattern) => pattern.test(fileName));
  if (skippedPattern) {
    return { included: false, relPath, language: null, reason: `skip-file:${skippedPattern.source}` };
  }
  const language = detectLanguage(fileName);
  if (!language) {
    return { included: false, relPath, language: null, reason: 'unsupported-language' };
  }
  return { included: true, relPath, language, reason: 'source' };
}

export async function discoverSourceFiles(rootDir = process.cwd(), { explain = false } = {}) {
  const files = [];
  const excluded = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = toPolicyRelPath(fullPath, rootDir);
      if (entry.isDirectory()) {
        const policy = classifyDirectory(entry.name, relPath);
        if (!policy.included) {
          if (explain) excluded.push({ path: relPath, reason: policy.reason });
          continue;
        }
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const policy = classifyIndexPath(fullPath, { rootDir });
      if (!policy.included) {
        if (explain) excluded.push({ path: policy.relPath, reason: policy.reason });
        continue;
      }
      files.push({
        absPath: fullPath,
        relPath: policy.relPath,
        language: policy.language,
        reason: policy.reason,
      });
    }
  }

  files.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return { rootDir, files, excluded };
}

export async function pruneCodeIndex(codeStore, inventory, rootDir = codeStore.projectRoot) {
  const allowed = new Set((inventory?.files || []).map((file) => file.relPath));
  const rows = codeStore.db.prepare('SELECT path FROM code_files').all();
  const pruned = [];
  let removed = 0;
  const deleteFts = codeStore.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?');
  const deleteFile = codeStore.db.prepare('DELETE FROM code_files WHERE path = ?');

  for (const row of rows) {
    const relPath = normalizeRelPath(row.path);
    const absPath = join(rootDir, relPath);
    const policy = classifyIndexPath(absPath, { rootDir });
    const shouldRemove = !existsSync(absPath) || !policy.included || !allowed.has(relPath);
    if (!shouldRemove) continue;
    deleteFts.run(relPath);
    deleteFile.run(relPath);
    removed++;
    pruned.push({
      path: relPath,
      reason: !existsSync(absPath) ? 'missing-on-disk' : policy.reason,
    });
  }

  return { removed, pruned };
}

function classifyDirectory(name, relPath) {
  if (GENERATED_DIRS.has(name)) return { included: false, reason: `generated-dir:${name}` };
  if (SKIP_DIRS.has(name) || name.startsWith('.')) return { included: false, reason: `skip-dir:${name}` };
  return { included: true, reason: 'walk' };
}
