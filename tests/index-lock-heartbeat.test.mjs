import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts", "build-code-index.mjs");

test("clean-stale-lock explains dead pid, heartbeat age and resume safety", async () => {
  const rootDir = join(tmpdir(), `supervibe-index-lock-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    const lockPath = join(rootDir, ".supervibe", "memory", "code-index.lock");
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    await writeFile(lockPath, JSON.stringify({
      pid: 99999999,
      startedAt: "2026-05-02T00:00:00.000Z",
      heartbeatAt: "2026-05-02T00:00:01.000Z",
      command: "stale-lock-test",
      phase: "reading",
      activeIndexFile: "src-tauri/src/commands/chat.rs",
    }, null, 2), "utf8");

    const out = execFileSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--clean-stale-lock",
    ], { cwd: process.cwd(), encoding: "utf8" });

    assert.match(out, /SUPERVIBE_INDEX_LOCK/);
    assert.match(out, /STATUS: stale/);
    assert.match(out, /PID_RUNNING: false/);
    assert.match(out, /ACTION: removed/);
    assert.match(out, /SAFE_TO_RESUME: true/);
    assert.equal(existsSync(lockPath), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
