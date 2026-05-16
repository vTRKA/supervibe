#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RELEASE_PROOF_METADATA_V2_SCHEMA_VERSION,
  VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
  VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
  canReuseVerificationCacheRecordV2,
  createReleaseProofMetadataV2,
  createVerificationCacheRecordV2,
  createVerificationGateInputDeclarationV2,
} from './lib/supervibe-verification-cache-v2.mjs';

const SCHEMA_VERSION = 2;
const DEFAULT_CACHE_PATH = join('.supervibe', 'memory', 'release-check-cache.json');

const RELEASE_CHECK_CACHE_SAFETY_SIGNALS = Object.freeze({
  cachePolicy: 'opt-in-resume-only',
  cacheUse: 'resume-only-failed-interrupted-running',
  dryRunCacheAction: 'not-written-dry-run',
  dryRunCacheResult: 'not-written',
  finalPassReuse: 'previous-pass-cache-ignored',
  finalReleasePolicy: 'previous all-pass cache never converts into a fresh release pass',
  forceBypassInputs: Object.freeze(['clearCache', 'fromStart']),
  proofBindingInputs: Object.freeze(['exitCode', 'receiptDependencyHash', 'status']),
  reuseKeyInputs: Object.freeze([
    'dependencyHash',
    'envFingerprint',
    'gateInputDeclaration',
    'gitHead',
    'inputContentHashes',
    'invalidationInputs',
    'proofHashes',
    'scriptHash',
  ]),
});

const RELEASE_EVIDENCE_V1_CONTRACT = Object.freeze({
  schemaVersion: 'ReleaseEvidenceV1',
  requiredFields: Object.freeze([
    'command',
    'exitCode',
    'timestamp',
    'stdoutPath',
    'stderrPath',
    'artifactPath',
    'receiptId',
    'ledgerHash',
    'proofHash',
    'hostInvocationSource',
  ]),
  releaseGatePolicy: 'ReleaseEvidenceV1 is created only by the final release gate after executed commands; dry-run output is non-reusable and never satisfies release evidence.',
});

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    script: 'check:full',
    cache: false,
    dryRun: false,
    fromStart: false,
    clearCache: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--dry-run') options.dryRun = true;
    else if (item === '--from-start') options.fromStart = true;
    else if (item === '--cache') options.cache = true;
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
    '  node scripts/run-release-check.mjs [--script check:full] [--dry-run] [--from-start] [--cache] [--no-cache] [--clear-cache]',
    '',
    'Runs the release check as ordered gates. Passing --cache enables an opt-in resume cache for interrupted or failed runs; it never converts a previous all-pass cache into a fresh release pass.',
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

function sha256File(path) {
  try {
    return 'sha256:' + createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return 'sha256:unreadable';
  }
}

