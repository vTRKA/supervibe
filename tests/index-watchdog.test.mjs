import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts", "build-code-index.mjs");

test("hard watchdog stops inside the first active file phase", async () => {
  const rootDir = join(tmpdir(), `supervibe-index-watchdog-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(join(rootDir, "src", "first.ts"), "export const watchdogFixture = 1;\n", "utf8");

    const started = Date.now();
    const result = spawnSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--source-only",
      "--max-files", "1",
      "--max-seconds", "0.2",
      "--json-progress",
      "--heartbeat-seconds", "0",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        SUPERVIBE_INDEX_TEST_DELAY_PHASE: "reading",
        SUPERVIBE_INDEX_TEST_DELAY_MS: "3000",
      },
      timeout: 5000,
    });
    const elapsed = Date.now() - started;
    const output = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0, output);
    assert.ok(elapsed < 2000, `watchdog should exit before external timeout, elapsed=${elapsed}ms\n${output}`);
    assert.match(output, /SUPERVIBE_INDEX_BOUNDED_TIMEOUT/);
    assert.match(output, /PROCESSED: 0/);
    assert.match(output, /Files indexed: 0/);
    assert.doesNotMatch(output, /ETIMEDOUT|spawnSync.*timeout/i);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
