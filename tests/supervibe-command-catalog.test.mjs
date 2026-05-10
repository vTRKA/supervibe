import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProjectCommandCatalog,
  COMMAND_AGENT_ORCHESTRATION_CONTRACT,
  findCommandShortcut,
  formatCommandCatalog,
  formatCommandMatch,
  resolveCommandRequest,
} from "../scripts/lib/supervibe-command-catalog.mjs";
import {
  buildCommandAgentPlan,
  formatCommandAgentPlan,
  listCommandAgentProfiles,
  resolveHostAgentDispatcher,
  validateCommandAgentProfiles,
} from "../scripts/lib/command-agent-orchestration-contract.mjs";

const ROOT = process.cwd();
const COMMANDS_SCRIPT = join(ROOT, "scripts", "supervibe-commands.mjs");
const AGENT_PLAN_SCRIPT = join(ROOT, "scripts", "command-agent-plan.mjs");

function installHostAgentFiles(projectRoot, hostFolder, agentIds) {
  const dir = join(projectRoot, ...hostFolder.split("/"));
  mkdirSync(dir, { recursive: true });
  for (const agentId of agentIds) {
    writeFileSync(join(dir, `${agentId}.md`), `# ${agentId}\n`, "utf8");
  }
}

test("project command catalog exposes slash commands, npm scripts, and fast shortcuts", () => {
  const catalog = buildProjectCommandCatalog({ pluginRoot: ROOT, projectRoot: ROOT });
  const shortcut = catalog.shortcuts.find((entry) => entry.id === "index-rag-codegraph");

  assert.ok(catalog.slashCommands.some((entry) => entry.id === "/supervibe-status"));
  assert.ok(catalog.npmScripts.some((entry) => entry.name === "supervibe:status"));
  assert.ok(shortcut);
  assert.equal(catalog.agentContract.ownerAgentId, "supervibe-orchestrator");
  assert.equal(catalog.agentContract.defaultExecutionMode, "real-agents");
  assert.deepEqual(catalog.agentContract.executionModes, ["real-agents", "hybrid", "inline"]);
  assert.equal(catalog.agentContract.blockedMode, "agent-required-blocked");
  assert.equal(catalog.slashCommands.every((entry) => entry.agentContract?.ownerAgentId === "supervibe-orchestrator"), true);
  assert.equal(catalog.slashCommands.every((entry) => entry.agentProfile?.defaultExecutionMode === "real-agents"), true);
  assert.match(shortcut.command, /build-code-index\.mjs --root \. --resume --source-only --max-files 200 --max-seconds 120 --health --json-progress/);
  assert.ok(shortcut.followUpCommands.some((command) => /--resume --graph --max-files 200 --health/.test(command)));
  const report = formatCommandCatalog(catalog);
  assert.match(report, /SUPERVIBE_COMMAND_CATALOG/);
  assert.match(report, /index-rag-codegraph/);
  assert.match(report, /SLASH_COMMANDS:/);
  assert.match(report, /NPM_SCRIPTS:/);
  assert.match(report, /AGENT_OWNER: supervibe-orchestrator/);
  assert.match(report, /AGENT_BLOCKED_MODE: agent-required-blocked/);
});

