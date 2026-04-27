import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attachHotReload } from '../scripts/lib/preview-hot-reload.mjs';

const sandbox = join(tmpdir(), `evolve-hot-reload-${Date.now()}`);

before(async () => {
  await mkdir(sandbox, { recursive: true });
  await writeFile(join(sandbox, 'index.html'), '<html></html>');
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

test('attachHotReload: invokes broadcastReload on file change', async () => {
  let reloadCount = 0;
  const fakeServer = { broadcastReload: () => { reloadCount++; } };

  const watcher = await attachHotReload({ root: sandbox, server: fakeServer });
  await new Promise(r => setTimeout(r, 300));

  await writeFile(join(sandbox, 'index.html'), '<html><body>changed</body></html>');
  await new Promise(r => setTimeout(r, 500));

  assert.ok(reloadCount >= 1, `expected ≥1 reload, got ${reloadCount}`);

  await watcher.close();
});

test('attachHotReload: debounces rapid changes', async () => {
  let reloadCount = 0;
  const fakeServer = { broadcastReload: () => { reloadCount++; } };
  const watcher = await attachHotReload({ root: sandbox, server: fakeServer, debounceMs: 200 });
  await new Promise(r => setTimeout(r, 300));

  for (let i = 0; i < 5; i++) {
    await writeFile(join(sandbox, 'index.html'), `<html>${i}</html>`);
    await new Promise(r => setTimeout(r, 30));
  }

  await new Promise(r => setTimeout(r, 500));

  assert.ok(reloadCount <= 3, `expected debounced (≤3) reloads, got ${reloadCount}`);
  assert.ok(reloadCount >= 1, 'expected at least one reload');

  await watcher.close();
});

test('attachHotReload: returns watcher with watching list', async () => {
  const fakeServer = { broadcastReload: () => {} };
  const watcher = await attachHotReload({ root: sandbox, server: fakeServer });
  assert.ok(typeof watcher.close === 'function');
  assert.ok(typeof watcher.getWatchedCount === 'function');
  await watcher.close();
});
