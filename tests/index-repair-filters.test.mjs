import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const scriptPath = join(process.cwd(), "scripts", "build-code-index.mjs");

test("repair CLI filters by language, path and exact file", async () => {
  const rootDir = join(tmpdir(), `supervibe-index-filter-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(join(rootDir, "src-tauri", "src", "commands"), { recursive: true });
    await mkdir(join(rootDir, "src"), { recursive: true });
    await writeFile(join(rootDir, "src-tauri", "src", "commands", "chat.rs"), "pub fn chat_fixture() {}\n", "utf8");
    await writeFile(join(rootDir, "src-tauri", "src", "commands", "settings.rs"), "pub fn settings_fixture() {}\n", "utf8");
    await writeFile(join(rootDir, "src", "main.ts"), "export const mainFixture = 1;\n", "utf8");

    const rustOnly = execFileSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--list-missing",
      "--language", "rust",
      "--path", "src-tauri/src",
      "--heartbeat-seconds", "0",
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.match(rustOnly, /src-tauri\/src\/commands\/chat\.rs/);
    assert.match(rustOnly, /src-tauri\/src\/commands\/settings\.rs/);
    assert.doesNotMatch(rustOnly, /src\/main\.ts/);

    const exactFile = execFileSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--list-missing",
      "--file", "src-tauri/src/commands/chat.rs",
      "--heartbeat-seconds", "0",
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.match(exactFile, /MISSING_OR_STALE: 1/);
    assert.match(exactFile, /src-tauri\/src\/commands\/chat\.rs/);
    assert.doesNotMatch(exactFile, /settings\.rs/);

    const debug = execFileSync(process.execPath, [
      scriptPath,
      "--root", rootDir,
      "--source-only",
      "--debug-file", "src-tauri/src/commands/chat.rs",
      "--trace-phases",
      "--json-progress",
      "--heartbeat-seconds", "0",
    ], { cwd: process.cwd(), encoding: "utf8" });
    assert.match(debug, /debug-file/);
    assert.match(debug, /"activeIndexFile":"src-tauri\/src\/commands\/chat\.rs"/);
    assert.doesNotMatch(debug, /settings\.rs/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
