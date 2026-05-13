import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildEvidencePacket } from "../scripts/lib/supervibe-evidence-packet.mjs";
import {
  atomizePlanToWorkItems,
  writeWorkItemGraph,
} from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { buildExecutionWaves, formatWaveStatus } from "../scripts/lib/supervibe-wave-controller.mjs";
import {
  defaultWorktreeRegistryPath,
  markStaleWorktreeSessions,
  readWorktreeSessionRegistry,
  writeWorktreeSessionRegistry,
} from "../scripts/lib/supervibe-worktree-session-manager.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function budgetLimitedPlan({ maxTasksPerPhase = 5, maxChildItems = 10, taskCount = 1, parallel = false } = {}) {
  const taskRefs = Array.from({ length: taskCount }, (_, index) => `T${String(index + 1).padStart(2, "0")}`);
  const tasks = taskRefs.map((taskRef, index) => [
    `## Task ${taskRef}: Budgeted scheduler slice ${index + 1}`,
    "**Files:**",
    "- Modify: `scripts/supervibe-loop.mjs`",
    "**Acceptance Criteria:**",
    `- Scheduler budget behavior ${index + 1} is visible before execution.`,
    "```bash",
    "node --test tests/supervibe-loop-scheduler.test.mjs",
    "```",
  ].join("\n")).join("\n\n");
  return [
    "# Budget Limited Implementation Plan",
    "",
    parallel ? `Parallelizable: ${taskRefs.join(" || ")}` : "",
    "",
    "## Delivery Strategy",
    "",
    `- Task budget policy: max tasks per phase=${maxTasksPerPhase}; max child items per atomization run=${maxChildItems}; phase-split required before graph write.`,
    "",
    tasks,
    "",
  ].join("\n");
}

async function seedEvidence(root) {
  const memoryDir = join(root, ".supervibe", "memory");
  await mkdir(memoryDir, { recursive: true });
  await writeFile(join(memoryDir, "index.json"), JSON.stringify({
    schemaVersion: 2,
    entries: [
      {
        id: "rag-codegraph-preflight-policy",
        type: "decision",
        tags: ["rag", "codegraph", "project-memory", "preflight", "agents"],
        file: ".supervibe/memory/decisions/rag-codegraph-preflight-policy.md",
        confidence: 10,
      },
    ],
  }), "utf8");
  await writeFile(join(memoryDir, "code.db"), "fixture-code-index", "utf8");
}

test("assign-ready includes bounded evidence packets in worker and reviewer payloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-assign-ready-"));
  await seedEvidence(dir);
  const statePath = join(dir, "state.json");
  await writeFile(statePath, JSON.stringify({
    tasks: [{
      id: "T45a",
      goal: "Inject Evidence Packets Into Worker And Reviewer Assignments",
      status: "ready",
      category: "implementation",
      targetFiles: ["scripts/supervibe-loop.mjs"],
    }],
  }), "utf8");

  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--assign-ready",
    "--json",
    "--file",
    statePath,
  ], { cwd: dir });
  const dispatches = JSON.parse(cli.stdout);
  const [dispatch] = dispatches;

  assert.equal(dispatch.taskId, "T45a");
  assert.equal(dispatch.evidencePacket.ready, true);
  assert.ok(dispatch.evidencePacket.sourceCount <= 6);
  assert.equal(dispatch.workerAssignmentPayload.evidencePacket.packetId, dispatch.evidencePacket.packetId);
  assert.equal(dispatch.reviewerAssignmentPayload.evidencePacket.packetId, dispatch.evidencePacket.packetId);

  const explained = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--assign-ready",
    "--explain",
    "--file",
    statePath,
  ], { cwd: dir });

  assert.match(explained.stdout, /EVIDENCE_PACKET_ID: evp-/);
  assert.match(explained.stdout, /EVIDENCE_PACKET_SOURCES: 3/);
  assert.match(explained.stdout, /EVIDENCE_PACKET_TOKENS: \d+/);
  assert.match(explained.stdout, /EVIDENCE_PACKET_OMITTED: none/);
});

