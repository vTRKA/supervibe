import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildMemorySafeNodeOptions,
  buildRequestedMemorySafeNodeOptions,
  executableForPlatform,
  parseMemorySafeCliArgs,
  tokenizeNodeOptions,
} from "../scripts/lib/node-memory-safe-runner.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, "scripts", "node-memory-safe-run.mjs");

test("memory-safe node options add only supported missing flags", () => {
  const allowedFlags = new Set([
    "--max-old-space-size",
    "--heapsnapshot-near-heap-limit",
  ]);
  const report = buildMemorySafeNodeOptions({
    existingNodeOptions: "--max-old-space-size=2048",
    requested: [
      "--max-old-space-size=4096",
      "--heapsnapshot-near-heap-limit=3",
      "--heap-prof",
    ],
    allowedFlags,
  });

  assert.deepEqual(report.added, ["--heapsnapshot-near-heap-limit=3"]);
  assert.deepEqual(report.skipped, [
    { flag: "--max-old-space-size=4096", reason: "already-present" },
    { flag: "--heap-prof", reason: "unsupported-by-current-node" },
  ]);
  assert.equal(report.nodeOptions, "--max-old-space-size=2048 --heapsnapshot-near-heap-limit=3");
});

test("memory-safe CLI args support overrides and disable switches", () => {
  const parsed = parseMemorySafeCliArgs([
    "--max-old-space-size",
    "1024",
    "--no-heapsnapshot-near-heap-limit",
    "--heap-prof",
    "--",
    "npm",
    "run",
    "check",
  ], {});

  assert.equal(parsed.options.maxOldSpaceMb, 1024);
  assert.equal(parsed.options.heapsnapshotNearHeapLimit, null);
  assert.equal(parsed.options.heapProf, true);
  assert.deepEqual(parsed.commandArgs, ["npm", "run", "check"]);
});

test("memory-safe CLI args reject missing option values", () => {
  assert.throws(
    () => parseMemorySafeCliArgs(["--max-old-space-size", "--", "npm", "test"], {}),
    /--max-old-space-size requires a value/,
  );
});

test("node option tokenization handles quoted values", () => {
  assert.deepEqual(
    tokenizeNodeOptions('--max-old-space-size=2048 "--heap-prof-name=heap profile"'),
    ["--max-old-space-size=2048", "--heap-prof-name=heap profile"],
  );
});

test("memory-safe requested options use conservative defaults", () => {
  assert.deepEqual(buildRequestedMemorySafeNodeOptions(), [
    "--max-old-space-size=4096",
    "--heapsnapshot-near-heap-limit=3",
  ]);
});

test("Windows package manager executable names use cmd shims", () => {
  assert.equal(executableForPlatform("npm", "win32"), "npm.cmd");
  assert.equal(executableForPlatform("node", "win32"), "node");
  assert.equal(executableForPlatform("npm", "linux"), "npm");
});

test("memory-safe CLI dry-run reports supported flags without executing command", () => {
  const stdout = execFileSync(process.execPath, [
    CLI,
    "--max-old-space-size",
    "64",
    "--no-heapsnapshot-near-heap-limit",
    "--dry-run",
    "--",
    process.execPath,
    "-e",
    "console.log('EXECUTED_MARKER')",
  ], { encoding: "utf8" });

  assert.match(stdout, /SUPERVIBE_NODE_MEMORY_SAFE_RUN/);
  assert.match(stdout, /DRY_RUN: true/);
  assert.match(stdout, /--max-old-space-size=64/);
  assert.doesNotMatch(stdout, /^EXECUTED_MARKER$/m);
});

test("memory-safe CLI passes supported NODE_OPTIONS to child node processes", () => {
  const stdout = execFileSync(process.execPath, [
    CLI,
    "--max-old-space-size",
    "64",
    "--no-heapsnapshot-near-heap-limit",
    "--",
    process.execPath,
    "-e",
    "console.log(process.env.NODE_OPTIONS.includes('--max-old-space-size=64') ? 'NODE_OPTIONS_OK' : process.env.NODE_OPTIONS)",
  ], { encoding: "utf8" });

  assert.match(stdout, /NODE_OPTIONS_OK/);
});
