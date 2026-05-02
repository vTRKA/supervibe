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

function buildLargeRustFixture({ targetLines = 16339, targetBytes = 740000 } = {}) {
  const lines = [
    "pub mod generated_services {",
    "use std::collections::HashMap;",
    "",
    "macro_rules! service_metric {",
    "  ($name:expr, $value:expr) => {",
    "    println!(\"{}:{}\", $name, $value);",
    "  };",
    "}",
    "",
    "pub trait ServiceOperation {",
    "  fn apply(&self, input: i64) -> i64;",
    "}",
    "",
    "pub struct ServiceState {",
    "  pub values: HashMap<String, i64>,",
    "}",
    "",
  ];
  let i = 0;
  let byteLength = Buffer.byteLength(lines.join("\n"), "utf8");
  while (lines.length < targetLines || byteLength < targetBytes) {
    const block = [
      `pub fn generated_service_operation_${i}(input: i64) -> i64 {`,
      `  let mut total = input + ${i};`,
      `  total += ${i % 17};`,
      `  service_metric!("generated_service_operation_${i}", total);`,
      `  if total % 2 == 0 { return total / 2; }`,
      `  total + ${(i % 31) + 1}`,
      "}",
      "",
    ];
    lines.push(...block);
    byteLength += Buffer.byteLength(`\n${block.join("\n")}`, "utf8");
    i += 1;
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

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
  assert.match(out, /--large-file-threshold-bytes/);
  assert.match(out, /--known-failed-ttl/);
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

test("build-code-index --list-missing is read-only with respect to index locks and checkpoints", async () => {
  await withFixture(async (rootDir) => {
    const lockPath = join(rootDir, ".supervibe", "memory", "code-index.lock");
    const checkpointPath = join(rootDir, ".supervibe", "memory", "code-index-checkpoint.json");
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    await writeFile(lockPath, JSON.stringify({
      pid: process.pid,
      startedAt: "2026-05-02T00:00:00.000Z",
      heartbeatAt: new Date().toISOString(),
      command: "live-test-lock",
    }), "utf8");

    const result = spawnSync(process.execPath, [scriptPath, "--root", rootDir, "--list-missing", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /SUPERVIBE_INDEX_MISSING/);
    assert.equal(existsSync(lockPath), true, "diagnostic listing must not remove or replace a live writer lock");
    assert.equal(existsSync(checkpointPath), false, "diagnostic listing must not leave an unfinished repair checkpoint");
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

test("build-code-index --source-only reports approximate chunking for repair-safe source indexing", async () => {
  const rootDir = join(tmpdir(), `supervibe-code-index-source-only-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src-tauri", "src", "commands"), { recursive: true });
    await writeFile(join(rootDir, "src-tauri", "src", "commands", "chat.rs"), [
      "pub fn chat_fixture() {",
      "  let mut value = 0;",
      "  value += 1;",
      "}",
      "",
    ].join("\n"), "utf8");

    const out = execFileSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--source-only",
      "--debug-file", "src-tauri/src/commands/chat.rs",
      "--trace-phases",
      "--json-progress",
      "--heartbeat-seconds", "0",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.match(out, /"phase":"chunking"/);
    assert.match(out, /"chunkerMode":"approximate"/);
    assert.doesNotMatch(out, /SUPERVIBE_INDEX_BOUNDED_TIMEOUT/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("build-code-index indexes a 750KB Rust source file through large-file mode without timing out", async () => {
  const rootDir = join(tmpdir(), `supervibe-code-index-large-rust-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    const relPath = "src-tauri/src/services/large_service.rs";
    const absPath = join(rootDir, ...relPath.split("/"));
    await mkdir(join(rootDir, "src-tauri", "src", "services"), { recursive: true });
    const content = buildLargeRustFixture();
    await writeFile(absPath, content, "utf8");

    assert.ok(Buffer.byteLength(content, "utf8") >= 740000, "fixture should exercise the large-file byte path");
    assert.ok(content.split("\n").length >= 16000, "fixture should exercise the large-file line path");

    const out = execFileSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--source-only",
      "--debug-file", relPath,
      "--json-progress",
      "--health",
      "--heartbeat-seconds", "0",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });

    assert.match(out, /"chunkerMode":"large-file"/);
    assert.match(out, /Files indexed: 1/);
    assert.doesNotMatch(out, /SUPERVIBE_INDEX_BOUNDED_TIMEOUT/);

    const store = new CodeStore(rootDir, { useEmbeddings: false });
    await store.init();
    try {
      const row = store.db.prepare(`
        SELECT line_count AS lineCount, index_status AS indexStatus, chunking_strategy AS chunkingStrategy
        FROM code_files
        WHERE path = ?
      `).get(relPath);
      const chunks = store.db.prepare("SELECT COUNT(*) AS count FROM code_chunks WHERE path = ?").get(relPath).count;
      assert.ok(row, "large Rust file should have a source row");
      assert.equal(row.indexStatus, "full");
      assert.match(row.chunkingStrategy, /large-file/);
      assert.ok(row.lineCount >= 16000);
      assert.ok(chunks > 10, `expected many incremental chunks, got ${chunks}`);
    } finally {
      store.close();
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("build-code-index --resume --graph skips fresh known-failed source rows before selecting work", async () => {
  const rootDir = join(tmpdir(), `supervibe-code-index-known-failed-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "aaa"), { recursive: true });
    await mkdir(join(rootDir, "zzz"), { recursive: true });
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    await writeFile(join(rootDir, "aaa", "large.rs"), "pub fn known_failed_large_fixture() { }\n", "utf8");
    await writeFile(join(rootDir, "zzz", "next.ts"), "export function selectedAfterKnownFailed() { return 1; }\n", "utf8");
    await writeFile(join(rootDir, ".supervibe", "memory", "failed_files.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      files: [{
        path: "aaa/large.rs",
        phase: "chunking",
        status: "missing-row",
        failedAt: new Date().toISOString(),
        message: "previous chunking timeout",
      }],
    }, null, 2), "utf8");

    const out = execFileSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--resume",
      "--graph",
      "--no-embeddings",
      "--max-files", "1",
      "--heartbeat-seconds", "0",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.match(out, /KNOWN_FAILED_SKIPPED: 1/);
    assert.match(out, /Files indexed: 1/);

    const store = new CodeStore(rootDir, { useEmbeddings: false });
    await store.init();
    try {
      const skipped = store.db.prepare("SELECT path FROM code_files WHERE path = ?").get("aaa/large.rs");
      const selected = store.db.prepare("SELECT path FROM code_files WHERE path = ?").get("zzz/next.ts");
      assert.equal(skipped, undefined, "known failed missing source row should not consume the bounded graph batch");
      assert.ok(selected, "next eligible file should be indexed instead");
    } finally {
      store.close();
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("build-code-index --resume skips already indexed unchanged files", async () => {
  await withFixture(async (rootDir) => {
    execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--source-only", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    const beforeStore = new CodeStore(rootDir, { useEmbeddings: false });
    await beforeStore.init();
    const before = beforeStore.db.prepare("SELECT content_hash AS contentHash, indexed_at AS indexedAt FROM code_files WHERE path = ?").get("src/main.ts");
    beforeStore.close();

    const out = execFileSync(process.execPath, [scriptPath, "--root", rootDir, "--resume", "--source-only", "--heartbeat-seconds", "0"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.match(out, /resume mode: 0 missing\/stale file\(s\), 0 selected/);
    assert.match(out, /Files indexed: 0/);
    assert.match(out, /Files skipped \(unchanged\/unsupported\): 0/);

    const afterStore = new CodeStore(rootDir, { useEmbeddings: false });
    await afterStore.init();
    try {
      const after = afterStore.db.prepare("SELECT content_hash AS contentHash, indexed_at AS indexedAt FROM code_files WHERE path = ?").get("src/main.ts");
      assert.deepEqual(after, before);
    } finally {
      afterStore.close();
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