function gitResult(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function gitOutput(args, cwd) {
  const result = gitResult(args, cwd);
  return result.status === 0 ? result.stdout.trim() : '';
}

function changedFileFingerprint(rootDir) {
  const headResult = gitResult(['rev-parse', 'HEAD'], rootDir);
  const statusResult = gitResult(['status', '--porcelain=v1', '-z', '--untracked-files=all'], rootDir);
  if (headResult.status !== 0 || statusResult.status !== 0) {
    return {
      dirtyPathCount: 0,
      dirtyPaths: [],
      fingerprint: 'sha256:unknown',
      known: false,
      reason: headResult.status !== 0 ? 'git-head-unavailable' : 'git-status-unavailable',
    };
  }
  const head = headResult.stdout.trim();
  const paths = statusResult.stdout.split('\0')
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
  return {
    dirtyPathCount: paths.length,
    dirtyPaths: paths,
    fingerprint: 'sha256:' + h.digest('hex'),
    known: true,
    reason: 'git-status-ok',
  };
}

function receiptDependencyHash(rootDir) {
  const receiptInputs = [
    join(rootDir, '.supervibe', 'memory', 'evidence-ledger.jsonl'),
    join(rootDir, '.supervibe', 'memory', 'workflow-invocation-ledger.jsonl'),
    join(rootDir, '.supervibe', 'memory', 'workflow-receipt-index.json'),
  ];
  return 'sha256:' + sha256(receiptInputs.map((path) => sha256File(path)).join('\n'));
}

function buildReleaseCheckInputs({ rootDir, packageJson, scriptName, scriptText }) {
  const packagePath = join(rootDir, 'package.json');
  const packageLockPath = join(rootDir, 'package-lock.json');
  const runnerPath = join(rootDir, 'scripts', 'run-release-check.mjs');
  const cacheSchemaPath = join(rootDir, 'scripts', 'lib', 'supervibe-verification-cache-v2.mjs');
  const gitHead = gitOutput(['rev-parse', 'HEAD'], rootDir) || 'unknown';
  const worktree = changedFileFingerprint(rootDir);
  const receiptHash = receiptDependencyHash(rootDir);
  const scriptHash = 'sha256:' + sha256(JSON.stringify({ scriptName, scriptText }));
  const dependencyHash = 'sha256:' + sha256([
    sha256File(packagePath),
    existsSync(packageLockPath) ? sha256File(packageLockPath) : 'missing-package-lock',
  ].join('\n'));
  const inputContentHashes = {
    'package.json': sha256File(packagePath),
    'scripts/run-release-check.mjs': sha256File(runnerPath),
    'scripts/lib/supervibe-verification-cache-v2.mjs': sha256File(cacheSchemaPath),
  };
  if (existsSync(packageLockPath)) inputContentHashes['package-lock.json'] = sha256File(packageLockPath);
  const envFingerprint = [
    'node=' + process.versions.node,
    'platform=' + process.platform,
    'arch=' + process.arch,
    'package=' + (packageJson.name || 'unknown') + '@' + (packageJson.version || 'unknown'),
  ].join(';');
  const invalidationInputs = {
    cachePolicy: 'opt-in-resume-only',
    gateCountSource: 'package-script-chain',
    gitDirtyFingerprint: worktree.fingerprint,
    gitDirtyPathCount: worktree.dirtyPathCount,
    gitDirtyStateKnown: worktree.known,
    gitDirtyStateReason: worktree.reason,
    nodeMajor: Number(process.versions.node.split('.')[0]),
    packageName: packageJson.name || 'unknown',
    packageVersion: packageJson.version || 'unknown',
    receiptDependencyHash: receiptHash,
    scriptName,
    scriptTextHash: scriptHash,
  };
  const signature = 'sha256:' + sha256(JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    node: process.versions.node,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    scriptName,
    scriptText,
    worktree,
    inputContentHashes,
    envFingerprint,
    receiptDependencyHash: receiptHash,
  }));
  return {
    dependencyHash,
    envFingerprint,
    gitHead,
    inputContentHashes,
    invalidationInputs,
    receiptDependencyHash: receiptHash,
    scriptHash,
    signature,
  };
}

function buildGateInputDeclaration({ command, inputs, options }) {
  return createVerificationGateInputDeclarationV2({
    schemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
    commandName: command,
    fileInputs: Object.keys(inputs.inputContentHashes),
    environmentInputs: [
      'node',
      'platform',
      'arch',
      'package',
    ],
    versionInputs: {
      cacheRecordSchemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
      gateInputDeclarationSchemaVersion: VERIFICATION_GATE_INPUT_DECLARATION_V2_SCHEMA_VERSION,
      releaseCheckCacheSchemaVersion: SCHEMA_VERSION,
      nodeMajor: inputs.invalidationInputs.nodeMajor,
      packageName: inputs.invalidationInputs.packageName,
      packageVersion: inputs.invalidationInputs.packageVersion,
      scriptName: inputs.invalidationInputs.scriptName,
      scriptTextHash: inputs.invalidationInputs.scriptTextHash,
    },
    bypassForceInputs: {
      cacheEnabled: Boolean(options.cache),
      cachePathProvided: Boolean(options.cachePath),
      clearCache: Boolean(options.clearCache),
      dryRun: Boolean(options.dryRun),
      fromStart: Boolean(options.fromStart),
    },
  });
}

function loadCache(path) {
  const cache = readJson(path, null);
  return cache && cache.schemaVersion === SCHEMA_VERSION ? cache : null;
}

