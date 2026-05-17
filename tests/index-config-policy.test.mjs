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
import { classifyIndexPath, discoverSourceFiles, pruneCodeIndex } from "../scripts/lib/supervibe-index-policy.mjs";
import { CodeStore } from "../scripts/lib/code-store.mjs";
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


test("index pruning removes chunks, entities, and graph rows for excluded files", async () => {
  await withIndexFixture(async (rootDir) => {
    const excludedPath = "generated-client/api.ts";
    const store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: true });
    await store.init();
    try {
      await store.indexFile(join(rootDir, excludedPath), { force: true });
      assert.ok(store.db.prepare("SELECT COUNT(*) AS n FROM code_files WHERE path = ?").get(excludedPath).n > 0);
      assert.ok(store.db.prepare("SELECT COUNT(*) AS n FROM code_chunks WHERE path = ?").get(excludedPath).n > 0);

    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    await writeFile(join(rootDir, ".supervibe", "memory", "index-config.json"), JSON.stringify({
      schemaVersion: 1,
      refreshIntervalMs: 300_000,
      exclude: ["generated-client/**"],
      include: [],
    }, null, 2), "utf8");

      const inventory = await discoverSourceFiles(rootDir);
      const result = await pruneCodeIndex(store, inventory, rootDir);

      assert.equal(result.removed, 1);
      for (const table of ["code_files", "code_chunks", "code_chunks_fts", "code_chunk_entities", "code_symbols", "code_semantic_anchors"]) {
        const count = store.db.prepare("SELECT COUNT(*) AS n FROM " + table + " WHERE path = ?").get(excludedPath).n;
        assert.equal(count, 0, table + " should be pruned for " + excludedPath);
      }
      const edgeCount = store.db.prepare("SELECT COUNT(*) AS n FROM code_edges WHERE from_id LIKE ? OR to_id LIKE ?").get(excludedPath + "%", excludedPath + "%").n;
      assert.equal(edgeCount, 0);
    } finally {
      store.close();
    }
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


test("curated Supervibe artifacts and root bin entrypoints remain indexable", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-index-artifacts-"));
  try {
    await mkdir(join(rootDir, "bin"), { recursive: true });
    await mkdir(join(rootDir, "references", "internal-commands"), { recursive: true });
    await mkdir(join(rootDir, "templates", "approval-markers"), { recursive: true });
    await mkdir(join(rootDir, "templates", "design-system"), { recursive: true });
    await mkdir(join(rootDir, "templates", "gitignore"), { recursive: true });
    await mkdir(join(rootDir, "hooks"), { recursive: true });
    await mkdir(join(rootDir, "questionnaires"), { recursive: true });
    await mkdir(join(rootDir, "confidence-rubrics"), { recursive: true });
    await mkdir(join(rootDir, "app", "bin", "Debug"), { recursive: true });
    await writeFile(join(rootDir, "bin", "supervibe.mjs"), "export const cli = true;\n", "utf8");
    await writeFile(join(rootDir, "README.ru.md"), "# Guide\n", "utf8");
    await writeFile(join(rootDir, "gemini-extension.json"), "{\n  \"name\": \"supervibe\"\n}\n", "utf8");
    await writeFile(join(rootDir, "confidence-rubrics", "_schema.json"), "{\n  \"type\": \"object\"\n}\n", "utf8");
    await writeFile(join(rootDir, "questionnaires", "01-stack-foundation.yaml"), "name: stack\n", "utf8");
    await writeFile(join(rootDir, "references", "internal-commands", "supervibe-loop.md"), "# Loop\n", "utf8");
    await writeFile(join(rootDir, "templates", "approval-markers", "prototype-approval.json.tpl"), "{\n  \"approved\": true\n}\n", "utf8");
    await writeFile(join(rootDir, "templates", "design-system", "tokens.css.tpl"), ":root { --color: red; }\n", "utf8");
    await writeFile(join(rootDir, "templates", "gitignore", "_base"), "node_modules\n", "utf8");
    await writeFile(join(rootDir, "hooks", "hooks.json"), "{\n  \"hooks\": {}\n}\n", "utf8");
    await writeFile(join(rootDir, "package-lock.json"), "{\n  \"lockfileVersion\": 3\n}\n", "utf8");
    await writeFile(join(rootDir, "bun.lock"), "# bun lockfile\n", "utf8");
    await writeFile(join(rootDir, "app", "bin", "Debug", "app.js"), "export const generated = true;\n", "utf8");

    for (const relPath of [
      "bin/supervibe.mjs",
      "README.ru.md",
      "gemini-extension.json",
      "confidence-rubrics/_schema.json",
      "questionnaires/01-stack-foundation.yaml",
      "references/internal-commands/supervibe-loop.md",
      "templates/approval-markers/prototype-approval.json.tpl",
      "templates/design-system/tokens.css.tpl",
      "templates/gitignore/_base",
      "hooks/hooks.json",
    ]) {
      const policy = classifyIndexPath(join(rootDir, relPath), { rootDir });
      assert.equal(policy.included, true, `expected curated artifact to be indexed: ${relPath}`);
    }

    const lockfile = classifyIndexPath(join(rootDir, "package-lock.json"), { rootDir });
    const bunLockfile = classifyIndexPath(join(rootDir, "bun.lock"), { rootDir });
    const nestedBuild = classifyIndexPath(join(rootDir, "app", "bin", "Debug", "app.js"), { rootDir });
    assert.equal(lockfile.included, false);
    assert.equal(bunLockfile.included, false);
    assert.equal(nestedBuild.included, false);

    const inventory = await discoverSourceFiles(rootDir, { explain: true });
    const indexed = new Set(inventory.files.map((file) => file.relPath));
    assert.ok(indexed.has("bin/supervibe.mjs"));
    assert.ok(indexed.has("README.ru.md"));
    assert.ok(indexed.has("references/internal-commands/supervibe-loop.md"));
    assert.ok(indexed.has("templates/approval-markers/prototype-approval.json.tpl"));
    assert.ok(indexed.has("templates/design-system/tokens.css.tpl"));
    assert.ok(indexed.has("templates/gitignore/_base"));
    assert.ok(indexed.has("hooks/hooks.json"));
    assert.ok(!indexed.has("app/bin/Debug/app.js"));
    assert.ok(!indexed.has("package-lock.json"));
    assert.ok(!indexed.has("bun.lock"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