test("assign-ready enforces task-local verification and defers full checks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-task-local-verification-"));
  await seedEvidence(dir);
  const statePath = join(dir, "state.json");
  await writeFile(statePath, JSON.stringify({
    tasks: [{
      id: "T45",
      goal: "Enforce Task-Local Verification Policy",
      status: "ready",
      category: "implementation",
      targetFiles: ["scripts/supervibe-loop.mjs"],
      verificationCommands: [
        "node --test tests/supervibe-loop-scheduler.test.mjs",
        "npm run check",
      ],
    }],
  }), "utf8");

  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--assign-ready",
    "--json",
    "--file",
    statePath,
  ], { cwd: dir });
  const [dispatch] = JSON.parse(cli.stdout);
  assert.equal(dispatch.verificationPolicy.scope, "task-local");
  assert.equal(dispatch.reviewPolicy.mode, "final-sweep");
  assert.deepEqual(dispatch.workerAssignmentPayload.verificationCommands, ["node --test tests/supervibe-loop-scheduler.test.mjs"]);
  assert.deepEqual(dispatch.workerAssignmentPayload.deferredFullVerificationCommands, ["npm run check"]);
  assert.equal(dispatch.workerAssignmentPayload.verificationPolicy.fullSuiteAllowed, false);
  assert.equal(dispatch.reviewerAssignmentPayload.deferredUntil, "graph-release-gate");

  const explained = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--assign-ready",
    "--explain",
    "--file",
    statePath,
  ], { cwd: dir });
  assert.match(explained.stdout, /SUPERVIBE_TASK_VERIFICATION_POLICY/);
  assert.match(explained.stdout, /VERIFICATION_SCOPE: task-local/);
  assert.match(explained.stdout, /TARGETED_COMMANDS: node --test tests\/supervibe-loop-scheduler\.test\.mjs/);
  assert.match(explained.stdout, /DEFERRED_FULL_COMMANDS: npm run check/);

  const commandPlan = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "command-agent-plan.mjs"),
    "--command",
    "/supervibe-loop",
    "--host",
    "codex",
    "--intent",
    "loop",
    "--artifact-type",
    "task",
    "--stage",
    "work-item-execution",
    "--no-host-proof",
  ], {
    cwd: dir,
    env: { ...process.env, SUPERVIBE_HOST: "codex", SUPERVIBE_PLUGIN_ROOT: ROOT },
    maxBuffer: 1024 * 1024,
  });
  assert.match(commandPlan.stdout, /SUPERVIBE_COMMAND_VERIFICATION_POLICY/);
  assert.match(commandPlan.stdout, /VERIFICATION_SCOPE: task-local/);
  assert.match(commandPlan.stdout, /FULL_SUITE_ALLOWED: false/);
  assert.match(commandPlan.stdout, /normal task agents run targeted commands only/);
});

test("combined final-review sweep and completion validation does not skip completion gate", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-final-review-completion-"));
  const cliPath = join(ROOT, "scripts", "supervibe-loop.mjs");
  const graph = atomizePlanToWorkItems(`# Final Review Completion Plan

## Task T1: Task with evidence
**Files:**
- Modify: \`scripts/supervibe-loop.mjs\`
**Acceptance Criteria:**
- Combined final review and completion command reaches both gates.
\`\`\`bash
node --test tests/supervibe-loop-scheduler.test.mjs
\`\`\`
`, {
    planPath: ".supervibe/artifacts/plans/final-review-completion.md",
    epicId: "epic-final-review-completion",
    planReviewPassed: true,
  });
  const taskId = "epic-final-review-completion-t1";
  const evidence = { taskId, command: "node --test tests/supervibe-loop-scheduler.test.mjs", status: "pass" };
  graph.items = graph.items.map((item) => item.itemId === taskId
    ? { ...item, status: "complete", verificationEvidence: [evidence] }
    : item);
  graph.tasks = graph.tasks.map((task) => task.id === taskId
    ? { ...task, status: "complete", verificationEvidence: [evidence] }
    : task);
  graph.evidence = [evidence];
  const { graphPath } = await writeWorkItemGraph(graph, { rootDir: dir });

  const cli = await execFileAsync(process.execPath, [
    cliPath,
    "--record-final-review",
    taskId,
    "--reviewer-agent",
    "quality-gate-reviewer",
    "--score",
    "10",
    "--production-ready",
    "true",
    "--validate-completion",
    "--file",
    graphPath,
    "--non-production",
    "--allow-untrusted-final-review",
    "--allow-open-epic",
    "--no-auto-ui",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });

  assert.match(cli.stdout, /SUPERVIBE_FINAL_REVIEWER_SWEEP/);
  assert.match(cli.stdout, /SUPERVIBE_EPIC_COMPLETION/);
  assert.match(cli.stdout, /PASS: true/);
});