test("command resolver resolves every published slash command explicitly without repo search", () => {
  const commandIds = readdirSync(join(ROOT, "commands"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `/${file.replace(/\.md$/, "")}`)
    .sort();

  assert.ok(commandIds.length >= 19);
  for (const commandId of commandIds) {
    const match = resolveCommandRequest(`${commandId} --help`, {
      pluginRoot: ROOT,
      projectRoot: ROOT,
    });

    assert.equal(match.id, `slash-command:${commandId.slice(1)}`, commandId);
    assert.equal(match.intent, "slash_command", commandId);
    assert.equal(match.slashCommandStatus, "present", commandId);
    assert.equal(match.doNotSearchProject, true, commandId);
    assert.equal(match.command, `${commandId} --help`, commandId);
    assert.equal(match.agentContract.ownerAgentId, COMMAND_AGENT_ORCHESTRATION_CONTRACT.ownerAgentId, commandId);
    assert.match(match.nextAction, /command-agent-plan\.mjs/, commandId);
  }
});

test("command resolver treats no-slash update/adapt requests as command invocations", () => {
  const cases = [
    ["supervibe-adapt", "/supervibe-adapt"],
    ["supervibe-adapt --dry-run", "/supervibe-adapt --dry-run"],
    ["supervibe adapt", "/supervibe-adapt"],
    ["adapt", "/supervibe-adapt"],
    ["supervibe-adpat", "/supervibe-adapt"],
    ["supervibe-update", "/supervibe-update"],
    ["supervibe update", "/supervibe-update"],
    ["supervibe upgrade", "/supervibe-update"],
    ["supervibe-updat", "/supervibe-update"],
    ["update supervibe", "/supervibe-update"],
    ["pull latest supervibe", "/supervibe-update"],
    ["обнови supervibe", "/supervibe-update"],
    ["обнолви плагин", "/supervibe-update"],
    ["обнолвление проекта", "/supervibe-adapt"],
    ["sync project artifacts", "/supervibe-adapt"],
    ["update project artifacts", "/supervibe-adapt"],
  ];

  for (const [request, expectedCommand] of cases) {
    const match = resolveCommandRequest(request, {
      pluginRoot: ROOT,
      projectRoot: ROOT,
    });

    assert.ok(match, request);
    assert.equal(match.command, expectedCommand, request);
    assert.equal(match.doNotSearchProject, true, request);
  }
});

test("command matches expose the real-agent orchestration contract", () => {
  const match = resolveCommandRequest("/supervibe-design build prototype", {
    pluginRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(match.agentContract.ownerAgentId, "supervibe-orchestrator");
  assert.equal(match.agentProfile.defaultExecutionMode, "real-agents");
  assert.ok(match.agentProfile.requiredAgentIds.includes("creative-director"));
  assert.ok(match.agentProfile.requiredAgentIds.includes("prototype-builder"));
  assert.deepEqual(match.agentProfile.immediateAgentIds, ["supervibe-orchestrator"]);
  assert.equal(match.agentProfile.stageGate, "design-wizard");
  assert.deepEqual(match.agentContract.requiredPlanFields, ["agentPlan", "requiredAgentIds"]);
  assert.deepEqual(match.agentContract.requiredReceiptFields, ["hostInvocation.source", "hostInvocation.invocationId"]);

  const report = formatCommandMatch(match);
  assert.match(report, /OWNER_AGENT: supervibe-orchestrator/);
  assert.match(report, /AGENT_EXECUTION_MODES: real-agents, hybrid, inline/);
  assert.match(report, /AGENT_BLOCKED_MODE: agent-required-blocked/);
  assert.match(report, /AGENT_PROOF: hostInvocation\.source, hostInvocation\.invocationId/);
  assert.match(report, /REQUIRED_AGENTS: .*creative-director.*prototype-builder/);
  assert.match(report, /AGENT_PLAN_COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/command-agent-plan\.mjs --command \/supervibe-design/);
  assert.match(report, /AGENT_EMULATION: Do not emulate specialist agents/);
});

test("worktree plan loop request resolves to loop command, not flat plan execution", () => {
  const match = resolveCommandRequest("запусти loop по плану в worktree", {
    pluginRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(match.intent, "supervibe_loop");
  assert.equal(match.command, "/supervibe-loop");
  assert.ok(match.confidence > 0.9);
});

test("slash command parser keeps command id separate from free-form context", () => {
  const match = resolveCommandRequest("/supervibe-genesis т.к мы будем использовать React Next Vite TypeScript Tailwind Laravel PostgreSQL", {
    pluginRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(match.intent, "slash_command");
  assert.equal(match.command, "/supervibe-genesis");
  assert.equal(match.commandId, "/supervibe-genesis");
  assert.match(match.commandContext, /React Next Vite TypeScript Tailwind Laravel PostgreSQL/);
  assert.equal(match.requestedCommand, "/supervibe-genesis т.к мы будем использовать React Next Vite TypeScript Tailwind Laravel PostgreSQL");
  assert.match(formatCommandMatch(match), /COMMAND_CONTEXT: .*React Next Vite TypeScript Tailwind Laravel PostgreSQL/);

  const flagged = resolveCommandRequest("/supervibe-genesis --profile minimal --host codex под next laravel postgres", {
    pluginRoot: ROOT,
    projectRoot: ROOT,
  });
  assert.equal(flagged.command, "/supervibe-genesis --profile minimal --host codex");
  assert.equal(flagged.commandArgs, "--profile minimal --host codex");
  assert.equal(flagged.commandContext, "под next laravel postgres");
});

test("command resolver prefers explicit slash command embedded in long specialist text", () => {
  const request = "The controller must run `/supervibe-plan --review` before claiming Supervibe audit completion.";
  const match = resolveCommandRequest(request, {
    pluginRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(match.intent, "slash_command");
  assert.equal(match.commandId, "/supervibe-plan");
  assert.equal(match.command, "/supervibe-plan --review");
  assert.equal(match.commandArgs, "--review");
  assert.equal(match.doNotSearchProject, true);
});

test("command catalog routes natural-language genesis setup with stack names", () => {
  const match = resolveCommandRequest("сделай genesis scaffold под next laravel postgres", {
    pluginRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.equal(match.command, "/supervibe-genesis");
  assert.equal(match.intent, "genesis_setup");
  assert.equal(match.doNotSearchProject, true);
  assert.match(formatCommandMatch(match), /REQUIRED_AGENTS: .*supervibe-orchestrator/);
});

test("audit command defers domain specialists behind the global maturity gate", () => {
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));

  const plan = buildCommandAgentPlan("/supervibe-audit", {
    availableAgentIds,
    hostAdapterId: "codex",
    enforceHostProof: true,
  });
  const report = formatCommandAgentPlan(plan);

  assert.deepEqual(plan.immediateAgentIds, ["supervibe-orchestrator"]);
  assert.equal(plan.stageGate, "audit-maturity");
  assert.match(plan.stageGateCommand, /supervibe-agent-maturity\.mjs/);
  assert.ok(plan.deferredAgentIds.includes("repo-researcher"));
  assert.ok(plan.deferredAgentIds.includes("memory-curator"));
  assert.ok(plan.deferredAgentIds.includes("quality-gate-reviewer"));
  assert.match(report, /AGENT_STAGE_GATE: audit-maturity/);
  assert.match(report, /CODEX_DEFERRED_SPAWN_PAYLOADS:/);
});

test("command catalog routes Russian plugin and agent-system audit requests", () => {
  for (const request of [
    "Проведи аудит агентской системы",
    "сделай аудит плагина",
    "хочу 10 из 10 аудит агентской системы",
    "audit agent system maturity",
    "rate agent system maturity out of 10",
    "check whether agents are really invoked with receipts instead of emulation",
    "проверь что агенты реально вызываются а не эмулируются",
  ]) {
    const match = resolveCommandRequest(request, {
      pluginRoot: ROOT,
      projectRoot: ROOT,
    });

    assert.equal(match.command, "/supervibe-audit", request);
    assert.equal(match.intent, "supervibe_audit", request);
    assert.equal(match.doNotSearchProject, true, request);
    assert.match(formatCommandMatch(match), /AGENT_STAGE_GATE_COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/supervibe-agent-maturity\.mjs|AGENT_PLAN_COMMAND:/, request);
  }
});

test("command catalog routes mandatory provider agent repair to provisioning", () => {
  for (const request of [
    "fix agents for every provider and make agents mandatory",
    "repair host callable agents across providers",
    "make agents mandatory for each provider",
  ]) {
    const match = resolveCommandRequest(request, {
      pluginRoot: ROOT,
      projectRoot: ROOT,
    });

    assert.equal(match.id, "agent-provisioning", request);
    assert.equal(match.intent, "agent_provisioning", request);
    assert.match(match.command, /supervibe-adapt\.mjs --add-agents/, request);
    assert.equal(match.doNotSearchProject, true, request);
    assert.notEqual(match.command, "/supervibe-audit", request);
  }
});

test("command catalog does not treat host instruction migration as agent provisioning", () => {
  const match = resolveCommandRequest("run host instruction migration in a project where multiple plugins share AGENTS.md and preserve other managed blocks", {
    pluginRoot: ROOT,
    projectRoot: ROOT,
  });

  assert.notEqual(match.intent, "agent_provisioning");
  assert.notEqual(match.command, "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --add-agents <ids> --skills <ids>");
  assert.notEqual(match.id, "agent-provisioning");
});

test("command catalog routes workflow-chain maturity audits before explicit slash preemption", () => {
  for (const request of [
    "audit /supervibe-brainstorm /supervibe-plan /supervibe-execute-plan /supervibe-loop maturity",
    "rate the brainstorm plan execute loop maturity out of 10",
    "audit review-loop plan readiness out of 10",
    "Проведи аудит review-loop системы планов на 10 из 10",
    "оцени зрелость review-loop для планов из 10",
    "проверь насколько прокачана цепочка /supervibe-brainstorm /supervibe-plan /supervibe-execute-plan /supervibe-loop",
  ]) {
    const match = resolveCommandRequest(request, {
      pluginRoot: ROOT,
      projectRoot: ROOT,
    });

    assert.equal(match.command, "/supervibe-audit --workflow-chain", request);
    assert.equal(match.intent, "workflow_chain_audit", request);
    assert.equal(match.doNotSearchProject, true, request);
    assert.equal(match.commandId, "/supervibe-audit", request);
    assert.equal(match.commandArgs, "--workflow-chain", request);
  }
});

test("command catalog routes plan-review complaints to mandatory review instead of audit or execute", () => {
  for (const request of [
    "запусти ревью плана спец агентами",
    "review plan with specialist agents",
    "запусти review loop по плану спец агентами",
    "запусти review loop по плану",
  ]) {
    const match = resolveCommandRequest(request, {
      pluginRoot: ROOT,
      projectRoot: ROOT,
    });

    assert.equal(match.command, "/supervibe-plan --review", request);
    assert.equal(match.intent, "plan_review", request);
    assert.equal(match.commandId, "/supervibe-plan", request);
    assert.equal(match.commandArgs, "--review", request);
    assert.notEqual(match.command, "/supervibe-audit --workflow-chain", request);
    assert.notEqual(match.command, "/supervibe-execute-plan", request);
    assert.equal(match.doNotSearchProject, true, request);
  }
});

test("every slash command has a mandatory real-agents profile", () => {
  const commandIds = readdirSync(join(ROOT, "commands"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `/${file.replace(/\.md$/, "")}`)
    .sort();
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));

  const result = validateCommandAgentProfiles({ commandIds, availableAgentIds });
  assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
  assert.equal(listCommandAgentProfiles().length, commandIds.length);

  for (const commandId of commandIds) {
    const plan = buildCommandAgentPlan(commandId, { availableAgentIds });
    assert.equal(plan.executionMode, "agent-dispatch-required", commandId);
    assert.equal(plan.requestedExecutionMode, "real-agents", commandId);
    assert.equal(plan.ownerAgentId, "supervibe-orchestrator", commandId);
    assert.ok(plan.requiredAgentIds.includes("supervibe-orchestrator"), commandId);
    assert.ok(plan.immediateAgentIds.includes("supervibe-orchestrator"), commandId);
    assert.equal(plan.agentOwnedOutputRequiresReceipts, true, commandId);
    assert.equal(plan.agentOwnedOutputAllowed, false, commandId);
    assert.equal(plan.durableWritesAllowed, false, commandId);
    assert.equal(plan.agentDispatchRequired, true, commandId);
    assert.equal(plan.receiptGate, "pending-runtime-agent-receipts", commandId);
    assert.equal(plan.agentsInstalled, true, commandId);
    assert.equal(plan.agentInvocationsCompleted, false, commandId);
    assert.equal(plan.agentReceiptsTrusted, false, commandId);
    assert.equal(plan.missingAgents.length, 0, commandId);
  }
});

test("command agent plan blocks missing real agents and keeps inline diagnostic only", () => {
  const blocked = buildCommandAgentPlan("/supervibe-design", {
    availableAgentIds: ["supervibe-orchestrator"],
  });
  assert.equal(blocked.executionMode, "agent-required-blocked");
  assert.equal(blocked.durableWritesAllowed, false);
  assert.ok(blocked.missingAgents.includes("creative-director"));
  assert.match(blocked.blockedQuestion.prompt, /\/supervibe-design cannot claim real-agent output yet/);
  assert.ok(blocked.blockedQuestion.choices.every((choice) => choice.id && choice.label && choice.tradeoff));
  assert.ok(blocked.blockedQuestion.choices.some((choice) => /creative-director/.test(choice.tradeoff)));
  assert.ok(blocked.blockedQuestion.choices.every((choice) => choice.label !== choice.id));

  const inline = buildCommandAgentPlan("/supervibe-design", {
    requestedExecutionMode: "inline",
    availableAgentIds: ["supervibe-orchestrator"],
  });
  assert.equal(inline.executionMode, "inline");
  assert.equal(inline.durableWritesAllowed, false);
  assert.equal(inline.agentOwnedOutputAllowed, false);
  assert.match(inline.qualityImpact, /diagnostic\/dry-run only/);
});

test("genesis bootstrap-pre-agent mode allows only base scaffold before project agents exist", () => {
  const plan = buildCommandAgentPlan("/supervibe-genesis", {
    availableAgentIds: [],
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: { bootstrapPreAgent: true },
  });
  const report = formatCommandAgentPlan(plan);

  assert.equal(plan.executionMode, "bootstrap-pre-agent");
  assert.equal(plan.durableWritesAllowed, true);
  assert.equal(plan.bootstrapPreAgentAllowed, true);
  assert.equal(plan.agentOwnedOutputAllowed, false);
  assert.equal(plan.agentOwnedOutputRequiresReceipts, false);
  assert.equal(plan.agentDispatchRequired, false);
  assert.equal(plan.receiptGate, "bootstrap-pre-agent-basic-scaffold");
  assert.ok(plan.missingAgents.includes("supervibe-orchestrator"));
  assert.match(report, /BOOTSTRAP_PRE_AGENT_ALLOWED: true/);
  assert.match(report, /RECEIPT_GATE: bootstrap-pre-agent-basic-scaffold/);
  assert.match(report, /Write only bootstrap scaffold\/state/);
});

test("genesis dry-run/app generation phases are bootstrap-pre-agent without completion claims", () => {
  const dryRun = buildCommandAgentPlan("/supervibe-genesis", {
    availableAgentIds: [],
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: { dryRun: true },
  });
  assert.equal(dryRun.executionMode, "bootstrap-pre-agent");
  assert.equal(dryRun.durableWritesAllowed, false);
  assert.equal(dryRun.bootstrapPreAgentAllowed, true);
  assert.equal(dryRun.agentDispatchRequired, false);
  assert.equal(dryRun.receiptGate, "bootstrap-pre-agent-basic-scaffold");

  const appGeneration = buildCommandAgentPlan("/supervibe-genesis", {
    availableAgentIds: [],
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: { apply: true, generateApps: true },
  });
  assert.equal(appGeneration.executionMode, "bootstrap-pre-agent");
  assert.equal(appGeneration.durableWritesAllowed, true);

  const smokeGate = buildCommandAgentPlan("/supervibe-genesis", {
    availableAgentIds: readdirSync(join(ROOT, "agents"), { recursive: true })
      .filter((entry) => String(entry).endsWith(".md"))
      .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, "")),
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: { verifyAgents: true },
  });
  assert.equal(smokeGate.executionMode, "agent-dispatch-required");
  assert.equal(smokeGate.receiptGate, "pending-runtime-agent-receipts");
});

test("command-agent-plan CLI treats bare Genesis as default dry-run bootstrap phase", () => {
  const out = execFileSync(process.execPath, [
    AGENT_PLAN_SCRIPT,
    "--command",
    "/supervibe-genesis",
    "--host",
    "codex",
    "--installed-only",
  ], {
    cwd: ROOT,
    env: { ...process.env, SUPERVIBE_PLUGIN_ROOT: ROOT },
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  assert.match(out, /EXECUTION_MODE: bootstrap-pre-agent/);
  assert.match(out, /DURABLE_WRITES_ALLOWED: false/);
  assert.match(out, /BOOTSTRAP_PRE_AGENT_ALLOWED: true/);
  assert.match(out, /RECEIPT_GATE: bootstrap-pre-agent-basic-scaffold/);
});

test("adapt dry-run command plan is read-only and agentless while verify-agents keeps the receipt gate", () => {
  const dryRun = buildCommandAgentPlan("/supervibe-adapt", {
    availableAgentIds: [],
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: { dryRun: true, adds: 0, updates: 1, projectOnly: 0, conflicts: 0, memoryWrites: false },
  });
  const report = formatCommandAgentPlan(dryRun);

  assert.equal(dryRun.executionMode, "dry-run-no-agent");
  assert.equal(dryRun.durableWritesAllowed, false);
  assert.equal(dryRun.agentDispatchRequired, false);
  assert.equal(dryRun.agentOwnedOutputRequiresReceipts, false);
  assert.equal(dryRun.receiptGate, "not-required-for-dry-run");
  assert.match(report, /DRY_RUN_AGENTLESS_ALLOWED: true/);
  assert.match(report, /RECEIPT_GATE: not-required-for-dry-run/);

  const verifyAgents = buildCommandAgentPlan("/supervibe-adapt", {
    availableAgentIds: readdirSync(join(ROOT, "agents"), { recursive: true })
      .filter((entry) => String(entry).endsWith(".md"))
      .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, "")),
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: { verifyAgents: true, adds: 0, updates: 1, projectOnly: 0, conflicts: 0, memoryWrites: false },
  });
  assert.equal(verifyAgents.executionMode, "agent-dispatch-required");
  assert.equal(verifyAgents.receiptGate, "pending-runtime-agent-receipts");

  const baselineOnlyApply = buildCommandAgentPlan("/supervibe-adapt", {
    availableAgentIds: [],
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: { apply: true, adds: 0, updates: 0, projectOnly: 0, conflicts: 0, memoryWrites: false },
  });
  const baselineReport = formatCommandAgentPlan(baselineOnlyApply);
  assert.equal(baselineOnlyApply.executionMode, "baseline-only-fast-path");
  assert.equal(baselineOnlyApply.agentDispatchRequired, false);
  assert.equal(baselineOnlyApply.agentOwnedOutputRequiresReceipts, false);
  assert.equal(baselineOnlyApply.receiptGate, "quality-gate-only-baseline-refresh");
  assert.deepEqual(baselineOnlyApply.requiredAgentIds, ["quality-gate-reviewer"]);
  assert.doesNotMatch(baselineReport, /REQUIRED_AGENTS: supervibe-orchestrator/);
  assert.match(baselineReport, /BASELINE_ONLY_FAST_PATH_ALLOWED: true/);
  assert.match(baselineReport, /real-agent dispatch is not required/);
});

test("adapt command agent plan uses low-risk fast path and reports role sources", () => {
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));
  const availableAgentSources = {
    "supervibe-orchestrator": "project artifact",
    "quality-gate-reviewer": "plugin-only",
  };

  const plan = buildCommandAgentPlan("/supervibe-adapt", {
    availableAgentIds,
    availableAgentSources,
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: {
      adds: 0,
      updates: 1,
      projectOnly: 0,
      conflicts: 0,
    },
  });
  const report = formatCommandAgentPlan(plan);

  assert.equal(plan.agentSelectionMode, "low-risk-fast-path");
  assert.deepEqual(plan.requiredAgentIds, ["supervibe-orchestrator", "quality-gate-reviewer"]);
  assert.equal(plan.requiredAgentSources.find((item) => item.agentId === "supervibe-orchestrator").source, "project artifact");
  assert.equal(plan.requiredAgentSources.find((item) => item.agentId === "quality-gate-reviewer").source, "plugin-only");
  assert.match(report, /AGENT_SELECTION_MODE: low-risk-fast-path/);
  assert.match(report, /REQUIRED_AGENT_SOURCES: .*supervibe-orchestrator=project artifact.*quality-gate-reviewer=plugin-only/);
});

test("command agent plan reflects trusted runtime receipt validator state", () => {
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));

  const plan = buildCommandAgentPlan("/supervibe-adapt", {
    availableAgentIds,
    hostAdapterId: "codex",
    enforceHostProof: true,
    receiptTrust: {
      pass: true,
      trustedHostAgentReceipts: 2,
      agentInvocations: 2,
      loggedAgentInvocations: 2,
      minHostAgentReceipts: 1,
      minAgentInvocations: 1,
      issues: [],
    },
    workflowContext: {
      verifyAgents: true,
      adds: 0,
      updates: 0,
      projectOnly: 0,
      conflicts: 0,
      memoryWrites: false,
    },
  });
  const report = formatCommandAgentPlan(plan);

  assert.equal(plan.agentInvocationsCompleted, true);
  assert.equal(plan.agentReceiptsTrusted, true);
  assert.equal(plan.receiptGate, "trusted-runtime-agent-receipts");
  assert.equal(plan.agentDispatchRequired, false);
  assert.match(report, /AGENT_RECEIPTS_TRUSTED: true/);
  assert.match(report, /RECEIPT_GATE: trusted-runtime-agent-receipts/);
});

test("adapt command agent plan does not use fast path when dry-run wrote memory", () => {
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));

  const plan = buildCommandAgentPlan("/supervibe-adapt", {
    availableAgentIds,
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: {
      adds: 0,
      updates: 1,
      projectOnly: 0,
      conflicts: 0,
      memoryWrites: true,
    },
  });

  assert.equal(plan.agentSelectionMode, "standard");
  assert.ok(plan.requiredAgentIds.includes("rules-curator"));
  assert.ok(plan.requiredAgentIds.includes("memory-curator"));
});

