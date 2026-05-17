import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  applyWorkItemAdapter,
  atomizePlanToWorkItems,
  createWorkItemGraph,
  createWorkflowReceiptPolicy,
  createNativeWorkItemAdapter,
  createWorkItemPreview,
  parsePlanForWorkItems,
  validateWorkItemGraph,
  WORKFLOW_EVIDENCE_MODES,
  WORK_ITEM_REQUIRED_FIELDS,
  WORK_ITEM_TYPES,
  workItemsToLoopTasks,
  writeWorkItemGraph,
} from "../scripts/lib/supervibe-plan-to-work-items.mjs";

const execFileAsync = promisify(execFile);
const TRUSTED_PRODUCER_PROOF = Object.freeze({
  hostInvocationSource: "codex-spawn-agent",
  hostInvocationId: "codex-graph-builder-test",
});

async function writeTestHostInvocation(rootDir, invocationId = TRUSTED_PRODUCER_PROOF.hostInvocationId, agentId = "work-item-graph-builder", options = {}) {
  if (agentId && typeof agentId === "object") {
    options = agentId;
    agentId = options.agentId || "work-item-graph-builder";
  }
  const graph = options.graph || null;
  const graphId = options.graphId || graph?.epicId || "epic-payment";
  const outputArtifacts = options.outputArtifacts || [options.outputArtifact || `.supervibe/memory/work-items/${graphId}/graph.json`];
  const memoryDir = join(rootDir, ".supervibe", "memory");
  await mkdir(memoryDir, { recursive: true });
  const record = {
    schemaVersion: 1,
    ts: "2026-05-17T00:00:00.000Z",
    invocation_id: invocationId,
    host_invocation_id: invocationId,
    host_invocation_source: options.hostInvocationSource || "codex-spawn-agent",
    agent_id: agentId,
    subject_id: agentId,
    subject_type: options.subjectType || "agent",
    host: "codex",
    status: options.status || "completed",
    task_summary: "test graph producer proof",
    confidence_score: 9,
    command: options.command || "/supervibe-loop",
    stage: options.stage || "work-item-atomization",
    handoff_id: options.handoffId || graph?.metadata?.graphProducerProof?.handoffId || graphId,
    output_artifacts: outputArtifacts,
  };
  await writeFile(join(memoryDir, "agent-invocations.jsonl"), JSON.stringify(record) + "\n", "utf8");
}

function expectedPlanEpicId(planPath) {
  const titleSlug = "payment-flow-implementation-plan";
  const hash = createHash("sha1").update(String(planPath).replace(/\\/g, "/")).digest("hex").slice(0, 6);
  return `epic-${titleSlug}-${hash}`;
}


const PLAN = `# Payment Flow Implementation Plan

Critical path: T1 -> T2 -> T3
Parallelizable: T4 || T5

## Development Contract Map

| ID | Contract | Required details | Owner | Verification |
|----|----------|------------------|-------|--------------|
| C-BEH | Behavior contract | Payment behavior and invariants | payments | unit tests |
| C-DATA | Data and schema contract | Payment schema and migration | payments | schema tests |
| C-API | API and event contract | Endpoint and idempotency | payments | integration tests |
| C-OBS | Observability contract | Metrics, logs, and alerts | ops | metric assertion |

## Scope Safety Gate

- Approved scope baseline: payment schema, API, and final review.
- Deferred scope: external provider replay remains deferred.

## Production Readiness

- Test: unit and integration suites pass.
- Security: payment permissions are reviewed.
- Observability: metrics and logs are emitted.
- Rollback: route rollback is documented.

## Final 10/10 Acceptance Gate

- 10/10 acceptance: all tasks complete.
- Verification: commands pass.
- No open blockers: blockers are closed.
- Contract coverage: all touched contract rows are covered.

## Task 1: Foundation schema
**Files:**
- Create: \`src/schema.ts\`
**Scope IDs:** S1
**Requirement IDs:** REQ1
**Contract rows touched:** C-BEH, C-DATA
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if schema requires external production data.
**Acceptance Criteria:**
- Schema validates payment records.
\`\`\`bash
npm test -- schema.test.ts
\`\`\`

## Task 2: API implementation
**Files:**
- Modify: \`src/api.ts\`
**Scope IDs:** S2
**Requirement IDs:** REQ2
**Contract rows touched:** C-API, C-OBS
**Estimated time:** 30min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if API compatibility changes without approval.
**Acceptance Criteria:**
- API returns idempotent responses.
\`\`\`bash
npm test -- api.test.ts
\`\`\`

### REVIEW GATE 1

## Task 3: Final review
**Files:**
- Test: \`tests/payment.test.ts\`
**Scope IDs:** S3
**Requirement IDs:** REQ3
**Contract rows touched:** C-BEH, C-OBS
**Rollback:** git revert <sha>
**Stop conditions:** stop if release checks cannot run.
**Acceptance Criteria:**
- Full payment suite is green.
\`\`\`bash
npm test -- payment.test.ts
\`\`\`
- Follow-up: add external provider replay fixture.
`;

const INVALID_PLAN_WITHOUT_TASKS = `# Empty Reviewed Implementation Plan

This reviewed plan has narrative text but no parseable task sections.
`;

const PLAN_WITH_STEPS = `# Step Expansion Implementation Plan

Critical path: T1 -> T2

## Development Contract Map

| ID | Contract | Required details | Owner | Verification |
|----|----------|------------------|-------|--------------|
| C-BEH | Behavior contract | Step expansion behavior | runtime | unit tests |

## Scope Safety Gate

- Approved scope baseline: parser step expansion.

## Production Readiness

- Test: unit tests pass.

## Final 10/10 Acceptance Gate

- 10/10 acceptance: all steps become work items.
- Verification: commands pass.

## Task T01: Parse steps
**Files:**
- Modify: \`scripts/lib/supervibe-plan-to-work-items.mjs\`
**Scope IDs:** S1
**Requirement IDs:** REQ1
**Contract rows touched:** C-BEH
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if parser loses parent tasks.
**Acceptance Criteria:**
- Parent task and checkbox steps are present.
- [ ] **Step 1: Write failing test**
\`\`\`bash
node --test tests/supervibe-plan-to-work-items.test.mjs
\`\`\`
- [ ] **Step 2: Implement parser**
\`\`\`bash
node --test tests/supervibe-plan-to-work-items.test.mjs
\`\`\`

## Task T02: Verify expansion
**Files:**
- Test: \`tests/supervibe-plan-to-work-items.test.mjs\`
**Scope IDs:** S2
**Requirement IDs:** REQ2
**Contract rows touched:** C-BEH
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if graph validation fails.
**Acceptance Criteria:**
- Step subtasks keep verification commands.
- [ ] **Step 1: Run verification**
\`\`\`bash
node --test tests/supervibe-plan-to-work-items.test.mjs
\`\`\`
`;

