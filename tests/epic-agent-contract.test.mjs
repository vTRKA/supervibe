import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";

import { issueWorkflowInvocationReceipt } from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";
import { atomizePlanToWorkItems, writeWorkItemGraph } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { validateEpicAgentContract } from "../scripts/lib/supervibe-epic-agent-contract.mjs";

const PLAN = `# Agent Contract Plan

## Task 1: Build graph-backed workflow
**Files:**
- Modify: \`scripts/supervibe-loop.mjs\`
**Scope IDs:** A029
**Requirement IDs:** REQ-EPIC-AGENT
**Contract rows touched:** C-EPIC, C-AGENT
**Estimated time:** 20min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if receipt trust cannot be verified.
**Acceptance Criteria:**
- Durable graph has a trusted agent receipt.
\`\`\`bash
npm run validate:work-item-graphs
\`\`\`
`;

const BUDGETED_ATOMIC_PLAN = `# Budgeted Atomic Plan

## Delivery Strategy

- MVP production slice: strict graph atomization.
- User value: users see scoped task batches before execution.
- Anti-bloat boundary: no oversized graph writes without a budget decision.
- Task budget policy: max tasks per phase=4; max child items per atomization run=4; phase-split required before graph write when either limit is exceeded.
- Phase model: graph, review, release.
- Production target: graph writes stay reversible.

## Atomic Task Inventory

| ID | Work item |
|----|-----------|
| A001 | Add budget helper. |
| A002 | Wire budget report. |
| A003 | Reject oversized graph. |
| A004 | Show split prompt. |

## Task 1: Budget work
**Files:**
- Modify: \`scripts/lib/supervibe-plan-to-work-items.mjs\`
**Scope IDs:** A001, A002, A003, A004
**Requirement IDs:** REQ-BUDGET
**Contract rows touched:** C-PLAN, C-EPIC
**Estimated time:** 20min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if budget cannot be enforced before graph write.
**Acceptance Criteria:**
- Oversized graph writes are blocked.
\`\`\`bash
node --test tests/epic-agent-contract.test.mjs
\`\`\`
`;

test("plan atomization adds an epic-agent receipt contract for durable reviewed graphs", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/agent-contract.md",
    epicId: "epic-agent-contract",
    planReviewPassed: true,
  });

  assert.equal(graph.metadata.epicAgentContract.required, true);
  assert.equal(graph.metadata.epicAgentContract.trust, "runtime-issued-host-agent-receipt");
  assert.ok(graph.metadata.epicAgentContract.allowedAgentIds.includes("stack-developer"));
});

test("plan atomization adds task, reviewer, and evidence score fields to work items and loop tasks", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/agent-contract.md",
    epicId: "epic-agent-contract",
    planReviewPassed: true,
  });
  const taskItem = graph.items.find((item) => item.itemId === "epic-agent-contract-t1");
  const loopTask = graph.tasks.find((task) => task.id === "epic-agent-contract-t1");

  for (const field of ["taskScore", "reviewerScore", "evidenceScore"]) {
    assert.equal(taskItem[field].schemaVersion, 1);
    assert.equal(taskItem[field].score, null);
    assert.equal(taskItem[field].status, "pending");
    assert.equal(loopTask[field].schemaVersion, 1);
  }
});

test("plan atomization records task budget limits and counts", () => {
  const graph = atomizePlanToWorkItems(BUDGETED_ATOMIC_PLAN, {
    planPath: ".supervibe/artifacts/plans/budgeted.md",
    epicId: "epic-budgeted",
    planReviewPassed: true,
  });

  const budget = graph.metadata.taskBudgetPolicy.report;
  assert.equal(budget.pass, true);
  assert.equal(budget.policy.maxTasksPerPhase, 4);
  assert.equal(budget.policy.maxChildItemsPerAtomizationRun, 4);
  assert.equal(budget.totals.childItems, 4);
  assert.equal(budget.totals.largestPhase.count, 4);
});

