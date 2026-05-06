import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  forkAutonomousLoopCheckpoint,
  recordUserGoalAcceptance,
  resumeAutonomousLoop,
  runAutonomousLoop,
} from "../scripts/lib/autonomous-loop-runner.mjs";
import { createShellStubAdapter } from "../scripts/lib/autonomous-loop-tool-adapters.mjs";

const execFileAsync = promisify(execFile);

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
  assert.equal(state.user_goal_acceptance.required, false);
  assert.equal(state.user_goal_acceptance.status, "not-required");
  assert.equal(state.system_acceptance.pass, true);
  assert.equal(state.scope_value_guard.mvp_protection, true);
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

test("runner can require user goal acceptance before final completion", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-user-acceptance-"));
  const result = await runAutonomousLoop({
    rootDir,
    request: "validate integrations",
    dryRun: true,
    requireUserAcceptance: true,
  });
  assert.equal(result.status, "AWAITING_USER_ACCEPTANCE");
  assert.equal(result.stopReason, "user_goal_acceptance_required");
  assert.equal(result.state.system_acceptance.pass, true);
  assert.equal(result.state.final_acceptance.pass, false);
  assert.equal(result.state.user_goal_acceptance.required, true);
  assert.equal(result.state.user_goal_acceptance.status, "pending");

  const statePath = join(result.loopDir, "state.json");
  const accepted = await recordUserGoalAcceptance(statePath, {
    accepted: true,
    acceptedBy: "product-owner",
    now: "2026-05-07T00:00:00.000Z",
  });
  assert.equal(accepted.status, "COMPLETE");
  assert.equal(accepted.stop_reason, null);
  assert.equal(accepted.final_acceptance.pass, true);
  assert.equal(accepted.user_goal_acceptance.accepted_by, "product-owner");

  const rejected = await recordUserGoalAcceptance(statePath, {
    accepted: false,
    acceptedBy: "product-owner",
    feedback: "Need another checkout edge case",
    now: "2026-05-07T00:05:00.000Z",
  });
  assert.equal(rejected.status, "REPLAN_REQUIRED");
  assert.equal(rejected.stop_reason, "user_goal_acceptance_rejected");

  const fork = await forkAutonomousLoopCheckpoint(statePath, {
    reason: "Need another checkout edge case",
    now: "2026-05-07T00:10:00.000Z",
  });
  assert.equal(fork.state.status, "REPLAN_REQUIRED");
  assert.equal(fork.state.forked_from.run_id, result.runId);
  assert.equal(fork.state.checkpoint_policy.user_can_change_direction, true);
  assert.match(fork.path, /state\.replan-/);
});

test("loop CLI records goal acceptance and forks checkpoints", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-user-cli-"));
  const result = await runAutonomousLoop({
    rootDir,
    request: "validate integrations",
    dryRun: true,
    requireUserAcceptance: true,
  });
  const cliPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
  const statePath = join(result.loopDir, "state.json");

  const accepted = await execFileAsync(process.execPath, [
    cliPath,
    "--accept-goals",
    "--file",
    statePath,
    "--accepted-by",
    "cli-user",
  ], { cwd: rootDir });
  assert.match(accepted.stdout, /SUPERVIBE_LOOP_USER_GOAL_ACCEPTANCE/);
  assert.match(accepted.stdout, /USER_GOAL_ACCEPTANCE: approved/);

  const acceptedState = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(acceptedState.status, "COMPLETE");
  assert.equal(acceptedState.user_goal_acceptance.accepted_by, "cli-user");

  await execFileAsync(process.execPath, [
    cliPath,
    "--reject-goals",
    "--file",
    statePath,
    "--feedback",
    "Need stronger validation",
  ], { cwd: rootDir });

  const fork = await execFileAsync(process.execPath, [
    cliPath,
    "--fork-checkpoint",
    "--file",
    statePath,
    "--reason",
    "Need stronger validation",
  ], { cwd: rootDir });
  assert.match(fork.stdout, /SUPERVIBE_LOOP_CHECKPOINT_FORK/);
  assert.match(fork.stdout, /STATUS: REPLAN_REQUIRED/);
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
  assert.equal(result.state.preflight.run_until, "goal-complete");
  assert.equal(result.state.preflight.max_loops, null);
  assert.equal(result.state.preflight.max_runtime_minutes, null);
  assert.equal(result.state.budget_remaining.loops, null);
  assert.equal(result.state.budget_remaining.runtimeMinutes, null);
  assert.equal(result.state.final_acceptance.score, 10);
  assert.equal(result.state.scheduler.graph_summary.complete, 21);
  assert.ok(result.state.scheduler.snapshots.length >= 1);
});

test("runner requeues a failed fresh-context attempt once and then awaits user acceptance", async () => {
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

  assert.equal(result.status, "AWAITING_USER_ACCEPTANCE");
  assert.equal(result.state.attempts.length, 2);
  assert.equal(result.state.attempts[0].status, "requeued");
  assert.equal(result.state.attempts[1].status, "completed");
  assert.equal(result.state.requeue_summary.total, 1);
  assert.equal(result.state.failure_packets.length, 1);
  assert.equal(result.state.system_acceptance.pass, true);
  assert.equal(result.state.final_acceptance.pass, false);
  assert.equal(result.state.user_goal_acceptance.required, true);
  assert.equal(result.state.user_goal_acceptance.status, "pending");
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