const PLAN_WITH_SUFFIX_TASKS = `# Suffix Task Implementation Plan

Critical path: T55 -> T55A -> T55B -> T56

## Delivery Strategy

- Task budget policy: maxTasksPerPhase=10; maxChildItemsPerAtomizationRun=80; phase-split required before graph write.

## Task T55: Build provider doctor
**Files:**
- Modify: \`scripts/provider.mjs\`
**Scope IDs:** S1
**Requirement IDs:** REQ1
**Contract rows touched:** C-BEH
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if provider docs are missing.
**Acceptance Criteria:**
- Provider doctor exists.
- [ ] **Step 1: Verify provider doctor**
\`\`\`bash
node --test tests/provider.test.mjs
\`\`\`

## Task T55A: Add provider power presets
**Files:**
- Modify: \`scripts/provider-presets.mjs\`
**Scope IDs:** S2
**Requirement IDs:** REQ2
**Contract rows touched:** C-BEH
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if configs would write silently.
**Acceptance Criteria:**
- Presets are preview-only.
- [ ] **Step 1: Verify presets**
\`\`\`bash
node --test tests/provider.test.mjs
\`\`\`

## Task T55B: Add lifecycle guard
**Files:**
- Modify: \`scripts/lifecycle.mjs\`
**Scope IDs:** S3
**Requirement IDs:** REQ3
**Contract rows touched:** C-BEH
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if old plans cannot be classified.
**Acceptance Criteria:**
- Old plans are not active sources.
- [ ] **Step 1: Verify lifecycle**
\`\`\`bash
node --test tests/lifecycle.test.mjs
\`\`\`

## Task T56: Final proof
**Files:**
- Modify: \`scripts/proof.mjs\`
**Scope IDs:** S4
**Requirement IDs:** REQ4
**Contract rows touched:** C-BEH
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if strict readiness is false.
**Acceptance Criteria:**
- Final proof is strict.
- [ ] **Step 1: Verify proof**
\`\`\`bash
node --test tests/proof.test.mjs
\`\`\`
`;

function buildLargeReviewedPlanWithSteps({ taskCount = 30, stepsPerTask = 3 } = {}) {
  const tasks = [];
  for (let index = 1; index <= taskCount; index += 1) {
    const padded = String(index).padStart(2, "0");
    const steps = Array.from({ length: stepsPerTask }, (_, stepIndex) => {
      const stepNumber = stepIndex + 1;
      return [
        `- [ ] **Step ${stepNumber}: Execute slice ${padded}.${stepNumber}**`,
        "```bash",
        "node --test tests/supervibe-plan-to-work-items.test.mjs",
        "```",
      ].join("\n");
    }).join("\n");
    tasks.push(`## Task T${padded}: Implement slice ${padded}
**Files:**
- Modify: \`src/slice-${padded}.ts\`
**Scope IDs:** S${padded}
**Requirement IDs:** REQ${padded}
**Contract rows touched:** C-BEH
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if verification fails.
**Acceptance Criteria:**
- Slice ${padded} is implemented.
${steps}`);
  }
  return `# Large Step Collapse Implementation Plan

## Delivery Strategy

- Task budget policy: maxTasksPerPhase=10; maxChildItemsPerAtomizationRun=80; phase-split required before graph write.

${tasks.join("\n\n")}`;
}

const PLAN_WITH_ATOMIC_INVENTORY = `# Atomic Inventory Implementation Plan

Critical path: T1 -> T2

## Atomic Task Inventory

| ID | Work item |
|----|-----------|
| A001 | Add active workflow state schema. |
| A002 | Persist active workflow state. |
| A003 | Add continuation routing. |
| A004 | Add status preview. |

## Scope Safety Gate

- Approved scope baseline: atomic inventory coverage.

## Production Readiness

- Test: unit tests pass.

## Final 10/10 Acceptance Gate

- 10/10 acceptance: every A-row is visible as a child work item.
- Verification: commands pass.

## Task T1: Workflow state
**Files:**
- Create: \`scripts/lib/state.mjs\`
**Scope IDs:** A001, A002
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Acceptance Criteria:**
- State rows are implemented.
\`\`\`bash
node --test tests/state.test.mjs
\`\`\`

## Task T2: Routing and status
**Files:**
- Modify: \`scripts/router.mjs\`
**Scope IDs:** A003, A004
**Estimated time:** 15min, confidence: high
**Rollback:** git revert <sha>
**Acceptance Criteria:**
- Routing rows are implemented.
\`\`\`bash
node --test tests/router.test.mjs
\`\`\`
`;

test("plan parser extracts tasks, critical path, parallel groups, and review gates", () => {
  assert.ok(WORK_ITEM_TYPES.includes("epic"));
  assert.ok(WORK_ITEM_REQUIRED_FIELDS.includes("verificationCommands"));
  const parsed = parsePlanForWorkItems(PLAN, ".supervibe/artifacts/plans/payment.md");
  assert.equal(parsed.title, "Payment Flow Implementation Plan");
  assert.equal(parsed.tasks.length, 3);
  assert.deepEqual(parsed.criticalPath, ["T1", "T2", "T3"]);
  assert.equal(parsed.parallelGroups.get("T4"), "parallel");
  assert.equal(parsed.reviewGates.length, 1);
});

