import assert from "node:assert/strict";
import test from "node:test";
import {
  createProcessSideEffect,
  createSideEffect,
  createWorktreeSideEffect,
  reconcileSideEffects,
} from "../scripts/lib/autonomous-loop-side-effect-ledger.mjs";

test("side-effect ledger requires reconciliation for unknown started actions", () => {
  const entry = createSideEffect({ status: "started" });
  assert.equal(reconcileSideEffects([entry]).status, "side_effect_reconciliation_required");
});

test("process side effects record adapter process ownership and stop controls", () => {
  const entry = createProcessSideEffect({
    adapterId: "generic-shell-stub",
    executionMode: "fresh-context",
    processId: 123,
    outputPath: "attempt-output.txt",
  });

  assert.equal(entry.type, "process");
  assert.equal(entry.adapterId, "generic-shell-stub");
  assert.equal(entry.executionMode, "fresh-context");
  assert.equal(entry.processId, 123);
  assert.equal(entry.stoppable, true);
  assert.equal(entry.trackedInSideEffectLedger, true);
});

test("worktree side effects record session ownership and cleanup controls", () => {
  const entry = createWorktreeSideEffect({
    sessionId: "session-1",
    worktreePath: ".worktrees/session-1",
    branchName: "supervibe/session-1",
  });

  assert.equal(entry.type, "worktree");
  assert.equal(entry.sessionId, "session-1");
  assert.equal(entry.worktreePath, ".worktrees/session-1");
  assert.equal(entry.branchName, "supervibe/session-1");
  assert.equal(entry.cleanupPolicy, "keep-until-reviewed");
  assert.equal(entry.stoppable, true);
});