test("command agent plan enforces host dispatch proof policy", () => {
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));

  const claude = buildCommandAgentPlan("/supervibe-design", {
    availableAgentIds,
    hostAdapterId: "claude",
    enforceHostProof: true,
  });
  assert.equal(resolveHostAgentDispatcher("claude").nativeTool, "Task");
  assert.equal(claude.executionMode, "agent-dispatch-required");
  assert.equal(claude.requestedExecutionMode, "real-agents");
  assert.equal(claude.hostDispatch.status, "supported");
  assert.equal(claude.durableWritesAllowed, false);
  assert.equal(claude.agentDispatchRequired, true);
  assert.equal(claude.receiptGate, "pending-runtime-agent-receipts");
  assert.equal(claude.agentsInstalled, true);
  assert.equal(claude.hostDispatchAvailable, true);
  assert.equal(claude.agentInvocationsCompleted, false);
  assert.equal(claude.agentReceiptsTrusted, false);

  const codex = buildCommandAgentPlan("/supervibe-design", {
    availableAgentIds,
    hostAdapterId: "codex",
    enforceHostProof: true,
  });
  assert.equal(codex.executionMode, "agent-dispatch-required");
  assert.equal(codex.requestedExecutionMode, "real-agents");
  assert.equal(codex.hostDispatch.nativeTool, "spawn_agent");
  assert.equal(codex.hostDispatch.invocationProof, "codex-spawn-agent");

  const unsupported = buildCommandAgentPlan("/supervibe-design", {
    availableAgentIds,
    hostAdapterId: "cursor",
    enforceHostProof: true,
  });
  assert.equal(unsupported.executionMode, "agent-required-blocked");
  assert.equal(unsupported.hostProofBlocked, true);
  assert.equal(unsupported.durableWritesAllowed, false);
  const report = formatCommandAgentPlan(unsupported);
  assert.match(report, /SUPERVIBE_COMMAND_AGENT_PLAN/);
  assert.match(report, /HOST_DISPATCH: cursor:requires-runtime-proof/);
  assert.match(report, /EMULATION_ALLOWED: false/);
});

