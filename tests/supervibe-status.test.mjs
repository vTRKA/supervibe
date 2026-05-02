import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const STATUS_SCRIPT = join(ROOT, 'scripts', 'supervibe-status.mjs');

function runStatus() {
  return execSync('node scripts/supervibe-status.mjs --no-color', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

test('supervibe-status: prints index health summary header', () => {
  const out = runStatus();
  assert.match(out, /Supervibe Index Status/);
  assert.match(out, /Project root:/);
});

test('supervibe-status: reports Code RAG state', () => {
  const out = runStatus();
  // Either initialized (lists files/chunks) or NOT INITIALIZED warning
  assert.ok(/Code RAG/.test(out), 'should mention Code RAG');
  assert.ok(
    /\d+ files, \d+ chunks/.test(out) || /NOT INITIALIZED/.test(out),
    'should show file/chunk counts or NOT INITIALIZED'
  );
});

test('supervibe-status: reports source coverage directly', () => {
  const out = runStatus();
  assert.ok(/Source coverage: \d+\/\d+ source files indexed, \d+\.\d+% coverage/.test(out) || /NOT INITIALIZED/.test(out));
});

test('supervibe-status: reports Code Graph state', () => {
  const out = runStatus();
  // Either lists symbols/edges or NOT INITIALIZED (graph lives in same DB as RAG)
  assert.ok(
    /Code Graph: \d+ symbols, \d+ edges/.test(out) || /Code Graph: not built/.test(out) || /NOT INITIALIZED/.test(out),
    'should show symbol/edge counts or NOT INITIALIZED'
  );
});

test('supervibe-status: reports grammar / language coverage', () => {
  const out = runStatus();
  assert.match(out, /Language coverage:/);
});

test('supervibe-status: reports Memory state', () => {
  const out = runStatus();
  // Memory: <count> entries OR not yet built
  assert.ok(
    /Memory: \d+ entries/.test(out) || /not yet built/.test(out),
    'should mention Memory state'
  );
});

test('supervibe-status: reports watcher state', () => {
  const out = runStatus();
  // Three possible states: running heartbeat, stale heartbeat, or not running
  assert.ok(
    /File watcher: running/.test(out)
    || /File watcher: stale heartbeat/.test(out)
    || /File watcher: not running/.test(out),
    'should report one of three watcher states'
  );
});

test('supervibe-status: reports preview server state', () => {
  const out = runStatus();
  assert.ok(
    /Preview servers: \d+ running/.test(out) || /Preview servers: none/.test(out),
    'should report preview server state'
  );
});

test('supervibe-status: reports MCP registry state', () => {
  const out = runStatus();
  assert.ok(/MCPs:/.test(out), 'should mention MCPs');
});

test('supervibe-status: reports agent telemetry state', () => {
  const out = runStatus();
  assert.ok(/Agent telemetry:/.test(out), 'should mention agent telemetry');
});

test('supervibe-status: reports GC hints', () => {
  const out = runStatus();
  assert.ok(/SUPERVIBE_GC_HINTS/.test(out), 'should mention GC hints');
});

test('supervibe-status --capabilities resolves plugin root when launched from a project', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'supervibe-status-project-'));
  try {
    mkdirSync(join(projectRoot, '.codex', 'agents'), { recursive: true });
    mkdirSync(join(projectRoot, '.codex', 'rules'), { recursive: true });
    mkdirSync(join(projectRoot, '.codex', 'skills', 'adapt'), { recursive: true });
    writeFileSync(join(projectRoot, 'AGENTS.md'), '# Project instructions\n');
    writeFileSync(join(projectRoot, '.codex', 'agents', 'repo-researcher.md'), '# local repo researcher\n');
    writeFileSync(join(projectRoot, '.codex', 'rules', 'operational-safety.md'), '# local safety\n');
    writeFileSync(join(projectRoot, '.codex', 'skills', 'adapt', 'SKILL.md'), '---\nname: adapt\n---\n# local adapt\n');

    const out = execFileSync(process.execPath, [STATUS_SCRIPT, '--capabilities', '--no-color'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPERVIBE_HOST: 'codex',
        SUPERVIBE_PLUGIN_ROOT: '',
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /SUPERVIBE_CAPABILITY_REGISTRY/);
    assert.match(out, /PASS: true/);
    assert.match(out, /COMMANDS: 19/);
    assert.doesNotMatch(out, /missing-command: command file missing: \/supervibe-adapt/);
    assert.doesNotMatch(out, /AGENTS: 0/);
    assert.doesNotMatch(out, /SKILLS: 0/);
    assert.doesNotMatch(out, /RULES: 0/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('supervibe-status --genesis-dry-run uses plugin artifacts, not project cwd, with legacy design profile', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'supervibe-genesis-project-'));
  try {
    writeFileSync(join(projectRoot, 'AGENTS.md'), '# Project instructions\n');
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: {
        react: '^19.0.0',
        vite: '^7.0.0',
      },
    }, null, 2));

    const out = execFileSync(process.execPath, [
      STATUS_SCRIPT,
      '--genesis-dry-run',
      '.',
      '--profile',
      'custom-minimal-product-design',
      '--addons',
      'product-design-extended',
      '--no-color',
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPERVIBE_HOST: 'codex',
        SUPERVIBE_PLUGIN_ROOT: '',
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /SUPERVIBE_GENESIS_DRY_RUN/);
    assert.match(out, /PROFILE: custom-minimal-product-design/);
    assert.match(out, /RECOMMENDED_AGENTS: .*react-implementer/);
    assert.match(out, /RECOMMENDED_AGENTS: .*product-manager/);
    assert.match(out, /OPTIONAL_AGENTS: .*creative-director/);
    assert.doesNotMatch(out, /RECOMMENDED_AGENTS: none/);
    assert.doesNotMatch(out, /SELECTED_SKILLS: none/);
    assert.doesNotMatch(out, /CREATE: AGENTS\.md - host instruction file/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
