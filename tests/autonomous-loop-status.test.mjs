import assert from "node:assert/strict";
import test from "node:test";
import { createState, formatStatus } from "../scripts/lib/autonomous-loop-status.mjs";

test("status output follows explicit contract", () => {
  const text = formatStatus(createState({
    runId: "loop-x",
    status: "COMPLETE",
    claims: [{ taskId: "t1", claimId: "claim-1", status: "expired" }],
    progressSummary: { completed: 1, in_progress: 0, blockers: 0, evidence: 2 },
    gates: [{ gateId: "gate-1", status: "blocked" }],
    worktreeSessions: [{ sessionId: "session-1", status: "active", epicId: "epic-1" }],
  }));
  assert.match(text, /SUPERVIBE_LOOP_STATUS/);
  assert.match(text, /STATUS: COMPLETE/);
  assert.match(text, /STALE_CLAIMS: 1/);
  assert.match(text, /OPEN_GATES: 1/);
  assert.match(text, /EXECUTION_MODE: dry-run/);
  assert.match(text, /ADAPTERS:/);
  assert.match(text, /TASKS: ready=0 blocked=0 claimed=0 complete=0 open=0/);
  assert.match(text, /REPEATED_FAILURE_SIGNATURES: 0/);
  assert.match(text, /WORKTREE_SESSIONS: active=1 stale=0 cleanup_blocked=0 total=1/);
  assert.match(text, /PROGRESS: completed=1 in_progress=0 blockers=0 evidence=2/);
});

test("status output reports graph counts and repeated failure signatures", () => {
  const text = formatStatus(createState({
    runId: "loop-y",
    status: "BLOCKED",
    tasks: [
      { id: "done", status: "complete" },
      { id: "blocked", status: "blocked" },
      { id: "claimed", status: "in_progress" },
      { id: "open", status: "open" },
    ],
    requeueSummary: { repeated_failure_signatures: [{ signature: "a", count: 2 }] },
  }));

  assert.match(text, /TASKS: ready=0 blocked=1 claimed=1 complete=1 open=1/);
  assert.match(text, /REPEATED_FAILURE_SIGNATURES: 1/);
});