test("release full-check gate is visible and child task handoff stays targeted", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-release-full-check-"));
  const cliPath = join(ROOT, "scripts", "supervibe-loop.mjs");
  const epicId = "epic-release-gate";
  const taskId = "task-targeted";
  const graphPath = join(dir, "graph.json");
  const graph = {
    epicId,
    items: [
      { itemId: epicId, type: "epic", title: "Release Gate", status: "open" },
      {
        itemId: taskId,
        type: "task",
        title: "Targeted child task",
        status: "done",
        parentId: epicId,
        verificationEvidence: [{
          command: "node --test tests/supervibe-loop-scheduler.test.mjs",
          status: "pass",
        }],
      },
    ],
    tasks: [
      {
        id: taskId,
        title: "Targeted child task",
        status: "done",
        parentId: epicId,
      },
    ],
  };
  await writeFile(graphPath, JSON.stringify(graph, null, 2), "utf8");

  const pending = await execFileAsync(process.execPath, [
    cliPath,
    "--status",
    "--file",
    graphPath,
    "--no-auto-ui",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  assert.match(pending.stdout, /SUPERVIBE_RELEASE_FULL_CHECK_GATE/);
  assert.match(pending.stdout, /RELEASE_FULL_CHECK_GATE: pending/);
  assert.match(pending.stdout, /CHILD_TASK_REQUIRES_FULL_CHECK: false/);
  assert.match(pending.stdout, /FULL_CHECK_COMMAND: npm run check/);

  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["check:release"], "npm run check:release-strict");

  graph.items[0].verificationEvidence = [{
    command: "npm run check",
    status: "pass",
  }];
  await writeFile(graphPath, JSON.stringify(graph, null, 2), "utf8");
  const passed = await execFileAsync(process.execPath, [
    cliPath,
    "--status",
    "--file",
    graphPath,
    "--no-auto-ui",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  assert.match(passed.stdout, /RELEASE_FULL_CHECK_GATE: passed/);
  assert.match(passed.stdout, /FULL_CHECK_EVIDENCE: npm run check/);
});

test("workflow receipt drift inspect reports stale source and dry-run repair stays non-mutating", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-receipt-drift-"));
  const receiptCli = join(ROOT, "scripts", "workflow-receipt.mjs");
  const statusPath = join(ROOT, "scripts", "supervibe-status.mjs");
  const outputRel = ".supervibe/artifacts/drift/output.txt";
  const outputPath = join(dir, outputRel);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, "original\n", "utf8");

  const issue = await execFileAsync(process.execPath, [
    receiptCli,
    "issue",
    "--command",
    "/supervibe-loop",
    "--stage",
    "work-item-execution",
    "--reason",
    "drift fixture",
    "--output",
    outputRel,
    "--handoff",
    "drift-fixture",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  const receiptPath = /RECEIPT_PATH: (.+)/.exec(issue.stdout)?.[1]?.trim();
  assert.ok(receiptPath);
  await writeFile(outputPath, "changed\n", "utf8");

  let inspectError;
  try {
    await execFileAsync(process.execPath, [
      receiptCli,
      "inspect",
    ], { cwd: dir, maxBuffer: 1024 * 1024 });
  } catch (error) {
    inspectError = error;
  }
  assert.ok(inspectError);
  assert.match(inspectError.stdout, /SUPERVIBE_WORKFLOW_RECEIPT_INSPECT/);
  assert.match(inspectError.stdout, /APPLY: false/);
  assert.match(inspectError.stdout, /MUTATION: none/);
  assert.match(inspectError.stdout, /STALE: 1/);
  assert.match(inspectError.stdout, /STALE_RECEIPT: workflow-/);
  assert.match(inspectError.stdout, /DRIFT_SOURCE: \.supervibe\/artifacts\/drift\/output\.txt/);
  assert.match(inspectError.stdout, /REPAIR_REISSUE: node scripts\/workflow-receipt\.mjs reissue --receipt/);
  await stat(join(dir, receiptPath));

  let pruneError;
  try {
    await execFileAsync(process.execPath, [
      receiptCli,
      "prune-stale",
    ], { cwd: dir, maxBuffer: 1024 * 1024 });
  } catch (error) {
    pruneError = error;
  }
  assert.ok(pruneError);
  assert.match(pruneError.stdout, /SUPERVIBE_WORKFLOW_RECEIPT_PRUNE_STALE/);
  assert.match(pruneError.stdout, /APPLY: false/);
  await stat(join(dir, receiptPath));

  const fullStatus = await execFileAsync(process.execPath, [
    statusPath,
    "--no-color",
    "--no-gc-hints",
  ], {
    cwd: dir,
    env: { ...process.env, SUPERVIBE_HOST: "codex", SUPERVIBE_PLUGIN_ROOT: ROOT },
    maxBuffer: 1024 * 1024,
  });
  assert.match(fullStatus.stdout, /SUPERVIBE_WORKFLOW_RECEIPT_RECOVERY/);
  assert.match(fullStatus.stdout, /STALE: 1/);
  assert.match(fullStatus.stdout, /STALE_RECEIPT: workflow-/);
  assert.match(fullStatus.stdout, /DRIFT_SOURCE: \.supervibe\/artifacts\/drift\/output\.txt/);
  assert.match(fullStatus.stdout, /REPAIR_COMMAND: node scripts\/workflow-receipt\.mjs reissue --receipt/);
});

test("missing evidence packet blocks 10/10 execution waves", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-plan-waves-"));
  const planPath = join(dir, "plan.md");
  await writeFile(planPath, [
    "# 10/10 implementation plan",
    "",
    "## Task T45a: Inject Evidence Packets Into Worker And Reviewer Assignments",
    "- Acceptance criteria mention 10/10 execution waves.",
    "- Modify: `scripts/supervibe-loop.mjs`",
  ].join("\n"), "utf8");

  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--plan-waves",
    planPath,
  ], { cwd: dir });

  assert.match(cli.stdout, /STATUS: paused/);
  assert.match(cli.stdout, /BLOCKERS: missing-evidence-packet/);
  assert.match(cli.stdout, /EVIDENCE_PACKET_SOURCES: 0/);
  assert.match(cli.stdout, /EVIDENCE_PACKET_OMITTED: no-memory-rag-codegraph-sources/);
});