test("atomization creates one epic, child tasks, blocker edges, gates, and followups", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });

  assert.equal(graph.epicId, "epic-payment");
  assert.equal(graph.items.filter((item) => item.type === "epic").length, 1);
  assert.ok(graph.items.some((item) => item.type === "gate"));
  assert.ok(graph.items.some((item) => item.type === "followup"));
  assert.equal(graph.validation.valid, true);

  const t1 = graph.items.find((item) => item.itemId === "epic-payment-t1");
  const t2 = graph.items.find((item) => item.itemId === "epic-payment-t2");
  assert.ok(t1.blocks.includes(t2.itemId));
  assert.ok(t2.acceptanceCriteria.some((item) => /idempotent/.test(item)));
  assert.ok(t2.verificationCommands.includes("npm test -- api.test.ts"));
  assert.ok(t2.deferredVerificationCommands.includes("npm test -- api.test.ts"));
  assert.equal(t2.verificationPolicy.mode, "final-only-release-verification");
  assert.equal(t2.verificationPolicy.developmentTestsAllowed, false);
  assert.equal(t2.verificationPolicy.developmentValidatorsAllowed, false);
  assert.equal(t2.executionHints.testsDeferredUntil, "release-handoff");
  assert.deepEqual(t2.writeScope, [{ action: "modify", path: "src/api.ts" }]);
  assert.deepEqual(t2.executionHints.scopeIds, ["S2"]);
  assert.deepEqual(t2.executionHints.requirementIds, ["REQ2"]);
  assert.ok(t2.contractChecklist.includes("C-API"));
  assert.ok(t2.productionReadinessChecklist.some((item) => /Observability/.test(item)));
  assert.ok(t2.tenOfTenChecklist.some((item) => /Contract coverage/.test(item)));
});

test("plan parser extracts inline file scopes and final gates block on prior tasks", () => {
  const graph = atomizePlanToWorkItems(`# Inline Scope Plan

## Task T001: Skill foundation
**Files:** Create: \`docs/skill-anatomy.md\`; Create: \`references/templates/skill-template.md\`; Modify: \`docs/supervibe-workflow-hardening.md\`; Test: \`tests/skill-template-quality.test.mjs\`
**Acceptance Criteria:**
- Inline file scope is parsed.

## Task T002: Independent workflow policy
**Files required:** Create: \`docs/workflow-command-policy.md\`; Modify: \`.supervibe/artifacts/evidence/t016-workflow-policy-proposed-links.md\`
**Acceptance Criteria:**
- Inline files required scope is parsed.

## Task T028: Final self-review 10/10 gate
**Files:** Test: \`tests/final-gate.test.mjs\`
**Acceptance Criteria:**
- Final gate waits for all executable siblings.
`, {
    planPath: ".supervibe/artifacts/plans/inline-scope.md",
    epicId: "epic-inline-scope",
    planReviewPassed: true,
  });

  const t001 = graph.items.find((item) => item.itemId === "epic-inline-scope-t001");
  const t002 = graph.items.find((item) => item.itemId === "epic-inline-scope-t002");
  const t028 = graph.items.find((item) => item.itemId === "epic-inline-scope-t028");

  assert.deepEqual(t001.writeScope.map((entry) => `${entry.action}:${entry.path}`), [
    "create:docs/skill-anatomy.md",
    "create:references/templates/skill-template.md",
    "modify:docs/supervibe-workflow-hardening.md",
    "test:tests/skill-template-quality.test.mjs",
  ]);
  assert.deepEqual(t002.writeScope.map((entry) => `${entry.action}:${entry.path}`), [
    "create:docs/workflow-command-policy.md",
    "modify:.supervibe/artifacts/evidence/t016-workflow-policy-proposed-links.md",
  ]);
  assert.ok(t028.blockedBy.includes(t001.itemId));
  assert.ok(t028.blockedBy.includes(t002.itemId));
});

test("atomization expands checkbox steps into subtask work items", () => {
  const graph = atomizePlanToWorkItems(PLAN_WITH_STEPS, {
    planPath: ".supervibe/artifacts/plans/steps.md",
    epicId: "epic-steps",
    planReviewPassed: true,
  });

  const parent = graph.items.find((item) => item.itemId === "epic-steps-t01");
  const stepOne = graph.items.find((item) => item.itemId === "epic-steps-t01-s1");
  const stepTwo = graph.items.find((item) => item.itemId === "epic-steps-t01-s2");
  const secondParent = graph.items.find((item) => item.itemId === "epic-steps-t02");
  const secondStep = graph.items.find((item) => item.itemId === "epic-steps-t02-s1");

  assert.equal(graph.validation.valid, true);
  assert.equal(graph.items.filter((item) => item.type === "subtask").length, 3);
  assert.ok(parent.blocks.includes(stepOne.itemId));
  assert.ok(stepOne.blocks.includes(stepTwo.itemId));
  assert.deepEqual(stepOne.blockedBy, [parent.itemId]);
  assert.equal(stepOne.parentId, parent.itemId);
  assert.equal(stepOne.discoveredFrom.type, "plan-step");
  assert.equal(stepOne.executionHints.parentTaskRef, "T01");
  assert.ok(stepOne.verificationCommands.includes("node --test tests/supervibe-plan-to-work-items.test.mjs"));
  assert.ok(stepOne.deferredVerificationCommands.includes("node --test tests/supervibe-plan-to-work-items.test.mjs"));
  assert.equal(stepOne.verificationPolicy.testsDeferredUntil, "release-handoff");
  assert.ok(secondParent.blocks.includes(secondStep.itemId));
});

test("atomization keeps suffix task ids distinct", () => {
  const graph = atomizePlanToWorkItems(PLAN_WITH_SUFFIX_TASKS, {
    planPath: ".supervibe/artifacts/plans/suffix.md",
    epicId: "epic-suffix",
    planReviewPassed: true,
  });

  assert.equal(graph.validation.valid, true);
  assert.ok(graph.items.some((item) => item.itemId === "epic-suffix-t55"));
  assert.ok(graph.items.some((item) => item.itemId === "epic-suffix-t55a"));
  assert.ok(graph.items.some((item) => item.itemId === "epic-suffix-t55b"));
  assert.ok(graph.items.some((item) => item.itemId === "epic-suffix-t56"));

  const ids = graph.items.map((item) => item.itemId);
  assert.equal(new Set(ids).size, ids.length);
  const t55 = graph.items.find((item) => item.itemId === "epic-suffix-t55");
  const t55a = graph.items.find((item) => item.itemId === "epic-suffix-t55a");
  const t55b = graph.items.find((item) => item.itemId === "epic-suffix-t55b");
  assert.ok(t55.blocks.includes(t55a.itemId));
  assert.ok(t55a.blocks.includes(t55b.itemId));
});