test("codex command agent plan emits fork-safe spawn payloads", () => {
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));

  const plan = buildCommandAgentPlan("/supervibe-design", {
    availableAgentIds,
    hostAdapterId: "codex",
    enforceHostProof: true,
  });

  assert.equal(plan.executionMode, "agent-dispatch-required");
  assert.equal(plan.requestedExecutionMode, "real-agents");
  assert.deepEqual(plan.immediateAgentIds, ["supervibe-orchestrator"]);
  assert.ok(plan.deferredAgentIds.includes("creative-director"));
  assert.equal(plan.stageGate, "design-wizard");
  assert.ok(plan.codexSpawnPayloadRules.some((rule) => /fork_context=true.*omit agent_type, model, reasoning_effort/i.test(rule)));
  assert.ok(plan.codexSpawnPayloadRules.some((rule) => /Supervibe logical agent.*message.*not.*agent_type/i.test(rule)));

  const creativeDirector = plan.codexSpawnPayloads.find((payload) => payload.agentId === "creative-director");
  assert.ok(creativeDirector);
  assert.equal(creativeDirector.codexExecutionModeHint, "default");
  assert.equal(creativeDirector.payload.fork_context, true);
  assert.equal(Object.hasOwn(creativeDirector.payload, "agent_type"), false);
  assert.equal(Object.hasOwn(creativeDirector.payload, "model"), false);
  assert.equal(Object.hasOwn(creativeDirector.payload, "reasoning_effort"), false);
  assert.match(creativeDirector.payload.message, /Supervibe required specialist agent `creative-director`/);
  assert.match(creativeDirector.payload.message, /Do not claim inline emulation/);
  assert.match(creativeDirector.payload.message, /typed output contract/);
  assert.match(creativeDirector.receipt.logCommand, /--changed-files <paths> --risks <items> --recommendations <items>/);
  assert.match(creativeDirector.receipt.logCommand, /--issue-receipt --command <command-id> --stage <stage-id>/);
  assert.match(creativeDirector.receipt.logCommand, /--output-artifacts \.supervibe\/artifacts\/_agent-outputs\/<returned-codex-agent-id>\/agent-output\.json/);
  assert.doesNotMatch(creativeDirector.receipt.logCommand, /--output-artifacts (?:none|<paths>)/);
  assert.equal(creativeDirector.receipt.structuredOutput, ".supervibe/artifacts/_agent-outputs/<invocation-id>/agent-output.json");

  const prototypeBuilder = plan.codexSpawnPayloads.find((payload) => payload.agentId === "prototype-builder");
  assert.ok(prototypeBuilder);
  assert.equal(prototypeBuilder.codexExecutionModeHint, "worker");
  assert.equal(prototypeBuilder.payload.fork_context, true);
  assert.equal(Object.hasOwn(prototypeBuilder.payload, "agent_type"), false);

  const report = formatCommandAgentPlan(plan);
  assert.match(report, /CODEX_SPAWN_PAYLOAD_RULES:/);
  assert.match(report, /fork_context=true: omit agent_type, model, reasoning_effort/);
  assert.match(report, /encode Supervibe logical agent role in message/);
  assert.match(report, /CODEX_SPAWN_PAYLOADS:/);
  assert.match(report, /creative-director: \{"fork_context":true,"message":/);
  assert.match(report, /CODEX_SPAWN_NOW_PAYLOADS:/);
  assert.match(report, /supervibe-orchestrator: \{"fork_context":true,"message":/);
  assert.match(report, /CODEX_DEFERRED_SPAWN_PAYLOADS:/);
  assert.match(report, /creative-director: deferred until design-wizard/);
  assert.match(report, /CODEX_RECEIPT_LOG_COMMANDS:/);
  assert.match(report, /--changed-files <paths>/);
  assert.match(report, /--issue-receipt --command <command-id>/);
  assert.match(report, /--output-artifacts \.supervibe\/artifacts\/_agent-outputs\/<returned-codex-agent-id>\/agent-output\.json/);
  assert.doesNotMatch(report, /--output-artifacts (?:none|<paths>)/);
  assert.match(report, /IMMEDIATE_AGENTS: supervibe-orchestrator/);
  assert.match(report, /DEFERRED_AGENTS: .*creative-director.*prototype-builder/);
  assert.match(report, /AGENT_STAGE_GATE: design-wizard/);
  assert.match(report, /NEXT: Invoke immediate owner agent\(s\) now: supervibe-orchestrator/);
});

