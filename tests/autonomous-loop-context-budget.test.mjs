import assert from "node:assert/strict";
import test from "node:test";
import { buildFreshContextPacket, runFreshContextAttempt } from "../scripts/lib/autonomous-loop-fresh-context-executor.mjs";
import { createProgressEntry, summarizeProgress } from "../scripts/lib/autonomous-loop-progress-log.mjs";
import {
  annotateTaskWithContextBudget,
  createContextHandoffPacket,
  estimateContextBudget,
  formatContextBudgetStatus,
} from "../scripts/lib/autonomous-loop-context-budget.mjs";

test("context budget warns and creates handoff before exhaustion", () => {
  const task = { id: "t1", goal: "x".repeat(950), acceptanceCriteria: ["done"] };
  const budget = estimateContextBudget({ task, maxChars: 1000, warningRatio: 0.5, handoffRatio: 0.8 });

  assert.equal(budget.status, "handoff_recommended");
  assert.equal(budget.smallEnoughForAutonomy, false);
  assert.match(budget.handoffPacket.nextAction, /split task/);
  assert.match(formatContextBudgetStatus(budget), /SMALL_ENOUGH_FOR_AUTONOMY: false/);
  assert.equal(annotateTaskWithContextBudget(task, { maxChars: 1000 }).contextBudget.maxChars, 1000);
  const handoffPacket = createContextHandoffPacket({ task, estimatedChars: 950, maxChars: 1000, pressure: 0.95 });
  assert.equal(handoffPacket.type, "context-budget-handoff");
  assert.equal(handoffPacket.taskId, "t1");
  assert.equal(handoffPacket.estimatedChars, 950);
  assert.equal(handoffPacket.nextAction, "split task or create a fresh-context handoff before execution");
});

test("fresh-context packets and attempts carry context budget signals", async () => {
  const task = { id: "t-budget", goal: "large story ".repeat(200) };
  const packet = buildFreshContextPacket({ task, contextBudgetOptions: { maxChars: 500, handoffRatio: 0.6 } });
  assert.equal(packet.contextBudget.status, "handoff_recommended");

  const attempt = await runFreshContextAttempt({
    task,
    mode: "fresh-context",
    adapter: { id: "stub", run: async () => ({ output: "" }) },
    enforceContextBudget: true,
    contextBudgetOptions: { maxChars: 500, handoffRatio: 0.6 },
  });
  assert.equal(attempt.status, "blocked");
  assert.equal(attempt.contextBudget.status, "handoff_recommended");

  const progress = createProgressEntry({ taskId: "t-budget", section: "NEXT", summary: "handoff", contextBudget: packet.contextBudget });
  assert.equal(summarizeProgress([progress]).context_warnings, 1);
});
