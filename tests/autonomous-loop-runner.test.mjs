import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resumeAutonomousLoop, runAutonomousLoop } from "../scripts/lib/autonomous-loop-runner.mjs";
import { createShellStubAdapter } from "../scripts/lib/autonomous-loop-tool-adapters.mjs";

test("runner executes dry-run request and writes loop state", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-"));
  const result = await runAutonomousLoop({ rootDir, request: "validate integrations", dryRun: true, maxLoops: 20 });
  assert.equal(result.status, "COMPLETE");
  assert.ok(result.finalScore >= 9);
  assert.equal(result.state.final_acceptance.pass, true);
  assert.equal(result.state.plugin_version, "0.0.0");
  assert.match(result.reportPath, /final-report\.md$/);
});

test("runner pins dry-run artifact contract for validate integrations", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-contract-"));
  const result = await runAutonomousLoop({
    rootDir,
    runId: "compat-validate-integrations",
    request: "validate integrations",
    dryRun: true,
    maxLoops: 20,
  });
  const loopDir = result.loopDir;

  for (const fileName of [
    "preflight.json",
    "state.json",
    "tasks.jsonl",
    "scores.jsonl",
    "handoffs.jsonl",
    "events.jsonl",
    "side-effects.jsonl",
    "progress.md",
    "final-report.md",
  ]) {
    const info = await stat(join(loopDir, fileName));
    assert.ok(info.size > 0, `${fileName} must be non-empty`);
  }

  const state = JSON.parse(await readFile(join(loopDir, "state.json"), "utf8"));
  assert.equal(state.schema_version, 1);
  assert.equal(state.command_version, 1);
  assert.equal(state.rubric_version, 1);
  assert.equal(state.run_id, "compat-validate-integrations");
  assert.equal(state.status, "COMPLETE");
  assert.equal(state.final_acceptance.pass, true);
  assert.equal(state.claim_summary.completed, state.tasks.length);
  assert.equal(state.progress_summary.completed, state.tasks.length);
  assert.equal(state.execution_mode, "dry-run");
  assert.equal(state.commit_per_task, false);
  assert.equal(state.attempts.length, state.tasks.length);
  assert.ok(state.tool_adapter_summary.available.includes("generic-shell-stub"));
  assert.ok(state.tasks.every((task) => task.resumeNotes?.nextAction));
  assert.ok(Array.isArray(state.tasks));
  assert.ok(Array.isArray(state.scores));
  assert.ok(Array.isArray(state.handoffs));
  assert.ok(state.handoffs.every((handoff) => handoff.contextPack?.workflowSignal?.phase));
  assert.ok(state.handoffs.every((handoff) => handoff.contextPack.workflowSignal.taskId === handoff.taskId));
  assert.equal(state.preflight.request, "validate integrations");

  const tasks = (await readFile(join(loopDir, "tasks.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const scores = (await readFile(join(loopDir, "scores.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const handoffs = (await readFile(join(loopDir, "handoffs.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const events = (await readFile(join(loopDir, "events.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  const sideEffects = (await readFile(join(loopDir, "side-effects.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(tasks.every((entry) => entry.schema_version === 1));
  assert.ok(scores.every((entry) => entry.schema_version === 1));
  assert.ok(handoffs.every((entry) => entry.schema_version === 1));
  assert.equal(events[0].type, "run_started");
  assert.equal(sideEffects[0].expectedSideEffect, "dry-run-no-mutation");
});

test("status mode preserves SUPERVIBE_LOOP_STATUS compatibility fields", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-status-contract-"));
  const result = await runAutonomousLoop({
    rootDir,
    runId: "compat-status",
    request: "validate integrations",
    dryRun: true,
  });
  const status = await runAutonomousLoop({ rootDir, statusFile: join(result.loopDir, "state.json") });

  assert.match(status.statusText, /^SUPERVIBE_LOOP_STATUS/m);
  for (const field of [
    "STATUS:",
    "EXIT_SIGNAL:",
    "CONFIDENCE:",
    "NEXT_AGENT:",
    "NEXT_ACTION:",
    "STOP_REASON:",
    "POLICY_RISK:",
  ]) {
    assert.match(status.statusText, new RegExp(`^${field}`, "m"));
  }
});

test("resume migrates legacy state with pre-migration backup and keeps unknown fields", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-migration-"));
  const statePath = join(rootDir, "state.json");
  await writeFile(statePath, JSON.stringify({
    run_id: "legacy-run",
    status: "IN_PROGRESS",
    future_unknown_field: { preserved: true },
  }, null, 2), "utf8");

  const result = await resumeAutonomousLoop(statePath);
  assert.equal(result.status, "migrated");
  assert.equal(result.state.future_unknown_field.preserved, true);
  assert.equal(result.state.migration_snapshot_required, true);
  const backup = JSON.parse(await readFile(`${statePath}.pre-migration`, "utf8"));
  assert.equal(backup.run_id, "legacy-run");
  assert.equal(backup.future_unknown_field.preserved, true);
});

test("runner sizes default loop budget for plan tasks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-plan-"));
  const planPath = join(rootDir, "plan.md");
  const items = Array.from({ length: 21 }, (_, index) => `- [ ] **Step ${index + 1}: Verify local item ${index + 1}**`);
  await writeFile(planPath, `# Plan\n\n${items.join("\n")}\n`, "utf8");
  const result = await runAutonomousLoop({ rootDir, plan: planPath, dryRun: true });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.state.tasks.length, 21);
  assert.equal(result.stopReason, null);
  assert.equal(result.state.final_acceptance.score, 10);
  assert.equal(result.state.scheduler.graph_summary.complete, 21);
  assert.ok(result.state.scheduler.snapshots.length >= 1);
});

test("runner requeues a failed fresh-context attempt once and then completes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-requeue-"));
  const planPath = join(rootDir, "graph.json");
  await writeFile(planPath, JSON.stringify({
    tasks: [{
      id: "story-1",
      goal: "Repair failing story",
      acceptanceCriteria: ["Story passes"],
      verificationCommands: [],
    }],
  }, null, 2), "utf8");

  let calls = 0;
  const adapter = createShellStubAdapter({
    outputFactory() {
      calls += 1;
      if (calls === 1) return "SUPERVIBE_TASK_COMPLETE: false";
      return [
        "SUPERVIBE_TASK_COMPLETE: true",
        "SUPERVIBE_EVIDENCE_SUMMARY: repaired story passed",
        "SUPERVIBE_CHANGED_FILES: scripts/story.js",
      ].join("\n");
    },
  });

  const result = await runAutonomousLoop({
    rootDir,
    plan: planPath,
    executionMode: "fresh-context",
    adapter,
    maxTaskRetries: 1,
    maxLoops: 5,
  });

  assert.equal(result.status, "COMPLETE");
  assert.equal(result.state.attempts.length, 2);
  assert.equal(result.state.attempts[0].status, "requeued");
  assert.equal(result.state.attempts[1].status, "completed");
  assert.equal(result.state.requeue_summary.total, 1);
  assert.equal(result.state.failure_packets.length, 1);
  assert.equal(result.state.final_acceptance.pass, true);
});

test("runner creates blocked approval gate for high-risk production plan task", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-gate-"));
  const planPath = join(rootDir, "plan.md");
  await writeFile(planPath, "# Plan\n\n- [ ] **Step 1: Execute production deploy action**\n", "utf8");

  const result = await runAutonomousLoop({ rootDir, plan: planPath, dryRun: true });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.state.gates.length, 1);
  assert.equal(result.state.gates[0].type, "human");
  assert.equal(result.state.gate_summary.open, 1);
  assert.equal(result.state.tasks[0].resumeNotes.blocker, "exact_approval_lease_required");
});
