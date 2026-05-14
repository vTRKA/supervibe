#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;
const DEFAULT_CACHE_PATH = join('.supervibe', 'memory', 'release-check-cache.json');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    script: 'check:full',
    cache: true,
    dryRun: false,
    fromStart: false,
    clearCache: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--dry-run') options.dryRun = true;
    else if (item === '--from-start') options.fromStart = true;
    else if (item === '--no-cache') options.cache = false;
    else if (item === '--clear-cache') options.clearCache = true;
    else if (item === '--script') {
      options.script = argv[index + 1] || options.script;
      index += 1;
    } else if (item.startsWith('--script=')) options.script = item.slice('--script='.length);
    else if (item === '--cache-path') {
      options.cachePath = argv[index + 1];
      index += 1;
    } else if (item.startsWith('--cache-path=')) options.cachePath = item.slice('--cache-path='.length);
    else if (item === '--help' || item === '-h') options.help = true;
  }
  return options;
}

function usage() {
  return [
    'SUPERVIBE_RELEASE_CHECK_HELP',
    'USAGE:',
    '  node scripts/run-release-check.mjs [--script check:full] [--dry-run] [--from-start] [--no-cache] [--clear-cache]',
    '',
    'Runs the release check as resumable gates. If a late gate fails or the run is interrupted, the next run resumes at that gate instead of repeating every earlier validator.',
    'Use npm run check:full for the old one-shot command chain.',
  ].join('\n');
}

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function splitAndChain(script = '') {
  return String(script || '')
    .split(/\s+&&\s+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sha256(text = '') {
  return createHash('sha256').update(String(text)).digest('hex');
}

function gitOutput(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 ? result.stdout.trim() : '';
}

function changedFileFingerprint(rootDir) {
  const head = gitOutput(['rev-parse', 'HEAD'], rootDir);
  const raw = gitOutput(['status', '--porcelain=v1', '-z', '--untracked-files=all'], rootDir);
  const paths = raw.split('\0')
    .map((entry) => entry.slice(3).trim())
    .filter(Boolean)
    .map((entry) => entry.includes(' -> ') ? entry.split(' -> ').pop() : entry)
    .filter((entry) => !entry.startsWith('.supervibe/') && !entry.startsWith('node_modules/'))
    .sort();
  const h = createHash('sha256');
  h.update('head:');
  h.update(head);
  h.update('\n');
  for (const relPath of paths) {
    h.update(relPath);
    h.update('\0');
    const fullPath = join(rootDir, relPath);
    if (existsSync(fullPath)) {
      try {
        h.update(readFileSync(fullPath));
      } catch {
        h.update('<unreadable>');
      }
    } else {
      h.update('<deleted>');
    }
    h.update('\0');
  }
  return h.digest('hex');
}

function buildSignature({ rootDir, packageJson, scriptName, scriptText }) {
  return sha256(JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    node: process.versions.node,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    scriptName,
    scriptText,
    worktree: changedFileFingerprint(rootDir),
  }));
}

function loadCache(path) {
  const cache = readJson(path, null);
  return cache && cache.schemaVersion === SCHEMA_VERSION ? cache : null;
}

function saveCache(path, cache) {
  writeJson(path, { ...cache, updatedAt: new Date().toISOString() });
}

function gateRecord(index, command, status, extra = {}) {
  return {
    index,
    command,
    status,
    ...extra,
    updatedAt: new Date().toISOString(),
  };
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
}

