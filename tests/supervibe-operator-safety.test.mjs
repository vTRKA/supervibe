import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import test from "node:test";

import {
  assertSafeRecursiveCleanupPath,
  detectFastSearchTool,
  inspectOperatorSafety,
} from "../scripts/lib/supervibe-operator-safety.mjs";

test("detectFastSearchTool always returns a non-blocking search plan", () => {
  const result = detectFastSearchTool();
  assert.equal(result.pass, true);
  assert.ok(result.primary);
});

test("assertSafeRecursiveCleanupPath accepts generated temp child directories", () => {
  const target = join(tmpdir(), "supervibe-operator-safety-smoke", "child");
  const result = assertSafeRecursiveCleanupPath(target);
  assert.equal(result.pass, true);
  assert.equal(result.checked, true);
  assert.ok(result.safeRoot);
});

test("assertSafeRecursiveCleanupPath rejects protected roots", () => {
  const home = assertSafeRecursiveCleanupPath(homedir());
  assert.equal(home.pass, false);
  assert.match(home.issues.join("\n"), /outside allowed temp|protected root/);

  const tempRoot = assertSafeRecursiveCleanupPath(tmpdir());
  assert.equal(tempRoot.pass, false);
  assert.match(tempRoot.issues.join("\n"), /child directory/);
});

test("inspectOperatorSafety combines search and cleanup signals", () => {
  const target = join(tmpdir(), "supervibe-operator-safety-inspect", "child");
  const report = inspectOperatorSafety({ cleanupPath: target });
  assert.equal(report.searchTool.pass, true);
  assert.equal(report.cleanup.pass, true);
});