test("active command agent plan requires scoped receipts instead of unrelated global trust", () => {
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));
  const globalReceiptTrust = {
    pass: true,
    trustedHostAgentReceipts: 12,
    agentInvocations: 12,
    minHostAgentReceipts: 1,
    minAgentInvocations: 1,
  };
  const scopedReceiptTrust = {
    pass: false,
    trustedHostAgentReceipts: 0,
    agentInvocations: 0,
    minHostAgentReceipts: 9,
    minAgentInvocations: 9,
    missingSubjects: ["creative-director", "prototype-builder"],
    issues: [{ code: "missing-scoped-agent-producer-receipt", message: "missing scoped receipts" }],
  };

  const plan = buildCommandAgentPlan("/supervibe-design", {
    availableAgentIds,
    callableAgentIds: availableAgentIds,
    hostAdapterId: "codex",
    enforceHostProof: true,
    receiptTrust: globalReceiptTrust,
    scopedReceiptTrust,
    workflowContext: {
      active: true,
      slug: "new-agent-chat",
      handoffId: "new-agent-chat-run",
    },
  });

  assert.equal(plan.scopedReceiptGateActive, true);
  assert.equal(plan.executionMode, "agent-dispatch-required");
  assert.equal(plan.agentInvocationsCompleted, false);
  assert.equal(plan.agentReceiptsTrusted, false);
  assert.equal(plan.durableWritesAllowed, false);
  assert.equal(plan.agentOwnedOutputRequiresReceipts, true);
  assert.equal(plan.receiptGate, "pending-scoped-runtime-agent-receipts");
  const report = formatCommandAgentPlan(plan);
  assert.match(report, /SCOPED_RECEIPT_GATE: true/);
  assert.match(report, /SCOPED_RECEIPTS_MISSING: creative-director, prototype-builder/);
  assert.match(report, /RECEIPT_GATE: pending-scoped-runtime-agent-receipts/);
});

test("every slash command has codex-safe payloads for every required agent", () => {
  const commandIds = readdirSync(join(ROOT, "commands"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `/${file.replace(/\.md$/, "")}`)
    .sort();
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));

  for (const commandId of commandIds) {
    const plan = buildCommandAgentPlan(commandId, {
      availableAgentIds,
      hostAdapterId: "codex",
      enforceHostProof: true,
    });

    assert.equal(plan.executionMode, "agent-dispatch-required", commandId);
    assert.equal(plan.requestedExecutionMode, "real-agents", commandId);
    assert.equal(plan.codexSpawnPayloads.length, plan.requiredAgentIds.length, commandId);
    for (const spawnPayload of plan.codexSpawnPayloads) {
      assert.deepEqual(Object.keys(spawnPayload.payload).sort(), ["fork_context", "message"], `${commandId}:${spawnPayload.agentId}`);
      assert.equal(spawnPayload.payload.fork_context, true, `${commandId}:${spawnPayload.agentId}`);
      assert.match(spawnPayload.payload.message, new RegExp(`Supervibe required specialist agent \`${spawnPayload.agentId}\``), `${commandId}:${spawnPayload.agentId}`);
      assert.doesNotMatch(JSON.stringify(spawnPayload.payload), /"agent_type"|"model"|"reasoning_effort"/, `${commandId}:${spawnPayload.agentId}`);
      assert.equal(spawnPayload.receipt.hostInvocationSource, "codex-spawn-agent", `${commandId}:${spawnPayload.agentId}`);
      assert.match(spawnPayload.receipt.logCommand, /agent-invocation\.mjs log/, `${commandId}:${spawnPayload.agentId}`);
      assert.match(spawnPayload.receipt.logCommand, /--issue-receipt/, `${commandId}:${spawnPayload.agentId}`);
      assert.match(spawnPayload.receipt.logCommand, /--command <command-id>/, `${commandId}:${spawnPayload.agentId}`);
      assert.match(spawnPayload.receipt.logCommand, /--stage <stage-id>/, `${commandId}:${spawnPayload.agentId}`);
      assert.match(spawnPayload.receipt.logCommand, /--handoff-id <handoff-id>/, `${commandId}:${spawnPayload.agentId}`);
      assert.match(spawnPayload.receipt.logCommand, /--output-artifacts \.supervibe\/artifacts\/_agent-outputs\/<returned-codex-agent-id>\/agent-output\.json/, `${commandId}:${spawnPayload.agentId}`);
      assert.doesNotMatch(spawnPayload.receipt.logCommand, /--output-artifacts (?:none|<paths>)/, `${commandId}:${spawnPayload.agentId}`);
      assert.equal(spawnPayload.receipt.structuredOutput, ".supervibe/artifacts/_agent-outputs/<invocation-id>/agent-output.json", `${commandId}:${spawnPayload.agentId}`);
    }
  }
});

