import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { CodeStore } from "../scripts/lib/code-store.mjs";
import { hashFile } from "../scripts/lib/file-hash.mjs";

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
  assert.match(out, /--max-seconds/);
  assert.match(out, /--source-only/);
  assert.match(out, /--json-progress/);
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

test("build-code-index removes a stale lock whose PID no longer exists", async () => {
  await withFixture(async (rootDir) => {
    const lockPath = join(rootDir, ".supervibe", "memory", "code-index.lock");
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    await writeFile(lockPath, JSON.stringify({
      pid: 99999999,
      startedAt: "2026-05-02T00:00:00.000Z",
      command: "stale-test-lock",
    }), "utf8");

    const out = execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--source-only", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.match(out, /Indexing code in/);
    assert.equal(existsSync(lockPath), false, "stale lock should be released after successful run");
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

test("build-code-index --source-only indexes BM25 chunks without graph work", async () => {
  await withFixture(async (rootDir) => {
    execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--force", "--source-only", "--heartbeat-seconds", "0"], {
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

test("build-code-index writes JSON progress and a persisted checkpoint per batch", async () => {
  await withFixture(async (rootDir) => {
    const out = execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--source-only", "--json-progress", "--max-files", "1", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    const progressLine = out.split(/\r?\n/).find((line) => line.startsWith("SUPERVIBE_INDEX_PROGRESS "));
    assert.ok(progressLine, `expected JSON progress line, got:\n${out}`);
    const payload = JSON.parse(progressLine.replace("SUPERVIBE_INDEX_PROGRESS ", ""));
    assert.equal(payload.stage, "discovered");
    assert.equal(typeof payload.elapsedSeconds, "number");

    const checkpointPath = join(rootDir, ".supervibe", "memory", "code-index-checkpoint.json");
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    assert.equal(checkpoint.stage, "done");
    assert.equal(checkpoint.processed, 1);
    assert.equal(checkpoint.total, 1);
    assert.ok(checkpoint.lastPersistedAt);
  });
});

test("build-code-index --resume --max-files prioritizes missing rows before stale hashes", async () => {
  const rootDir = join(tmpdir(), `supervibe-code-index-resume-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    const stalePath = join(rootDir, "src", "a-stale.ts");
    const missingPath = join(rootDir, "src", "z-missing.ts");
    await writeFile(stalePath, "export const staleValue = 1;\n", "utf8");

    execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--source-only", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const oldHash = await hashFile(stalePath);

    await writeFile(stalePath, "export const staleValue = 2;\n", "utf8");
    await writeFile(missingPath, "export const missingValue = 1;\n", "utf8");

    execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--resume", "--max-files", "1", "--source-only", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    const store = new CodeStore(rootDir, { useEmbeddings: false });
    await store.init();
    try {
      const missing = store.db.prepare("SELECT path FROM code_files WHERE path = ?").get("src/z-missing.ts");
      const stale = store.db.prepare("SELECT content_hash AS contentHash FROM code_files WHERE path = ?").get("src/a-stale.ts");
      assert.ok(missing, "missing row should be indexed first");
      assert.equal(stale.contentHash, oldHash, "stale changed file should wait for the next bounded batch");
    } finally {
      store.close();
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("build-code-index --max-seconds exits gracefully after a bounded batch", async () => {
  const rootDir = join(tmpdir(), `supervibe-code-index-bounded-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    for (let i = 0; i < 20; i += 1) {
      await writeFile(join(rootDir, "src", `file-${i}.ts`), `export const value${i} = ${i};\n`, "utf8");
    }

    const out = execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--source-only", "--max-seconds", "0.001", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.match(out, /SUPERVIBE_INDEX_BOUNDED_TIMEOUT/);

    const store = new CodeStore(rootDir, { useEmbeddings: false });
    await store.init();
    try {
      assert.ok(store.stats().totalFiles < 20, "bounded run should stop before indexing the full inventory");
    } finally {
      store.close();
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
