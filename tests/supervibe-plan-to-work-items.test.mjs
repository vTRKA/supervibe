import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  applyWorkItemAdapter,
  atomizePlanToWorkItems,
  createWorkItemGraph,
  createNativeWorkItemAdapter,
  createWorkItemPreview,
  parsePlanForWorkItems,
  validateWorkItemGraph,
  WORK_ITEM_REQUIRED_FIELDS,
  WORK_ITEM_TYPES,
  workItemsToLoopTasks,
  writeWorkItemGraph,
} from "../scripts/lib/supervibe-plan-to-work-items.mjs";

const execFileAsync = promisify(execFile);

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
    });
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

test("atomization records and writes an adjacent source plan snapshot", async () => {
  const temp = await mkdtemp(join(tmpdir(), "supervibe-work-items-source-plan-"));
  try {
    const graph = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/payment.md",
      epicId: "epic-payment",
      planReviewPassed: true,
    });
    const expectedHash = createHash("sha256").update(PLAN).digest("hex");

    assert.equal(graph.source.sha256, expectedHash);
    assert.equal(graph.metadata.sourcePlanSnapshot.sha256, expectedHash);

    const writeResult = await writeWorkItemGraph(graph, { rootDir: temp });
    const saved = JSON.parse(await readFile(writeResult.graphPath, "utf8"));
    const snapshot = await readFile(join(writeResult.outDir, "source-plan.md"), "utf8");

    assert.equal(snapshot, PLAN);
    assert.equal(saved.source.snapshotPath, "source-plan.md");
    assert.equal(saved.metadata.sourcePlanSnapshot.sha256, expectedHash);
    assert.equal("content" in saved.metadata.sourcePlanSnapshot, false);
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
    assert.match(stdout, /TRACKER_STATUS: synced/);
    const saved = JSON.parse(await readFile(join(temp, "out", "graph.json"), "utf8"));
    const mapping = JSON.parse(await readFile(join(temp, ".supervibe", "memory", "loops", "task-tracker-map.json"), "utf8"));
    assert.equal(saved.kind, "supervibe-work-item-graph");
    assert.equal(Object.keys(mapping.items).length, saved.items.length);
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
