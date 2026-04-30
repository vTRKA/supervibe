import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ATTEMPT_STATUSES,
  buildFreshContextPacket,
  createAttemptRecord,
  runFreshContextAttempt,
} from "../scripts/lib/autonomous-loop-fresh-context-executor.mjs";
import { createShellStubAdapter } from "../scripts/lib/autonomous-loop-tool-adapters.mjs";

const task = {
  id: "T7.1",
  goal: "Implement adapter packet",
  category: "implementation",
  policyRiskLevel: "low",
  acceptanceCriteria: ["Completion signal exists", "Evidence summary exists"],
};

test("attempt status constants and record helper cover lifecycle states", () => {
  assert.ok(ATTEMPT_STATUSES.includes("requeued"));
  const record = createAttemptRecord({
    task,
    attemptId: "T7.1-attempt-helper",
    executionMode: "dry-run",
    status: "started",
  });
  assert.equal(record.status, "started");
});

test("fresh-context packet contains only scoped execution fields", () => {
  const packet = buildFreshContextPacket({
    task: { ...task, conversationHistory: ["old chat"] },
    contract: { contractId: "contract-T7.1" },
    verificationMatrix: [{ taskId: "T7.1", scenario: "unit", evidenceType: "deterministic assertion" }],
    contextPack: {
      memoryEntries: [{ id: "m1" }],
      codeRagChunks: [{ file: "scripts/a.mjs" }],
      conversationHistory: ["old chat"],
    },
    progressNotes: { nextAction: "execute" },
  });

  assert.equal(packet.packetType, "fresh-context-task");
  assert.equal(packet.task.id, "T7.1");
  assert.deepEqual(Object.keys(packet).sort(), [
    "acceptanceCriteria",
    "contextBudget",
    "contextPack",
    "contract",
    "outputContract",
    "packetType",
    "policyBoundaries",
    "progressNotes",
    "schemaVersion",
    "sideEffectRules",
    "task",
    "verificationMatrix",
  ].sort());
  assert.equal(packet.contextPack.conversationHistory, undefined);
});

test("fresh-context attempt completes with stub adapter and writes attempt output", async () => {
  const attemptDir = await mkdtemp(join(tmpdir(), "supervibe-attempt-"));
  const ledgerPath = join(attemptDir, "side-effects.jsonl");
  const adapter = createShellStubAdapter({
    output: [
      "SUPERVIBE_TASK_COMPLETE: true",
      "SUPERVIBE_EVIDENCE_SUMMARY: unit tests passed",
      "SUPERVIBE_CHANGED_FILES: scripts/lib/autonomous-loop-tool-adapters.mjs",
    ].join("\n"),
  });

  const attempt = await runFreshContextAttempt({
    task,
    adapter,
    attemptId: "T7.1-attempt-1",
    attemptDir,
    ledgerPath,
  });

  assert.equal(attempt.status, "completed");
  assert.equal(attempt.score.finalScore, 10);
  assert.deepEqual(attempt.changedFiles, ["scripts/lib/autonomous-loop-tool-adapters.mjs"]);
  assert.deepEqual(attempt.verificationEvidence, ["unit tests passed"]);
  assert.match(await readFile(attempt.outputPath, "utf8"), /SUPERVIBE_TASK_COMPLETE/);
  assert.match(await readFile(ledgerPath, "utf8"), /generic-shell-stub/);
});

test("fresh-context attempt creates failure packet when signal or evidence is missing", async () => {
  const attemptDir = await mkdtemp(join(tmpdir(), "supervibe-attempt-fail-"));
  const adapter = createShellStubAdapter({ output: "I changed files but forgot the signal." });

  const attempt = await runFreshContextAttempt({
    task,
    adapter,
    attemptId: "T7.1-attempt-2",
    attemptDir,
  });

  assert.equal(attempt.status, "verification_failed");
  assert.equal(attempt.failurePacket.requeueReason, "missing_evidence");
  assert.ok(attempt.score.finalScore <= 6);
});

test("manual mode writes prompt and blocks instead of spawning an adapter", async () => {
  const attemptDir = await mkdtemp(join(tmpdir(), "supervibe-attempt-manual-"));
  const attempt = await runFreshContextAttempt({
    task,
    mode: "manual",
    attemptId: "T7.1-attempt-manual",
    attemptDir,
  });

  assert.equal(attempt.status, "blocked");
  assert.match(await readFile(attempt.outputPath, "utf8"), /SUPERVIBE_FRESH_CONTEXT_TASK/);
});