test("task budget policy blocks graph writes before phase split decision", async () => {
  const root = await mkdtemp(join(tmpdir(), "task-budget-policy-"));
  try {
    const graph = atomizePlanToWorkItems(BUDGETED_ATOMIC_PLAN, {
      planPath: ".supervibe/artifacts/plans/budgeted.md",
      epicId: "epic-budgeted",
      planReviewPassed: true,
      taskBudgetPolicy: {
        maxTasksPerPhase: 2,
        maxChildItemsPerAtomizationRun: 3,
        hasExplicitPolicy: true,
        hasPhaseSplitRule: true,
      },
    });

    assert.equal(graph.validation.valid, false);
    assert.ok(graph.validation.issues.some((issue) => issue.code === "task-budget-exceeded"));
    assert.match(graph.metadata.taskBudgetPolicy.report.prompt, /TASK_BUDGET_EXCEEDED/);
    assert.match(graph.metadata.taskBudgetPolicy.report.prompt, /NEXT_QUESTION/);

    await assert.rejects(
      () => writeWorkItemGraph(graph, { rootDir: root }),
      /TASK_BUDGET_EXCEEDED/,
    );
    await assert.rejects(
      () => writeWorkItemGraph(graph, { rootDir: root, allowInvalidGraph: true }),
      /TASK_BUDGET_EXCEEDED/,
    );
    await assert.rejects(
      () => stat(join(root, ".supervibe", "memory", "work-items", "epic-budgeted", "graph.json")),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dry-run atomization records the contract but does not require a receipt", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/agent-contract.md",
    epicId: "epic-agent-contract",
    planReviewPassed: false,
    dryRun: true,
  });

  assert.equal(graph.metadata.epicAgentContract.required, false);
  assert.deepEqual(validateEpicAgentContract({ graph }).issues, []);
});

test("epic-agent contract rejects durable graph without a trusted host-agent receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "epic-agent-contract-missing-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/agent-contract.md",
      epicId: "epic-agent-contract",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: root });
    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const report = validateEpicAgentContract({ rootDir: root, graph: saved, graphPath });

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "missing-epic-agent-receipt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("epic-agent contract accepts a runtime-issued trusted agent receipt bound to graph.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "epic-agent-contract-trusted-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/agent-contract.md",
      epicId: "epic-agent-contract",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: root });
    await writeInvocation(root, {
      agentId: "stack-developer",
      invocationId: "stack-agent-1",
      outputRel: ".supervibe/artifacts/_agent-outputs/stack-agent-1/agent-output.json",
    });
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "agent",
      subjectId: "stack-developer",
      agentId: "stack-developer",
      stage: "work-item-atomization",
      invocationReason: "create durable epic/task graph",
      outputArtifacts: [relative(root, graphPath).replace(/\\/g, "/")],
      startedAt: "2026-05-12T00:00:00.000Z",
      completedAt: "2026-05-12T00:01:00.000Z",
      handoffId: "epic-agent-contract",
      hostInvocation: {
        source: "agent-invocations-jsonl",
        invocationId: "stack-agent-1",
      },
    });

    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const report = validateEpicAgentContract({ rootDir: root, graph: saved, graphPath });

    assert.equal(report.pass, true);
    assert.equal(report.trustedReceipts.length, 1);
    assert.equal(report.trustedReceipts[0].agentId, "stack-developer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("epic-agent contract rejects recovery receipts as producer proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "epic-agent-contract-recovery-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/agent-contract.md",
      epicId: "epic-agent-contract",
      planReviewPassed: true,
    });
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: root });
    await writeInvocation(root, {
      agentId: "stack-developer",
      invocationId: "stack-agent-recovery",
      outputRel: ".supervibe/artifacts/_agent-outputs/stack-agent-recovery/agent-output.json",
    });
    const issued = await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "agent",
      subjectId: "stack-developer",
      agentId: "stack-developer",
      stage: "work-item-atomization",
      invocationReason: "create durable epic/task graph",
      outputArtifacts: [relative(root, graphPath).replace(/\\/g, "/")],
      startedAt: "2026-05-12T00:00:00.000Z",
      completedAt: "2026-05-12T00:01:00.000Z",
      handoffId: "epic-agent-contract",
      hostInvocation: {
        source: "agent-invocations-jsonl",
        invocationId: "stack-agent-recovery",
      },
    });

    const receiptPath = join(root, ...issued.receiptPath.split("/"));
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.recovery = { reason: "reissued stale receipt" };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    const saved = JSON.parse(await readFile(graphPath, "utf8"));
    const report = validateEpicAgentContract({ rootDir: root, graph: saved, graphPath });

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "missing-epic-agent-receipt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeInvocation(root, { agentId, invocationId, outputRel }) {
  await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
  await mkdir(dirname(join(root, outputRel)), { recursive: true });
  await writeFile(join(root, outputRel), `${JSON.stringify({ ok: true })}\n`, "utf8");
  await appendFile(join(root, ".supervibe", "memory", "agent-invocations.jsonl"), `${JSON.stringify({
    schemaVersion: 1,
    invocation_id: invocationId,
    agent_id: agentId,
    task_summary: "create durable epic/task graph",
    host: "codex",
    host_invocation_source: "codex-spawn-agent",
    status: "completed",
    structured_output: { json: outputRel },
  })}\n`, "utf8");
}
