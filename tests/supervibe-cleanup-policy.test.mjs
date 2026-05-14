import assert from "node:assert/strict";
import test from "node:test";

import {
  CLEANUP_NAMESPACES,
  CLEANUP_MODES,
  decideCleanupAction,
  namespaceForCleanupPath,
  resolveCleanupPolicy,
} from "../scripts/lib/supervibe-cleanup-policy.mjs";

test("cleanup policy covers namespaces, modes, and unsafe combinations", () => {
  const policy = resolveCleanupPolicy({ mode: "dry-run", now: "2026-05-06T00:00:00.000Z" });
  assert.deepEqual(CLEANUP_MODES, ["disabled", "dry-run", "review", "auto-safe", "manual-apply"]);
  for (const namespace of CLEANUP_NAMESPACES) assert.ok(policy.namespaces[namespace], namespace);
  assert.equal(policy.twoPhaseApplyRequired, true);
  assert.equal(policy.requireActionManifest, false);
  assert.equal(resolveCleanupPolicy({ mode: "manual" }).requireActionManifest, true);
  assert.equal(namespaceForCleanupPath(".supervibe/artifacts/_workflow-invocations/run/receipt.json"), "workflow-invocations");
  assert.equal(namespaceForCleanupPath(".supervibe/.archive/gc/old.json"), "archives");

  assert.throws(() => resolveCleanupPolicy({
    mode: "auto-safe",
    overrides: { namespaces: { plans: { autoSafe: true, action: "delete" } } },
  }), /cannot be auto-safe/);
});

test("cleanup decision protects provenance and limits auto-safe deletion", () => {
  const dryRun = resolveCleanupPolicy({ mode: "dry-run" });
  assert.equal(decideCleanupAction({ policy: dryRun, relPath: ".supervibe/artifacts/_workflow-invocations/r.json", lifecycleClass: "protected" }).action, "protect");
  assert.equal(decideCleanupAction({ policy: dryRun, relPath: ".supervibe/logs/runtime.log", lifecycleClass: "trash" }).action, "report");

  const autoSafe = resolveCleanupPolicy({ mode: "auto-safe" });
  assert.equal(decideCleanupAction({ policy: autoSafe, relPath: ".supervibe/logs/runtime.log", lifecycleClass: "trash" }).action, "delete");
  assert.equal(decideCleanupAction({ policy: autoSafe, relPath: ".supervibe/artifacts/plans/old.md", lifecycleClass: "trash" }).action, "review");
});
