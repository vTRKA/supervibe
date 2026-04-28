import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';

function runStatus() {
  return execSync('node scripts/supervibe-status.mjs --no-color', {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

test('evolve-status: prints index health summary header', () => {
  const out = runStatus();
  assert.match(out, /Evolve Index Status/);
  assert.match(out, /Project root:/);
});

test('evolve-status: reports Code RAG state', () => {
  const out = runStatus();
  // Either initialized (lists files/chunks) or NOT INITIALIZED warning
  assert.ok(/Code RAG/.test(out), 'should mention Code RAG');
  assert.ok(
    /\d+ files, \d+ chunks/.test(out) || /NOT INITIALIZED/.test(out),
    'should show file/chunk counts or NOT INITIALIZED'
  );
});

test('evolve-status: reports Code Graph state', () => {
  const out = runStatus();
  // Either lists symbols/edges or NOT INITIALIZED (graph lives in same DB as RAG)
  assert.ok(
    /Code Graph: \d+ symbols, \d+ edges/.test(out) || /NOT INITIALIZED/.test(out),
    'should show symbol/edge counts or NOT INITIALIZED'
  );
});

test('evolve-status: reports grammar / language coverage', () => {
  const out = runStatus();
  // Either green checkmark for languages OR explicit broken / NOT INITIALIZED
  assert.ok(
    /active language/.test(out)
    || /Grammar queries broken/.test(out)
    || /NOT INITIALIZED/.test(out),
    `expected language status line; got: ${out.split('\n').slice(0,15).join('|')}`
  );
});

test('evolve-status: reports Memory state', () => {
  const out = runStatus();
  // Memory: <count> entries OR not yet built
  assert.ok(
    /Memory: \d+ entries/.test(out) || /not yet built/.test(out),
    'should mention Memory state'
  );
});

test('evolve-status: reports watcher state', () => {
  const out = runStatus();
  // Three possible states: running heartbeat, stale heartbeat, or not running
  assert.ok(
    /File watcher: running/.test(out)
    || /File watcher: stale heartbeat/.test(out)
    || /File watcher: not running/.test(out),
    'should report one of three watcher states'
  );
});

test('evolve-status: reports preview server state', () => {
  const out = runStatus();
  assert.ok(
    /Preview servers: \d+ running/.test(out) || /Preview servers: none/.test(out),
    'should report preview server state'
  );
});

test('evolve-status: reports MCP registry state', () => {
  const out = runStatus();
  assert.ok(/MCPs:/.test(out), 'should mention MCPs');
});

test('evolve-status: reports agent telemetry state', () => {
  const out = runStatus();
  assert.ok(/Agent telemetry:/.test(out), 'should mention agent telemetry');
});