function saveCache(path, cache) {
  writeJson(path, { ...cache, updatedAt: new Date().toISOString() });
}

function cacheActionStatus({ cacheEnabled, dryRun }) {
  if (!cacheEnabled) return 'disabled';
  if (dryRun) return 'not-written-dry-run';
  return 'write-enabled';
}

function releaseActionStatus({ dryRun }) {
  return dryRun ? 'planned-not-executed' : 'executing';
}

function unusableProofHash(value) {
  return typeof value !== 'string' || !value.startsWith('sha256:') || value === 'sha256:unknown' || value === 'sha256:unreadable';
}

function releaseProofBypasses({ exitCode, inputs, options, proofHashes, status }) {
  const bypasses = [];
  if (options.dryRun) bypasses.push('dry-run');
  if (options.fromStart) bypasses.push('forced-from-start');
  if (options.clearCache) bypasses.push('cache-cleared');
  if (status === 'skipped') bypasses.push('skipped');
  if (status !== 'pass' || exitCode !== 0) bypasses.push('not-passed');
  if (!proofHashes || Object.keys(proofHashes).length === 0) bypasses.push('missing-proof');
  else if (Object.values(proofHashes).some(unusableProofHash)) bypasses.push('degraded-proof');
  if (!inputs.invalidationInputs.gitDirtyStateKnown) bypasses.push('degraded-proof');
  return [...new Set(bypasses)].sort();
}

function buildReleaseProofMetadata({ exitCode, inputs, options, proofHashes, status }) {
  const bypasses = releaseProofBypasses({ exitCode, inputs, options, proofHashes, status });
  const eligible = bypasses.length === 0;
  const reason = eligible ? 'executed-pass' : bypasses[0];
  return createReleaseProofMetadataV2({
    schemaVersion: RELEASE_PROOF_METADATA_V2_SCHEMA_VERSION,
    eligible,
    status: eligible ? 'eligible' : 'bypass',
    reason,
    proofMode: eligible ? 'executed-gate' : reason,
    nonReusable: !eligible,
    bypasses,
  });
}

function visibleReleaseProofBypasses({ inputs, options }) {
  const bypasses = [];
  if (options.dryRun) bypasses.push('dry-run');
  if (options.fromStart) bypasses.push('forced-from-start');
  if (options.clearCache) bypasses.push('cache-cleared');
  if (!inputs.invalidationInputs.gitDirtyStateKnown) bypasses.push('degraded-proof');
  return [...new Set(bypasses)].sort();
}

function buildGateProofHashes({ exitCode, inputs, status }) {
  return {
    exitCode: 'sha256:' + sha256(String(exitCode)),
    receiptDependencyHash: inputs.receiptDependencyHash,
    status: 'sha256:' + sha256(status),
  };
}

function buildGateVerificationKey({ command, exitCode, index, inputs, options, status }) {
  const proofHashes = buildGateProofHashes({ exitCode, inputs, status });
  return {
    schemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
    command: 'shell',
    args: [command],
    inputContentHashes: inputs.inputContentHashes,
    gitHead: inputs.gitHead,
    scriptHash: inputs.scriptHash,
    dependencyHash: inputs.dependencyHash,
    envFingerprint: inputs.envFingerprint,
    gateInputDeclaration: buildGateInputDeclaration({ command, inputs, options }),
    invalidationInputs: {
      ...inputs.invalidationInputs,
      gateCommandHash: 'sha256:' + sha256(command),
      gateIndex: index,
    },
    proofHashes,
  };
}

function buildGateVerificationRecord({ command, durationMs = 0, exitCode, index, inputs, options, status }) {
  const key = buildGateVerificationKey({ command, exitCode, index, inputs, options, status });
  return createVerificationCacheRecordV2({
    ...key,
    releaseProof: buildReleaseProofMetadata({ exitCode, inputs, options, proofHashes: key.proofHashes, status }),
    result: {
      durationMs,
      exitCode,
      status,
    },
  });
}

