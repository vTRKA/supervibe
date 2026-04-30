import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

describe("supervibe trigger router", () => {
  it("routes completed brainstorms to planning with an explicit handoff question", () => {
    const route = routeTriggerRequest("я сделал брейншторм", {
      artifacts: { brainstormSummary: true },
    });

    assert.equal(route.intent, "brainstorm_to_plan");
    assert.equal(route.command, "/supervibe-plan");
    assert.equal(route.skill, "supervibe:writing-plans");
    assert.equal(route.nextQuestion, "Следующий шаг - написать план. Переходим?");
    assert.deepEqual(route.missingArtifacts, []);
  });

  it("routes plan completion to the review loop before atomization or execution", () => {
    const route = routeTriggerRequest("после плана сделай ревью луп", {
      artifacts: { planPath: "docs/plans/example.md" },
    });

    assert.equal(route.intent, "plan_review");
    assert.equal(route.command, "/supervibe-plan --review");
    assert.equal(route.nextQuestion, "Следующий шаг - review loop по плану. Переходим?");
  });

  it("routes epic worktree runs to provider-safe preflight and exposes blockers", () => {
    const route = routeTriggerRequest("запусти эпик автономно в отдельном worktree", {
      artifacts: { epicId: "SV-1", worktreeClean: true, confirmedMutation: false },
    });

    assert.equal(route.intent, "worktree_autonomous_run");
    assert.equal(route.skill, "supervibe:using-git-worktrees");
    assert.equal(route.mutationRisk, "creates-worktree");
    assert.equal(route.safetyBlockers.includes("needs-explicit-user-confirmation"), true);
    assert.equal(route.safetyBlockers.includes("needs-bounded-runtime"), true);
  });

  it("routes multi-session worktree orchestration phrases", () => {
    const route = routeTriggerRequest("run 10 sessions on the same plan in worktree", {
      artifacts: { epicId: "SV-10", worktreeClean: true, maxDuration: "3h", confirmedMutation: true },
    });

    assert.equal(route.intent, "worktree_autonomous_run");
    assert.equal(route.command, "/supervibe-loop --epic --worktree");
    assert.equal(route.skill, "supervibe:using-git-worktrees");
    assert.deepEqual(route.safetyBlockers, []);
  });

  it("supports fuzzy Russian trigger diagnostics", () => {
    const route = routeTriggerRequest("объясни почему не сработал триггер для плана");

    assert.equal(route.intent, "trigger_diagnostics");
    assert.equal(route.command, "/supervibe --diagnose-trigger");
  });
  it("routes security, network, prompt, and kanban requests through specialized flows", () => {
    const security = routeTriggerRequest("security audit should scan vulnerabilities and prioritize remediation", {
      artifacts: { userRequest: true },
    });
    assert.equal(security.intent, "security_audit");
    assert.equal(security.command, "/supervibe-security-audit");
    assert.equal(security.requiredSafety.includes("read-only-audit"), true);

    const network = routeTriggerRequest("diagnose router vpn wifi network stability", {
      artifacts: { userRequest: true },
    });
    assert.equal(network.intent, "network_ops");
    assert.equal(network.command, "/supervibe --agent network-router-engineer --read-only");
    assert.equal(network.requiredSafety.includes("read-only-diagnostics"), true);

    const prompt = routeTriggerRequest("strengthen the prompt agent instructions and intent router evals", {
      artifacts: { userRequest: true, confirmedMutation: true },
    });
    assert.equal(prompt.intent, "prompt_ai_engineering");
    assert.equal(prompt.command, "/supervibe --agent prompt-ai-engineer");
    assert.equal(prompt.requiredSafety.includes("eval-before-claim"), true);

    const kanban = routeTriggerRequest("show tasks epics projects and agents on a kanban board");
    assert.equal(kanban.intent, "work_control_ui");
    assert.equal(kanban.command, "/supervibe-ui");
  });
});