test("evidence packet helper stays bounded", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-evidence-bounds-"));
  await seedEvidence(dir);

  const packet = buildEvidencePacket({
    rootDir: dir,
    task: { id: "T45a", goal: "memory rag codegraph preflight" },
    maxSources: 2,
  });

  assert.equal(packet.ready, true);
  assert.equal(packet.sourceCount, 2);
  assert.match(packet.omittedEvidenceReason, /^bounded:/);
});

test("atomization refuses oversized graph writes with split recommendation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-budget-refusal-"));
  const planPath = join(dir, "budget-plan.md");
  const outDir = join(dir, "out");
  await writeFile(planPath, budgetLimitedPlan({ maxTasksPerPhase: 2, maxChildItems: 3, taskCount: 4, parallel: true }), "utf8");

  await assert.rejects(
    () => execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-loop.mjs"),
      "--atomize-plan",
      planPath,
      "--plan-review-passed",
      "--allow-unverified-plan-review",
      "--out",
      outDir,
    ], {
      cwd: dir,
      env: { ...process.env, SUPERVIBE_ALLOW_UNVERIFIED_PLAN_REVIEW: "1" },
      maxBuffer: 1024 * 1024,
    }),
    (error) => {
      assert.notEqual(error.code, 0);
      const output = `${error.stdout}\n${error.stderr}`;
      assert.match(output, /TASK_BUDGET_EXCEEDED/);
      assert.match(output, /VIOLATION: max-tasks-per-phase-exceeded actual=4 limit=2 phase=parallel/);
      assert.match(output, /VIOLATION: max-child-items-per-atomization-run-exceeded actual=4 limit=3/);
      assert.match(output, /PHASE_SPLIT_REQUIRED: split the plan into smaller phases/);
      assert.match(output, /NEXT_QUESTION: Which phase should be written now/);
      return true;
    },
  );
  await assert.rejects(() => stat(join(outDir, "graph.json")), /ENOENT/);
});

test("pre-loop summary shows task budget policy before execution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-budget-summary-"));
  const planPath = join(dir, "budget-plan.md");
  const graphPath = join(dir, "graph.json");
  await writeFile(planPath, budgetLimitedPlan({ maxTasksPerPhase: 5, maxChildItems: 10, taskCount: 1 }), "utf8");

  const dryRun = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--atomize-plan",
    planPath,
    "--dry-run",
    "--json",
  ], { cwd: dir });
  await writeFile(graphPath, dryRun.stdout, "utf8");

  const summary = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--pre-loop-summary",
    "--file",
    graphPath,
  ], { cwd: dir });

  assert.match(summary.stdout, /SUPERVIBE_PRE_LOOP_SUMMARY/);
  assert.match(summary.stdout, /STARTS_EXECUTION: false/);
  assert.match(summary.stdout, /TASK_BUDGET_POLICY: pass/);
  assert.match(summary.stdout, /MAX_TASKS_PER_PHASE: 5/);
  assert.match(summary.stdout, /MAX_CHILD_ITEMS_PER_ATOMIZATION_RUN: 10/);
  assert.match(summary.stdout, /PHASE_SPLIT_REQUIRED: true/);
});