function validateResumeCachePrefix({ cache, gates, inputs, options, startIndex }) {
  const issues = [];
  if (!inputs.invalidationInputs.gitDirtyStateKnown) {
    issues.push({ code: 'dirty-state-unknown', message: 'resume denied because git dirty state is unknown' });
    return issues;
  }
  for (let index = 0; index < startIndex; index += 1) {
    const gate = cache.gates?.[index];
    if (!gate || gate.status !== 'pass' || gate.command !== gates[index]) {
      issues.push({ code: 'gate-prefix-mismatch', message: 'resume denied because cached gate prefix is incomplete at index ' + index });
      continue;
    }
    const requestedKey = buildGateVerificationKey({ command: gates[index], exitCode: 0, index, inputs, options, status: 'pass' });
    const reuse = canReuseVerificationCacheRecordV2(gate.verificationCacheRecord, requestedKey);
    if (!reuse.reusable) {
      issues.push({
        code: 'gate-record-reuse-denied',
        message: 'resume denied because cached gate record no longer matches index ' + index,
        details: reuse.issues,
      });
    }
  }
  return issues;
}

function gateRecord(index, command, status, extra = {}) {
  const { inputs, options = {}, ...rest } = extra;
  const record = {
    index,
    command,
    status,
    ...rest,
    updatedAt: new Date().toISOString(),
  };
  if (inputs) {
    record.verificationCacheRecord = buildGateVerificationRecord({
      command,
      durationMs: Number(rest.durationMs || 0),
      exitCode: Number(rest.exitCode ?? (status === 'pass' ? 0 : 1)),
      index,
      inputs,
      options,
      status,
    });
  }
  return record;
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
  const releaseInputs = buildReleaseCheckInputs({ rootDir, packageJson, scriptName, scriptText });
  const releaseProofBypassReasons = visibleReleaseProofBypasses({ inputs: releaseInputs, options });
  const signature = releaseInputs.signature;
  let cache = options.cache && !options.clearCache ? loadCache(cachePath) : null;
  const signatureMatches = cache?.signature === signature;
  const resumableStatus = cache && ['failed', 'interrupted', 'running'].includes(cache.status);
  const canResume = options.cache && !options.fromStart && resumableStatus && signatureMatches && cache.scriptName === scriptName;
  let startIndex = 0;
  let resumeIssues = [];
  let resumeReason = options.cache ? 'new-run' : 'cache-disabled';

  if (options.cache && !releaseInputs.invalidationInputs.gitDirtyStateKnown) {
    cache = null;
    resumeReason = 'dirty-state-unknown';
  } else if (canResume && Number.isInteger(cache.nextIndex)) {
    startIndex = Math.max(0, Math.min(cache.nextIndex, gates.length));
    resumeIssues = validateResumeCachePrefix({ cache, gates, inputs: releaseInputs, options, startIndex });
    if (resumeIssues.length === 0) {
      resumeReason = 'same-inputs-safe-resume';
    } else {
      cache = null;
      startIndex = 0;
      resumeReason = resumeIssues[0]?.code || 'cache-invalidated';
    }
  } else if (options.cache && cache && !signatureMatches) {
    cache = null;
    resumeReason = 'cache-invalidated';
  } else if (options.cache && cache?.status === 'pass') {
    cache = null;
    resumeReason = 'previous-pass-cache-ignored';
  }

  if (options.fromStart || options.clearCache || !cache) {
    if (options.fromStart) resumeReason = 'forced-from-start';
    else if (options.clearCache) resumeReason = 'cache-cleared';
    else if (!options.cache) resumeReason = 'cache-disabled';
    cache = null;
    startIndex = 0;
  }

  const nextCache = {
    schemaVersion: SCHEMA_VERSION,
    verificationCacheRecordSchemaVersion: VERIFICATION_CACHE_RECORD_V2_SCHEMA_VERSION,
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
  console.log('CACHE_ACTION: ' + cacheActionStatus({ cacheEnabled: options.cache, dryRun: options.dryRun }));
  console.log('RELEASE_ACTION: ' + releaseActionStatus({ dryRun: options.dryRun }));
  console.log('RELEASE_EVIDENCE_SCHEMA: ' + RELEASE_EVIDENCE_V1_CONTRACT.schemaVersion);
  console.log('RELEASE_EVIDENCE_REQUIRED_FIELDS: ' + RELEASE_EVIDENCE_V1_CONTRACT.requiredFields.join(','));
  console.log('DIRTY_STATE: ' + (releaseInputs.invalidationInputs.gitDirtyStateKnown ? 'known' : 'unknown'));
  console.log('DIRTY_PATHS: ' + releaseInputs.invalidationInputs.gitDirtyPathCount);
  console.log('RELEASE_PROOF: ' + (releaseProofBypassReasons.length === 0 ? 'eligible' : 'non-reusable'));
  if (releaseProofBypassReasons.length > 0) console.log('RELEASE_PROOF_BYPASS: ' + releaseProofBypassReasons.join(','));
  if (resumeIssues.length > 0) console.log('RESUME_ISSUES: ' + resumeIssues.map((item) => item.code).join(','));

  for (let index = 0; index < gates.length; index += 1) {
    const command = gates[index];
    if (index < startIndex) {
      const skipReason = options.dryRun ? 'dry-run-cached-prefix-not-replayed' : 'cached-prefix';
      console.log('SKIP ' + (index + 1) + '/' + gates.length + ' [' + skipReason + ']: ' + command);
      console.log('PROOF_REUSE ' + (index + 1) + '/' + gates.length + ': ' + (options.dryRun ? 'non-reusable-dry-run' : 'validated-cached-prefix'));
      continue;
    }
    console.log('GATE ' + (index + 1) + '/' + gates.length + ': ' + command);
    if (options.dryRun) {
      console.log('PLAN ' + (index + 1) + '/' + gates.length + ' [not-executed]: ' + command);
      continue;
    }

    nextCache.nextIndex = index;
    nextCache.status = 'running';
    nextCache.gates[index] = gateRecord(index, command, 'running', { exitCode: 1, inputs: releaseInputs, options, startedAt: new Date().toISOString() });
    if (options.cache) saveCache(cachePath, nextCache);

    let activeChild = null;
    let interrupted = false;
    const started = Date.now();
    const onInterrupt = () => {
      interrupted = true;
      nextCache.status = 'interrupted';
      nextCache.nextIndex = index;
      nextCache.gates[index] = gateRecord(index, command, 'interrupted', { exitCode: 130, inputs: releaseInputs, options });
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
      nextCache.gates[index] = gateRecord(index, command, 'failed', { exitCode: result.code, durationMs, inputs: releaseInputs, options });
      if (options.cache) saveCache(cachePath, nextCache);
      console.error('SUPERVIBE_RELEASE_CHECK_FAILED');
      console.error('FAILED_GATE: ' + (index + 1) + '/' + gates.length);
      console.error('COMMAND: ' + command);
      console.error('EXIT_CODE: ' + result.code);
      console.error('NEXT: node scripts/run-release-check.mjs --cache resumes this opt-in run; npm run check:full forces the old full chain');
      return result.code || 1;
    }

    nextCache.gates[index] = gateRecord(index, command, 'pass', { exitCode: 0, durationMs, inputs: releaseInputs, options });
    nextCache.nextIndex = index + 1;
    if (options.cache) saveCache(cachePath, nextCache);
  }

  if (!options.dryRun) {
    nextCache.status = 'pass';
    nextCache.nextIndex = gates.length;
    nextCache.completedAt = new Date().toISOString();
    if (options.cache) saveCache(cachePath, nextCache);
  }
  if (options.dryRun) {
    console.log('DRY_RUN_PASS: true');
    console.log('PASS: not-applicable-dry-run');
    console.log('STATUS: dry-run-planned');
    console.log('CACHE_RESULT: ' + (options.cache ? 'not-written' : 'disabled'));
    console.log('RELEASE_RESULT: not-executed');
  } else {
    console.log('PASS: true');
    console.log('STATUS: complete');
    console.log('CACHE_RESULT: ' + (options.cache ? 'written' : 'disabled'));
    console.log('RELEASE_RESULT: completed');
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}

export { RELEASE_CHECK_CACHE_SAFETY_SIGNALS, RELEASE_EVIDENCE_V1_CONTRACT, cacheActionStatus, releaseActionStatus, splitAndChain, usage };
