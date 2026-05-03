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
    assert.ok(plan.agents.some((entry) => entry.targetRel === ".codex/agents/_design/creative-director.md"));
    assert.ok(plan.skills.some((entry) => entry.targetRel === ".codex/skills/brandbook"));

    const result = await applyAgentProvisioningPlan(plan);

    assert.equal(result.applied.length, 2);
    assert.equal(existsSync(join(projectRoot, ".codex", "agents", "_design", "creative-director.md")), true);
    assert.equal(existsSync(join(projectRoot, ".codex", "skills", "brandbook", "SKILL.md")), true);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "agent-provisioning", "last-apply.json")), true);

    const instructions = await readFile(join(projectRoot, "AGENTS.md"), "utf8");
    assert.match(instructions, /## Local/);
    assert.match(instructions, /SUPERVIBE:BEGIN managed-context codex/);
    assert.match(instructions, /creative-director/);
    assert.match(instructions, /Do not emulate an agent-owned stage/);

    const roster = loadAgentRosterSync({ rootDir: projectRoot });
    assert.ok(roster.agents.some((agent) => agent.id === "creative-director" && agent.path === ".codex/agents/_design/creative-director.md"));

    const available = await loadAvailableAgents(projectRoot);
    assert.equal(available["creative-director"], ".codex/agents/_design/creative-director.md");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(pluginRoot, { recursive: true, force: true });
  }
});

test("agent provisioning command is discoverable from natural language", () => {
  const cases = [
    "add missing agents and skills to the project",
    "real agents are not being invoked, connect real agents",
    "агенты не вызываются, добавь недостающих агентов из плагина в проект",
    "агенты эмулируются, подключи настоящих агентов",
  ];

  for (const phrase of cases) {
    const match = resolveCommandRequest(phrase, {
      pluginRoot: process.cwd(),
      projectRoot: process.cwd(),
    });

    assert.equal(match.id, "agent-provisioning", phrase);
    assert.equal(match.command, "node <resolved-supervibe-plugin-root>/scripts/provision-agents.mjs", phrase);
    assert.equal(match.doNotSearchProject, true, phrase);

    const route = routeTriggerRequest(phrase);
    assert.equal(route.command, "node <resolved-supervibe-plugin-root>/scripts/provision-agents.mjs", phrase);
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
