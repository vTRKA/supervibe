import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  formatCommandMatch,
  resolveCommandRequest,
} from "../scripts/lib/supervibe-command-catalog.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

async function matchCommand(request) {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-command-route-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-commands.mjs"),
      "--project",
      projectRoot,
      "--match",
      request,
    ], { cwd: ROOT });
    return stdout;
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

test("static route formatting keeps fast plan and loop output lightweight", () => {
  const simple = resolveCommandRequest("make a plan", { pluginRoot: ROOT, projectRoot: ROOT });
  const simpleOutput = formatCommandMatch(simple);
  assert.match(simpleOutput, /COMMAND: \/supervibe-plan/);
  assert.doesNotMatch(simpleOutput, /PARALLEL_AGENT_|AGENT_FANOUT|AGENT_PLAN_COMMAND|command-agent-plan\.mjs/);
  assert.doesNotMatch(simpleOutput, /Dispatch the next ready task/);

  const resumeOutput = formatCommandMatch({
    id: "active-workflow-continuation",
    intent: "continue_plan",
    command: "/supervibe-plan --loop-ready --from-brainstorm",
    confidence: 0.99,
    doNotSearchProject: true,
    reason: "static compact-chat resume route",
    nextAction: "Resume active workflow: continue plan.",
  });
  assert.doesNotMatch(resumeOutput, /PARALLEL_AGENT_|AGENT_FANOUT|AGENT_PLAN_COMMAND|command-agent-plan\.mjs/);
  assert.match(resumeOutput, /NEXT: Resume active workflow: continue plan./);
});

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

test("routes loop-ready planning phrases to plan loop-ready", async () => {
  const output = await matchCommand("\u0441\u0434\u0435\u043b\u0430\u0439 \u043f\u043b\u0430\u043d \u0433\u043e\u0442\u043e\u0432\u044b\u0439 \u043a loop \u0441 \u044d\u043f\u0438\u043a\u0430\u043c\u0438 \u0438 \u0437\u0430\u0434\u0430\u0447\u0430\u043c\u0438");
  assert.match(output, /INTENT: supervibe_plan_loop_ready/);
  assert.match(output, /COMMAND: \/supervibe-plan --loop-ready/);
  assert.match(output, /\/supervibe-loop --atomize-plan <plan-path> --user-approved-plan/);
  assert.doesNotMatch(output, /AGENT_PLAN_COMMAND|PARALLEL_AGENT_|AGENT_FANOUT|command-agent-plan\.mjs/);
});

test("routes approved ready plan directly to loop atomization", async () => {
  const output = await matchCommand("\u043f\u043b\u0430\u043d \u0433\u043e\u0442\u043e\u0432, \u043d\u0430\u0447\u043d\u0438 \u0440\u0430\u0431\u043e\u0442\u0443");

  assert.match(output, /INTENT: task_graph_create_from_plan/);
  assert.match(output, /COMMAND: \/supervibe-loop --atomize-plan <plan-path> --user-approved-plan/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-execute-plan/);
  assert.doesNotMatch(output, /NEXT: .*command-agent-plan\.mjs/);
  assert.doesNotMatch(output, /AGENT_PLAN_COMMAND|PARALLEL_AGENT_|AGENT_FANOUT|command-agent-plan\.mjs/);
  assert.match(output, /NEXT: .*Create the active work graph/);
});

test("routes plan then execute requests to planning without review-only hijack", async () => {
  const output = await matchCommand("Давай все 40+ задач в детальный план, после этого начни работу по плану, сначала проверь что все задачи выполнены из плана");

  assert.match(output, /INTENT: plan_then_execute/);
  assert.match(output, /COMMAND: \/supervibe-plan --loop-ready/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-plan --review/);
  assert.match(output, /\/supervibe-loop --atomize-plan <plan-path> --user-approved-plan/);
  assert.match(output, /\/supervibe-loop --resume-dispatch/);
});

test("routes temporary plan review and reviewed plan execution distinctly", async () => {
  const reviewOutput = await matchCommand("create a temporary plan with all tasks and run plan reviewers; only the plan for now, I will say when to start work");
  assert.match(reviewOutput, /INTENT: plan_review/);
  assert.match(reviewOutput, new RegExp("COMMAND: \/supervibe-plan --review"));
  assert.doesNotMatch(reviewOutput, /INTENT: plan_then_execute/);
  assert.doesNotMatch(reviewOutput, new RegExp("COMMAND: \/supervibe-ui"));

  const executeOutput = await matchCommand("start work by the reviewed plan and mark completed tasks");
  assert.match(executeOutput, /INTENT: supervibe_execute_plan/);
  assert.match(executeOutput, new RegExp("COMMAND: \/supervibe-execute-plan"));
  assert.doesNotMatch(executeOutput, /INTENT: plan_then_execute/);
});

test("routes broken design workflow audits before plan-review", async () => {
  const output = await matchCommand("Проведи аудит и проверь почему дизайн флоу снова сломан. Нужен аудит и план исправлений. Не использовались prototype-builder ux-ui-designer ui-polish-reviewer accessibility-reviewer quality-gate-reviewer copywriter.");

  assert.match(output, /INTENT: supervibe_audit/);
  assert.match(output, /COMMAND: \/supervibe-audit/);
  assert.doesNotMatch(output, /INTENT: plan_review/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-plan --review/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-security-audit/);
});

test("does not route generic reviewer severity blockers to security audit", async () => {
  const output = await matchCommand("reviewers returned major severity blockers, continue validation");

  assert.doesNotMatch(output, /INTENT: supervibe_security_audit/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-security-audit/);
});

