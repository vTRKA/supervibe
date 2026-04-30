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
  assert.deepEqual(getWorkItemTemplate("production-prep").requiredGates, ["human-approval", "production-readiness"]);
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
});
