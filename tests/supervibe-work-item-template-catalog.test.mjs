import assert from "node:assert/strict";
import test from "node:test";
import { atomizePlanToWorkItems, workItemsToLoopTasks } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import {
  applyTemplateToWorkItem,
  getWorkItemTemplate,
  inferWorkItemTemplate,
  listWorkItemTemplates,
} from "../scripts/lib/supervibe-work-item-template-catalog.mjs";

test("template catalog exposes required reusable work-item templates", () => {
  const ids = listWorkItemTemplates().map((template) => template.id);

  for (const id of ["feature", "bugfix", "refactor", "ui-story", "integration", "migration", "documentation", "release-prep", "production-prep", "research-spike"]) {
    assert.ok(ids.includes(id), `${id} template must exist`);
  }
  assert.deepEqual(getWorkItemTemplate("production-prep").requiredGates, ["human-approval", "production-readiness", "10/10-acceptance"]);
});

test("templates carry contract, production readiness, and 10/10 scorecard prompts", () => {
  for (const template of listWorkItemTemplates()) {
    assert.ok(template.acceptanceCriteria.some((item) => item.includes("10/10")), `${template.id} needs 10/10 acceptance criteria`);
    assert.ok(template.requiredGates.includes("10/10-acceptance"), `${template.id} needs final acceptance gate`);
    assert.ok(template.contractChecklist?.length >= 3, `${template.id} needs contract checklist`);
    assert.ok(template.productionReadinessChecklist?.length >= 3, `${template.id} needs production readiness checklist`);
    assert.ok(template.tenOfTenChecklist?.length >= 3, `${template.id} needs 10/10 checklist`);
    assert.ok(template.sdlcCoverage?.length >= 3, `${template.id} needs SDLC coverage`);
  }

  const productionPrep = getWorkItemTemplate("production-prep");
  assert.ok(productionPrep.productionReadinessChecklist.join(" ").toLowerCase().includes("rollback"));
  assert.ok(productionPrep.productionReadinessChecklist.join(" ").toLowerCase().includes("observability"));
});

test("template inference and application add labels, gates, risk, and routing metadata", () => {
  const template = inferWorkItemTemplate({
    title: "Build checkout UI component",
    writeScope: [{ path: "src/components/Checkout.tsx" }],
  });
  const item = applyTemplateToWorkItem({
    itemId: "task-1",
    title: "Build checkout UI component",
    acceptanceCriteria: [],
    writeScope: [{ path: "src/components/Checkout.tsx" }],
    executionHints: {},
  }, template, { repo: "web", package: "checkout" });

  assert.equal(template.id, "ui-story");
  assert.ok(item.labels.includes("visual-verification"));
  assert.ok(item.requiredGates.includes("browser-evidence"));
  assert.equal(item.repo, "web");
  assert.equal(item.package, "checkout");
  assert.equal(item.stack, "frontend");
  assert.equal(item.executionHints.policyRiskLevel, "medium");
  assert.ok(item.contractChecklist.some((entry) => entry.toLowerCase().includes("workflow")));
  assert.ok(item.scopeSafetyChecklist.some((entry) => entry.toLowerCase().includes("approved scope")));
  assert.ok(item.scopeSafetyChecklist.some((entry) => entry.toLowerCase().includes("deferred or rejected")));
  assert.ok(item.tenOfTenChecklist.some((entry) => entry.toLowerCase().includes("visual")));
});

test("atomization enriches work items with template labels and multi-repo metadata", () => {
  const graph = atomizePlanToWorkItems(`# Plan

## Task 1: Update README docs
**Acceptance Criteria:**
- Docs match behavior
\`\`\`bash
npm test
\`\`\`
`, { epicId: "epic-docs", repo: "docs-repo", workspace: "packages/docs", planReviewPassed: true });
  const item = graph.items.find((candidate) => candidate.itemId === "epic-docs-t1");
  const task = workItemsToLoopTasks(graph.items).find((candidate) => candidate.id === item.itemId);

  assert.equal(item.templateId, "documentation");
  assert.ok(item.labels.includes("documentation"));
  assert.equal(item.repo, "docs-repo");
  assert.equal(task.workspace, "packages/docs");
  assert.ok(task.contractChecklist.some((entry) => entry.toLowerCase().includes("reader")));
  assert.ok(task.scopeSafetyChecklist.some((entry) => entry.toLowerCase().includes("optional extras")));
  assert.ok(task.requiredGates.includes("10/10-acceptance"));
});
