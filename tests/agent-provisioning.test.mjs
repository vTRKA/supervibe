import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  applyAgentProvisioningPlan,
  createAgentProvisioningPlan,
  formatAgentProvisioningPlan,
} from "../scripts/lib/agent-provisioning.mjs";
import { loadAvailableAgents } from "../scripts/lib/autonomous-loop-dispatcher.mjs";
import { loadAgentRosterSync } from "../scripts/lib/supervibe-agent-roster.mjs";
import { resolveCommandRequest } from "../scripts/lib/supervibe-command-catalog.mjs";
import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("agent provisioning installs missing agents and refreshes host instructions", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-project-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-plugin-"));
  try {
    await writeUtf8(projectRoot, "AGENTS.md", "# AGENTS\n\n## Local\nKeep this.\n");
    await writeUtf8(pluginRoot, "agents/_design/creative-director.md", [
      "---",
      "name: creative-director",
      "namespace: _design",
      "description: Creative direction specialist for product-grade design systems.",
      "skills:",
      "  - supervibe:brandbook",
      "---",
      "# Creative Director",
      "",
    ].join("\n"));
    await writeUtf8(pluginRoot, "skills/brandbook/SKILL.md", "# Brandbook\n");

    const plan = createAgentProvisioningPlan({
      projectRoot,
      pluginRoot,
      adapterId: "codex",
      agentIds: ["creative-director"],
      skillIds: ["supervibe:brandbook"],
    });

    assert.equal(plan.readyToApply, true, formatAgentProvisioningPlan(plan));
    assert.equal(plan.contextRefresh.instructionPath, "AGENTS.md");
    assert.ok(plan.agents.some((entry) => entry.targetRel === ".codex/agents/creative-director.md"));
    assert.ok(plan.skills.some((entry) => entry.targetRel === ".codex/skills/brandbook"));

    const result = await applyAgentProvisioningPlan(plan);

    assert.equal(result.applied.length, 2);
    assert.equal(existsSync(join(projectRoot, ".codex", "agents", "creative-director.md")), true);
    assert.equal(existsSync(join(projectRoot, ".codex", "skills", "brandbook", "SKILL.md")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "agent-provisioning", "last-apply.json")), true);

    const instructions = await readFile(join(projectRoot, "AGENTS.md"), "utf8");
    assert.match(instructions, /## Local/);
    assert.match(instructions, /SUPERVIBE:BEGIN managed-context codex/);
    assert.match(instructions, /creative-director/);
    assert.match(instructions, /Do not emulate an agent-owned stage/);

    const roster = loadAgentRosterSync({ rootDir: projectRoot });
    assert.ok(roster.agents.some((agent) => agent.id === "creative-director" && agent.path === ".codex/agents/creative-director.md"));

    const available = await loadAvailableAgents(projectRoot);
    assert.equal(available["creative-director"], ".codex/agents/creative-director.md");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("agent provisioning treats shared agent definitions as source, not host-callable presence", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-shared-source-"));
  try {
    await writeUtf8(projectRoot, "AGENTS.md", "# AGENTS\n");
    await writeUtf8(projectRoot, "agents/_meta/supervibe-orchestrator.md", [
      "---",
      "name: supervibe-orchestrator",
      "namespace: _meta",
      "description: Workflow orchestrator.",
      "---",
      "# Supervibe Orchestrator",
      "",
    ].join("\n"));

    const plan = createAgentProvisioningPlan({
      projectRoot,
      pluginRoot: projectRoot,
      adapterId: "codex",
      agentIds: ["supervibe-orchestrator"],
    });

    assert.equal(plan.readyToApply, true, formatAgentProvisioningPlan(plan));
    assert.equal(plan.counts.add, 1);
    assert.equal(plan.counts.present, 0);
    assert.ok(plan.agents.some((entry) => entry.status === "add" && entry.targetRel === ".codex/agents/supervibe-orchestrator.md"));
    assert.doesNotMatch(formatAgentProvisioningPlan(plan), /all requested agents and skills are already present/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("skills-only provisioning preserves existing host-callable agent roles", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-skills-only-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-skills-plugin-"));
  try {
    await writeUtf8(projectRoot, "AGENTS.md", "# AGENTS\n");
    await writeUtf8(projectRoot, ".codex/agents/creative-director.md", [
      "---",
      "name: creative-director",
      "namespace: _design",
      "description: Creative direction specialist for product-grade design systems.",
      "---",
      "# Creative Director",
      "",
    ].join("\n"));
    await writeUtf8(pluginRoot, "skills/brandbook/SKILL.md", "# Brandbook\n");

    const plan = createAgentProvisioningPlan({
      projectRoot,
      pluginRoot,
      adapterId: "codex",
      skillIds: ["supervibe:brandbook"],
    });

    assert.equal(plan.readyToApply, true, formatAgentProvisioningPlan(plan));
    assert.equal(plan.counts.add, 1);
    assert.match(plan.contextMigration.afterContent, /Provisioned\/requested agents: none/);
    assert.match(plan.contextMigration.afterContent, /Host-callable agents: creative-director/);
    assert.match(plan.contextMigration.afterContent, /- creative-director: Creative direction specialist/);
    assert.match(plan.contextMigration.afterContent, /## Current Provisioning\n- agent:creative-director present -> \.codex\/agents\/creative-director\.md/);
    assert.match(plan.contextMigration.afterContent, /## Requested Provisioning Operation\n- skill:supervibe:brandbook add -> \.codex\/skills\/brandbook/);
    assert.doesNotMatch(plan.contextMigration.afterContent, /## Agent Roles\n- none/);

    await applyAgentProvisioningPlan(plan);
    const instructions = await readFile(join(projectRoot, "AGENTS.md"), "utf8");
    assert.match(instructions, /Host-callable agents: creative-director/);
    assert.match(instructions, /- creative-director: Creative direction specialist/);
    assert.match(instructions, /## Current Provisioning\n- agent:creative-director present -> \.codex\/agents\/creative-director\.md/);
    assert.match(instructions, /## Requested Provisioning Operation\n- skill:supervibe:brandbook add -> \.codex\/skills\/brandbook/);
    assert.doesNotMatch(instructions, /## Agent Roles\n- none/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("agent provisioning detects host-callable duplicate when shared source also exists", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-host-duplicate-"));
  try {
    await writeUtf8(projectRoot, "agents/_design/creative-director.md", [
      "---",
      "name: creative-director",
      "namespace: _design",
      "description: Shared creative direction specialist.",
      "---",
      "# Shared Creative Director",
      "",
    ].join("\n"));
    await writeUtf8(projectRoot, ".codex/agents/creative-director.md", [
      "---",
      "name: creative-director",
      "namespace: _design",
      "description: Host-callable creative direction specialist.",
      "---",
      "# Host Creative Director",
      "",
    ].join("\n"));

    const plan = createAgentProvisioningPlan({
      projectRoot,
      pluginRoot: projectRoot,
      adapterId: "codex",
      agentIds: ["creative-director"],
    });

    assert.equal(plan.readyToApply, false);
    assert.equal(plan.counts.present, 1);
    assert.ok(plan.agents.some((entry) => entry.status === "present" && entry.projectRel === ".codex/agents/creative-director.md"));
    assert.match(plan.contextMigration.afterContent, /Host-callable agents: creative-director/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("agent provisioning migrates legacy namespaced host agents to flat runtime files", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-legacy-host-"));
  const pluginRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-legacy-plugin-"));
  try {
    await writeUtf8(projectRoot, "AGENTS.md", "# AGENTS\n");
    await writeUtf8(projectRoot, ".codex/agents/_core/security-auditor.md", [
      "---",
      "name: security-auditor",
      "namespace: _core",
      "description: Legacy nested host security auditor.",
      "---",
      "# Legacy Security Auditor",
      "",
    ].join("\n"));
    await writeUtf8(pluginRoot, "agents/_core/security-auditor.md", [
      "---",
      "name: security-auditor",
      "namespace: _core",
      "description: Security auditor.",
      "---",
      "# Security Auditor",
      "",
    ].join("\n"));

    const plan = createAgentProvisioningPlan({
      projectRoot,
      pluginRoot,
      adapterId: "codex",
      agentIds: ["security-auditor"],
    });

    assert.equal(plan.readyToApply, true, formatAgentProvisioningPlan(plan));
    assert.equal(plan.counts.add, 1);
    assert.equal(plan.counts.present, 0);
    assert.ok(plan.agents.some((entry) => entry.status === "add" && entry.targetRel === ".codex/agents/security-auditor.md"));
    assert.match(plan.contextMigration.afterContent, /Host-callable agents: security-auditor/);
    assert.match(plan.contextMigration.afterContent, /## Current Provisioning\n- agent:security-auditor add -> \.codex\/agents\/security-auditor\.md/);
    assert.match(plan.contextMigration.afterContent, /## Requested Provisioning Operation\n- agent:security-auditor add -> \.codex\/agents\/security-auditor\.md/);

    await applyAgentProvisioningPlan(plan);
    assert.equal(existsSync(join(projectRoot, ".codex", "agents", "security-auditor.md")), true);

    const available = await loadAvailableAgents(projectRoot);
    assert.equal(available["security-auditor"], ".codex/agents/security-auditor.md");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("agent provisioning targets the selected host runtime folder for every provider", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-provider-matrix-"));
  try {
    await writeUtf8(projectRoot, "agents/_meta/supervibe-orchestrator.md", [
      "---",
      "name: supervibe-orchestrator",
      "namespace: _meta",
      "description: Workflow orchestrator.",
      "---",
      "# Supervibe Orchestrator",
      "",
    ].join("\n"));

    const expectedPrefixes = {
      claude: ".claude/agents/",
      codex: ".codex/agents/",
      cursor: ".cursor/agents/",
      gemini: ".gemini/agents/",
      opencode: ".opencode/agents/",
    };

    for (const [adapterId, prefix] of Object.entries(expectedPrefixes)) {
      const plan = createAgentProvisioningPlan({
        projectRoot,
        pluginRoot: projectRoot,
        adapterId,
        agentIds: ["supervibe-orchestrator"],
      });

      assert.equal(plan.readyToApply, true, `${adapterId}: ${formatAgentProvisioningPlan(plan)}`);
      assert.ok(plan.agents.some((entry) => entry.status === "add" && entry.targetRel.startsWith(prefix)), adapterId);
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("agent provisioning writes flat runtime agents and matching instruction file for every provider", async () => {
  const pluginRoot = await mkdtemp(join(tmpdir(), "supervibe-agent-provision-provider-plugin-"));
  try {
    await writeUtf8(pluginRoot, "agents/_core/security-auditor.md", [
      "---",
      "name: security-auditor",
      "namespace: _core",
      "description: Security auditor.",
      "---",
      "# Security Auditor",
      "",
    ].join("\n"));

    const expected = {
      claude: { agentRel: ".claude/agents/security-auditor.md", instructionRel: "CLAUDE.md" },
      codex: { agentRel: ".codex/agents/security-auditor.md", instructionRel: "AGENTS.md" },
      cursor: { agentRel: ".cursor/agents/security-auditor.md", instructionRel: ".cursor/rules/supervibe.mdc" },
      gemini: { agentRel: ".gemini/agents/security-auditor.md", instructionRel: "GEMINI.md" },
      opencode: { agentRel: ".opencode/agents/security-auditor.md", instructionRel: "opencode.json" },
    };

    for (const [adapterId, config] of Object.entries(expected)) {
      const projectRoot = await mkdtemp(join(tmpdir(), `supervibe-agent-provision-${adapterId}-`));
      try {
        const plan = createAgentProvisioningPlan({
          projectRoot,
          pluginRoot,
          adapterId,
          agentIds: ["security-auditor"],
        });

        assert.equal(plan.readyToApply, true, `${adapterId}: ${formatAgentProvisioningPlan(plan)}`);
        assert.equal(plan.contextRefresh.instructionPath, config.instructionRel, adapterId);
        assert.ok(plan.agents.some((entry) => entry.targetRel === config.agentRel), adapterId);
        await applyAgentProvisioningPlan(plan);

        assert.equal(existsSync(join(projectRoot, ...config.agentRel.split("/"))), true, adapterId);
        assert.equal(existsSync(join(projectRoot, ...config.agentRel.replace("/security-auditor.md", "/_core/security-auditor.md").split("/"))), false, adapterId);
        const instructions = await readFile(join(projectRoot, ...config.instructionRel.split("/")), "utf8");
        assert.match(instructions, new RegExp(`SUPERVIBE:BEGIN managed-context ${adapterId}`), adapterId);
        assert.match(instructions, /Host-callable agents: security-auditor/, adapterId);
        assert.match(instructions, /## Agent Roles\n- security-auditor: Security auditor\./, adapterId);
        assert.match(instructions, new RegExp(`## Current Provisioning\\n- agent:security-auditor add -> ${escapeRegExp(config.agentRel)}`), adapterId);
      } finally {
        await rm(projectRoot, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("agent provisioning command is discoverable from natural language", () => {
  const cases = [
    "add missing agents and skills to the project",
    "real agents are not being invoked, connect real agents",
    "fix agents for every provider and make agents mandatory",
    "repair host callable agents across providers",
    "агенты не вызываются, добавь недостающих агентов из плагина в проект",
    "почини агентов для каждого провайдера и сделай агентов обязательными",
    "агенты эмулируются, подключи настоящих агентов",
  ];

  for (const phrase of cases) {
    const match = resolveCommandRequest(phrase, {
      pluginRoot: process.cwd(),
      projectRoot: process.cwd(),
    });

    assert.equal(match.id, "agent-provisioning", phrase);
    assert.equal(match.command, "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --add-agents <ids> --skills <ids>", phrase);
    assert.equal(match.doNotSearchProject, true, phrase);

    const route = routeTriggerRequest(phrase);
    assert.equal(route.command, "node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --add-agents <ids> --skills <ids>", phrase);
    assert.ok(route.requiredSafety.includes("dry-run-before-host-file-write"), phrase);
  }
});

test("design request synonyms route to supervibe-design before broad source search", () => {
  const cases = [
    "create a design system from old prototypes",
    "make a styleboard for the desktop app",
    "создай новую дизайн систему из старых прототипов",
    "сделай стайлборд для desktop app",
  ];

  for (const phrase of cases) {
    const match = resolveCommandRequest(phrase, {
      pluginRoot: process.cwd(),
      projectRoot: process.cwd(),
    });
    assert.equal(match.command, "/supervibe-design", phrase);
    assert.ok(["design_new", "supervibe_design"].includes(match.intent), phrase);
    assert.equal(match.doNotSearchProject, true, phrase);

    const route = routeTriggerRequest(phrase);
    assert.equal(route.intent, "design_new", phrase);
    assert.equal(route.command, "/supervibe-design", phrase);
    assert.ok(route.requiredSafety.includes("preference-coverage-matrix"), phrase);
  }
});
