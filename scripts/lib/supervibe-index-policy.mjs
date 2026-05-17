import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

import { detectLanguage, isRetrievalOnlyLanguage } from './code-chunker.mjs';
import { loadIndexConfig, shouldExcludeFromIndex } from './supervibe-index-config.mjs';
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
  'bin',
  'obj',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.angular',
  '.vercel',
  '.netlify',
  'coverage',
  '.turbo',
  'target',
  'generated',
  '__generated__',
  '.generated',
  'gen',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  'bower_components',
  'jspm_packages',
  '.pnpm-store',
  '.git',
  '.claude',
  '.supervibe',
  'vendor',
  'site-packages',
  'Pods',
  'DerivedData',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '.nox',
  '.eggs',
  '.parcel-cache',
  '.cache',
  '.gradle',
  'venv',
  '.venv',
]);

const SKIP_FILE_PATTERNS = [
  /\.min\.(js|css)$/i,
  /\.bundle\./i,
  /\.test\./i,
  /\.spec\./i,
  /\.d\.ts$/i,
  /(?:^|\/)(?:package-lock|npm-shrinkwrap)\.json$/i,
  /(?:^|\/)(?:pnpm-lock|yarn)\.ya?ml$/i,
  /(?:^|\/)bun\.lockb?$/i,
];

const ROOT_MARKDOWN_ARTIFACTS = new Set([
  'agents.md',
  'readme.md',
  'readme.ru.md',
  'claude.md',
  'gemini.md',
  'codex.md',
  'opencode.md',
  'contributing.md',
  'changelog.md',
  'security.md',
  'license.md',
]);

const ROOT_JSON_ARTIFACTS = new Set([
  'gemini-extension.json',
  'knip.json',
  'package.json',
]);

export function normalizeRelPath(path = '') {
  return String(path).replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isGeneratedPath(path = '') {
  const segments = normalizeRelPath(path).split('/').filter(Boolean);
  return segments.some((segment, index) => GENERATED_DIRS.has(segment) && !(index === 0 && segment === 'bin'));
}

function isAllowedRetrievalArtifactPath(path = '', language = '') {
  const normalized = normalizeRelPath(path).toLowerCase();
  const segments = normalized.split('/').filter(Boolean);
  const name = segments.at(-1) || '';
  if (!isRetrievalOnlyLanguage(language)) return true;
  if (/^(package-lock|npm-shrinkwrap)\.json$/.test(name)) return false;
  if (/^(pnpm-lock|yarn)\.ya?ml$/.test(name)) return false;
  if (name === 'bun.lock' || name === 'bun.lockb') return false;
  if (language === 'markdown') {
    return ROOT_MARKDOWN_ARTIFACTS.has(name)
      || normalized.startsWith('docs/')
      || normalized.startsWith('templates/')
      || normalized.startsWith('references/')
      || normalized.startsWith('commands/')
      || normalized.startsWith('agents/')
      || normalized.startsWith('skills/')
      || normalized.startsWith('rules/');
  }
  if (language === 'json') {
    return ROOT_JSON_ARTIFACTS.has(name)
      || normalized.startsWith('confidence-rubrics/')
      || normalized.startsWith('hooks/')
      || normalized.startsWith('templates/')
      || normalized.startsWith('schemas/')
      || normalized.startsWith('tests/fixtures/scenario-evals/');
  }
  if (language === 'yaml') {
    return name === 'registry.yaml'
      || normalized.startsWith('confidence-rubrics/')
      || normalized.startsWith('questionnaires/')
      || normalized.startsWith('templates/')
      || normalized.startsWith('schemas/')
      || normalized.startsWith('stack-packs/');
  }
  if (language === 'template') {
    return normalized.startsWith('templates/');
  }
  return false;
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

export function classifyIndexPath(path, { rootDir = process.cwd(), indexConfig = loadIndexConfig({ rootDir }) } = {}) {
  const relPath = toPolicyRelPath(path, rootDir);
  const segments = relPath.split('/').filter(Boolean);
  const fileName = segments.at(-1) || '';
  const privacy = classifyPrivacyPath(relPath);
  if (!privacy.indexAllowed && ['generated', 'binary', 'archive', 'secret-like', 'local-config'].includes(privacy.classification)) {
    return { included: false, relPath, language: null, reason: `privacy:${privacy.classification}` };
  }
  const userExclude = shouldExcludeFromIndex(relPath, indexConfig);
  if (userExclude) {
    return { included: false, relPath, language: null, reason: `user-exclude:${userExclude}` };
  }
  const generatedSegment = segments.find((segment, index) => GENERATED_DIRS.has(segment) && !(index === 0 && segment === 'bin'));
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
  const language = detectLanguage(relPath);
  if (!language) {
    return { included: false, relPath, language: null, reason: 'unsupported-language' };
  }
  if (isRetrievalOnlyLanguage(language) && !isAllowedRetrievalArtifactPath(relPath, language)) {
    return { included: false, relPath, language, reason: 'unsupported-artifact-path' };
  }
  return {
    included: true,
    relPath,
    language,
    reason: isRetrievalOnlyLanguage(language) ? 'artifact' : 'source',
  };
}

export async function discoverSourceFiles(rootDir = process.cwd(), { explain = false } = {}) {
  const files = [];
  const excluded = [];
  const queue = [rootDir];
  const indexConfig = loadIndexConfig({ rootDir });

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
        const policy = classifyDirectory(entry.name, relPath, indexConfig);
        if (!policy.included) {
          if (explain) excluded.push({ path: relPath, reason: policy.reason });
          continue;
        }
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const policy = classifyIndexPath(fullPath, { rootDir, indexConfig });
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

  for (const row of rows) {
    const relPath = normalizeRelPath(row.path);
    const absPath = join(rootDir, relPath);
    const policy = classifyIndexPath(absPath, { rootDir });
    const shouldRemove = !existsSync(absPath) || !policy.included || !allowed.has(relPath);
    if (!shouldRemove) continue;
    await codeStore.removeFile(absPath);
    removed++;
    pruned.push({
      path: relPath,
      reason: !existsSync(absPath) ? 'missing-on-disk' : policy.reason,
    });
  }

  return { removed, pruned };
}

function classifyDirectory(name, relPath, indexConfig = loadIndexConfig({ rootDir: process.cwd() })) {
  const userExclude = shouldExcludeFromIndex(`${normalizeRelPath(relPath)}/`, indexConfig)
    || shouldExcludeFromIndex(`${normalizeRelPath(relPath)}/__dir__`, indexConfig);
  if (userExclude) return { included: false, reason: `user-exclude:${userExclude}` };
  if (GENERATED_DIRS.has(name) && normalizeRelPath(relPath) !== 'bin') return { included: false, reason: `generated-dir:${name}` };
  if (SKIP_DIRS.has(name) || name.startsWith('.')) return { included: false, reason: `skip-dir:${name}` };
  return { included: true, reason: 'walk' };
}