test("write-set locks block unsafe assignment and expose stale recovery", async () => {
  const plan = buildExecutionWaves({
    requireWriteSet: true,
    maxConcurrency: 3,
    tasks: [
      { id: "missing-write-set", status: "open", dependencies: [], policyRiskLevel: "low" },
      { id: "locked-write-set", status: "open", dependencies: [], targetFiles: ["scripts/supervibe-loop.mjs"], policyRiskLevel: "low" },
      { id: "free-write-set", status: "open", dependencies: [], targetFiles: ["tests/free.test.mjs"], policyRiskLevel: "low" },
      { id: "conflicting-write-set", status: "open", dependencies: [], writeScope: [{ path: "tests/free.test.mjs" }], policyRiskLevel: "low" },
    ],
    writeSetLocks: [
      {
        lockId: "active-lock-1",
        taskId: "other-task",
        owner: "worker-a",
        status: "active",
        writeSet: ["scripts/supervibe-loop.mjs"],
      },
      {
        lockId: "stale-lock-1",
        taskId: "old-task",
        owner: "worker-b",
        status: "stale",
        staleAt: "2026-05-12T00:00:00.000Z",
        writeSet: ["scripts/stale.mjs"],
      },
    ],
  });
  const formatted = formatWaveStatus(plan);

  assert.ok(plan.blocked.some((item) => item.taskId === "missing-write-set" && /missing write-set/.test(item.reason)));
  assert.ok(plan.blocked.some((item) => item.taskId === "locked-write-set" && /active-lock-1/.test(item.reason)));
  assert.deepEqual(plan.currentWave.tasks, ["free-write-set"]);
  assert.ok(plan.serialized.some((item) => item.taskId === "conflicting-write-set" && /write-set conflict/.test(item.reason)));
  assert.equal(plan.writeSetLocks.stale.length, 1);
  assert.match(formatted, /STALE_WRITE_SET_LOCKS: stale-lock-1/);
  assert.match(formatted, /RECOVER_WRITE_SET_LOCKS: \/supervibe-loop --recover-stale-lock stale-lock-1/);
});

test("plan wave scheduler caps concurrency from provider manifest and explains decisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-provider-scheduler-"));
  const planPath = join(dir, "provider-plan.md");
  const taskBlocks = Array.from({ length: 8 }, (_, index) => {
    const id = `T${String(index + 1).padStart(2, "0")}`;
    return [
      `## Task ${id}: Provider limited task ${index + 1}`,
      "**Files:**",
      `- Modify: \`src/task-${index + 1}.mjs\``,
      "**Acceptance Criteria:**",
      `- ${id} is scheduled safely.`,
      "```bash",
      "node --test tests/supervibe-loop-scheduler.test.mjs",
      "```",
    ].join("\n");
  }).join("\n\n");
  await writeFile(planPath, [
    "# Provider Limited Implementation Plan",
    "",
    "## Delivery Strategy",
    "- Task budget policy: max tasks per phase=12; max child items per atomization run=80; phase-split required before graph write.",
    "",
    taskBlocks,
  ].join("\n"), "utf8");

  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--plan-waves",
    planPath,
    "--provider",
    "codex",
    "--max-concurrency",
    "10",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });

  assert.match(cli.stdout, /SUPERVIBE_SCHEDULER_POLICY/);
  assert.match(cli.stdout, /PROVIDER: codex/);
  assert.match(cli.stdout, /REQUESTED_MAX_CONCURRENCY: 10/);
  assert.match(cli.stdout, /PROVIDER_MAX_THREADS: 8/);
  assert.match(cli.stdout, /EFFECTIVE_MAX_CONCURRENCY: 8/);
  assert.match(cli.stdout, /TASK: plan-t01 DECISION: parallel/);
  assert.match(cli.stdout, /TASK: plan-t06 DECISION: parallel/);
  assert.match(cli.stdout, /TASK: plan-t07 DECISION: parallel/);
  assert.match(cli.stdout, /TASK: plan-t08 DECISION: parallel/);
});

