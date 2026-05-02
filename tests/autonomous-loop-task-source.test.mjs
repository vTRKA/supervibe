import assert from "node:assert/strict";
import test from "node:test";
import {
  createTasksFromRequest,
  parsePlanTasks,
  parsePrdMarkdown,
  parsePrdStories,
  parseTaskSource,
  validateStorySize,
  validateTask,
} from "../scripts/lib/autonomous-loop-task-source.mjs";

test("open validation request becomes bounded task queue", () => {
  const tasks = createTasksFromRequest("validate code and fix integration, dependency, and connection bugs");
  assert.ok(tasks.length >= 8);
  assert.ok(tasks.every((task) => validateTask(task).valid));
  assert.ok(tasks.some((task) => task.category === "dependency"));
});

test("plan checkboxes are parsed into executable tasks", () => {
  const tasks = parsePlanTasks("## Task 1\n- [ ] **Step 1: Verify runtime**\n```bash\nnode --test tests/x.test.mjs\n```", ".supervibe/artifacts/plans/x.md");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].verificationCommands[0], "node --test tests/x.test.mjs");
});

test("explicit JSON task graph parses into runner-compatible tasks", () => {
  const tasks = parseTaskSource(JSON.stringify({
    graph_id: "g1",
    tasks: [
      { id: "a", goal: "A", status: "complete" },
      { id: "b", goal: "B", dependencies: ["a"], verificationCommands: ["npm test"] },
    ],
  }), "graph.json");

  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].dependencies[0], "a");
  assert.equal(tasks[1].verificationCommands[0], "npm test");
});

test("work-item graph JSON parses into runner-compatible tasks", () => {
  const tasks = parseTaskSource(JSON.stringify({
    kind: "supervibe-work-item-graph",
    epicId: "epic-x",
    items: [
      {
        epicId: "epic-x",
        itemId: "epic-x",
        title: "Epic",
        type: "epic",
        priority: "critical",
        parentId: null,
        blocks: ["task-a"],
        related: [],
        discoveredFrom: { type: "plan", path: ".supervibe/artifacts/plans/x.md" },
        acceptanceCriteria: ["Epic done"],
        verificationCommands: [],
        writeScope: [],
        estimatedSize: "small",
        parallelGroup: null,
        executionHints: {},
      },
      {
        epicId: "epic-x",
        itemId: "task-a",
        title: "Task A",
        type: "task",
        priority: "high",
        parentId: "epic-x",
        blocks: [],
        related: [],
        discoveredFrom: { type: "plan", path: ".supervibe/artifacts/plans/x.md" },
        acceptanceCriteria: ["Task done"],
        verificationCommands: ["npm test"],
        writeScope: [{ action: "modify", path: "src/a.ts" }],
        estimatedSize: "small",
        parallelGroup: "A",
        executionHints: { requiredAgentCapability: "stack-developer" },
      },
    ],
  }), "work-items.json");

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "task-a");
  assert.equal(tasks[0].epicId, "epic-x");
  assert.equal(tasks[0].writeScope[0].path, "src/a.ts");
});

test("story-loop JSON preserves passing and failing story state", () => {
  const tasks = parseTaskSource(JSON.stringify({
    project: "Billing",
    branchName: "feature/billing-stories",
    description: "Repair billing stories",
    userStories: [
      { id: "s1", title: "Passing story", passes: true },
      { id: "s2", title: "Critical failure", passes: false, priority: "critical" },
      { id: "s3", title: "Low failure", passes: false, priority: "low" },
    ],
  }), "prd.json");

  assert.deepEqual(tasks.map((task) => task.id), ["s2", "s3", "s1"]);
  assert.equal(tasks.find((task) => task.id === "s1").status, "complete");
  assert.equal(tasks.find((task) => task.id === "s2").status, "open");
  assert.equal(tasks[0].source.type, "prd");
  assert.equal(tasks[0].source.project, "Billing");
  assert.equal(tasks[0].source.branchName, "feature/billing-stories");
  assert.deepEqual(tasks[1].dependencies, ["s2"]);
  assert.ok(tasks[0].acceptanceCriteria.some((item) => /typecheck/i.test(item)));
  assert.equal(parsePrdStories([{ id: "direct", title: "Direct story", passes: false }], "direct.json").length, 1);
});

test("PRD markdown extracts user stories with source lines and branch slug", () => {
  const tasks = parsePrdMarkdown(`# Checkout Flow

## Goals
- Reduce checkout drop-off

## User Stories
- As a buyer, I want a fast checkout UI so that I can pay quickly.
- As an operator, I want payment provider integration so that payments settle.

## Non-Goals
- Subscription billing
`, ".supervibe/artifacts/specs/checkout.md");

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].source.type, "prd");
  assert.equal(tasks[0].source.branchName, "checkout-flow");
  assert.equal(tasks[0].source.line, 7);
  assert.equal(tasks[0].category, "design");
  assert.ok(tasks[0].acceptanceCriteria.some((item) => /browser\/preview evidence/i.test(item)));
  assert.equal(tasks[1].category, "integration");
  assert.ok(tasks[1].acceptanceCriteria.some((item) => /access\/env evidence/i.test(item)));
});

test("oversized stories are blocked with split suggestions", () => {
  const validation = validateStorySize({ title: "Build dashboard and add authentication", description: "refactor API and add backend, UI, and integration" });
  assert.equal(validation.ok, false);
  assert.ok(validation.splitSuggestions.includes("schema"));

  const tasks = parseTaskSource(JSON.stringify({
    userStories: [
      { id: "big", title: "Build dashboard and add authentication", passes: false, description: "refactor API and add backend UI integration" },
    ],
  }), "stories.json");
  assert.equal(tasks[0].status, "blocked");
  assert.equal(tasks[0].storySize.ok, false);
  assert.ok(tasks[0].acceptanceCriteria.some((item) => /split oversized story/i.test(item)));
});