test("atomization keeps phase-scoped dotted task ids distinct", () => {
  const graph = atomizePlanToWorkItems(`# Phase Dotted Implementation Plan

Critical path: P1.1 -> P1.2 -> P2.1

## Phase 1 - One Next Action Engine

### Task P1.1 - Canonical State Inventory
**Acceptance Criteria:**
- Inventory is complete.

### Task P1.2 - Blocker Priority Model
**Acceptance Criteria:**
- Priority model is deterministic.

## Phase 2 - Thin Facade

### Task P2.1 - Facade Contract
**Acceptance Criteria:**
- Contract is documented.
`, {
    planPath: ".supervibe/artifacts/plans/phase-dotted.md",
    epicId: "epic-phase-dotted",
    planReviewPassed: true,
  });

  assert.equal(graph.validation.valid, true);
  assert.ok(graph.items.some((item) => item.itemId === "epic-phase-dotted-p1-1"));
  assert.ok(graph.items.some((item) => item.itemId === "epic-phase-dotted-p1-2"));
  assert.ok(graph.items.some((item) => item.itemId === "epic-phase-dotted-p2-1"));
  assert.equal(graph.items.find((item) => item.itemId === "epic-phase-dotted-p1-1").title, "Canonical State Inventory");

  const ids = graph.items.map((item) => item.itemId);
  assert.equal(new Set(ids).size, ids.length);
});

test("atomization collapses plan steps when expansion would exceed child item budget", () => {
  const plan = buildLargeReviewedPlanWithSteps({ taskCount: 30, stepsPerTask: 3 });
  const graph = atomizePlanToWorkItems(plan, {
    planPath: ".supervibe/artifacts/plans/large.md",
    epicId: "epic-large",
    planReviewPassed: true,
  });

  assert.equal(graph.validation.valid, true);
  assert.equal(graph.items.filter((item) => item.type === "subtask").length, 0);
  assert.equal(graph.items.filter((item) => item.type === "task").length, 30);
  assert.equal(graph.metadata.taskBudgetPolicy.report.pass, true);

  const firstTask = graph.items.find((item) => item.itemId === "epic-large-t01");
  assert.equal(firstTask.executionHints.planStepsCollapsed, true);
  assert.equal(firstTask.executionHints.planStepCount, 3);
  assert.ok(firstTask.acceptanceCriteria.some((item) => /Complete plan step 1/.test(item)));
});

test("atomization expands Atomic Task Inventory rows into visible child work items", () => {
  const graph = atomizePlanToWorkItems(PLAN_WITH_ATOMIC_INVENTORY, {
    planPath: ".supervibe/artifacts/plans/atomic.md",
    epicId: "epic-atomic",
    planReviewPassed: true,
  });

  assert.equal(graph.validation.valid, true);
  assert.deepEqual(graph.metadata.atomicInventoryIds, ["A001", "A002", "A003", "A004"]);
  assert.equal(graph.items.some((item) => item.itemId === "epic-atomic-t1"), false);

  const atomicItems = graph.items.filter((item) => item.executionHints?.sourceAtomicId);
  assert.equal(atomicItems.length, 4);
  assert.ok(atomicItems.some((item) => item.itemId === "epic-atomic-a001"));
  assert.ok(atomicItems.some((item) => item.itemId === "epic-atomic-a004"));

  const a001 = graph.items.find((item) => item.itemId === "epic-atomic-a001");
  const a002 = graph.items.find((item) => item.itemId === "epic-atomic-a002");
  const a003 = graph.items.find((item) => item.itemId === "epic-atomic-a003");
  assert.equal(a001.executionHints.parentTaskRef, "T1");
  assert.equal(a003.executionHints.parentTaskRef, "T2");
  assert.ok(a001.blocks.includes(a002.itemId));
  assert.ok(a002.blocks.includes(a003.itemId));
  assert.deepEqual(a001.writeScope, [{ action: "create", path: "scripts/lib/state.mjs" }]);

  const preview = createWorkItemPreview(graph, graph.validation);
  assert.match(preview, /epic-atomic-a004: \[task\] A004: Add status preview\./);
  assert.match(preview, /ITEMS_DETAIL_TRUNCATED: 0/);
});

test("validation rejects missing Atomic Task Inventory coverage", () => {
  const graph = atomizePlanToWorkItems(PLAN_WITH_ATOMIC_INVENTORY, {
    planPath: ".supervibe/artifacts/plans/atomic.md",
    epicId: "epic-atomic",
    planReviewPassed: true,
  });
  graph.items = graph.items.filter((item) => item.itemId !== "epic-atomic-a003");
  graph.tasks = workItemsToLoopTasks(graph.items);

  const validation = validateWorkItemGraph(graph);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "missing-atomic-inventory-item" && issue.atomicId === "A003"));
});

test("work item graph converts into runner-compatible loop tasks", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });
  const tasks = workItemsToLoopTasks(graph.items);
  const apiTask = tasks.find((task) => task.id === "epic-payment-t2");

  assert.equal(tasks.some((task) => task.type === "epic"), false);
  assert.equal(apiTask.epicId, "epic-payment");
  assert.deepEqual(apiTask.dependencies, ["epic-payment-t1"]);
  assert.ok(apiTask.deferredVerificationCommands.includes("npm test -- api.test.ts"));
  assert.equal(apiTask.verificationPolicy.mode, "final-only-release-verification");
  assert.equal(apiTask.testsDeferredUntil, "release-handoff");
  assert.equal(apiTask.writeScope[0].path, "src/api.ts");
});

test("work item preview exposes editable scope details before approval", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });
  const preview = createWorkItemPreview(graph, graph.validation);

  assert.match(preview, /SCOPE_EDIT_HINT: .*exclude, defer, split, or reprioritize/);
  assert.match(preview, /ITEMS_DETAIL:/);
  assert.match(preview, /epic-payment-t1: \[task\] Foundation schema/);
  assert.match(preview, /scope=create:src\/schema\.ts/);
  assert.match(preview, /epic-payment-gate-1: \[gate\] REVIEW GATE 1/);
});

test("validation rejects unknown blockers", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });
  graph.items[1].blocks.push("missing");
  const validation = validateWorkItemGraph(graph);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "unknown-block"));
});

test("createWorkItemGraph exposes task graph projection", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment",
    planReviewPassed: true,
  });
  const projected = createWorkItemGraph({
    epicId: graph.epicId,
    planPath: ".supervibe/artifacts/plans/payment.md",
    title: graph.title,
    items: graph.items,
  });
  assert.equal(projected.tasks.some((task) => task.id === "epic-payment-t1"), true);
});