function runCommand(command, cwd) {
  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: process.env,
  });
  const promise = new Promise((resolveRun) => {
    child.on('exit', (code, signal) => resolveRun({ code: code ?? (signal ? 130 : 1), signal }));
    child.on('error', () => resolveRun({ code: 1, signal: null }));
  });
  promise.child = child;
  return promise;
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const rootDir = resolve(process.cwd());
  const packagePath = join(rootDir, 'package.json');
  const packageJson = readJson(packagePath, {});
  const scripts = packageJson.scripts || {};
  const scriptName = options.script || 'check:full';
  const scriptText = scripts[scriptName];
  if (!scriptText) {
    console.error('SUPERVIBE_RELEASE_CHECK');
    console.error('PASS: false');
    console.error('ERROR: missing package script ' + scriptName);
    return 1;
  }
  if (scriptName === 'check') {
    console.error('SUPERVIBE_RELEASE_CHECK');
    console.error('PASS: false');
    console.error('ERROR: refusing to execute recursive check script; use --script check:full');
    return 1;
  }

  const gates = splitAndChain(scriptText);
  const cachePath = resolve(rootDir, options.cachePath || DEFAULT_CACHE_PATH);
  const signature = buildSignature({ rootDir, packageJson, scriptName, scriptText });
  let cache = options.cache && !options.clearCache ? loadCache(cachePath) : null;
  const signatureMatches = cache?.signature === signature;
  const canResume = options.cache && !options.fromStart && cache && cache.scriptName === scriptName;
  let startIndex = 0;
  let resumeReason = 'from-start';

  if (canResume && cache.status === 'pass' && signatureMatches) {
    console.log('SUPERVIBE_RELEASE_CHECK');
    console.log('PASS: true');
    console.log('STATUS: cache-hit');
    console.log('SCRIPT: ' + scriptName);
    console.log('GATES: ' + gates.length);
    console.log('CACHE: ' + cachePath);
    console.log('NEXT: npm run check:full when a forced one-shot run is required');
    return 0;
  }

  if (canResume && Number.isInteger(cache.nextIndex)) {
    startIndex = Math.max(0, Math.min(cache.nextIndex, Math.max(0, gates.length - 1)));
    resumeReason = signatureMatches ? 'same-worktree' : 'workspace-changed-resume-at-last-gate';
  }

  if (options.fromStart || options.clearCache || !cache) {
    cache = null;
    startIndex = 0;
    resumeReason = options.fromStart ? 'forced-from-start' : options.clearCache ? 'cache-cleared' : 'new-run';
  }

  const nextCache = {
    schemaVersion: SCHEMA_VERSION,
    scriptName,
    scriptText,
    signature,
    status: options.dryRun ? 'dry-run' : 'running',
    startedAt: cache?.startedAt || new Date().toISOString(),
    nextIndex: startIndex,
    gates: cache?.gates || [],
  };

  console.log('SUPERVIBE_RELEASE_CHECK');
  console.log('SCRIPT: ' + scriptName);
  console.log('MODE: ' + (options.dryRun ? 'dry-run' : 'run'));
  console.log('RESUME: ' + resumeReason);
  console.log('GATES: ' + gates.length);
  console.log('START_INDEX: ' + startIndex);
  console.log('CACHE: ' + (options.cache ? cachePath : 'disabled'));

  for (let index = 0; index < gates.length; index += 1) {
    const command = gates[index];
    if (index < startIndex) {
      console.log('SKIP ' + (index + 1) + '/' + gates.length + ': ' + command);
      continue;
    }
    console.log('GATE ' + (index + 1) + '/' + gates.length + ': ' + command);
    if (options.dryRun) continue;

    nextCache.nextIndex = index;
    nextCache.status = 'running';
    nextCache.gates[index] = gateRecord(index, command, 'running', { startedAt: new Date().toISOString() });
    if (options.cache) saveCache(cachePath, nextCache);

    let activeChild = null;
    let interrupted = false;
    const started = Date.now();
    const onInterrupt = () => {
      interrupted = true;
      nextCache.status = 'interrupted';
      nextCache.nextIndex = index;
      nextCache.gates[index] = gateRecord(index, command, 'interrupted', { exitCode: 130 });
      if (options.cache) saveCache(cachePath, nextCache);
      killProcessTree(activeChild?.pid);
      process.exit(130);
    };
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onInterrupt);
    const promise = runCommand(command, rootDir);
    activeChild = promise.child;
    const result = await promise;
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onInterrupt);
    if (interrupted) return 130;

    const durationMs = Date.now() - started;
    if (result.code !== 0) {
      nextCache.status = 'failed';
      nextCache.nextIndex = index;
      nextCache.gates[index] = gateRecord(index, command, 'failed', { exitCode: result.code, durationMs });
      if (options.cache) saveCache(cachePath, nextCache);
      console.error('SUPERVIBE_RELEASE_CHECK_FAILED');
      console.error('FAILED_GATE: ' + (index + 1) + '/' + gates.length);
      console.error('COMMAND: ' + command);
      console.error('EXIT_CODE: ' + result.code);
      console.error('NEXT: npm run check resumes from this gate; npm run check:full forces the old full chain');
      return result.code || 1;
    }

    nextCache.gates[index] = gateRecord(index, command, 'pass', { exitCode: 0, durationMs });
    nextCache.nextIndex = index + 1;
    if (options.cache) saveCache(cachePath, nextCache);
  }

  if (!options.dryRun) {
    nextCache.status = 'pass';
    nextCache.nextIndex = gates.length;
    nextCache.completedAt = new Date().toISOString();
    if (options.cache) saveCache(cachePath, nextCache);
  }
  console.log('PASS: true');
  console.log('STATUS: ' + (options.dryRun ? 'dry-run' : 'complete'));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

export { splitAndChain, usage };
