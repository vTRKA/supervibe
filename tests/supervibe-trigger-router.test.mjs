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
    assert.equal(route.nextQuestion, "Шаг 1/1: написать план?");
    assert.deepEqual(route.missingArtifacts, []);
  });

  it("routes plan completion to the review loop before atomization or execution", () => {
    const route = routeTriggerRequest("после плана сделай ревью луп", {
      artifacts: { planPath: "docs/plans/example.md" },
    });

    assert.equal(route.intent, "plan_review");
    assert.equal(route.command, "/supervibe-plan --review");
    assert.equal(route.nextQuestion, "Шаг 1/1: запустить review loop по плану?");
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
  it("routes direct RAG and CodeGraph indexing requests to the bounded indexer command", () => {
    const route = routeTriggerRequest("запусти индексирование rag/codegraph");

    assert.equal(route.intent, "code_index_build");
    assert.match(route.command, /build-code-index\.mjs --root \. --resume --source-only/);
    assert.match(route.command, /--max-files 200 --max-seconds 120 --health --json-progress/);
    assert.ok(route.followUpCommands.some((command) => /--resume --graph --max-files 200 --health/.test(command)));
    assert.equal(route.skill, "supervibe:code-search");
    assert.equal(route.mutationRisk, "writes-generated-index");
    assert.deepEqual(route.safetyBlockers, []);
  });

  it("routes explicit npm run code:index phrasing without requiring a project package script", () => {
    const route = routeTriggerRequest("npm run code:index вот запусти индексацию");

    assert.equal(route.intent, "code_index_build");
    assert.match(route.command, /build-code-index\.mjs --root \. --resume --source-only/);
    assert.equal(route.source, "command-catalog");
    assert.deepEqual(route.safetyBlockers, []);
  });

  it("routes explicit slash and package commands through command catalog without repo search", () => {
    const slash = routeTriggerRequest("supervibe-status --capabilities");
    const packageScript = routeTriggerRequest("pnpm run supervibe:status -- --json");
    const semanticScript = routeTriggerRequest("validate frontmatter");
    const missing = routeTriggerRequest("npm run deploy:prod пожалуйста");

    assert.equal(slash.intent, "slash_command");
    assert.equal(slash.command, "/supervibe-status --capabilities");
    assert.equal(slash.doNotSearchProject, true);
    assert.deepEqual(slash.safetyBlockers, []);

    assert.equal(packageScript.intent, "project_npm_script");
    assert.equal(packageScript.command, "pnpm run supervibe:status -- --json");
    assert.equal(packageScript.doNotSearchProject, true);
    assert.deepEqual(packageScript.safetyBlockers, []);

    assert.equal(semanticScript.intent, "project_npm_script");
    assert.equal(semanticScript.command, "npm run validate:frontmatter");
    assert.equal(semanticScript.source, "command-catalog");
    assert.equal(semanticScript.doNotSearchProject, true);
    assert.deepEqual(semanticScript.safetyBlockers, []);

    assert.equal(missing.intent, "missing_npm_script");
    assert.equal(missing.command, null);
    assert.equal(missing.doNotSearchProject, true);
    assert.deepEqual(missing.safetyBlockers, []);
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

    const memoryAudit = routeTriggerRequest("audit memory rag codegraph context quality");
    assert.equal(memoryAudit.intent, "memory_audit");
    assert.equal(memoryAudit.command, "/supervibe-audit --memory");
  });

  it("routes design continuation phrases back into the design pipeline", () => {
    const route = routeTriggerRequest("продолжай все оставшиеся этапы дизайна", {
      artifacts: { designBrief: true, designArtifact: true },
    });

    assert.equal(route.intent, "design_continue");
    assert.equal(route.command, "/supervibe-design --continue");
    assert.equal(route.skill, "supervibe:prototype");
    assert.match(route.nextQuestion, /продолжить оставшиеся этапы/i);
    assert.deepEqual(route.missingArtifacts, []);
  });
});