test("native write and external adapter failure preserve native graph", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-work-items-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment",
      planReviewPassed: true,
      ...TRUSTED_PRODUCER_PROOF,
    });
    await writeTestHostInvocation(temp, TRUSTED_PRODUCER_PROOF.hostInvocationId, "work-item-graph-builder", { graph, outputArtifacts: [".supervibe/memory/work-items/epic-payment/graph.json", "native/graph.json"] });
    const writeResult = await writeWorkItemGraph(graph, { rootDir: temp });
    const saved = JSON.parse(await readFile(writeResult.graphPath, "utf8"));
    assert.equal(saved.kind, "supervibe-work-item-graph");

    const adapter = {
      id: "failing",
      async createGraph() {
        throw new Error("tracker unavailable");
      },
    };
    const result = await applyWorkItemAdapter(graph, adapter, { rootDir: temp });
    assert.equal(result.ok, false);
    assert.equal(result.nativeResult.graphPath.endsWith("graph.json"), true);

    const nativeAdapter = createNativeWorkItemAdapter({ rootDir: temp, outDir: join(temp, "native") });
    const nativeResult = await nativeAdapter.createGraph(graph);
    assert.equal(nativeResult.ok, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("atomization records source plan hash without writing snapshot files by default", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-work-items-source-plan-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment",
      planReviewPassed: true,
      ...TRUSTED_PRODUCER_PROOF,
    });
    const expectedHash = createHash("sha256").update(PLAN).digest("hex");

    assert.equal(graph.source.sha256, expectedHash);
    assert.equal(graph.source.snapshotPath, null);
    assert.equal(graph.metadata.sourcePlanSnapshot.sha256, expectedHash);
    assert.equal(graph.metadata.sourcePlanSnapshot.storedPath, null);
    assert.equal("content" in graph.metadata.sourcePlanSnapshot, false);

    await writeTestHostInvocation(temp, TRUSTED_PRODUCER_PROOF.hostInvocationId, "work-item-graph-builder", { graph });
    const writeResult = await writeWorkItemGraph(graph, { rootDir: temp });
    const saved = JSON.parse(await readFile(writeResult.graphPath, "utf8"));

    await assert.rejects(() => access(join(writeResult.outDir, "source-plan.md")), /ENOENT/);
    await assert.rejects(() => access(join(writeResult.outDir, "preview.txt")), /ENOENT/);
    assert.equal(saved.source.snapshotPath, null);
    assert.equal(saved.metadata.sourcePlanSnapshot.sha256, expectedHash);
    assert.equal(saved.metadata.sourcePlanSnapshot.storedPath, null);
    assert.equal("content" in saved.metadata.sourcePlanSnapshot, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("plan-review-passed alone keeps fast-session receipts deferred", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment-reviewed-fast",
    planReviewPassed: true,
  });

  assert.equal(graph.metadata.planReviewPassed, true);
  assert.equal(graph.metadata.workflowEvidenceMode, "fast-session");
  assert.equal(graph.metadata.receiptPolicy.graphProducerProof.required, false);
  assert.equal(graph.metadata.receiptPolicy.releaseProofRequiredAt, "release-handoff");
  assert.equal(graph.metadata.graphProducerProof.required, false);
  assert.equal(graph.metadata.epicAgentContract.required, false);
});

test("fast-session atomization keeps source snapshots hash-only and receipts deferred", () => {
  const graph = atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/payment.md",
    epicId: "epic-payment-fast",
    workflowEvidenceMode: WORKFLOW_EVIDENCE_MODES.FAST_SESSION,
  });

  const expectedHash = createHash("sha256").update(PLAN).digest("hex");
  assert.equal(graph.metadata.workflowEvidenceMode, "fast-session");
  assert.equal(graph.metadata.receiptPolicy.startupReceiptsRequired, false);
  assert.equal(graph.metadata.receiptPolicy.releaseProofRequiredAt, "release-handoff");
  assert.equal(graph.metadata.graphProducerProof.required, false);
  assert.equal(graph.metadata.epicAgentContract.required, false);
  assert.equal(graph.metadata.sourcePlanSnapshot.sha256, expectedHash);
  assert.equal(graph.metadata.sourcePlanSnapshot.storedPath, null);
  assert.equal(graph.metadata.sourcePlanSnapshot.contentLength, Buffer.byteLength(PLAN, "utf8"));
  assert.equal("content" in graph.metadata.sourcePlanSnapshot, false);
});

test("release-proof receipt policy requires startup and graph proof immediately", () => {
  const policy = createWorkflowReceiptPolicy({
    workflowEvidenceMode: WORKFLOW_EVIDENCE_MODES.RELEASE_PROOF,
  });

  assert.equal(policy.mode, "release-proof");
  assert.equal(policy.activeDevelopment, false);
  assert.equal(policy.startupReceiptsRequired, true);
  assert.equal(policy.releaseProofRequiredAt, "now");
  assert.equal(policy.graphProducerProof.required, true);
  assert.equal(policy.dispatchWaveReceipt.required, true);
  assert.equal(policy.graphProducerProof.trust, "runtime-issued-host-agent-receipt");
});


