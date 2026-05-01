import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { CodeStore } from "../scripts/lib/code-store.mjs";

const scriptPath = join(process.cwd(), "scripts", "build-code-index.mjs");

async function withFixture(fn) {
  const rootDir = join(tmpdir(), `supervibe-code-index-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(join(rootDir, "src", "main.ts"), "export function runCliIndexFixture() { return 1; }\n", "utf8");
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("build-code-index --help prints usage and does not start indexing", () => {
  const out = execFileSync(process.execPath, [scriptPath, "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.match(out, /Usage:/);
  assert.match(out, /--resume/);
  assert.doesNotMatch(out, /Indexing code in/);
});

test("build-code-index refuses to run when a live lock is present", async () => {
  await withFixture(async (rootDir) => {
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    await writeFile(join(rootDir, ".supervibe", "memory", "code-index.lock"), JSON.stringify({
      pid: process.pid,
      startedAt: "2026-05-02T00:00:00.000Z",
      command: "test-lock",
    }), "utf8");

    const result = spawnSync(process.execPath, [scriptPath, "--root", rootDir, "--heartbeat-seconds", "0", "--no-embeddings"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /already running/);
  });
});

test("build-code-index --list-missing reports policy-eligible gaps without indexing them", async () => {
  await withFixture(async (rootDir) => {
    const out = execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--list-missing", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.match(out, /SUPERVIBE_INDEX_MISSING/);
    assert.match(out, /MISSING_OR_STALE: 1/);
    assert.match(out, /src\/main\.ts \(missing-row\)/);
  });
});

test("build-code-index --no-embeddings indexes BM25 chunks without graph work by default", async () => {
  await withFixture(async (rootDir) => {
    execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--force", "--no-embeddings", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    const store = new CodeStore(rootDir, { useEmbeddings: false });
    await store.init();
    try {
      const stats = store.stats();
      assert.equal(stats.totalFiles, 1);
      assert.ok(stats.totalChunks > 0);
      assert.equal(stats.totalSymbols, 0);
      assert.equal(stats.totalEdges, 0);
    } finally {
      store.close();
    }
  });
});
