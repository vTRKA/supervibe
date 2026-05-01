import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createIndexWatcherLifecycle,
  formatWatcherDiagnostics,
  readWatcherDiagnostics,
  recoverStaleIndexLock,
  writeIndexLock,
} from "../scripts/lib/supervibe-index-watcher.mjs";
import { buildWatcherDaemonConfig } from "../scripts/lib/supervibe-process-manager.mjs";

test("watcher indexes created source files and removes deleted files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-watch-"));
  const indexed = [];
  const removed = [];
  const sourcePath = join(rootDir, "src", "feature.ts");
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(sourcePath, "export const feature = true;\n");
    const watcher = createIndexWatcherLifecycle({
      rootDir,
      codeStore: {
        indexFile: async (path) => indexed.push(path),
        removeFile: async (path) => removed.push(path),
      },
    });

    await watcher.handleSourceEvent("add", sourcePath);
    await watcher.handleSourceEvent("unlink", sourcePath);

    assert.deepEqual(indexed, [sourcePath], "created source file did not reach code index");
    assert.deepEqual(removed, [sourcePath]);
    assert.equal(watcher.state.eventsProcessed, 2);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("watcher ignores generated output by index policy", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-watch-"));
  const indexed = [];
  try {
    const watcher = createIndexWatcherLifecycle({
      rootDir,
      codeStore: {
        indexFile: async (path) => indexed.push(path),
        removeFile: async () => {},
      },
    });

    await watcher.handleSourceEvent("add", join(rootDir, "dist", "bundle.js"));

    assert.deepEqual(indexed, []);
    assert.equal(watcher.state.eventsIgnored, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("watcher diagnostics reports stale lock recovery", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-watch-"));
  try {
    await writeIndexLock({ rootDir, ownerPid: 12345, operation: "test", now: 1000 });
    const recovered = await recoverStaleIndexLock({ rootDir, now: 1000 + 120_000, staleMs: 30_000 });
    const diagnostics = readWatcherDiagnostics({ rootDir, now: 1000 + 120_000 });

    assert.equal(recovered.recovered, true);
    assert.equal(diagnostics.lock.status, "absent");
    assert.match(formatWatcherDiagnostics(diagnostics), /SUPERVIBE_WATCHER_DIAGNOSTICS/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("watcher daemon config uses hidden background logs", () => {
  const config = buildWatcherDaemonConfig({ rootDir: process.cwd(), noEmbeddings: true });

  assert.equal(config.name, "memory-watch");
  assert.ok(config.scriptPath.endsWith("watch-memory.mjs"));
  assert.ok(config.args.includes("--no-embeddings"));
  assert.ok(config.logs.stdout.includes("memory-watch"));
});
