import { existsSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { planContextMigration, writeContextMigrationPlan } from "./supervibe-context-migrator.mjs";
import { formatAgentRoleSummaries, loadAgentRosterSync } from "./supervibe-agent-roster.mjs";
import { selectHostAdapter } from "./supervibe-host-detector.mjs";

export function createAgentProvisioningPlan({
  projectRoot = process.cwd(),
  pluginRoot = process.cwd(),
  agentIds = [],
  skillIds = [],
  adapterId = null,
  env = process.env,
} = {}) {
  const host = selectHostAdapter({
    rootDir: projectRoot,
    env: adapterId ? { ...env, SUPERVIBE_HOST: adapterId } : env,
  });
  const projectRoster = loadAgentRosterSync({ rootDir: projectRoot });
  const pluginRoster = loadAgentRosterSync({ rootDir: pluginRoot });
  const projectAgents = new Set((projectRoster.agents || []).map((agent) => agent.id));
  const pluginAgents = new Map((pluginRoster.agents || []).map((agent) => [agent.id, agent]));

  const agents = unique(agentIds).map((agentId) => {
    if (projectAgents.has(agentId)) {
      const existing = projectRoster.agents.find((agent) => agent.id === agentId);
      return item({
        type: "agent",
        id: agentId,
        status: "present",
        projectRel: existing?.path || null,
      });
    }

    const upstream = pluginAgents.get(agentId);
    if (!upstream) {
      return item({
        type: "agent",
        id: agentId,
        status: "missing-upstream",
        reason: "agent is not present in the Supervibe plugin roster",
      });
    }

    const sourceRel = upstream.path;
    const targetRel = normalizeRel(join(
      host.adapter.agentsFolder,
      ...relPathAfterAgents(sourceRel).split("/"),
    ));
    return item({
      type: "agent",
      id: agentId,
      status: "add",
      sourceRel,
      targetRel,
      sourceAbs: join(pluginRoot, ...sourceRel.split("/")),
      targetAbs: join(projectRoot, ...targetRel.split("/")),
    });
  });

  const skills = unique(skillIds).map((skillId) => {
    const normalizedId = normalizeSkillId(skillId);
    const existingRel = findExistingSkill(projectRoot, host.adapter.skillsFolder, normalizedId);
    if (existingRel) {
      return item({
        type: "skill",
        id: skillId,
        normalizedId,
        status: "present",
        projectRel: existingRel,
      });
    }
    const sourceRel = `skills/${normalizedId}`;
    const sourceAbs = join(pluginRoot, "skills", normalizedId);
    if (!existsSync(join(sourceAbs, "SKILL.md"))) {
      return item({
        type: "skill",
        id: skillId,
        normalizedId,
        status: "missing-upstream",
        reason: "skill is not present in the Supervibe plugin skills folder",
      });
    }
    const targetRel = normalizeRel(join(host.adapter.skillsFolder, normalizedId));
    return item({
      type: "skill",
      id: skillId,
      normalizedId,
      status: "add",
      sourceRel,
      targetRel,
      sourceAbs,
      targetAbs: join(projectRoot, ...targetRel.split("/")),
    });
  });

  const items = [...agents, ...skills];
  const add = items.filter((entry) => entry.status === "add");
  const missingUpstream = items.filter((entry) => entry.status === "missing-upstream");
  const hostSelectionRequired = Boolean(host.requiresSelection && !adapterId);
  const managedInstruction = renderProvisioningManagedInstruction({
    host,
    projectRoster,
    pluginRoster,
    agentIds: unique(agentIds),
    skillIds: unique(skillIds),
    agents,
    skills,
  });
  const contextMigration = planContextMigration({
    rootDir: projectRoot,
    adapterId: host.adapter.id,
    generatedContent: managedInstruction,
  });
  const applyCommand = [
    "node <resolved-supervibe-plugin-root>/scripts/provision-agents.mjs",
    "--project-root .",
    `--host ${host.adapter.id}`,
    agents.length ? `--agents ${agents.map((entry) => entry.id).join(",")}` : null,
    skills.length ? `--skills ${skills.map((entry) => entry.id).join(",")}` : null,
    "--apply",
  ].filter(Boolean).join(" ");

  return {
    schemaVersion: 1,
    kind: "agent-provisioning-plan",
    projectRoot,
    pluginRoot,
    host: {
      adapterId: host.adapter.id,
      displayName: host.adapter.displayName,
      confidence: host.confidence,
      requiresSelection: hostSelectionRequired,
    },
    readyToApply: add.length > 0 && missingUpstream.length === 0 && !hostSelectionRequired,
    applyBlockedReason: hostSelectionRequired
      ? "host adapter selection is ambiguous; pass --host before applying"
      : missingUpstream.length > 0
        ? "one or more requested agents/skills are missing from the plugin source"
        : add.length === 0
          ? "all requested agents and skills are already present"
          : null,
    counts: {
      requested: items.length,
      add: add.length,
      present: items.filter((entry) => entry.status === "present").length,
      missingUpstream: missingUpstream.length,
    },
    agents,
    skills,
    contextRefresh: {
      required: items.length > 0,
      instructionPath: contextMigration.instructionPath,
      backupPath: contextMigration.backupPath,
      operations: contextMigration.operations,
      diff: contextMigration.diff,
    },
    contextMigration,
    applyCommand,
  };
}

export async function applyAgentProvisioningPlan(plan = {}, { refreshContext = true } = {}) {
  if (plan.readyToApply !== true) {
    throw new Error(plan.applyBlockedReason || "agent provisioning plan is not ready to apply");
  }
  const applied = [];
  const skipped = [];
  const blocked = [];
  let contextRefresh = null;
  for (const entry of [...(plan.agents || []), ...(plan.skills || [])]) {
    if (entry.status !== "add") {
      skipped.push(entry);
      continue;
    }
    if (!entry.sourceAbs || !entry.targetAbs) {
      blocked.push({ ...entry, reason: "missing source or target path" });
      continue;
    }
    if (existsSync(entry.targetAbs)) {
      skipped.push({ ...entry, status: "present" });
      continue;
    }
    await mkdir(dirname(entry.targetAbs), { recursive: true });
    if (entry.type === "skill") {
      await cp(entry.sourceAbs, entry.targetAbs, { recursive: true, force: false, errorOnExist: true });
    } else {
      await cp(entry.sourceAbs, entry.targetAbs, { force: false, errorOnExist: true });
    }
    applied.push(entry);
  }
  if (refreshContext && plan.contextMigration) {
    contextRefresh = await writeContextMigrationPlan(plan.contextMigration, { approved: true });
  }
  const statePath = await writeProvisioningState(plan, {
    applied,
    skipped,
    blocked,
    contextRefresh,
  });
  return {
    schemaVersion: 1,
    kind: "agent-provisioning-apply",
    host: plan.host,
    applied,
    skipped,
    blocked,
    contextRefresh,
    statePath,
  };
}

export function formatAgentProvisioningPlan(plan = {}) {
  const lines = [
    "SUPERVIBE_AGENT_PROVISIONING_PLAN",
    `HOST: ${plan.host?.adapterId || "unknown"}`,
    `HOST_SELECTION_REQUIRED: ${plan.host?.requiresSelection === true}`,
    `READY_TO_APPLY: ${plan.readyToApply === true}`,
    `REQUESTED: ${plan.counts?.requested ?? 0}`,
    `ADD: ${plan.counts?.add ?? 0}`,
    `PRESENT: ${plan.counts?.present ?? 0}`,
    `MISSING_UPSTREAM: ${plan.counts?.missingUpstream ?? 0}`,
  ];
  if (plan.applyBlockedReason) lines.push(`BLOCKED_REASON: ${plan.applyBlockedReason}`);
  if (plan.contextRefresh?.required) lines.push(`CONTEXT_REFRESH: ${plan.contextRefresh.instructionPath}`);
  for (const entry of [...(plan.agents || []), ...(plan.skills || [])]) {
    lines.push(`${entry.status.toUpperCase()}: ${entry.type}:${entry.id}${entry.targetRel ? ` -> ${entry.targetRel}` : ""}`);
  }
  if (plan.readyToApply) lines.push(`NEXT_APPLY: ${plan.applyCommand}`);
  return lines.join("\n");
}

export function formatAgentProvisioningApply(result = {}) {
  const lines = [
    "SUPERVIBE_AGENT_PROVISIONING_APPLY",
    `HOST: ${result.host?.adapterId || "unknown"}`,
    `APPLIED: ${result.applied?.length || 0}`,
    `SKIPPED: ${result.skipped?.length || 0}`,
    `BLOCKED: ${result.blocked?.length || 0}`,
  ];
  if (result.contextRefresh?.path) lines.push(`CONTEXT_REFRESHED: ${result.contextRefresh.path}`);
  if (result.statePath) lines.push(`STATE: ${result.statePath}`);
  for (const entry of result.applied || []) {
    lines.push(`APPLIED_FILE: ${entry.targetRel}`);
  }
  for (const entry of result.blocked || []) {
    lines.push(`BLOCKED_FILE: ${entry.targetRel || entry.id} - ${entry.reason || "blocked"}`);
  }
  return lines.join("\n");
}

function renderProvisioningManagedInstruction({
  host,
  projectRoster,
  pluginRoster,
  agentIds = [],
  skillIds = [],
  agents = [],
  skills = [],
} = {}) {
  const requestedAgents = unique(agentIds);
  const requestedSkills = unique(skillIds);
  const byId = new Map([
    ...((projectRoster.agents || []).map((agent) => [agent.id, agent])),
    ...((pluginRoster.agents || []).map((agent) => [agent.id, agent])),
  ]);
  const roleRoster = { agents: requestedAgents.map((id) => byId.get(id)).filter(Boolean) };
  const roleSummary = formatAgentRoleSummaries(requestedAgents, roleRoster, { max: 80 });
  const adapter = host.adapter;
  return [
    `# Supervibe Managed Context (${adapter.displayName})`,
    "",
    "This block was refreshed by Supervibe agent provisioning. It makes newly installed specialists visible to routing, dispatch, and receipt validation in this host.",
    "",
    `Host agents folder: ${adapter.agentsFolder}`,
    `Host skills folder: ${adapter.skillsFolder}`,
    `Provisioned/requested agents: ${requestedAgents.join(", ") || "none"}`,
    `Provisioned/requested skills: ${requestedSkills.join(", ") || "none"}`,
    "",
    "## Agent Roles",
    roleSummary || "- none",
    "",
    "## Agent Execution Contract",
    "- Supervibe workflows use real host/project agents. Do not emulate an agent-owned stage with the main assistant.",
    "- If a required specialist is missing, run `node <resolved-supervibe-plugin-root>/scripts/provision-agents.mjs --project-root . --agents <ids> --skills <ids>` as a dry-run, then apply only after approval.",
    "- Every claimed agent, worker, reviewer, skill, command, validator, or external-tool invocation must have a runtime-issued workflow receipt.",
    "- Agent-like receipts must include host invocation proof. Hand-written receipts and command receipts cannot substitute specialist output.",
    "- Run `npm run validate:agent-producer-receipts` and command-specific receipt validators before claiming delegated work is complete.",
    "",
    "## Current Provisioning",
    ...agents.map((entry) => `- agent:${entry.id} ${entry.status}${entry.targetRel ? ` -> ${entry.targetRel}` : ""}`),
    ...skills.map((entry) => `- skill:${entry.id} ${entry.status}${entry.targetRel ? ` -> ${entry.targetRel}` : ""}`),
  ].join("\n");
}

async function writeProvisioningState(plan, result) {
  const stateRel = ".supervibe/memory/agent-provisioning/last-apply.json";
  const stateAbs = join(plan.projectRoot, ...stateRel.split("/"));
  await mkdir(dirname(stateAbs), { recursive: true });
  await writeFile(stateAbs, JSON.stringify({
    schemaVersion: 1,
    appliedAt: new Date().toISOString(),
    host: plan.host,
    counts: plan.counts,
    agents: (plan.agents || []).map(redactPlanItem),
    skills: (plan.skills || []).map(redactPlanItem),
    applied: (result.applied || []).map(redactPlanItem),
    skipped: (result.skipped || []).map(redactPlanItem),
    blocked: (result.blocked || []).map(redactPlanItem),
    contextRefresh: result.contextRefresh ? {
      path: result.contextRefresh.path,
      backupPath: result.contextRefresh.backupPath,
    } : null,
  }, null, 2) + "\n", "utf8");
  return stateRel;
}

function redactPlanItem(entry = {}) {
  return {
    type: entry.type,
    id: entry.id,
    status: entry.status,
    sourceRel: entry.sourceRel,
    targetRel: entry.targetRel,
    projectRel: entry.projectRel,
    reason: entry.reason,
  };
}

function item(fields) {
  return {
    sourceRel: null,
    targetRel: null,
    projectRel: null,
    reason: null,
    ...fields,
  };
}

function findExistingSkill(projectRoot, skillsFolder, skillId) {
  const hostRel = normalizeRel(join(skillsFolder, skillId, "SKILL.md"));
  if (existsSync(join(projectRoot, ...hostRel.split("/")))) return normalizeRel(dirname(hostRel));
  const sharedRel = `skills/${skillId}/SKILL.md`;
  if (existsSync(join(projectRoot, ...sharedRel.split("/")))) return `skills/${skillId}`;
  return null;
}

function normalizeSkillId(value) {
  const raw = String(value || "").trim();
  return raw.includes(":") ? raw.split(":").pop() : raw;
}

function relPathAfterAgents(relPath) {
  const parts = normalizeRel(relPath).split("/");
  const index = parts.lastIndexOf("agents");
  if (index >= 0) return parts.slice(index + 1).join("/");
  return basename(relPath);
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/");
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}
