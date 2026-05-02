import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startWatcher } from "../scripts/lib/code-watcher.mjs";
import {
  DEFAULT_INDEX_REFRESH_INTERVAL_MS,
  ensureIndexConfig,
  formatIndexConfigStatus,
  loadIndexConfig,
} from "../scripts/lib/supervibe-index-config.mjs";
import { classifyIndexPath, discoverSourceFiles } from "../scripts/lib/supervibe-index-policy.mjs";
import { readWatcherDiagnostics } from "../scripts/lib/supervibe-index-watcher.mjs";
import {
  LIST_MISSING_INDEX_COMMAND,
  MEMORY_WATCH_COMMAND,
  SOURCE_RAG_INDEX_COMMAND,
} from "../scripts/lib/supervibe-command-catalog.mjs";

async function withIndexFixture(fn) {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-index-config-"));
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    await mkdir(join(rootDir, "generated-client"), { recursive: true });
    await writeFile(join(rootDir, "src", "main.ts"), "export const ok = 1;\n", "utf8");
    await writeFile(join(rootDir, "generated-client", "api.ts"), "export const generated = 1;\n", "utf8");
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("index config defaults to a five minute refresh interval", async () => {
  await withIndexFixture(async (rootDir) => {
    const config = await ensureIndexConfig({ rootDir });

    assert.equal(config.refreshIntervalMs, DEFAULT_INDEX_REFRESH_INTERVAL_MS);
    assert.equal(loadIndexConfig({ rootDir }).refreshIntervalMs, 300_000);
    assert.match(formatIndexConfigStatus(config), /REFRESH_INTERVAL: 5m/);
  });
});

test("project index config can hide files from code RAG and code graph indexing", async () => {
  await withIndexFixture(async (rootDir) => {
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    await writeFile(join(rootDir, ".supervibe", "memory", "index-config.json"), JSON.stringify({
      schemaVersion: 1,
      refreshIntervalMs: 300_000,
      exclude: ["generated-client/**"],
      include: [],
    }, null, 2), "utf8");

    const hidden = classifyIndexPath(join(rootDir, "generated-client", "api.ts"), { rootDir });
    const visible = classifyIndexPath(join(rootDir, "src", "main.ts"), { rootDir });
    const inventory = await discoverSourceFiles(rootDir, { explain: true });

    assert.equal(hidden.included, false);
    assert.equal(hidden.reason, "user-exclude:generated-client/**");
    assert.equal(visible.included, true);
    assert.ok(inventory.files.some((file) => file.relPath === "src/main.ts"));
    assert.ok(!inventory.files.some((file) => file.relPath === "generated-client/api.ts"));
    assert.ok(inventory.excluded.some((file) => file.reason === "user-exclude:generated-client/**"));
  });
});

test("watcher diagnostics expose the five minute periodic scan policy", async () => {
  await withIndexFixture(async (rootDir) => {
    await ensureIndexConfig({ rootDir });
    const diagnostics = readWatcherDiagnostics({ rootDir, now: 1_000_000 });

    assert.equal(diagnostics.indexConfig.refreshIntervalMs, 300_000);
    assert.deepEqual(diagnostics.repairActions, [
      MEMORY_WATCH_COMMAND,
      LIST_MISSING_INDEX_COMMAND,
      SOURCE_RAG_INDEX_COMMAND,
    ]);
    assert.doesNotMatch(diagnostics.repairActions.join("\n"), /npm run (code:index|memory:watch)/);
    assert.equal(DEFAULT_INDEX_REFRESH_INTERVAL_MS, 300_000);
    assert.equal(typeof startWatcher, "function");
  });
});