test("every command stays agent-first across host providers and blocks inline claims", () => {
  const commandIds = readdirSync(join(ROOT, "commands"))
    .filter((file) => file.endsWith(".md"))
    .map((file) => `/${file.replace(/\.md$/, "")}`)
    .sort();
  const availableAgentIds = readdirSync(join(ROOT, "agents"), { recursive: true })
    .filter((entry) => String(entry).endsWith(".md"))
    .map((entry) => String(entry).replace(/\\/g, "/").split("/").pop().replace(/\.md$/, ""));

  for (const commandId of commandIds) {
    for (const hostAdapterId of ["claude", "codex"]) {
      const plan = buildCommandAgentPlan(commandId, {
        availableAgentIds,
        hostAdapterId,
        enforceHostProof: true,
      });

      assert.equal(plan.defaultExecutionMode, "real-agents", `${commandId}:${hostAdapterId}`);
      assert.equal(plan.requestedExecutionMode, "real-agents", `${commandId}:${hostAdapterId}`);
      assert.equal(plan.executionMode, "agent-dispatch-required", `${commandId}:${hostAdapterId}`);
      assert.equal(plan.hostDispatchAvailable, true, `${commandId}:${hostAdapterId}`);
      assert.equal(plan.agentDispatchRequired, true, `${commandId}:${hostAdapterId}`);
      assert.equal(plan.agentOwnedOutputAllowed, false, `${commandId}:${hostAdapterId}`);
      assert.equal(plan.durableWritesAllowed, false, `${commandId}:${hostAdapterId}`);
      assert.equal(plan.inlineDraftAllowed, false, `${commandId}:${hostAdapterId}`);
      assert.equal(plan.receiptGate, "pending-runtime-agent-receipts", `${commandId}:${hostAdapterId}`);
      assert.deepEqual(plan.requiredReceiptFields, ["hostInvocation.source", "hostInvocation.invocationId"], `${commandId}:${hostAdapterId}`);
      assert.match(plan.qualityImpact, /runtime agent receipts/i, `${commandId}:${hostAdapterId}`);
    }

    for (const hostAdapterId of ["cursor", "gemini", "opencode", "unknown-host"]) {
      const plan = buildCommandAgentPlan(commandId, {
        availableAgentIds,
        hostAdapterId,
        enforceHostProof: true,
      });

      assert.equal(plan.executionMode, "agent-required-blocked", `${commandId}:${hostAdapterId}`);
      assert.equal(plan.hostProofBlocked, true, `${commandId}:${hostAdapterId}`);
      assert.equal(plan.agentOwnedOutputAllowed, false, `${commandId}:${hostAdapterId}`);
      assert.equal(plan.durableWritesAllowed, false, `${commandId}:${hostAdapterId}`);
      assert.equal(plan.inlineDraftAllowed, false, `${commandId}:${hostAdapterId}`);
      assert.match(plan.qualityImpact, /requires runtime invocation proof|requires real-agent dispatch/i, `${commandId}:${hostAdapterId}`);
    }

    const inline = buildCommandAgentPlan(commandId, {
      availableAgentIds,
      hostAdapterId: "codex",
      requestedExecutionMode: "inline",
      enforceHostProof: true,
    });
    assert.equal(inline.executionMode, "inline", commandId);
    assert.equal(inline.agentOwnedOutputAllowed, false, commandId);
    assert.equal(inline.durableWritesAllowed, false, commandId);
    assert.equal(inline.agentOwnedOutputRequiresReceipts, false, commandId);
    assert.equal(inline.inlineDraftAllowed, true, commandId);
    assert.match(inline.qualityImpact, /diagnostic\/dry-run only/i, commandId);
  }
});

