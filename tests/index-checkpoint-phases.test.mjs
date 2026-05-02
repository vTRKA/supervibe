import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts", "build-code-index.mjs");

test("checkpoint separates selection file, active index file, and phase", async () => {
  const rootDir = join(tmpdir(), `supervibe-index-checkpoint-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(join(rootDir, "src", "main.ts"), "export function checkpointFixture() { return 1; }\n", "utf8");

    const out = execFileSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--source-only",
      "--debug-file", "src/main.ts",
      "--trace-phases",
      "--json-progress",
      "--heartbeat-seconds", "0",
    ], { cwd: process.cwd(), encoding: "utf8" });

    assert.match(out, /SUPERVIBE_INDEX_PROGRESS/);
    assert.match(out, /"phase":"reading"|"stage":"reading"/);
    assert.match(out, /"phase":"db-write"|"stage":"db-write"/);
    assert.match(out, /"phase":"fts-write"|"stage":"fts-write"/);

    const checkpoint = JSON.parse(await readFile(join(rootDir, ".supervibe", "memory", "code-index-checkpoint.json"), "utf8"));
    assert.equal(checkpoint.selectionFile, null);
    assert.equal(checkpoint.activeIndexFile, "src/main.ts");
    assert.equal(checkpoint.currentFile, "src/main.ts");
    assert.equal(checkpoint.stage, "done");
    assert.equal(checkpoint.phase, "done");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
