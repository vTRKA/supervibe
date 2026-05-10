import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

async function matchCommand(request) {
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-commands.mjs"),
    "--match",
    request,
  ], { cwd: ROOT });
  return stdout;
}

test("routes plain planning workflow phrases to plan command", async () => {
  for (const request of [
    "план",
    "сделай план",
    "составь план для новой фичи",
    "make a plan",
    "create plan and then tasks",
  ]) {
    const output = await matchCommand(request);
    assert.match(output, /INTENT: supervibe_plan/);
    assert.match(output, /COMMAND: \/supervibe-plan/);
  }
});

test("routes plan then execute requests to planning without review-only hijack", async () => {
  const output = await matchCommand("Давай все 40+ задач в детальный план, после этого начни работу по плану, сначала проверь что все задачи выполнены из плана");

  assert.match(output, /INTENT: plan_then_execute/);
  assert.match(output, /COMMAND: \/supervibe-plan/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-plan --review/);
  assert.match(output, /\/supervibe-loop --atomize-plan <plan-path> --plan-review-passed/);
  assert.match(output, /\/supervibe-execute-plan <reviewed-plan-path>/);
});

test("routes plain brainstorm and new feature phrases to brainstorm command", async () => {
  for (const request of [
    "брейншторм",
    "давай брейншторм",
    "start brainstorm",
    "new feature",
    "давай новую фичу",
  ]) {
    const output = await matchCommand(request);
    assert.match(output, /INTENT: supervibe_brainstorm/);
    assert.match(output, /COMMAND: \/supervibe-brainstorm/);
  }
});

test("routes Russian task graph resume requests to loop status", async () => {
  const output = await matchCommand("продолжи loop по эпикам и задачам");
  assert.match(output, /INTENT: task_graph_resume/);
  assert.match(output, /COMMAND: \/supervibe-loop --status/);
});

test("routes task graph deletion and editing requests to preview actions", async () => {
  const deleteOutput = await matchCommand("удали задачу из эпика");
  assert.match(deleteOutput, /INTENT: task_graph_delete/);
  assert.match(deleteOutput, /COMMAND: \/supervibe-loop --delete <task-id> --preview/);

  const editOutput = await matchCommand("edit task in the epic");
  assert.match(editOutput, /INTENT: task_graph_edit/);
  assert.match(editOutput, /COMMAND: \/supervibe-loop --edit <task-id> --preview/);
});

test("routes ready claim and epic completion validation requests", async () => {
  const claimOutput = await matchCommand("claim next ready task");
  assert.match(claimOutput, /INTENT: task_graph_claim_ready/);
  assert.match(claimOutput, /COMMAND: \/supervibe-loop --claim-ready/);

  const completionOutput = await matchCommand("проверь готовность эпика к продакшену");
  assert.match(completionOutput, /INTENT: task_graph_validate_completion/);
  assert.match(completionOutput, /COMMAND: \/supervibe-loop --validate-completion/);
});

test("routes task graph creation, split, reparent, skip, defer, and block controls", async () => {
  const createOutput = await matchCommand("create epic tasks from plan");
  assert.match(createOutput, /INTENT: task_graph_create_from_plan/);
  assert.match(createOutput, /COMMAND: \/supervibe-loop --atomize-plan <plan-path> --plan-review-passed/);

  const splitOutput = await matchCommand("split task into subtasks");
  assert.match(splitOutput, /INTENT: task_graph_split/);
  assert.match(splitOutput, /COMMAND: \/supervibe-loop --split <task-id> --preview/);

  const reparentOutput = await matchCommand("move task to another parent");
  assert.match(reparentOutput, /INTENT: task_graph_reparent/);
  assert.match(reparentOutput, /COMMAND: \/supervibe-loop --reparent <task-id> --preview/);

  const skipOutput = await matchCommand("skip task with reason");
  assert.match(skipOutput, /INTENT: task_graph_skip/);
  assert.match(skipOutput, /COMMAND: \/supervibe-loop --skip <task-id> --preview/);

  const deferOutput = await matchCommand("defer task until later");
  assert.match(deferOutput, /INTENT: task_graph_defer/);
  assert.match(deferOutput, /COMMAND: \/supervibe-loop --defer <task-id> --preview/);

  const blockOutput = await matchCommand("block task with reason");
  assert.match(blockOutput, /INTENT: task_graph_block/);
  assert.match(blockOutput, /COMMAND: \/supervibe-loop --block <task-id> --preview/);
});

test("routes real Russian task graph complaint phrases", async () => {
  const createOutput = await matchCommand("создай задачи и эпик из плана");
  assert.match(createOutput, /INTENT: task_graph_create_from_plan/);
  assert.match(createOutput, /COMMAND: \/supervibe-loop --atomize-plan <plan-path> --plan-review-passed/);

  const atomizeOutput = await matchCommand("атомизируй план");
  assert.match(atomizeOutput, /INTENT: atomize_plan/);
  assert.match(atomizeOutput, /COMMAND: \/supervibe-loop --atomize-plan <plan-path> --plan-review-passed/);

  const createSubtasksOutput = await matchCommand("создай подзадачи");
  assert.match(createSubtasksOutput, /INTENT: task_graph_split/);
  assert.match(createSubtasksOutput, /COMMAND: \/supervibe-loop --split <task-id> --preview/);

  const splitOutput = await matchCommand("разбей задачу на подзадачи");
  assert.match(splitOutput, /INTENT: task_graph_split/);
  assert.match(splitOutput, /COMMAND: \/supervibe-loop --split <task-id> --preview/);
  assert.doesNotMatch(splitOutput, /INTENT: atomize_plan/);

  const reparentOutput = await matchCommand("перенеси задачу в другой эпик");
  assert.match(reparentOutput, /INTENT: task_graph_reparent/);
  assert.match(reparentOutput, /COMMAND: \/supervibe-loop --reparent <task-id> --preview/);

  const skipOutput = await matchCommand("пропусти задачу с причиной");
  assert.match(skipOutput, /INTENT: task_graph_skip/);
  assert.match(skipOutput, /COMMAND: \/supervibe-loop --skip <task-id> --preview/);

  const blockOutput = await matchCommand("заблокируй задачу");
  assert.match(blockOutput, /INTENT: task_graph_block/);
  assert.match(blockOutput, /COMMAND: \/supervibe-loop --block <task-id> --preview/);

  const readyOutput = await matchCommand("покажи готовые задачи");
  assert.match(readyOutput, /INTENT: ready_query/);
  assert.match(readyOutput, /COMMAND: \/supervibe-status --ready/);
});

test("routes stale and orphan task graph status queries", async () => {
  const staleOutput = await matchCommand("show stale claims for tasks");
  assert.match(staleOutput, /INTENT: task_graph_stale_query/);
  assert.match(staleOutput, /COMMAND: \/supervibe-status --stale/);

  const orphanOutput = await matchCommand("show orphan tasks in graph");
  assert.match(orphanOutput, /INTENT: task_graph_orphan_query/);
  assert.match(orphanOutput, /COMMAND: \/supervibe-status --orphan/);
});

test("routes task graph maturity requests to the task-graph-specific gate", async () => {
  const output = await matchCommand("task graph maturity");
  assert.match(output, /INTENT: task_graph_maturity/);
  assert.match(output, /COMMAND: npm run supervibe:task-graph-maturity/);

  const russianOutput = await matchCommand("проверь task graph maturity");
  assert.match(russianOutput, /INTENT: task_graph_maturity/);
  assert.doesNotMatch(russianOutput, /COMMAND: \/supervibe-audit/);
});