test("does not route router misroute complaints to docs audit by cleanup terms", async () => {
  const request = "fix intent routing system. docs-audit wrongly matched by words \u043c\u0443\u0441\u043e\u0440 \u043e\u0447\u0438\u0441\u0442 instead of /supervibe-audit";
  const output = await matchCommand(request);

  assert.match(output, /MATCH: semantic-trigger:prompt_ai_engineering/);
  assert.match(output, /INTENT: prompt_ai_engineering/);
  assert.match(output, /COMMAND: \/supervibe --agent prompt-ai-engineer/);
  assert.doesNotMatch(output, /INTENT: docs_audit/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-audit --docs/);
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

test("routes documentation summary gate before creating docs", async () => {
  const output = await matchCommand("show summary before creating documentation");
  assert.match(output, /INTENT: documentation_summary_gate/);
  assert.match(output, /COMMAND: \/supervibe-brainstorm --summary-gate/);
});

test("routes visual explanation requests to text-first summary", async () => {
  const output = await matchCommand("explain this system visually with a text-first summary before implementation");
  assert.match(output, /INTENT: visual_explanation/);
  assert.match(output, /COMMAND: \/supervibe-plan --visual-summary/);
});

test("routes Russian task graph resume requests to resume-dispatch loop wave", async () => {
  const output = await matchCommand("продолжи loop по эпикам и задачам");
  assert.match(output, /INTENT: task_graph_resume/);
  assert.match(output, /COMMAND: \/supervibe-loop --resume-dispatch/);
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
  assert.match(createOutput, /COMMAND: \/supervibe-loop --atomize-plan <plan-path> --user-approved-plan/);

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
  assert.match(createOutput, /COMMAND: \/supervibe-loop --atomize-plan <plan-path> --user-approved-plan/);

  const atomizeOutput = await matchCommand("атомизируй план");
  assert.match(atomizeOutput, /INTENT: atomize_plan/);
  assert.match(atomizeOutput, /COMMAND: \/supervibe-loop --atomize-plan <plan-path> --user-approved-plan/);

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

test("routes active explicit slash-command handoff phrases without audit fallback", async () => {
  const output = await matchCommand("active /supervibe-review handoff verify-review-ship-workflow-review-final-pass");

  assert.match(output, /INTENT: slash_command/);
  assert.match(output, /COMMAND: \/supervibe-review/);
  assert.match(output, /COMMAND_ID: \/supervibe-review/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-audit/);
});

test("routes polite explicit slash commands without falling through to natural language", async () => {
  const output = await matchCommand("please /supervibe-verify");

  assert.match(output, /INTENT: slash_command/);
  assert.match(output, /COMMAND: \/supervibe-verify/);
  assert.match(output, /COMMAND_ID: \/supervibe-verify/);
});

test("routes verify review and ship workflow phrases", async () => {
  const verifyOutput = await matchCommand("verify implementation goals with tester evidence");
  assert.match(verifyOutput, /INTENT: supervibe_verify/);
  assert.match(verifyOutput, /COMMAND: \/supervibe-verify/);
  assert.match(verifyOutput, /REQUIRED_AGENTS: .*qa-test-engineer/);

  const reviewOutput = await matchCommand("review production readiness after verify evidence");
  assert.match(reviewOutput, /INTENT: supervibe_review/);
  assert.match(reviewOutput, /COMMAND: \/supervibe-review/);
  assert.match(reviewOutput, /REQUIRED_AGENTS: .*code-reviewer/);

  const shipOutput = await matchCommand("ship release with target-aware release readiness");
  assert.match(shipOutput, /INTENT: supervibe_ship/);
  assert.match(shipOutput, /COMMAND: \/supervibe-ship/);
  assert.match(shipOutput, /REQUIRED_AGENTS: .*release-governance-reviewer/);
});

test("routes task graph maturity requests to the task-graph-specific gate", async () => {
  const output = await matchCommand("task graph maturity");
  assert.match(output, /INTENT: task_graph_maturity/);
  assert.match(output, /COMMAND: npm run supervibe:task-graph-maturity/);

  const russianOutput = await matchCommand("проверь task graph maturity");
  assert.match(russianOutput, /INTENT: task_graph_maturity/);
  assert.doesNotMatch(russianOutput, /COMMAND: \/supervibe-audit/);
});


test("routes explicit summary gates before generic plan shortcuts", async () => {
  const cases = [
    ["show pre-spec summary before requirements spec approval", /INTENT: pre_spec_summary_gate/, /COMMAND: \/supervibe-brainstorm --summary-gate --stage pre-spec/],
    ["show post-spec summary after spec creation with table and ascii map", /INTENT: post_spec_summary_gate/, /COMMAND: \/supervibe-brainstorm --summary-gate --stage post-spec/],
    ["show pre-plan summary before implementation plan approval", /INTENT: pre_plan_summary_gate/, /COMMAND: \/supervibe-plan --summary-gate --stage pre-plan/],
    ["show post-plan summary after plan creation before graph creation", /INTENT: post_plan_summary_gate/, /COMMAND: \/supervibe-plan --summary-gate --stage post-plan/],
  ];
  for (const [request, intentRe, commandRe] of cases) {
    const output = await matchCommand(request);
    assert.match(output, intentRe);
    assert.match(output, commandRe);
    assert.doesNotMatch(output, /COMMAND: \/supervibe-execute-plan/);
  }
});

test("routes plan-only review requests away from execution", async () => {
  const output = await matchCommand("create a temporary plan with all tasks and run plan reviewers; do not execute");
  assert.match(output, /INTENT: plan_review/);
  assert.match(output, /COMMAND: \/supervibe-plan --review/);
  assert.doesNotMatch(output, /COMMAND: \/supervibe-execute-plan/);
});