test("agent heartbeat stall detection exposes retry and manual recovery state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-agent-stall-"));
  const cliPath = join(ROOT, "scripts", "supervibe-loop.mjs");
  const statusPath = join(ROOT, "scripts", "supervibe-status.mjs");
  const epicId = "epic-stall";
  const itemId = "t-stall";
  const graphDir = join(dir, ".supervibe", "memory", "work-items", epicId);
  const graphPath = join(graphDir, "graph.json");
  await mkdir(graphDir, { recursive: true });
  await writeFile(graphPath, JSON.stringify({
    epicId,
    items: [
      { itemId: epicId, type: "epic", title: "Stall Fixture", status: "open" },
      {
        itemId,
        type: "task",
        title: "Claimed task with heartbeat",
        status: "claimed",
        parentId: epicId,
        owner: "agent-a",
      },
    ],
    tasks: [
      {
        id: itemId,
        title: "Claimed task with heartbeat",
        status: "claimed",
        parentId: epicId,
      },
    ],
  }, null, 2), "utf8");
  await writeFile(join(dir, ".supervibe", "memory", "work-items", "index.json"), JSON.stringify({
    schemaVersion: 1,
    activeEpicId: epicId,
    activeGraphPath: ".supervibe/memory/work-items/epic-stall/graph.json",
    updatedAt: "2026-05-13T00:00:00.000Z",
    epics: {
      [epicId]: {
        epicId,
        graphId: epicId,
        title: "Stall Fixture",
        graphPath: ".supervibe/memory/work-items/epic-stall/graph.json",
        status: "active",
        totalTasks: 1,
        ready: 0,
        blocked: 0,
        claimed: 1,
        deferred: 0,
        review: 0,
        done: 0,
      },
    },
  }, null, 2), "utf8");

  const heartbeat = await execFileAsync(process.execPath, [
    cliPath,
    "--heartbeat",
    itemId,
    "--file",
    graphPath,
    "--owner",
    "agent-a",
    "--host-invocation-id",
    "codex-stall-1",
    "--now",
    "2026-05-13T00:00:00.000Z",
    "--progress-signature",
    "rev1",
    "--no-auto-ui",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  assert.match(heartbeat.stdout, /SUPERVIBE_AGENT_HEARTBEAT/);
  assert.match(heartbeat.stdout, /HOST_INVOCATION_ID: codex-stall-1/);

  const stallCheck = await execFileAsync(process.execPath, [
    cliPath,
    "--stall-check",
    "--file",
    graphPath,
    "--now",
    "2026-05-13T00:30:00.000Z",
    "--stale-after-minutes",
    "10",
    "--max-stall-retries",
    "1",
    "--no-auto-ui",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  assert.match(stallCheck.stdout, /SUPERVIBE_AGENT_STALL_CHECK/);
  assert.match(stallCheck.stdout, /STALLED: 1/);
  assert.match(stallCheck.stdout, /RETRYABLE: 1/);
  assert.match(stallCheck.stdout, /MANUAL_INTERVENTION: 0/);
  assert.match(stallCheck.stdout, /RECOVERY: \/supervibe-loop --recover-stalled t-stall/);

  const loopStatus = await execFileAsync(process.execPath, [
    cliPath,
    "--status",
    "--file",
    graphPath,
    "--no-auto-ui",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  assert.match(loopStatus.stdout, /STALLED: 1/);
  assert.match(loopStatus.stdout, /RETRYABLE_STALLED: 1/);
  assert.match(loopStatus.stdout, /MANUAL_INTERVENTION: 0/);
  assert.match(loopStatus.stdout, /STALL_RECOVERY_COMMAND: \/supervibe-loop --recover-stalled <item-id>/);

  const fullStatus = await execFileAsync(process.execPath, [
    statusPath,
    "--no-color",
    "--no-gc-hints",
  ], {
    cwd: dir,
    env: { ...process.env, SUPERVIBE_HOST: "codex", SUPERVIBE_PLUGIN_ROOT: ROOT },
    maxBuffer: 1024 * 1024,
  });
  assert.match(fullStatus.stdout, /SUPERVIBE_ACTIVE_WORK_GRAPH/);
  assert.match(fullStatus.stdout, /STALLED: 1/);
  assert.match(fullStatus.stdout, /RETRYABLE_STALLED: 1/);
  assert.match(fullStatus.stdout, /STALL_RECOVERY_COMMAND: \/supervibe-loop --recover-stalled <item-id>/);

  const recovery = await execFileAsync(process.execPath, [
    cliPath,
    "--recover-stalled",
    itemId,
    "--file",
    graphPath,
    "--owner",
    "agent-a",
    "--now",
    "2026-05-13T00:31:00.000Z",
    "--no-auto-ui",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  assert.match(recovery.stdout, /SUPERVIBE_AGENT_STALL_RECOVERY/);
  assert.match(recovery.stdout, /RECOVERED: true/);

  const recoveredStatus = await execFileAsync(process.execPath, [
    cliPath,
    "--status",
    "--file",
    graphPath,
    "--no-auto-ui",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  assert.match(recoveredStatus.stdout, /STALLED: 0/);
  assert.match(recoveredStatus.stdout, /READY: 1/);
});

test("assign-ready payloads carry write-set locks before worker dispatch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-assign-ready-writeset-"));
  await seedEvidence(dir);
  const statePath = join(dir, "state.json");
  await writeFile(statePath, JSON.stringify({
    tasks: [
      {
        id: "with-write-set",
        goal: "Safe parallel assignment",
        status: "ready",
        category: "implementation",
        targetFiles: ["scripts/supervibe-loop.mjs"],
      },
      {
        id: "missing-write-set",
        goal: "Unsafe unscoped assignment",
        status: "ready",
        category: "implementation",
      },
    ],
  }), "utf8");

  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--assign-ready",
    "--json",
    "--file",
    statePath,
  ], { cwd: dir });
  const dispatches = JSON.parse(cli.stdout);
  const assigned = dispatches.find((dispatch) => dispatch.taskId === "with-write-set");
  const blocked = dispatches.find((dispatch) => dispatch.taskId === "missing-write-set");

  assert.deepEqual(assigned.writeSet, ["scripts/supervibe-loop.mjs"]);
  assert.equal(assigned.writeSetLock.taskId, "with-write-set");
  assert.deepEqual(assigned.workerAssignmentPayload.writeSet, ["scripts/supervibe-loop.mjs"]);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.assignmentBlocked, true);
  assert.match(blocked.blockedReason, /missing write-set declaration/);
  assert.equal(blocked.workerAssignmentPayload, null);
});

test("worktree sessions record owner and write-set scope with stale recovery status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-worktree-owner-"));
  const cliPath = join(ROOT, "scripts", "supervibe-loop.mjs");
  const statusPath = join(ROOT, "scripts", "supervibe-status.mjs");
  await writeFile(join(dir, ".gitignore"), ".worktrees/\n", "utf8");

  await execFileAsync(process.execPath, [
    cliPath,
    "--worktree",
    "--epic",
    "EPIC-T48",
    "--session-id",
    "session-t48-a",
    "--owner",
    "agent-a",
    "--assigned-task",
    "T48",
    "--assigned-write-set",
    "scripts/supervibe-loop.mjs",
    "--max-loops",
    "1",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });

  const registryPath = defaultWorktreeRegistryPath(dir);
  let registry = await readWorktreeSessionRegistry(registryPath);
  const ownerSession = registry.sessions.find((session) => session.sessionId === "session-t48-a");
  assert.equal(ownerSession.owner, "agent-a");
  assert.deepEqual(ownerSession.assignedTaskIds, ["T48"]);
  assert.deepEqual(ownerSession.assignedWriteSet, ["scripts/supervibe-loop.mjs"]);
  assert.match(ownerSession.branchName, /EPIC-T48/);
  assert.match(ownerSession.worktreePath.replace(/\\/g, "/"), /\.worktrees/);

  await assert.rejects(
    () => execFileAsync(process.execPath, [
      cliPath,
      "--worktree",
      "--epic",
      "EPIC-T48",
      "--session-id",
      "session-t48-blocked",
      "--owner",
      "agent-b",
      "--assigned-task",
      "T49",
      "--assigned-write-set",
      "scripts/supervibe-loop.mjs",
      "--max-loops",
      "1",
    ], { cwd: dir, maxBuffer: 1024 * 1024 }),
    /Worktree session conflict/,
  );

  await execFileAsync(process.execPath, [
    cliPath,
    "--worktree",
    "--epic",
    "EPIC-T48",
    "--session-id",
    "session-t48-override",
    "--owner",
    "agent-b",
    "--assigned-task",
    "T49",
    "--assigned-write-set",
    "scripts/supervibe-loop.mjs",
    "--allow-session-conflict",
    "--override-reason",
    "manual serialized recovery",
    "--max-loops",
    "1",
  ], { cwd: dir, maxBuffer: 1024 * 1024 });

  registry = await readWorktreeSessionRegistry(registryPath);
  const overrideSession = registry.sessions.find((session) => session.sessionId === "session-t48-override");
  assert.equal(overrideSession.conflictOverride.allowed, true);
  assert.equal(overrideSession.conflictOverride.reason, "manual serialized recovery");
  assert.ok(overrideSession.conflictOverride.conflicts.some((conflict) => conflict.reasons.includes("overlapping-write-set")));

  const stale = markStaleWorktreeSessions(registry, {
    now: "2030-01-01T00:00:00.000Z",
    ttlMinutes: 1,
  });
  await writeWorktreeSessionRegistry(registryPath, stale);

  const worktreeStatus = await execFileAsync(process.execPath, [
    cliPath,
    "--worktree-status",
    "--file",
    registryPath,
  ], { cwd: dir, maxBuffer: 1024 * 1024 });
  assert.match(worktreeStatus.stdout, /SUPERVIBE_WORKTREE_SESSIONS/);
  assert.match(worktreeStatus.stdout, /session-t48-a .*owner=agent-a .*heartbeat=/);
  assert.match(worktreeStatus.stdout, /STALE_RECOVERY: session-t48-a owner=agent-a .*command=\/supervibe-loop --resume-session session-t48-a/);

  const fullStatus = await execFileAsync(process.execPath, [
    statusPath,
    "--no-color",
    "--no-gc-hints",
  ], {
    cwd: dir,
    env: { ...process.env, SUPERVIBE_HOST: "codex", SUPERVIBE_PLUGIN_ROOT: ROOT },
    maxBuffer: 1024 * 1024,
  });
  assert.match(fullStatus.stdout, /SUPERVIBE_WORKTREE_SESSIONS/);
  assert.match(fullStatus.stdout, /session-t48-a .*owner=agent-a/);
  assert.match(fullStatus.stdout, /STALE_RECOVERY: session-t48-a owner=agent-a/);
});

