import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CodeStore } from "../scripts/lib/code-store.mjs";

const scriptPath = join(process.cwd(), "scripts", "build-code-index.mjs");

test("indexing errors are recorded with path, phase, error and optional stack", async () => {
  const rootDir = join(tmpdir(), `supervibe-index-failed-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(join(rootDir, "src", "broken.ts"), "export const brokenFixture = 1;\n", "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--source-only",
      "--debug-file", "src/broken.ts",
      "--trace-phases",
      "--verbose",
      "--heartbeat-seconds", "0",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        SUPERVIBE_INDEX_TEST_THROW_PHASE: "chunking",
      },
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.match(output, /Errors: 1/);
    assert.match(output, /failed_files\.json/);

    const failedPath = join(rootDir, ".supervibe", "memory", "failed_files.json");
    assert.equal(existsSync(failedPath), true, "failed_files.json should be written");
    const failed = JSON.parse(await readFile(failedPath, "utf8"));
    assert.equal(failed.files.length, 1);
    assert.equal(failed.files[0].path, "src/broken.ts");
    assert.equal(failed.files[0].phase, "chunking");
    assert.equal(failed.files[0].errorName, "Error");
    assert.match(failed.files[0].message, /SUPERVIBE_INDEX_TEST_THROW_PHASE/);
    assert.match(failed.files[0].stack, /Error:/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("large-file chunk interruption records partial-row diagnostics and continues the batch", async () => {
  const rootDir = join(tmpdir(), `supervibe-index-chunk-timeout-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src-tauri", "src", "commands"), { recursive: true });
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(join(rootDir, "src-tauri", "src", "commands", "chat.rs"), `pub fn chat_fixture() {\n${"  let value = 1;\n".repeat(40)}}\n`, "utf8");
    await writeFile(join(rootDir, "src", "main.ts"), "export const mainFixture = 1;\n", "utf8");

    const result = spawnSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--source-only",
      "--heartbeat-seconds", "0",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        SUPERVIBE_INDEX_LARGE_FILE_THRESHOLD_BYTES: "100",
        SUPERVIBE_INDEX_LARGE_FILE_CHUNK_LINES: "5",
        SUPERVIBE_INDEX_TEST_LARGE_FILE_STOP_AFTER_CHUNKS: "2",
      },
    });
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.match(output, /Files indexed: 2/);
    assert.match(output, /Errors: 1/);

    const failedPath = join(rootDir, ".supervibe", "memory", "failed_files.json");
    assert.equal(existsSync(failedPath), true, "failed_files.json should be written");
    const failed = JSON.parse(await readFile(failedPath, "utf8"));
    assert.equal(failed.files.length, 1);
    assert.equal(failed.files[0].path, "src-tauri/src/commands/chat.rs");
    assert.equal(failed.files[0].phase, "chunking");
    assert.equal(failed.files[0].status, "partial-row");
    assert.equal(failed.files[0].chunksWritten, 2);
    assert.equal(failed.files[0].timeoutMs, 0);
    assert.ok(failed.files[0].sizeBytes > 100);
    assert.ok(failed.files[0].lineCount > 0);
    assert.match(failed.files[0].chunkingStrategy, /large-file/);
    assert.match(failed.files[0].recommendedAction, /source row is partial/);

    const store = new CodeStore(rootDir, { useEmbeddings: false });
    await store.init();
    try {
      const row = store.db.prepare("SELECT index_status AS indexStatus FROM code_files WHERE path = ?").get("src-tauri/src/commands/chat.rs");
      const chunks = store.db.prepare("SELECT COUNT(*) AS count FROM code_chunks WHERE path = ?").get("src-tauri/src/commands/chat.rs").count;
      assert.equal(row.indexStatus, "partial");
      assert.equal(chunks, 2);
    } finally {
      store.close();
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