test("release-proof graph writes require trusted host invocation proof", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-release-proof-host-proof-"));
  try {
    const untrustedGraph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment-untrusted",
      workflowEvidenceMode: WORKFLOW_EVIDENCE_MODES.RELEASE_PROOF,
      writeSourcePlan: true,
    });

    await assert.rejects(
      () => writeWorkItemGraph(untrustedGraph, { rootDir: temp, writeSourcePlan: true }),
      /untrusted release-proof graph producer proof: .*hostInvocation/,
    );

    const traceEvidencePath = ".supervibe/memory/fake-host-trace.json";
    await mkdir(join(temp, ".supervibe", "memory"), { recursive: true });
    await writeFile(join(temp, ".supervibe", "memory", "fake-host-trace.json"), JSON.stringify({
      invocation_id: "codex-trace-only",
      agent_id: "work-item-graph-builder",
      status: "completed",
    }) + "\n", "utf8");
    const traceOnlyGraph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment-trace-only",
      workflowEvidenceMode: WORKFLOW_EVIDENCE_MODES.RELEASE_PROOF,
      hostInvocationSource: "host-trace-file",
      hostInvocationId: "codex-trace-only",
      hostInvocationEvidence: traceEvidencePath,
    });
    await assert.rejects(
      () => writeWorkItemGraph(traceOnlyGraph, { rootDir: temp, writeSourcePlan: true }),
      /untrusted release-proof graph producer proof: .*host-invocation-(?:command|stage|handoff|output)-mismatch/,
    );

    const trustedGraph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment-trusted",
      workflowEvidenceMode: WORKFLOW_EVIDENCE_MODES.RELEASE_PROOF,
      writeSourcePlan: true,
      ...TRUSTED_PRODUCER_PROOF,
    });
    await writeTestHostInvocation(temp, TRUSTED_PRODUCER_PROOF.hostInvocationId, "work-item-graph-builder", { graph: trustedGraph });
    const writeResult = await writeWorkItemGraph(trustedGraph, { rootDir: temp, writeSourcePlan: true });
    const saved = JSON.parse(await readFile(writeResult.graphPath, "utf8"));
    assert.equal(saved.metadata.graphProducerProof.hostInvocation.source, "codex-spawn-agent");
    assert.equal(saved.metadata.graphProducerProof.hostInvocation.invocationId, "codex-graph-builder-test");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("source plan and preview snapshots are opt-in write artifacts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-work-items-source-plan-write-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment",
      planReviewPassed: true,
      writeSourcePlan: true,
      ...TRUSTED_PRODUCER_PROOF,
    });
    const expectedHash = createHash("sha256").update(PLAN).digest("hex");

    await writeTestHostInvocation(temp, TRUSTED_PRODUCER_PROOF.hostInvocationId, "work-item-graph-builder", { graph });
    const writeResult = await writeWorkItemGraph(graph, {
      rootDir: temp,
      writePreview: true,
      writeSourcePlan: true,
    });
    const saved = JSON.parse(await readFile(writeResult.graphPath, "utf8"));
    const snapshot = await readFile(join(writeResult.outDir, "source-plan.md"), "utf8");
    const preview = await readFile(join(writeResult.outDir, "preview.txt"), "utf8");

    assert.equal(snapshot, PLAN);
    assert.match(preview, /SUPERVIBE_WORK_ITEMS_PREVIEW/);
    assert.equal(saved.source.snapshotPath, "source-plan.md");
    assert.equal(saved.metadata.sourcePlanSnapshot.sha256, expectedHash);
    assert.equal(saved.metadata.sourcePlanSnapshot.storedPath, "source-plan.md");
    assert.equal(saved.metadata.sourcePlanSnapshot.contentLength, Buffer.byteLength(PLAN, "utf8"));
    assert.equal("content" in saved.metadata.sourcePlanSnapshot, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});