test("command-agent-plan CLI prints runtime host plan", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-plan-cli-"));
  try {
    const designAgents = [
      "supervibe-orchestrator",
      "creative-director",
      "design-system-architect",
      "ux-ui-designer",
      "copywriter",
      "prototype-builder",
      "accessibility-reviewer",
      "ui-polish-reviewer",
      "quality-gate-reviewer",
    ];
    installHostAgentFiles(projectRoot, ".claude/agents", designAgents);
    installHostAgentFiles(projectRoot, ".codex/agents", designAgents);
    const baseArgs = ["--root", projectRoot];
    const claude = execFileSync(process.execPath, [
      AGENT_PLAN_SCRIPT,
      "--command",
      "/supervibe-design",
      "--host",
      "claude",
      ...baseArgs,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(claude, /SUPERVIBE_COMMAND_AGENT_PLAN/);
    assert.match(claude, /EXECUTION_MODE: agent-dispatch-required/);
    assert.match(claude, /DEFAULT_MODE: real-agents/);
    assert.match(claude, /RECEIPT_GATE: pending-runtime-agent-receipts/);
    assert.match(claude, /HOST_TOOL: Task/);
    assert.match(claude, /REQUIRED_AGENTS: .*creative-director.*prototype-builder/);

    const codex = execFileSync(process.execPath, [
      AGENT_PLAN_SCRIPT,
      "--command",
      "/supervibe-design",
      "--host",
      "codex",
      ...baseArgs,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(codex, /HOST_TOOL: spawn_agent/);
    assert.match(codex, /CODEX_SPAWN_PAYLOAD_RULES:/);
    assert.match(codex, /fork_context=true: omit agent_type, model, reasoning_effort/);
    assert.doesNotMatch(codex, /"agent_type"/);
    assert.doesNotMatch(codex, /"reasoning_effort"/);

    const blocked = execFileSync(process.execPath, [
      AGENT_PLAN_SCRIPT,
      "--command",
      "/supervibe-design",
      "--host",
      "cursor",
      ...baseArgs,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(blocked, /EXECUTION_MODE: agent-required-blocked/);
    assert.match(blocked, /HOST_DISPATCH: cursor:requires-runtime-proof/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command-agent-plan CLI separates plugin definitions from host-callable agents", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-plan-callable-"));
  try {
    const out = execFileSync(process.execPath, [
      AGENT_PLAN_SCRIPT,
      "--root",
      projectRoot,
      "--command",
      "/supervibe-design",
      "--host",
      "codex",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(out, /EXECUTION_MODE: agent-required-blocked/);
    assert.match(out, /AGENTS_INSTALLED: true/);
    assert.match(out, /CALLABLE_AGENTS_READY: false/);
    assert.match(out, /MISSING_CALLABLE_AGENTS: .*creative-director.*prototype-builder/);
    assert.match(out, /CALLABLE_AGENT_SOURCES: .*creative-director=missing/);
    assert.doesNotMatch(out, /CODEX_SPAWN_PAYLOADS:/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command-agent-plan CLI trusts runtime agent receipts when validators pass", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-plan-trusted-"));
  try {
    installHostAgentFiles(projectRoot, ".codex/agents", [
      "supervibe-orchestrator",
      "repo-researcher",
      "rules-curator",
      "memory-curator",
      "quality-gate-reviewer",
    ]);
    const outputRel = ".supervibe/artifacts/brandbook/direction.md";
    mkdirSync(join(projectRoot, ".supervibe", "artifacts", "brandbook"), { recursive: true });
    mkdirSync(join(projectRoot, ".supervibe", "memory"), { recursive: true });
    writeFileSync(join(projectRoot, ...outputRel.split("/")), "# Direction\n", "utf8");
    writeFileSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl"), `${JSON.stringify({
      schemaVersion: 1,
      invocation_id: "codex-agent-trusted-1",
      ts: "2026-05-05T00:00:00.000Z",
      agent_id: "creative-director",
      task_summary: "Brand direction specialist output",
      confidence_score: 9.4,
    })}\n`, "utf8");
    execFileSync(process.execPath, [
      join(ROOT, "scripts", "workflow-receipt.mjs"),
      "issue",
      "--root",
      projectRoot,
      "--command",
      "/supervibe-design",
      "--agent",
      "creative-director",
      "--host-invocation-source",
      "codex-spawn-agent",
      "--host-invocation-id",
      "codex-agent-trusted-1",
      "--stage",
      "stage-1-brand-direction",
      "--reason",
      "Brand direction specialist output",
      "--output",
      outputRel,
      "--handoff",
      "trusted-command-plan",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const out = execFileSync(process.execPath, [
      AGENT_PLAN_SCRIPT,
      "--root",
      projectRoot,
      "--command",
      "/supervibe-adapt",
      "--host",
      "codex",
      "--verify-agents",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(out, /AGENT_INVOCATIONS_COMPLETED: true/);
    assert.match(out, /AGENT_RECEIPTS_TRUSTED: true/);
    assert.match(out, /RECEIPT_GATE: trusted-runtime-agent-receipts/);
    assert.doesNotMatch(out, /RECEIPT_GATE: pending-runtime-agent-receipts/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver resolves plugin npm scripts from projects that do not define them", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");
    const scripts = Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts)
      .filter((name) => name !== "prepare")
      .sort();

    assert.ok(scripts.length >= 60);
    for (const script of scripts) {
      const match = resolveCommandRequest(`npm run ${script}`, {
        pluginRoot: ROOT,
        projectRoot,
      });

      assert.notEqual(match.intent, "missing_npm_script", script);
      assert.equal(match.requestedCommand, `npm run ${script}`, script);
      assert.equal(match.requestedPackageManager, "npm", script);
      assert.equal(match.projectScriptStatus, "missing", script);
      assert.ok(["present", "known-shortcut"].includes(match.pluginScriptStatus), script);
      assert.equal(match.doNotSearchProject, true, script);
      assert.ok(match.command.includes("<resolved-supervibe-plugin-root>"), script);
    }
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver understands npm, pnpm, yarn, bun, shortcut scripts, and script args", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        test: "vitest",
        dev: "vite",
      },
    }, null, 2), "utf8");

    const packageManagerCases = [
      ["pnpm run supervibe:status -- --json", "pnpm", "pnpm run supervibe:status -- --json", /supervibe-status\.mjs --json/],
      ["yarn supervibe:doctor -- --host codex", "yarn", "yarn supervibe:doctor -- --host codex", /supervibe-doctor\.mjs --host codex/],
      ["bun run supervibe:ui -- --file graph.json", "bun", "bun run supervibe:ui -- --file graph.json", /supervibe-ui\.mjs --file graph\.json/],
    ];

    for (const [request, manager, requested, commandPattern] of packageManagerCases) {
      const match = resolveCommandRequest(request, { pluginRoot: ROOT, projectRoot });
      assert.equal(match.intent, "plugin_npm_script", request);
      assert.equal(match.requestedPackageManager, manager, request);
      assert.equal(match.requestedCommand, requested, request);
      assert.match(match.command, commandPattern, request);
      assert.equal(match.doNotSearchProject, true, request);
    }

    const npmTest = resolveCommandRequest("npm test", { pluginRoot: ROOT, projectRoot });
    assert.equal(npmTest.intent, "project_npm_script");
    assert.equal(npmTest.command, "npm test");
    assert.equal(npmTest.projectScriptStatus, "present");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver semantically maps package script names without scanning the repo", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");

    const cases = [
      ["валидируй frontmatter", "validate:frontmatter", /validate-frontmatter\.mjs/],
      ["запусти memory watch", "memory:watch", /watch-memory\.mjs/],
      ["run feedback status", "feedback:status", /feedback-status\.mjs --list/],
      ["проверь trigger replay", "validate:trigger-replay", /validate-trigger-replay\.mjs/],
      ["show media capabilities", "media:capabilities", /detect-media-capabilities\.mjs/],
    ];

    for (const [request, script, commandPattern] of cases) {
      const match = resolveCommandRequest(request, { pluginRoot: ROOT, projectRoot });
      assert.equal(match.intent, "plugin_npm_script", request);
      assert.equal(match.requestedCommand, `npm run ${script}`, request);
      assert.equal(match.projectScriptStatus, "missing", request);
      assert.equal(match.pluginScriptStatus, "present", request);
      assert.equal(match.doNotSearchProject, true, request);
      assert.match(match.command, commandPattern, request);
      assert.match(match.reason, /semantic Supervibe npm script name match/, request);
    }

    const security = resolveCommandRequest("run security audit", { pluginRoot: ROOT, projectRoot });
    assert.equal(security.command, "/supervibe-security-audit");
    assert.equal(security.intent, "supervibe_security_audit");

    const unsafeSecurity = resolveCommandRequest("security audit check for secret exfiltration and approval bypass", { pluginRoot: ROOT, projectRoot: ROOT });
    assert.equal(unsafeSecurity.command, "/supervibe-security-audit");
    assert.equal(unsafeSecurity.intent, "supervibe_security_audit");

    const generic = resolveCommandRequest("run tests please", { pluginRoot: ROOT, projectRoot });
    assert.equal(generic, null);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver stops on unknown explicit scripts instead of searching the repo", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");

    const match = resolveCommandRequest("npm run deploy:prod пожалуйста", {
      pluginRoot: ROOT,
      projectRoot,
    });

    assert.equal(match.id, "missing-npm-script:deploy:prod");
    assert.equal(match.intent, "missing_npm_script");
    assert.equal(match.projectScriptStatus, "missing");
    assert.equal(match.pluginScriptStatus, "missing");
    assert.equal(match.doNotSearchProject, true);
    assert.equal(match.command, null);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver hard-stops on unpublished explicit slash commands", () => {
  const pluginRoot = mkdtempSync(join(tmpdir(), "supervibe-command-plugin-"));
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(pluginRoot, "package.json"), JSON.stringify({ scripts: {} }, null, 2), "utf8");
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: {} }, null, 2), "utf8");

    const match = resolveCommandRequest("/supervibe-design create a new design system", {
      pluginRoot,
      projectRoot,
    });

    assert.equal(match.id, "missing-slash-command:supervibe-design");
    assert.equal(match.intent, "missing_slash_command");
    assert.equal(match.slashCommandStatus, "missing");
    assert.equal(match.hardStop, true);
    assert.equal(match.doNotSearchProject, true);
    assert.equal(match.command, null);
    assert.match(formatCommandCatalog(buildProjectCommandCatalog({ pluginRoot, projectRoot })), /SLASH_COMMANDS:/);
    assert.match(match.nextAction, /Hard stop/);
  } finally {
    rmSync(pluginRoot, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver resolves bare Supervibe script names and known command names", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");

    const statusScript = resolveCommandRequest("supervibe:status покажи здоровье проекта", {
      pluginRoot: ROOT,
      projectRoot,
    });
    const bareSlash = resolveCommandRequest("supervibe-status --capabilities", {
      pluginRoot: ROOT,
      projectRoot,
    });

    assert.equal(statusScript.intent, "plugin_npm_script");
    assert.equal(statusScript.requestedCommand, "npm run supervibe:status");
    assert.match(statusScript.command, /supervibe-status\.mjs/);
    assert.equal(bareSlash.id, "slash-command:supervibe-status");
    assert.equal(bareSlash.command, "/supervibe-status --capabilities");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command catalog covers primary workflow intents in English and Russian", () => {
  const cases = [
    ["сделай брейншторм идеи", "/supervibe-brainstorm"],
    ["brainstorm the feature", "/supervibe-brainstorm"],
    ["напиши план реализации", "/supervibe-plan"],
    ["create implementation plan", "/supervibe-plan"],
    ["выполни план", "/supervibe-execute-plan"],
    ["execute reviewed plan", "/supervibe-execute-plan"],
    ["сделай дизайн макет UI", "/supervibe-design"],
    ["build a UI prototype", "/supervibe-design"],
    ["запусти превью прототипа", "/supervibe-preview"],
    ["start preview server", "/supervibe-preview"],
    ["покажи статус проекта", "/supervibe-status"],
    ["show project status", "/supervibe-status"],
    ["проведи аудит проекта", "/supervibe-audit"],
    ["run project audit", "/supervibe-audit"],
    ["проверь безопасность", "/supervibe-security-audit"],
    ["run security audit", "/supervibe-security-audit"],
    ["усиль слабых агентов", "/supervibe-strengthen"],
    ["strengthen weak agents", "/supervibe-strengthen"],
    ["обнови плагин", "/supervibe-update"],
    ["update the plugin", "/supervibe-update"],
    ["адаптируй проект после обновления", "/supervibe-adapt"],
    ["adapt project artifacts after update", "/supervibe-adapt"],
    ["покажи kanban доску задач", "/supervibe-ui"],
    ["open kanban dashboard", "/supervibe-ui"],
    ["сделай презентацию", "/supervibe-presentation"],
    ["build slide deck", "/supervibe-presentation"],
  ];

  for (const [request, command] of cases) {
    const match = resolveCommandRequest(request, { pluginRoot: ROOT, projectRoot: ROOT });
    assert.equal(match?.command, command, request);
    assert.equal(match.doNotSearchProject, true, request);
  }
});

test("command catalog matches natural-language RAG/CodeGraph indexing without repo-wide search", () => {
  const phrases = [
    "npm run code:index вот запусти индексацию",
    "`npm run code:index` запусти",
    "запусти индексирование rag/codegraph",
    "запусти индексацию",
    "проиндексируй проект",
    "переиндексируй кодовую базу",
    "обнови code rag",
    "собери codegraph",
    "refresh code index",
    "run code:index",
    "build code rag index",
    "start indexing the project",
    "run the supervibe code indexer",
    "почини rag индекс",
  ];

  for (const phrase of phrases) {
    const match = findCommandShortcut(phrase);
    assert.equal(match?.id, "index-rag-codegraph", phrase);
    assert.equal(match.intent, "code_index_build", phrase);
    assert.match(match.command, /--source-only --max-files 200 --max-seconds 120 --health --json-progress/, phrase);
    assert.doesNotMatch(match.command, /--no-embeddings --graph/, phrase);
  }
});

test("command catalog does not hijack RAG/CodeGraph quality complaints as indexing commands", () => {
  const quality = findCommandShortcut("agents are weak and memory rag codegraph quality wastes tokens");
  const health = findCommandShortcut("покажи index health rag codegraph");

  assert.notEqual(quality?.id, "index-rag-codegraph");
  assert.equal(health?.id, "index-health");
  assert.equal(health.directRoute, false);
});

test("command resolver maps missing project npm code:index to portable Supervibe index flow", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        dev: "vite",
        build: "vite build",
        preview: "vite preview",
      },
    }, null, 2), "utf8");

    const match = resolveCommandRequest("npm run code:index вот запусти индексацию", {
      pluginRoot: ROOT,
      projectRoot,
    });

    assert.equal(match.id, "index-rag-codegraph");
    assert.equal(match.requestedCommand, "npm run code:index");
    assert.equal(match.projectScriptStatus, "missing");
    assert.equal(match.doNotSearchProject, true);
    assert.match(match.command, /<resolved-supervibe-plugin-root>\/scripts\/build-code-index\.mjs --root \. --resume --source-only/);
    assert.ok(match.followUpCommands.some((command) => /--resume --graph/.test(command)));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("command resolver preserves available project npm scripts instead of scanning the repo", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-project-"));
  try {
    writeFileSync(join(projectRoot, "package.json"), JSON.stringify({
      scripts: {
        dev: "vite --host 127.0.0.1",
      },
    }, null, 2), "utf8");

    const match = resolveCommandRequest("npm run dev запусти", {
      pluginRoot: ROOT,
      projectRoot,
    });

    assert.equal(match.id, "project-npm-script:dev");
    assert.equal(match.intent, "project_npm_script");
    assert.equal(match.projectScriptStatus, "present");
    assert.equal(match.command, "npm run dev");
    assert.equal(match.doNotSearchProject, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("supervibe-commands CLI prints the exact matched command", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-cli-"));
  writeFileSync(join(projectRoot, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }, null, 2), "utf8");
  const out = execFileSync(process.execPath, [
    COMMANDS_SCRIPT,
    "--match",
    "npm run code:index вот запусти индексацию",
    "--project",
    projectRoot,
    "--no-color",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  rmSync(projectRoot, { recursive: true, force: true });

  assert.match(out, /SUPERVIBE_COMMAND_MATCH/);
  assert.match(out, /MATCH: index-rag-codegraph/);
  assert.match(out, /REQUESTED: npm run code:index/);
  assert.match(out, /PROJECT_SCRIPT: missing/);
  assert.match(out, /DO_NOT_SEARCH_PROJECT: true/);
  assert.match(out, /COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/build-code-index\.mjs --root \. --resume --source-only/);
  assert.match(out, /FOLLOW_UP_COMMANDS:/);
  assert.match(out, /--resume --graph/);
});

test("supervibe-commands CLI falls back to semantic trigger routing before broad search", () => {
  const out = execFileSync(process.execPath, [
    COMMANDS_SCRIPT,
    "--match",
    "agents do not use memory rag or codegraph",
    "--no-color",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  assert.match(out, /MATCH: semantic-trigger:agent_strengthen/);
  assert.match(out, /COMMAND: \/supervibe-strengthen/);
  assert.match(out, /DO_NOT_SEARCH_PROJECT: true/);
});

test("supervibe-commands CLI exposes no-tty help", () => {
  const out = execFileSync(process.execPath, [COMMANDS_SCRIPT, "--help"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  assert.match(out, /SUPERVIBE_COMMANDS_HELP/);
  assert.match(out, /--match/);
  assert.match(out, /code:index/);
  assert.match(out, /дизайн/);
});

test("genesis managed context tells agents to use command lookup before broad search", () => {
  const source = readFileSync(join(ROOT, "scripts", "lib", "supervibe-agent-recommendation.mjs"), "utf8");

  assert.match(source, /Fast Command Lookup/);
  assert.match(source, /Agent Orchestration Contract/);
  assert.match(source, /command-agent-orchestration-contract\.mjs/);
  assert.match(source, /rules\/command-agent-orchestration\.md/);
  assert.match(source, /supervibe-orchestrator/);
  assert.match(source, /command-agent-plan\.mjs/);
  assert.match(source, /SUPERVIBE_COMMAND_AGENT_PLAN/);
  assert.match(source, /agentPlan/);
  assert.match(source, /requiredAgentIds/);
  assert.match(source, /agent-required-blocked/);
  assert.match(source, /agent-invocation\.mjs/);
  assert.match(source, /spawn_agent/);
  assert.match(source, /supervibe-commands\.mjs --match/);
  assert.match(source, /npm run code:index/);
  assert.match(source, /--resume --source-only/);
});

test("project-facing command guidance avoids project-local npm run code:index assumptions", () => {
  const files = [
    "skills/audit/SKILL.md",
    "skills/code-search/SKILL.md",
    "skills/strengthen/SKILL.md",
    "commands/supervibe.md",
    "scripts/lib/supervibe-agent-recommendation.mjs",
    "scripts/lib/supervibe-adapt.mjs",
    "scripts/lib/supervibe-index-health.mjs",
    "scripts/lib/supervibe-ui-server.mjs",
    "scripts/supervibe-status.mjs",
  ];

  for (const file of files) {
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.doesNotMatch(text, /Run: npm run code:index|Run npm run code:index|run `npm run code:index`|nextAction: "Run npm run code:index/i, file);
    assert.doesNotMatch(text, /node scripts\/build-code-index\.mjs --root \./, file);
  }
});
