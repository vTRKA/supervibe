import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  buildBackgroundSpawnOptions,
  buildDaemonChildArgs,
  resolveServerLogPaths,
} from '../scripts/lib/supervibe-process-manager.mjs';

test('background server spawn options are silent on Windows-safe hosts', () => {
  const options = buildBackgroundSpawnOptions({
    cwd: 'D:/workspace/project',
    env: { EXISTING: '1' },
    logs: {
      stdout: 'D:/workspace/project/.supervibe/servers/preview.out.log',
      stderr: 'D:/workspace/project/.supervibe/servers/preview.err.log',
    },
  });

  assert.equal(options.detached, true, 'background server did not request detached');
  assert.equal(options.windowsHide, true, 'background server did not request windowsHide');
  assert.equal(options.stdio, 'ignore', 'stdio is not ignored');
  assert.equal(options.cwd, 'D:/workspace/project');
  assert.equal(options.env.EXISTING, '1');
  assert.equal(options.env.SUPERVIBE_SERVER_STDOUT_LOG, 'D:/workspace/project/.supervibe/servers/preview.out.log');
  assert.equal(options.env.SUPERVIBE_SERVER_STDERR_LOG, 'D:/workspace/project/.supervibe/servers/preview.err.log');
});

test('daemon child args replace daemon mode with explicit foreground mode', () => {
  const childArgs = buildDaemonChildArgs([
    '--root',
    '.',
    '--daemon',
    '--port',
    '3050',
  ]);

  assert.deepEqual(childArgs, ['--root', '.', '--port', '3050', '--foreground']);
});

test('server log paths stay under .supervibe/servers', () => {
  const logs = resolveServerLogPaths({
    rootDir: join('D:', 'workspace', 'project'),
    name: 'Preview Server',
    port: 3050,
  });

  assert.match(logs.stdout.replace(/\\/g, '/'), /\.supervibe\/servers\/preview-server-3050\.out\.log$/);
  assert.match(logs.stderr.replace(/\\/g, '/'), /\.supervibe\/servers\/preview-server-3050\.err\.log$/);
});