test("source plan snapshot path cannot escape graph output directory", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-source-plan-traversal-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment-traversal",
      planReviewPassed: true,
      writeSourcePlan: true,
      ...TRUSTED_PRODUCER_PROOF,
    });
    graph.metadata.sourcePlanSnapshot.storedPath = "../outside.md";

    await assert.rejects(
      () => writeWorkItemGraph(graph, { rootDir: temp, writeSourcePlan: true }),
      /sourcePlanSnapshot\.storedPath cannot contain path traversal segments/,
    );
    await assert.rejects(
      () => access(join(temp, ".supervibe", "memory", "work-items", "outside.md")),
      /ENOENT/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("reviewed plans without parseable tasks cannot be durably written", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-invalid-work-items-"));
  try {
    const graph = atomizePlanToWorkItems(INVALID_PLAN_WITHOUT_TASKS, {
      planPath: ".supervibe/artifacts/plans/invalid.md",
      epicId: "epic-invalid",
      planReviewPassed: true,
    });

    assert.equal(graph.validation.valid, false);
    assert.ok(graph.validation.issues.some((issue) => issue.code === "missing-child-task"));

    await assert.rejects(
      () => writeWorkItemGraph(graph, { rootDir: temp }),
      /invalid work-item graph/i,
    );
    await assert.rejects(
      () => stat(join(temp, ".supervibe", "memory", "work-items", "epic-invalid", "graph.json")),
      /ENOENT/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI atomizes a reviewed plan into graph artifacts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-cli-"));
  try {
    const planPath = join(temp, "plan.md");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(planPath, PLAN);
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--atomize-plan",
      planPath,
      "--plan-review-passed",
      "--allow-unverified-plan-review",
      "--out",
      join(temp, "out"),
    ], { cwd: temp, env: { ...process.env, SUPERVIBE_ALLOW_UNVERIFIED_PLAN_REVIEW: "1" } });

    assert.match(stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(stdout, /VALID: true/);
    assert.match(stdout, /EVIDENCE_MODE: fast-session/);
    assert.match(stdout, /TRACKER_STATUS: skipped-fast-session/);
    const saved = JSON.parse(await readFile(join(temp, "out", "graph.json"), "utf8"));
    assert.equal(saved.kind, "supervibe-work-item-graph");
    assert.equal(saved.metadata.workflowEvidenceMode, "fast-session");
    assert.equal(saved.metadata.receiptPolicy.graphProducerProof.required, false);
    await assert.rejects(() => access(join(temp, ".supervibe", "memory", "loops", "task-tracker-map.json")), /ENOENT/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI atomizes a user-approved plan with review deferred to final gate", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-user-approved-cli-"));
  try {
    const planPath = join(temp, "plan.md");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(planPath, PLAN);
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--atomize-plan",
      planPath,
      "--user-approved-plan",
      "--out",
      join(temp, "out"),
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(stdout, /PLAN_REVIEW_STATUS: deferred-to-final-gate/);
    const saved = JSON.parse(await readFile(join(temp, "out", "graph.json"), "utf8"));
    assert.equal(saved.metadata.planReviewPassed, false);
    assert.equal(saved.metadata.planReviewDeferred, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI fast-start writes graph without tracker sync or startup receipts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-fast-start-cli-"));
  try {
    const planPath = join(temp, "plan.md");
    const outDir = join(temp, "out");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(planPath, PLAN);
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--from-plan",
      planPath,
      "--start",
      "--out",
      outDir,
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(stdout, /EVIDENCE_MODE: fast-session/);
    assert.match(stdout, /RECEIPTS_NOW: not-required/);
    assert.match(stdout, /RELEASE_PROOF_REQUIRED_AT: release-handoff/);
    assert.match(stdout, /SUPERVIBE_FAST_START_READY_QUEUE/);
    assert.match(stdout, /TRACKER_STATUS: skipped-fast-session/);
    const saved = JSON.parse(await readFile(join(outDir, "graph.json"), "utf8"));
    assert.equal(saved.metadata.workflowEvidenceMode, "fast-session");
    assert.equal(saved.metadata.receiptPolicy.graphProducerProof.required, false);
    assert.equal("content" in saved.metadata.sourcePlanSnapshot, false);
    await assert.rejects(() => access(join(outDir, "source-plan.md")), /ENOENT/);
    await assert.rejects(() => access(join(temp, ".supervibe", "memory", "loops", "task-tracker-map.json")), /ENOENT/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI release-proof start emits required receipts and durable proof artifacts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-release-proof-cli-"));
  try {
    const planPath = join(temp, "plan.md");
    const outDir = join(temp, "out");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(planPath, PLAN);
    const graphId = expectedPlanEpicId(planPath);
    await writeTestHostInvocation(temp, "codex-graph-builder-cli", "work-item-graph-builder", { graphId, outputArtifact: "out/graph.json" });
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--from-plan", planPath,
      "--start",
      "--release-proof",
      "--host-invocation-source", "codex-spawn-agent",
      "--host-invocation-id", "codex-graph-builder-cli",
      "--out", outDir,
      "--no-auto-ui",
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(stdout, /EVIDENCE_MODE: release-proof/);
    assert.match(stdout, /RECEIPTS_NOW: required/);
    assert.match(stdout, /RELEASE_PROOF_REQUIRED_AT: now/);
    assert.match(stdout, /PREVIEW: .*preview\.txt/);
    assert.match(stdout, /SOURCE_PLAN: .*source-plan\.md/);
    assert.match(stdout, /TRACKER_STATUS: synced/);
    const saved = JSON.parse(await readFile(join(outDir, "graph.json"), "utf8"));
    assert.equal(saved.metadata.workflowEvidenceMode, "release-proof");
    assert.equal(saved.metadata.receiptPolicy.startupReceiptsRequired, true);
    assert.equal(saved.metadata.receiptPolicy.graphProducerProof.required, true);
    assert.equal(saved.metadata.epicAgentContract.required, true);
    assert.equal(saved.metadata.sourcePlanSnapshot.storedPath, "source-plan.md");
    assert.equal(saved.metadata.sourcePlanSnapshot.contentLength, Buffer.byteLength(PLAN, "utf8"));
    assert.equal(saved.metadata.graphProducerProof.hostInvocation.invocationId, "codex-graph-builder-cli");
    await stat(join(outDir, "preview.txt"));
    await stat(join(outDir, "source-plan.md"));
    await stat(join(temp, ".supervibe", "memory", "loops", "task-tracker-map.json"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI upgrades fast-session graph to release-proof artifacts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-release-upgrade-cli-"));
  try {
    const planPath = join(temp, "plan.md");
    const outDir = join(temp, "out");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(planPath, PLAN);
    await execFileAsync(process.execPath, [
      scriptPath,
      "--from-plan", planPath,
      "--start",
      "--fast-session",
      "--out", outDir,
      "--no-auto-ui",
    ], { cwd: temp });

    const graphId = expectedPlanEpicId(planPath);
    await writeTestHostInvocation(temp, "codex-graph-upgrade-cli", "work-item-graph-builder", { graphId, outputArtifact: "out/graph.json" });
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--upgrade-release-proof",
      "--file", join(outDir, "graph.json"),
      "--host-invocation-source", "codex-spawn-agent",
      "--host-invocation-id", "codex-graph-upgrade-cli",
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_RELEASE_PROOF_UPGRADE/);
    assert.match(stdout, /EVIDENCE_MODE: release-proof/);
    assert.match(stdout, /RECEIPTS_NOW: required/);
    assert.match(stdout, /SOURCE_PLAN: .*source-plan\.md/);
    assert.match(stdout, /PREVIEW: .*preview\.txt/);
    const saved = JSON.parse(await readFile(join(outDir, "graph.json"), "utf8"));
    assert.equal(saved.metadata.workflowEvidenceMode, "release-proof");
    assert.equal(saved.metadata.receiptPolicy.startupReceiptsRequired, true);
    assert.equal(saved.metadata.epicAgentContract.required, true);
    assert.equal(saved.metadata.sourcePlanSnapshot.storedPath, "source-plan.md");
    assert.equal(saved.metadata.graphProducerProof.hostInvocation.invocationId, "codex-graph-upgrade-cli");
    await stat(join(outDir, "source-plan.md"));
    await stat(join(outDir, "preview.txt"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});


test("release-proof upgrade refuses source plan paths outside project root", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-release-upgrade-source-traversal-"));
  try {
    const planPath = join(temp, "plan.md");
    const outDir = join(temp, "out");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(planPath, PLAN);
    await execFileAsync(process.execPath, [
      scriptPath,
      "--from-plan", planPath,
      "--start",
      "--fast-session",
      "--out", outDir,
      "--no-auto-ui",
    ], { cwd: temp });
    const graphPath = join(outDir, "graph.json");
    const graph = JSON.parse(await readFile(graphPath, "utf8"));
    graph.metadata.sourcePlanSnapshot = { ...(graph.metadata.sourcePlanSnapshot || {}), path: "../outside.md", storedPath: null };
    graph.source = { ...(graph.source || {}), path: "../outside.md", snapshotPath: null };
    await writeFile(graphPath, JSON.stringify(graph, null, 2) + "\n", "utf8");
    const graphId = expectedPlanEpicId(planPath);
    await writeTestHostInvocation(temp, "codex-graph-upgrade-traversal", "work-item-graph-builder", { graphId, outputArtifact: "out/graph.json" });

    await assert.rejects(
      () => execFileAsync(process.execPath, [
        scriptPath,
        "--upgrade-release-proof",
        "--file", graphPath,
        "--host-invocation-source", "codex-spawn-agent",
        "--host-invocation-id", "codex-graph-upgrade-traversal",
      ], { cwd: temp }),
      /sourcePlanSnapshot\.path cannot contain path traversal segments/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI dispatch apply writes fast-session wave receipt as diagnostic-only", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-dispatch-receipt-"));
  try {
    const graphPath = join(temp, "graph.json");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(graphPath, JSON.stringify({
      kind: "supervibe-work-item-graph",
      graph_id: "epic-dispatch-receipt",
      epicId: "epic-dispatch-receipt",
      title: "Dispatch Receipt",
      metadata: {
        workflowEvidenceMode: "fast-session",
        receiptPolicy: {
          startupReceiptsRequired: false,
          releaseProofRequiredAt: "release-handoff",
          legacyReceipts: { status: "diagnostic-only" },
        },
      },
      items: [
        { itemId: "epic-dispatch-receipt", type: "epic", status: "open", title: "Dispatch Receipt" },
        { itemId: "T-ready", type: "task", status: "open", title: "Ready task", writeScope: ["scripts/smoke.mjs"], acceptanceCriteria: ["done"] },
      ],
      tasks: [
        { id: "T-ready", type: "task", status: "open", title: "Ready task", writeScope: ["scripts/smoke.mjs"] },
      ],
    }, null, 2));

    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--dispatch-wave",
      "--apply",
      "--file",
      graphPath,
      "--max-concurrency",
      "1",
      "--wave-id",
      "test-wave",
    ], { cwd: temp, env: { ...process.env, SUPERVIBE_PLUGIN_ROOT: process.cwd() } });

    assert.match(stdout, /SUPERVIBE_DISPATCH_WAVE/);
    assert.match(stdout, /ASSIGNED: T-ready/);
    assert.match(stdout, /FAST_SESSION_RECEIPT: .*test-wave.fast-session.json/);
    assert.match(stdout, /FAST_SESSION_RECEIPT_TRUST: diagnostic-only-until-release-proof/);

    const receipt = JSON.parse(await readFile(join(temp, "dispatch-waves", "test-wave.fast-session.json"), "utf8"));
    assert.equal(receipt.kind, "supervibe-fast-session-dispatch-wave-receipt");
    assert.equal(receipt.mode, "fast-session");
    assert.equal(receipt.trust, "diagnostic-only-until-release-proof");
    assert.deepEqual(receipt.cannotProve, ["delegated-specialist-completion", "release-readiness", "final-validation"]);
    assert.equal(receipt.bindings[0].workItemId, "T-ready");
    assert.equal(receipt.bindings[0].hostId, "codex");
    assert.ok(receipt.bindings[0].agentId);
    assert.ok(receipt.bindings[0].invocationId);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI only writes preview and source-plan artifacts when requested", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-preview-cli-"));
  try {
    const planPath = join(temp, "plan.md");
    const outDir = join(temp, "out");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(planPath, PLAN);
    const { stdout } = await execFileAsync(process.execPath, [
      scriptPath,
      "--atomize-plan",
      planPath,
      "--user-approved-plan",
      "--write-preview",
      "--write-source-plan",
      "--out",
      outDir,
    ], { cwd: temp });

    assert.match(stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(stdout, /VALID: true/);
    const saved = JSON.parse(await readFile(join(outDir, "graph.json"), "utf8"));
    const preview = await readFile(join(outDir, "preview.txt"), "utf8");
    const sourcePlan = await readFile(join(outDir, "source-plan.md"), "utf8");
    assert.match(preview, /SUPERVIBE_WORK_ITEMS_PREVIEW/);
    assert.equal(sourcePlan, PLAN);
    assert.equal(saved.source.snapshotPath, "source-plan.md");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI rejects plan-review-passed alone without validated review artifact", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-review-gate-"));
  try {
    const planPath = join(temp, "plan.md");
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");
    await writeFile(planPath, PLAN);

    await assert.rejects(
      () => execFileAsync(process.execPath, [
        scriptPath,
        "--atomize-plan",
        planPath,
        "--plan-review-passed",
        "--out",
        join(temp, "out"),
      ], { cwd: temp }),
      (error) => {
        assert.notEqual(error.code, 0);
        assert.match(`${error.stderr}\n${error.stdout}`, /validated plan review artifact|no plan review artifacts found/i);
        return true;
      },
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("loop CLI rejects invalid reviewed plan without writing graph artifacts", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-loop-invalid-cli-"));
  try {
    const planPath = join(temp, "invalid-plan.md");
    const outDir = join(temp, "out");
    await writeFile(planPath, INVALID_PLAN_WITHOUT_TASKS);
    const scriptPath = join(process.cwd(), "scripts", "supervibe-loop.mjs");

    await assert.rejects(
      () => execFileAsync(process.execPath, [
        scriptPath,
        "--atomize-plan",
        planPath,
        "--plan-review-passed",
        "--allow-unverified-plan-review",
        "--out",
        outDir,
      ], { cwd: temp, env: { ...process.env, SUPERVIBE_ALLOW_UNVERIFIED_PLAN_REVIEW: "1" } }),
      (error) => {
        assert.notEqual(error.code, 0);
        assert.match(`${error.stderr}\n${error.stdout}`, /invalid work-item graph/i);
        return true;
      },
    );

    await assert.rejects(() => stat(join(outDir, "graph.json")), /ENOENT/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});


test("phase-level critical path creates executable task chain", () => {
  const graph = atomizePlanToWorkItems("# Phase Path Plan\n\n## Critical Path\n\n```text\nP0 review -> P1 engine -> P2 facade\n```\n\n## Phase 0 - Review\n\n### Task P0.1 - First gate\n\n**Acceptance Criteria:**\n- Gate is complete.\n\n### Task P0.2 - Second gate\n\n**Acceptance Criteria:**\n- Gate follows first.\n\n## Phase 1 - Engine\n\n### Task P1.1 - Inventory\n\n**Acceptance Criteria:**\n- Inventory is complete.\n\n### Task P1.2 - Priority model\n\n**Acceptance Criteria:**\n- Model follows inventory.\n\n## Phase 2 - Facade\n\n### Task P2.1 - Contract\n\n**Acceptance Criteria:**\n- Contract follows engine.\n", {
    planPath: ".supervibe/artifacts/plans/phase-path.md",
    epicId: "epic-phase-path",
    planReviewPassed: true,
  });

  const p01 = graph.items.find((item) => item.itemId === "epic-phase-path-p0-1");
  const p02 = graph.items.find((item) => item.itemId === "epic-phase-path-p0-2");
  const p11 = graph.items.find((item) => item.itemId === "epic-phase-path-p1-1");
  const p12 = graph.items.find((item) => item.itemId === "epic-phase-path-p1-2");
  const p21 = graph.items.find((item) => item.itemId === "epic-phase-path-p2-1");

  assert.equal(graph.validation.valid, true);
  assert.ok(p02.blockedBy.includes(p01.itemId));
  assert.ok(p11.blockedBy.includes(p02.itemId));
  assert.ok(p12.blockedBy.includes(p11.itemId));
  assert.ok(p21.blockedBy.includes(p12.itemId));
  assert.deepEqual(graph.tasks.filter((task) => task.dependencies.length === 0).map((task) => task.id), [p01.itemId]);
});