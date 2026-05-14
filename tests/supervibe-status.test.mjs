import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const STATUS_SCRIPT = join(ROOT, 'scripts', 'supervibe-status.mjs');
let cachedDefaultStatus = null;

function runStatus() {
  if (cachedDefaultStatus !== null) return cachedDefaultStatus;
  cachedDefaultStatus = execSync('node scripts/supervibe-status.mjs --no-color', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return cachedDefaultStatus;
}

test('supervibe-status: prints index health summary header', () => {
  const out = runStatus();
  assert.match(out, /Supervibe Index Status/);
  assert.match(out, /Project root:/);
});

test('supervibe-status: reports Code RAG state', () => {
  const out = runStatus();
  // Either initialized (lists files/chunks) or not-built warning
  assert.ok(/Code RAG/.test(out), 'should mention Code RAG');
  assert.ok(
    /\d+ files, \d+ chunks/.test(out) || /not-built/.test(out) || /NOT INITIALIZED/.test(out),
    'should show file/chunk counts or not-built'
  );
});

test('supervibe-status: reports source coverage directly', () => {
  const out = runStatus();
  assert.ok(/Source coverage: \d+\/\d+ source files indexed, \d+\.\d+% coverage/.test(out) || /not-built/.test(out) || /NOT INITIALIZED/.test(out));
});

test('supervibe-status: reports Code Graph state', () => {
  const out = runStatus();
  // Either lists symbols/edges or not-built (graph lives in same DB as RAG)
  assert.ok(
    /Code Graph: \d+ symbols, \d+ edges/.test(out) || /Code Graph: not built/.test(out) || /not-built/.test(out) || /NOT INITIALIZED/.test(out),
    'should show symbol/edge counts or not-built'
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

test('supervibe-status labels unmanaged framework servers as no-overlay and suggests proxy', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'supervibe-status-framework-dev-'));
  const candidatePorts = [3001, 3002, 4173, 4321, 5173, 5174, 8080];
  let server = null;
  let port = null;
  try {
    mkdirSync(join(projectRoot, '.supervibe', 'memory'), { recursive: true });
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      dependencies: { next: '16.2.4', react: '19.0.0' },
    }, null, 2));

    for (const candidate of candidatePorts) {
      server = createServer();
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(candidate, '127.0.0.1', resolve);
        });
        port = candidate;
        break;
      } catch {
        server = null;
      }
    }
    assert.ok(port, 'expected one framework candidate port to be available for status test');

    const out = execFileSync(process.execPath, [STATUS_SCRIPT, '--no-color', '--no-gc-hints'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPERVIBE_HOST: 'codex',
        SUPERVIBE_PLUGIN_ROOT: ROOT,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /feedback overlay: not injected/);
    assert.match(out, new RegExp(`--target http://127\\.0\\.0\\.1:${port} --daemon`));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('supervibe-status: reports MCP registry state', () => {
  const out = runStatus();
  assert.ok(/MCPs:/.test(out), 'should mention MCPs');
});

test('supervibe-status reports active work graph ready, blocked, stale, orphan, and next action', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'supervibe-status-active-graph-'));
  try {
    const graphDir = join(projectRoot, '.supervibe', 'memory', 'work-items', 'epic-status');
    mkdirSync(graphDir, { recursive: true });
    writeFileSync(join(graphDir, 'graph.json'), JSON.stringify({
      kind: 'supervibe-work-item-graph',
      graph_id: 'epic-status',
      epicId: 'epic-status',
      title: 'Status Epic',
      items: [
        { itemId: 'epic-status', type: 'epic', status: 'open', title: 'Status Epic' },
        { itemId: 'T-ready', type: 'task', status: 'open', title: 'Ready status task' },
        { itemId: 'T-claimed', type: 'task', status: 'claimed', title: 'Claimed stale task' },
        { itemId: 'T-orphan', type: 'task', parentId: 'missing-parent', status: 'open', title: 'Orphan task' },
        { itemId: 'T-blocked', type: 'task', status: 'blocked', title: 'Blocked task', blockerReason: 'needs approval' },
      ],
      tasks: [
        { id: 'T-ready', status: 'open' },
        { id: 'T-claimed', status: 'claimed' },
        { id: 'T-orphan', parentId: 'missing-parent', status: 'open' },
        { id: 'T-blocked', status: 'blocked' },
      ],
      claims: [
        { taskId: 'T-claimed', status: 'active', agentId: 'agent-a', claimedAt: '2026-01-01T00:00:00.000Z', heartbeatAt: '2026-01-01T00:00:00.000Z' },
      ],
    }, null, 2), 'utf8');

    const out = execFileSync(process.execPath, [
      STATUS_SCRIPT,
      '--no-color',
      '--no-gc-hints',
      '--ready',
      '--blocked',
      '--remaining',
      '--stale',
      '--orphan',
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPERVIBE_HOST: 'codex',
        SUPERVIBE_PLUGIN_ROOT: ROOT,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /SUPERVIBE_ACTIVE_WORK_GRAPH/);
    assert.match(out, /EPIC: epic-status/);
    assert.match(out, /NEXT_READY: T-ready/);
    assert.match(out, /READY_ITEM: T-ready/);
    assert.match(out, /BLOCKED_ITEM: T-blocked/);
    assert.match(out, /REMAINING_ITEM: T-ready/);
    assert.match(out, /REMAINING_ITEM: T-blocked/);
    assert.match(out, /STALE_ITEM: T-claimed/);
    assert.match(out, /ORPHAN_ITEM: T-orphan missing_parent=missing-parent/);
    assert.match(out, /NEXT_ACTION:/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('supervibe-status labels completed active graph as archive candidate', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'supervibe-status-archive-candidate-'));
  try {
    const graphDir = join(projectRoot, '.supervibe', 'memory', 'work-items', 'epic-archive');
    mkdirSync(graphDir, { recursive: true });
    writeFileSync(join(graphDir, 'graph.json'), JSON.stringify({
      kind: 'supervibe-work-item-graph',
      graph_id: 'epic-archive',
      epicId: 'epic-archive',
      title: 'Archive Epic',
      items: [
        { itemId: 'epic-archive', type: 'epic', status: 'closed', title: 'Archive Epic' },
        {
          itemId: 'T-done',
          type: 'task',
          status: 'complete',
          title: 'Done task',
          verificationEvidence: [{ taskId: 'T-done', command: 'node --test', status: 'pass', output: 'verified' }],
        },
      ],
      tasks: [
        { id: 'T-done', status: 'complete', verificationEvidence: [{ taskId: 'T-done', command: 'node --test', status: 'pass', output: 'verified' }] },
      ],
      evidence: [{ taskId: 'T-done', command: 'node --test', status: 'pass', output: 'verified' }],
    }, null, 2), 'utf8');

    const out = execFileSync(process.execPath, [
      STATUS_SCRIPT,
      '--no-color',
      '--no-gc-hints',
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPERVIBE_HOST: 'codex',
        SUPERVIBE_PLUGIN_ROOT: ROOT,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /ARCHIVE_CANDIDATE: true/);
    assert.match(out, /LIFECYCLE: completed-awaiting-archive/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('supervibe-status reports atomize and runtime gate guidance with no active work graph', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'supervibe-status-no-active-'));
  try {
    mkdirSync(join(projectRoot, '.supervibe', 'memory'), { recursive: true });
    const out = execFileSync(process.execPath, [
      STATUS_SCRIPT,
      '--no-color',
      '--no-gc-hints',
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPERVIBE_HOST: 'codex',
        SUPERVIBE_PLUGIN_ROOT: ROOT,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /Work graph: none active/);
    assert.match(out, /ATOMIZE_COMMAND: \/supervibe-loop --atomize-plan <plan-path> --plan-review-passed/);
    assert.match(out, /RUNTIME_GATE: node scripts\/supervibe-task-graph-maturity\.mjs --require-active-graph/);
    assert.match(out, /UI_COMMAND: \/supervibe-ui/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('supervibe-status: reports agent telemetry state', () => {
  const out = runStatus();
  assert.ok(/Agent telemetry:/.test(out), 'should mention agent telemetry');
});

test('supervibe-status warns when agents are installed but no invocations are logged', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'supervibe-status-zero-invocations-'));
  try {
    mkdirSync(join(projectRoot, '.supervibe', 'memory'), { recursive: true });
    mkdirSync(join(projectRoot, '.codex', 'agents'), { recursive: true });
    writeFileSync(join(projectRoot, '.codex', 'agents', 'creative-director.md'), [
      '---',
      'name: creative-director',
      '---',
      '# Creative Director',
      '',
    ].join('\n'));

    const out = execFileSync(process.execPath, [STATUS_SCRIPT, '--no-color', '--no-gc-hints'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SUPERVIBE_HOST: 'codex',
        SUPERVIBE_PLUGIN_ROOT: ROOT,
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    assert.match(out, /Agent telemetry: agents installed, but zero real invocations logged/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
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
    assert.match(out, new RegExp(`COMMANDS: ${readdirSync(join(ROOT, 'commands')).filter((file) => file.endsWith('.md')).length}`));
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
    assert.match(out, /RECOMMENDED_AGENTS: .*creative-director/);
    assert.match(out, /RECOMMENDED_AGENTS: .*design-system-architect/);
    assert.match(out, /OPTIONAL_AGENTS: .*competitive-design-researcher/);
    assert.doesNotMatch(out, /OPTIONAL_AGENTS: .*mobile-ui-designer/);
    assert.doesNotMatch(out, /OPTIONAL_AGENTS: .*electron-ui-designer/);
    assert.doesNotMatch(out, /RECOMMENDED_AGENTS: none/);
    assert.doesNotMatch(out, /SELECTED_SKILLS: none/);
    assert.doesNotMatch(out, /CREATE: AGENTS\.md - host instruction file/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
