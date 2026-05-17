import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { resolveCommandRequest } from "../scripts/lib/supervibe-command-catalog.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RU_BRAINSTORM_IDEAS = "\u0434\u0430\u0432\u0430\u0439 \u0431\u0440\u0435\u0439\u043d\u0448\u0442\u043e\u0440\u043c \u0438\u0434\u0435\u0438 \u0434\u043b\u044f \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0433\u043e \u0440\u043e\u0443\u0442\u0438\u043d\u0433\u0430";
const RU_BRAINSTORM_CHECK_ROUTING = "\u0441\u0434\u0435\u043b\u0430\u0439 \u0431\u0440\u0435\u0439\u043d\u0448\u0442\u043e\u0440\u043c \u0438\u0434\u0435\u0438 \u0434\u043b\u044f \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438 \u043c\u0430\u0440\u0448\u0440\u0443\u0442\u0438\u0437\u0430\u0446\u0438\u0438";
const RU_PLAN_REVIEW_SPECIALISTS = "\u0437\u0430\u043f\u0443\u0441\u0442\u0438 \u0440\u0435\u0432\u044c\u044e \u043f\u043b\u0430\u043d\u0430 \u0441\u043f\u0435\u0446 \u0430\u0433\u0435\u043d\u0442\u0430\u043c\u0438";

async function withRoute(request, assertions) {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-routing-regression-"));
  try {
    const route = resolveCommandRequest(request, {
      pluginRoot: ROOT,
      projectRoot,
    });
    assert.ok(route, "expected a route for " + request);
    assertions(route);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

test("routes English and Russian brainstorm phrases to brainstorm instead of audit or status", async () => {
  for (const request of [
    "start brainstorm for a routing safety idea",
    "brainstorm the feature for command intent safety",
    RU_BRAINSTORM_IDEAS,
    RU_BRAINSTORM_CHECK_ROUTING,
  ]) {
    await withRoute(request, (route) => {
      assert.equal(route.command, "/supervibe-brainstorm");
      assert.equal(route.intent, "supervibe_brainstorm");
      assert.notEqual(route.command, "/supervibe-audit");
      assert.notEqual(route.command, "/supervibe-status");
    });
  }
});

test("honors explicit active slash commands without plan or execution hijack", async () => {
  await withRoute("Active command: /supervibe-audit\nReview the current routing result.", (route) => {
    assert.equal(route.command, "/supervibe-audit");
    assert.equal(route.commandId, "/supervibe-audit");
    assert.notEqual(route.command, "/supervibe-plan");
  });

  await withRoute("Active command: /supervibe-plan\nPrepare the planning pass; do not execute the plan.", (route) => {
    assert.equal(route.command, "/supervibe-plan");
    assert.equal(route.commandId, "/supervibe-plan");
    assert.notEqual(route.command, "/supervibe-execute-plan");
  });
});

test("routes existing plan and spec artifact revision requests to plan instead of audit", async () => {
  for (const request of [
    "Check the existing plan artifact .supervibe/artifacts/plans/router.md and adapt the matcher intents for reviewer agents.",
    "Revise the existing spec artifact for command intent routing; it mentions agents, review, matcher, and intents.",
    "Scale the current implementation plan to cover Russian and English routing regressions without running audit.",
  ]) {
    await withRoute(request, (route) => {
      assert.equal(route.command, "/supervibe-plan");
      assert.equal(route.intent, "supervibe_plan");
      assert.notEqual(route.command, "/supervibe-audit");
      assert.notEqual(route.command, "/supervibe-plan --review");
    });
  }
});

test("treats slash command names inside plans and examples as evidence text", async () => {
  await withRoute(
    "Revise the existing plan text; it lists /supervibe-brainstorm, /supervibe-plan, and /supervibe-execute-plan as examples. Do not run those commands.",
    (route) => {
      assert.equal(route.command, "/supervibe-plan");
      assert.equal(route.intent, "supervibe_plan");
      assert.notEqual(route.intent, "slash_command");
      assert.notEqual(route.intent, "workflow_chain_audit");
      assert.notEqual(route.command, "/supervibe-audit --workflow-chain");
      assert.notEqual(route.command, "/supervibe-execute-plan");
    },
  );
});

test("routes fast graph creation and agent dispatch without plan-review hijack", async () => {
  await withRoute("\u0441\u043e\u0437\u0434\u0430\u0439 \u0435\u043f\u0438\u043a\u0438 \u0438 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438\u0437 \u043f\u043b\u0430\u043d\u0430 \u0434\u043b\u044f \u0431\u044b\u0441\u0442\u0440\u043e\u0433\u043e \u0441\u0442\u0430\u0440\u0442\u0430 \u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442\u043a\u0438", (route) => {
    assert.equal(route.intent, "task_graph_create_from_plan");
    assert.equal(route.command, "/supervibe-loop --from-plan <plan-path> --start --fast-session");
    assert.notEqual(route.command, "/supervibe-plan --review");
    assert.notEqual(route.command, "/supervibe-plan --loop-ready");
  });

  await withRoute("\u0431\u044b\u0441\u0442\u0440\u043e \u0440\u0430\u0437\u0434\u0430\u0442\u044c \u0435\u043f\u0438\u043a\u0438 \u0438 \u0437\u0430\u0434\u0430\u0447\u0438 \u0430\u0433\u0435\u043d\u0442\u0430\u043c\u0438", (route) => {
    assert.equal(route.intent, "task_graph_resume");
    assert.equal(route.command, "/supervibe-loop --resume-dispatch");
    assert.notEqual(route.command, "/supervibe-plan --review");
  });

  await withRoute("start work from the plan and dispatch agents", (route) => {
    assert.equal(route.intent, "task_graph_create_from_plan");
    assert.equal(route.command, "/supervibe-loop --from-plan <plan-path> --start --fast-session");
    assert.notEqual(route.command, "/supervibe-execute-plan");
  });

  await withRoute("take next ready task", (route) => {
    assert.equal(route.intent, "task_graph_claim_ready");
    assert.equal(route.command, "/supervibe-loop --claim-ready");
  });
});

test("keeps explicit plan-review routing for specialist review requests", async () => {
  for (const request of [
    "review plan with specialist agents",
    "run review loop for the plan",
    RU_PLAN_REVIEW_SPECIALISTS,
  ]) {
    await withRoute(request, (route) => {
      assert.equal(route.command, "/supervibe-plan --review");
      assert.equal(route.intent, "plan_review");
      assert.notEqual(route.command, "/supervibe-audit");
    });
  }
});

