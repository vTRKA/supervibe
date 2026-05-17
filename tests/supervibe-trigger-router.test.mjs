import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validateAgenticQuestion } from "../scripts/lib/supervibe-dialogue-contract.mjs";
import { resolveCommandRequest } from "../scripts/lib/supervibe-command-catalog.mjs";
import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

describe("supervibe trigger router", () => {
  it("routes completed brainstorms to planning with an explicit handoff question", () => {
    const route = routeTriggerRequest("я сделал брейншторм", {
      artifacts: { brainstormSummary: true },
    });

    assert.equal(route.intent, "brainstorm_to_plan");
    assert.equal(route.command, "/supervibe-plan --loop-ready --from-brainstorm");
    assert.equal(route.skill, "supervibe:writing-plans");
    assert.equal(route.nextQuestion, "Шаг 1/1: написать план?");
    assert.deepEqual(route.missingArtifacts, []);
    assert.deepEqual(validateAgenticQuestion(routeQuestion(route), { surface: "brainstorm trigger" }), []);
  });

  it("routes explicit plan-review requests to the optional review command", () => {
    const route = routeTriggerRequest("после плана сделай ревью луп", {
      artifacts: { planPath: ".supervibe/artifacts/plans/example.md" },
    });

    assert.equal(route.intent, "plan_review");
    assert.equal(route.command, "/supervibe-plan --review");
    assert.equal(route.nextQuestion, "Шаг 1/1: запустить review loop по плану?");
  });

  it("routes documentation summary requests to the pre-documentation gate", () => {
    const route = routeTriggerRequest("show summary before creating documentation", {
      artifacts: { request: true },
    });

    assert.equal(route.intent, "documentation_summary_gate");
    assert.equal(route.command, "/supervibe-brainstorm --summary-gate");
    assert.equal(route.skill, "supervibe:brainstorming");
    assert.equal(route.requiredSafety.includes("documentation-approval-before-write"), true);
  });

  it("does not route local evidence-lane safety wording to genesis", () => {
    const route = routeTriggerRequest("Read-only evidence lane: inspect supervibe provider config for this project without overwriting user files", {
      artifacts: { activeWorkGraph: true, taskId: "T002" },
    });

    assert.notEqual(route.intent, "genesis_setup");
    assert.notEqual(route.command, "/supervibe-genesis");
  });

  it("routes visual explanations to a text-first summary", () => {
    const route = routeTriggerRequest("explain this system visually with a text-first summary before implementation", {
      artifacts: { request: true },
    });

    assert.equal(route.intent, "visual_explanation");
    assert.equal(route.command, "/supervibe-plan --visual-summary");
    assert.equal(route.requiredSafety.includes("text-first-visual-summary"), true);
    assert.equal(route.requiredSafety.includes("optional-browser-preview-for-ui-only"), true);
  });

  it("routes plan then execute requests to planning without review-only hijack", () => {
    const route = routeTriggerRequest("Давай все 40+ задач в детальный план, после этого начни работу по плану, сначала проверь что все задачи выполнены из плана", {
      artifacts: { request: true },
    });

    assert.equal(route.intent, "plan_then_execute");
    assert.equal(route.command, "/supervibe-plan --loop-ready");
    assert.notEqual(route.command, "/supervibe-plan --review");
    assert.ok(route.followUpCommands.includes("/supervibe-loop --atomize-plan <plan-path> --user-approved-plan"));
    assert.ok(route.followUpCommands.includes("/supervibe-loop --resume-dispatch"));
  });

  it("routes epic worktree runs to provider-safe preflight and exposes blockers", () => {
    const route = routeTriggerRequest("запусти эпик автономно в отдельном worktree", {
      artifacts: { epicId: "SV-1", worktreeClean: true, confirmedMutation: false },
    });

    assert.equal(route.intent, "worktree_autonomous_run");
    assert.equal(route.skill, "supervibe:using-git-worktrees");
    assert.equal(route.mutationRisk, "creates-worktree");
    assert.equal(route.safetyBlockers.includes("needs-explicit-user-confirmation"), true);
    assert.equal(route.requiredSafety.includes("goal-stop-condition"), true);
    assert.equal(route.command, "/supervibe-loop --epic --worktree");
  });

  it("routes multi-session worktree orchestration phrases", () => {
    const route = routeTriggerRequest("run 10 sessions on the same plan in worktree", {
      artifacts: { epicId: "SV-10", worktreeClean: true, confirmedMutation: true },
    });

    assert.equal(route.intent, "worktree_autonomous_run");
    assert.equal(route.command, "/supervibe-loop --epic --worktree");
    assert.equal(route.skill, "supervibe:using-git-worktrees");
    assert.deepEqual(route.safetyBlockers, []);
  });

  it("routes Russian task graph status and mutation phrases", () => {
    const cases = [
      ["что осталось по задачам", "task_graph_remaining", "/supervibe-status --remaining"],
      ["измени эпик", "task_graph_edit", "/supervibe-loop --edit <task-id> --preview"],
      ["удали эпик", "task_graph_delete", "/supervibe-loop --delete <task-id> --preview"],
      ["пропусти задачу", "task_graph_skip", "/supervibe-loop --skip <task-id> --preview"],
      ["вернуться к проекту с задачами", "task_graph_resume", "/supervibe-loop --resume-dispatch"],
    ];

    for (const [request, intent, command] of cases) {
      const route = routeTriggerRequest(request, {
        artifacts: { activeWorkGraph: true, taskId: "T1", reason: "out of scope" },
      });

      assert.equal(route.intent, intent, request);
      assert.equal(route.command, command, request);
    }
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

  it("routes natural-language genesis scaffold requests with stack context", () => {
    const route = routeTriggerRequest("сделай genesis scaffold под next laravel postgres");

    assert.equal(route.intent, "genesis_setup");
    assert.equal(route.command, "/supervibe-genesis");
    assert.equal(route.skill, "supervibe:genesis");
    assert.equal(route.doNotSearchProject, true);
  });

  it("routes workflow-chain maturity audits to the read-only audit mode", () => {
    const route = routeTriggerRequest("проверь насколько прокачана цепочка /supervibe-brainstorm /supervibe-plan /supervibe-execute-plan /supervibe-loop");

    assert.equal(route.intent, "workflow_chain_audit");
    assert.equal(route.command, "/supervibe-audit --workflow-chain");
    assert.equal(route.skill, "supervibe:audit");
    assert.equal(route.mutationRisk, "none");
    assert.equal(route.requiredSafety.includes("read-only-audit"), true);
    assert.equal(route.requiredSafety.includes("scope-bloat-check"), true);
    assert.equal(route.doNotSearchProject, true);
  });

  it("routes agent-system intent and receipt audits to the read-only audit mode", () => {
    const route = routeTriggerRequest("audit agent system maturity intent routing receipts skills semantic rag and codegraph coverage");

    assert.equal(route.intent, "supervibe_audit");
    assert.equal(route.command, "/supervibe-audit");
    assert.equal(route.skill, "supervibe:audit");
    assert.equal(route.mutationRisk, "none");
    assert.equal(route.requiredSafety.includes("read-only-audit"), true);
    assert.equal(route.requiredSafety.includes("agent-system-coverage"), true);
    assert.equal(route.requiredSafety.includes("receipt-provenance-check"), true);
    assert.equal(route.requiredSafety.includes("semantic-route-coverage"), true);
    assert.deepEqual(route.safetyBlockers, []);
  });

  it("routes intent matcher audit and research requests away from pure diagnostics", () => {
    const auditRequests = [
      "audit intent matcher and routing system",
      "audit intent routing",
      "\u043f\u0440\u043e\u0432\u0435\u0434\u0438 \u0430\u0443\u0434\u0438\u0442 intent matcher \u0438 routing system",
      "\u043f\u0440\u043e\u0432\u0435\u0434\u0438 \u0430\u0443\u0434\u0438\u0442 \u0441\u0438\u0441\u0442\u0435\u043c\u044b \u043c\u0435\u0442\u0447\u0435\u0440\u0430 \u0438 \u0438\u043d\u0442\u0435\u043d\u0442\u0430",
    ];

    for (const request of auditRequests) {
      const route = routeTriggerRequest(request);

      assert.equal(route.intent, "supervibe_audit", request);
      assert.equal(route.command, "/supervibe-audit", request);
      assert.notEqual(route.intent, "trigger_diagnostics", request);
      assert.notEqual(route.intent, "unknown", request);
      assert.equal(route.requiredSafety.includes("semantic-route-coverage"), true, request);
    }

    const researchRoute = routeTriggerRequest("find internet solution for intent routing so plugin understands user");

    assert.equal(researchRoute.intent, "source_truth_research");
    assert.equal(researchRoute.command, "/supervibe-audit --source-of-truth");
    assert.notEqual(researchRoute.intent, "network_ops");
    assert.notEqual(researchRoute.intent, "trigger_diagnostics");
    assert.equal(researchRoute.intentArbiter.requestType, "route_research_request");
  });

  it("routes long Russian agent and design-data maturity audits to audit mode, not plan review", () => {
    const request = [
      "Проведи аудит и скажи на 10 из 10, что ты уверен что агенты и скилы сейчас сильно усилены",
      "в плане содержания практик, подходов, инструментов, документации и т.д.",
      "Скажи на сколько ты уверен что весь дата сет дизайнеров правильный, полностью содержит все необходимое",
      "и все взаимосвязано в skills/design-intelligence/data, а файл manifest.json полный и без пробелов.",
      "Убедись также что агенты умеют и понимают когда ходить в память/rag/codegraph.",
    ].join(" ");

    const shortcut = resolveCommandRequest(request, {
      pluginRoot: process.cwd(),
      projectRoot: process.cwd(),
    });
    assert.equal(shortcut.intent, "supervibe_audit");
    assert.equal(shortcut.command, "/supervibe-audit");
    assert.notEqual(shortcut.command, "/supervibe-plan --review");

    const route = routeTriggerRequest(request, {
      pluginRoot: process.cwd(),
      projectRoot: process.cwd(),
    });
    assert.equal(route.intent, "supervibe_audit");
    assert.equal(route.command, "/supervibe-audit");
    assert.equal(route.requiredSafety.includes("agent-system-coverage"), true);
    assert.equal(route.requiredSafety.includes("semantic-route-coverage"), true);
  });

  it("keeps router implementation complaints out of docs audit cleanup routes", () => {
    const implementationComplaint = "fix intent routing system. docs-audit wrongly matched by words \u043c\u0443\u0441\u043e\u0440 \u043e\u0447\u0438\u0441\u0442 instead of /supervibe-audit";
    const route = routeTriggerRequest(implementationComplaint);

    assert.equal(route.intent, "prompt_ai_engineering");
    assert.equal(route.command, "/supervibe --agent prompt-ai-engineer");
    assert.notEqual(route.command, "/supervibe-audit --docs");
    assert.equal(route.intentArbiter.requestType, "router_implementation_request");
    assert.ok(route.rejectedAlternatives.some((candidate) =>
      candidate.intent === "docs_audit" && candidate.negativeEvidence?.some((entry) => entry.includes("suspected wrong route"))
    ));

    const diagnosticComplaint = "why did intent router incorrectly route docs-audit by \u043c\u0443\u0441\u043e\u0440 \u043e\u0447\u0438\u0441\u0442 instead of /supervibe-audit";
    const diagnosticRoute = routeTriggerRequest(diagnosticComplaint);

    assert.equal(diagnosticRoute.intent, "trigger_diagnostics");
    assert.equal(diagnosticRoute.command, "/supervibe --diagnose-trigger");
    assert.notEqual(diagnosticRoute.command, "/supervibe-audit --docs");
  });

  it("keeps small routing questions on diagnostics instead of dispatching agent audits", () => {
    const phrases = [
      "do not call agents for this tiny question, just explain the route",
      "why did intent routing choose prompt-ai-engineer",
      "what does the intent router do and why would it pick prompt-ai-engineer",
      "explain agent intent routing without calling agents",
    ];

    for (const phrase of phrases) {
      const route = routeTriggerRequest(phrase);

      assert.equal(route.intent, "trigger_diagnostics", phrase);
      assert.equal(route.command, "/supervibe --diagnose-trigger", phrase);
      assert.notEqual(route.intent, "supervibe_audit", phrase);
      assert.notEqual(route.intent, "agent_strengthen", phrase);
      assert.notEqual(route.intent, "prompt_ai_engineering", phrase);
      assert.deepEqual(route.safetyBlockers, [], phrase);
      assert.ok(route.routingEvidence.some((entry) => entry.arbiterEvidence?.length || entry.negativeEvidence?.length), phrase);
    }
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

  it("routes no-slash update/adapt shortcuts through command catalog without falling through to unknown", () => {
    const cases = [
      ["supervibe-adapt", "/supervibe-adapt"],
      ["supervibe adapt", "/supervibe-adapt"],
      ["adapt", "/supervibe-adapt"],
      ["supervibe-adpat", "/supervibe-adapt"],
      ["sync project artifacts", "/supervibe-adapt"],
      ["обнолвление проекта", "/supervibe-adapt"],
      ["supervibe-update", "/supervibe-update"],
      ["supervibe update", "/supervibe-update"],
      ["update supervibe", "/supervibe-update"],
      ["pull latest supervibe", "/supervibe-update"],
      ["обнови supervibe", "/supervibe-update"],
      ["обнолви плагин", "/supervibe-update"],
    ];

    for (const [request, command] of cases) {
      const route = routeTriggerRequest(request);

      assert.equal(route.command, command, request);
      assert.equal(route.source, "command-catalog", request);
      assert.equal(route.doNotSearchProject, true, request);
      assert.deepEqual(route.safetyBlockers, [], request);
    }
  });

  it("keeps plugin drift repair intent ahead of generic no-slash update shortcuts", () => {
    const request = "update plugin should replace local plugin drift with upstream files";
    const route = routeTriggerRequest(request, { artifacts: { request, userRequest: request } });

    assert.equal(route.intent, "plugin_update_repair");
    assert.equal(route.command, "npm run supervibe:upgrade");
    assert.notEqual(route.source, "command-catalog");
  });

  it("does not manually emulate the published supervibe-design slash command from a mixed-language request", () => {
    const route = routeTriggerRequest("запусти команду /supervibe-design на создание новой дизайн системы десктопного приложения");

    assert.equal(route.intent, "slash_command");
    assert.equal(route.command, "/supervibe-design");
    assert.match(route.commandContext, /на создание/);
    assert.equal(route.skill, "supervibe:brandbook");
    assert.equal(route.source, "command-catalog");
    assert.equal(route.doNotSearchProject, true);
    assert.equal(route.requiredSafety.includes("slash-command-owns-safety"), true);
    assert.deepEqual(route.safetyBlockers, []);
  });

  it("routes every published exact slash command through the agent command contract", () => {
    const commandIds = readdirSync(join(process.cwd(), "commands"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => `/${file.replace(/\.md$/, "")}`)
      .sort();

    for (const commandId of commandIds) {
      const route = routeTriggerRequest(`${commandId} test request`, {
        pluginRoot: process.cwd(),
        projectRoot: process.cwd(),
      });

      assert.equal(route.intent, "slash_command", commandId);
      if (commandId === "/supervibe-genesis") assert.equal(route.skill, "supervibe:genesis", commandId);
      assert.equal(route.doNotSearchProject, true, commandId);
      assert.equal(route.agentContract.ownerAgentId, "supervibe-orchestrator", commandId);
      assert.ok(route.agentProfile.requiredAgentIds.includes("supervibe-orchestrator"), commandId);
      assert.match(route.nextQuestion, /slash command|slash-команду/i, commandId);
      assert.ok(route.questionChoices.length >= 3, commandId);
      assert.ok(route.questionChoices.every((choice) => choice.label && choice.label !== choice.id && choice.tradeoff), commandId);
    }
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

  it("uses request text as user-request evidence for diagnostic specialist routes", () => {
    const network = routeTriggerRequest("diagnose router vpn wifi network stability");
    const prompt = routeTriggerRequest("review prompt agent router evals and safety boundaries");

    assert.equal(network.intent, "network_ops");
    assert.equal(network.missingArtifacts.includes("user-request"), false);
    assert.equal(prompt.intent, "prompt_ai_engineering");
    assert.equal(prompt.missingArtifacts.includes("user-request"), false);
  });

  it("routes design continuation phrases back into the design pipeline", () => {
    const route = routeTriggerRequest("продолжай все оставшиеся этапы дизайна", {
      artifacts: { designBrief: true, designArtifact: true },
    });

    assert.equal(route.intent, "design_continue");
    assert.equal(route.command, "/supervibe-design --continue");
    assert.equal(route.skill, "supervibe:brandbook");
    assert.match(route.nextQuestion, /продолжить оставшиеся этапы/i);
    assert.deepEqual(route.missingArtifacts, []);
  });

  it("routes new design requests through brandbook before prototype work", () => {
    const route = routeTriggerRequest("make a new design system for dashboard", {
      artifacts: { designBrief: true },
    });

    assert.equal(route.intent, "design_new");
    assert.equal(route.command, "/supervibe-design");
    assert.equal(route.skill, "supervibe:brandbook");
    assert.match(route.nextQuestion, /brandbook before prototype/i);
    assert.equal(route.requiredSafety.includes("creative-direction-first"), true);
    assert.deepEqual(route.missingArtifacts, []);
    assert.deepEqual(validateAgenticQuestion(routeQuestion(route), { surface: "design trigger" }), []);
    assert.ok(route.questionChoices.some((choice) => /design workflow|brief/i.test(choice.label)));
  });

  it("routes creative variant feedback overlay prompts into the design pipeline", () => {
    const shortPrompt = routeTriggerRequest("Сделай 5 креативных и РАЗНЫХ вариантов с фидбек оверлей системой от плагина.", {
      artifacts: { designBrief: true },
    });

    assert.equal(shortPrompt.intent, "design_new");
    assert.equal(shortPrompt.command, "/supervibe-design");
    assert.equal(shortPrompt.skill, "supervibe:brandbook");
    assert.equal(shortPrompt.requiredSafety.includes("creative-direction-first"), true);

    const longPrompt = routeTriggerRequest([
      "изучи старые прототипы D:\\product-docs\\old prototypes и сами экраны чата file:///D:/product-docs/old%20prototypes/screen-chat.html",
      "для создания совершенно нового формата креативности и уникальности подходов к агентскому приложению, используй агента кретивный директора",
      "Сделай 5 креативных и РАЗНЫХ вариантов с фидбек оверлей системой от плагина.",
    ].join(" "), {
      artifacts: { designBrief: true },
    });

    assert.equal(longPrompt.intent, "design_new");
    assert.equal(longPrompt.command, "/supervibe-design");
    assert.equal(longPrompt.skill, "supervibe:brandbook");
    assert.ok(longPrompt.agentProfile.requiredAgentIds.includes("creative-director"));
  });

  it("hard-stops unpublished explicit slash commands before static route matching", async () => {
    const pluginRoot = await mkdtemp(join(tmpdir(), "supervibe-trigger-plugin-"));
    const commandPath = join(pluginRoot, "commands", "supervibe-status.md");
    try {
      await mkdir(dirname(commandPath), { recursive: true });
      await writeFile(commandPath, "---\ndescription: \"Status command\"\n---\n# /supervibe-status\n", "utf8");
      await writeFile(join(pluginRoot, "package.json"), JSON.stringify({ scripts: {} }, null, 2), "utf8");

      const route = routeTriggerRequest("/supervibe-design create a desktop design system", {
        pluginRoot,
        projectRoot: pluginRoot,
      });

      assert.equal(route.intent, "missing_slash_command");
      assert.equal(route.command, null);
      assert.equal(route.hardStop, true);
      assert.equal(route.doNotSearchProject, true);
      assert.equal(route.stopCondition, "report-missing-command");
      assert.equal(route.requiredSafety.includes("report-missing-command"), true);
      assert.deepEqual(route.safetyBlockers, []);
    } finally {
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });

  it("hard-stops unpublished brainstorm, plan, and loop slash commands before static routing", async () => {
    const pluginRoot = await mkdtemp(join(tmpdir(), "supervibe-trigger-plugin-"));
    const commandPath = join(pluginRoot, "commands", "supervibe-status.md");
    try {
      await mkdir(dirname(commandPath), { recursive: true });
      await writeFile(commandPath, "---\ndescription: \"Status command\"\n---\n# /supervibe-status\n", "utf8");
      await writeFile(join(pluginRoot, "package.json"), JSON.stringify({ scripts: {} }, null, 2), "utf8");

      for (const command of ["/supervibe-brainstorm", "/supervibe-plan", "/supervibe-loop"]) {
        const route = routeTriggerRequest(`${command} test flow`, {
          pluginRoot,
          projectRoot: pluginRoot,
        });

        assert.equal(route.intent, "missing_slash_command", command);
        assert.equal(route.hardStop, true, command);
        assert.equal(route.doNotSearchProject, true, command);
        assert.equal(route.stopCondition, "report-missing-command", command);
      }
    } finally {
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });
});

function routeQuestion(route) {
  return {
    prompt: route.nextQuestion,
    choices: route.questionChoices || [],
    locale: /[а-яё]/i.test(route.nextQuestion || "") ? "ru" : "en",
    specialist: route.questionSpecialist || route.agentProfile?.ownerAgentId || route.skill,
    evidence: route.questionEvidence || route.routingEvidence || [],
    artifactImpact: route.questionArtifactImpact,
  };
}


describe("workflow summary gate routing", () => {
  it("routes post summary gates with source-bound safety metadata", () => {
    const route = routeTriggerRequest("show post-plan summary after plan creation before graph creation", {
      artifacts: { planPath: ".supervibe/artifacts/plans/example.md" },
    });
    assert.equal(route.intent, "post_plan_summary_gate");
    assert.equal(route.summaryStage, "post-plan");
    assert.equal(route.summaryApprovalContract.stage, "post-plan");
    assert.equal(route.requiredSafety.includes("visual-table-required"), true);
    assert.equal(route.requiredSafety.includes("ascii-map-required"), true);
  });
});