test("atomization records semantic epic grouping for large related plans", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-semantic-epics-"));
  const planPath = join(dir, "large-plan.md");
  const areas = [
    { key: "ui", title: "Supervibe UI", file: "scripts/lib/supervibe-ui-server.mjs", terms: ["Loop run tab", "Kanban board", "Work items panel"] },
    { key: "memory", title: "Memory", file: "scripts/lib/project-memory-store.mjs", terms: ["Memory graph", "decision recall", "linked evidence"] },
    { key: "rag", title: "RAG", file: "scripts/lib/code-store.mjs", terms: ["Code RAG", "retrieval golden query", "chunk metadata"] },
    { key: "codegraph", title: "CodeGraph", file: "scripts/lib/supervibe-codegraph-ui-map.mjs", terms: ["CodeGraph map", "symbol edge", "graph coverage"] },
    { key: "loop", title: "Loop scheduler", file: "scripts/supervibe-loop.mjs", terms: ["agent concurrency", "claim lease", "execution wave"] },
    { key: "provider", title: "Provider configs", file: "scripts/lib/supervibe-provider-config-doctor.mjs", terms: ["Codex config", "provider preset", "subagent limit"] },
  ];
  const lines = ["# Large Supervibe Implementation Plan", ""];
  let taskNumber = 1;
  for (const area of areas) {
    for (let index = 0; index < 20; index += 1) {
      const term = area.terms[index % area.terms.length];
      lines.push(
        `## Task T${taskNumber}: ${area.title} ${term} hardening ${index + 1}`,
        "**Files:**",
        `- Modify: \`${area.file}\``,
        "**Acceptance Criteria:**",
        `- ${area.title} ${term} behavior is complete and verified.`,
        "```bash",
        "node --test tests/supervibe-loop-scheduler.test.mjs",
        "```",
        "",
      );
      taskNumber += 1;
    }
  }
  await writeFile(planPath, lines.join("\n"), "utf8");

  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--atomize-plan",
    planPath,
    "--dry-run",
    "--json",
  ], { cwd: dir, maxBuffer: 1024 * 1024 * 8 });
  const graph = JSON.parse(cli.stdout);
  const semanticEpics = graph.metadata?.semanticEpics || [];
  const childItems = graph.items.filter((item) => !["epic", "gate", "followup"].includes(item.type));
  const groupedTaskIds = new Set(semanticEpics.flatMap((epic) => epic.taskIds || []));

  assert.equal(childItems.length, 120);
  assert.ok(semanticEpics.length > 1, "large plans should produce multiple semantic epic groups");
  assert.ok(semanticEpics.length < childItems.length, "large plans must not create one epic per task");
  assert.ok(semanticEpics.length <= 12, `expected bounded semantic epic count, got ${semanticEpics.length}`);
  assert.equal(groupedTaskIds.size, childItems.length);
  assert.equal(semanticEpics.every((epic) => epic.groupingReason && epic.confidence >= 0.65), true);
  assert.ok(semanticEpics.some((epic) => epic.semanticKey === "rag" && epic.taskIds.length >= 15));
  assert.ok(semanticEpics.some((epic) => epic.semanticKey === "codegraph" && epic.taskIds.length >= 15));
});
