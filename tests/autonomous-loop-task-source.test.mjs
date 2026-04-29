import assert from "node:assert/strict";
import test from "node:test";
import { createTasksFromRequest, parsePlanTasks, validateTask } from "../scripts/lib/autonomous-loop-task-source.mjs";

test("open validation request becomes bounded task queue", () => {
  const tasks = createTasksFromRequest("validate code and fix integration, dependency, and connection bugs");
  assert.ok(tasks.length >= 8);
  assert.ok(tasks.every((task) => validateTask(task).valid));
  assert.ok(tasks.some((task) => task.category === "dependency"));
});

test("plan checkboxes are parsed into executable tasks", () => {
  const tasks = parsePlanTasks("## Task 1\n- [ ] **Step 1: Verify runtime**\n```bash\nnode --test tests/x.test.mjs\n```", "docs/plans/x.md");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].verificationCommands[0], "node --test tests/x.test.mjs");
});
