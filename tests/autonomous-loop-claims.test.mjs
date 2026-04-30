import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  claimTask,
  createClaimRecord,
  expireClaims,
  isClaimActive,
  releaseClaim,
  summarizeClaims,
} from "../scripts/lib/autonomous-loop-claims.mjs";
import {
  assertNoRawSecrets,
  createProgressEntry,
  createResumeNotes,
  renderProgressMarkdown,
  writeProgressMarkdown,
} from "../scripts/lib/autonomous-loop-progress-log.mjs";

test("claimTask creates one active claim and blocks duplicate active claims", () => {
  const task = { id: "t1", goal: "Implement", category: "implementation", policyRiskLevel: "low" };
  const first = claimTask({
    claims: [],
    task,
    agentId: "stack-developer",
    attemptId: "attempt-1",
    now: "2026-04-29T00:00:00.000Z",
    ttlMinutes: 10,
  });
  assert.equal(first.ok, true);
  assert.equal(isClaimActive(first.claim, "2026-04-29T00:01:00.000Z"), true);

  const second = claimTask({
    claims: first.claims,
    task,
    agentId: "other-agent",
    attemptId: "attempt-2",
    now: "2026-04-29T00:01:00.000Z",
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "task_already_claimed");
  assert.equal(second.activeClaim.claimId, first.claim.claimId);
});

test("createClaimRecord creates deterministic active lease fields", () => {
  const claim = createClaimRecord({
    taskId: "t1",
    agentId: "stack-developer",
    attemptId: "attempt-1",
    now: "2026-04-29T00:00:00.000Z",
    ttlMinutes: 5,
  });

  assert.equal(claim.taskId, "t1");
  assert.equal(claim.status, "active");
  assert.equal(claim.attemptId, "attempt-1");
});

test("expired claims are visible and repairable", () => {
  const task = { id: "t1", goal: "Implement", category: "implementation", policyRiskLevel: "low" };
  const first = claimTask({
    claims: [],
    task,
    agentId: "stack-developer",
    attemptId: "attempt-1",
    now: "2026-04-29T00:00:00.000Z",
    ttlMinutes: 1,
  });
  const expired = expireClaims(first.claims, "2026-04-29T00:02:00.000Z");
  assert.equal(expired[0].status, "expired");

  const next = claimTask({
    claims: expired,
    task,
    agentId: "stack-developer",
    attemptId: "attempt-2",
    now: "2026-04-29T00:02:00.000Z",
  });
  assert.equal(next.ok, true);
  assert.equal(summarizeClaims(next.claims, "2026-04-29T00:02:00.000Z").expired, 1);
});

test("high-risk claims require exact approval lease", () => {
  const task = { id: "deploy", goal: "Deploy production", category: "production_deploy", policyRiskLevel: "high" };
  const denied = claimTask({ claims: [], task, agentId: "devops-sre", attemptId: "a1" });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "exact_approval_lease_required");

  const allowed = claimTask({
    claims: [],
    task,
    agentId: "devops-sre",
    attemptId: "a1",
    approvalLease: {
      environment: "production",
      actionClass: "production_deploy",
      budget: { max_runtime_minutes: 5 },
    },
  });
  assert.equal(allowed.ok, true);
});

test("releaseClaim marks completed claim", () => {
  const task = { id: "t1", goal: "Implement", category: "implementation", policyRiskLevel: "low" };
  const first = claimTask({ claims: [], task, agentId: "stack-developer", attemptId: "a1" });
  const released = releaseClaim(first.claims, first.claim.claimId, "completed", "2026-04-29T00:05:00.000Z");
  assert.equal(released[0].status, "completed");
  assert.equal(summarizeClaims(released).completed, 1);
});

test("progress markdown is compact, structured, and rejects raw secrets", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-progress-"));
  const entry = createProgressEntry({
    taskId: "t1",
    attemptId: "a1",
    section: "COMPLETED",
    summary: "Validated artifact contract",
    nextAction: "Proceed to graph model",
    evidencePaths: ["tests/autonomous-loop-runner.test.mjs"],
    scoreId: "score-t1",
  });
  const markdown = renderProgressMarkdown([entry]);
  assert.match(markdown, /## COMPLETED/);
  assert.match(markdown, /## EVIDENCE/);
  assert.match(markdown, /tests\/autonomous-loop-runner\.test\.mjs/);

  const filePath = join(rootDir, "progress.md");
  await writeProgressMarkdown(filePath, [entry]);
  assert.match(await readFile(filePath, "utf8"), /Autonomous Loop Progress/);
  assert.doesNotThrow(() => assertNoRawSecrets("clean progress text"));

  assert.throws(() => createProgressEntry({
    taskId: "t2",
    attemptId: "a2",
    section: "NEXT",
    summary: "api_key=12345678901234567890",
  }), /raw secret/);
});

test("resume notes contain enough context for a fresh agent", () => {
  const task = { id: "t1", goal: "Fix parser" };
  const notes = createResumeNotes({
    task,
    claim: { attemptId: "a1", agentId: "stack-developer", claimId: "claim-1" },
    nextAction: "Run focused parser tests",
    evidencePaths: ["tests/parser.test.mjs"],
  });

  assert.equal(notes.taskId, "t1");
  assert.equal(notes.activeAgent, "stack-developer");
  assert.equal(notes.nextAction, "Run focused parser tests");
  assert.deepEqual(notes.evidencePaths, ["tests/parser.test.mjs"]);
});
