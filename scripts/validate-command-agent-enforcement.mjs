#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRuntimeCommandAgentPlan,
  commandAgentPlanStrictReady,
} from "./command-agent-plan.mjs";
import {
  copyCommandAgentContract,
  listCommandAgentProfiles,
  resolveHostAgentDispatcher,
  validateCommandAgentProfiles,
} from "./lib/command-agent-orchestration-contract.mjs";

const REQUIRED_DESIGN_AGENTS = Object.freeze([
  "creative-director",
  "design-system-architect",
  "ux-ui-designer",
  "tauri-ui-designer",
  "copywriter",
  "prototype-builder",
  "accessibility-reviewer",
  "ui-polish-reviewer",
  "quality-gate-reviewer",
]);
const REQUIRED_PREVIEW_AGENTS = Object.freeze([
  "prototype-builder",
  "ui-polish-reviewer",
  "accessibility-reviewer",
  "quality-gate-reviewer",
]);
const PROBE_HANDOFF_ID = "__command-agent-enforcement-probe__";
const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

export function validateCommandAgentEnforcement(rootDir = process.cwd(), options = {}) {
  const profiles = options.profiles || listCommandAgentProfiles();
  const contract = copyCommandAgentContract();
  const issues = [];
  const commandIds = profiles.map((profile) => profile.commandId).filter(Boolean);

  if (!options.profiles) {
    const profileResult = validateCommandAgentProfiles({
      commandIds,
      availableAgentIds: listAvailableAgentIds(rootDir),
    });
    for (const item of profileResult.issues || []) {
      issues.push(issue(item.commandId || "command-profile", item.code || "command-agent-profile-invalid", item.message || "command agent profile validation failed"));
    }
  }

  for (const profile of profiles) {
    issues.push(...validateProfileShape(profile, contract));
  }

  if (options.sourcePolicyChecks !== false) {
    issues.push(...validateProviderBypassSourcePolicy(rootDir));
  }

  const syntheticChecks = [];
  if (options.syntheticActiveProbe !== false) {
    for (const profile of profiles) {
      const report = buildRuntimeCommandAgentPlan({
        command: profile.commandId,
        projectRoot: rootDir,
        pluginRoot: options.pluginRoot || PLUGIN_ROOT,
        host: options.host || "codex",
        workflowContext: syntheticWorkflowContext(profile.commandId),
      });
      const strictReady = commandAgentPlanStrictReady(report);
      syntheticChecks.push({
        command: profile.commandId,
        strictReady,
        receiptGate: report.plan?.receiptGate || null,
        durableWritesAllowed: report.plan?.durableWritesAllowed === true,
      });
      if (strictReady) {
        issues.push(issue(profile.commandId, "synthetic-active-agent-gate-not-blocked", `${profile.commandId}: synthetic active handoff became strict-ready without scoped runtime receipts`));
      }
      if ((report.plan?.requiredAgentIds || []).length === 0) {
        issues.push(issue(profile.commandId, "synthetic-active-required-agents-empty", `${profile.commandId}: synthetic active command plan has no required agents`));
      }
    }
  }

  return {
    schemaVersion: 1,
    pass: issues.length === 0,
    checked: profiles.length,
    syntheticChecked: syntheticChecks.length,
    issues,
    syntheticChecks,
  };
}

export function validateProfileShape(profile = {}, contract = copyCommandAgentContract()) {
  const issues = [];
  const commandId = profile.commandId || "unknown-command";
  const required = new Set(profile.requiredAgentIds || []);
  if (required.size === 0) {
    issues.push(issue(commandId, "missing-required-agents", `${commandId}: every command profile must require real agents`));
  }
  if (!required.has(contract.ownerAgentId)) {
    issues.push(issue(commandId, "missing-owner-agent", `${commandId}: required agents must include ${contract.ownerAgentId}`));
  }
  if (!required.has("quality-gate-reviewer")) {
    issues.push(issue(commandId, "missing-quality-gate-agent", `${commandId}: required agents must include quality-gate-reviewer`));
  }
  if (profile.defaultExecutionMode !== "real-agents") {
    issues.push(issue(commandId, "non-real-agent-default", `${commandId}: default execution mode must be real-agents`));
  }
  if (profile.emulationAllowed !== false || !/Do not emulate/i.test(String(profile.emulationPolicy || ""))) {
    issues.push(issue(commandId, "emulation-not-forbidden", `${commandId}: specialist emulation must be explicitly forbidden`));
  }
  if (profile.inlineScope !== contract.inlineScope) {
    issues.push(issue(commandId, "inline-scope-not-diagnostic", `${commandId}: inline mode must be diagnostic/dry-run only`));
  }
  if (commandId === "/supervibe-design") {
    for (const agentId of REQUIRED_DESIGN_AGENTS) {
      if (!required.has(agentId)) {
        issues.push(issue(commandId, "missing-design-flow-agent", `${commandId}: design flow must require ${agentId}`));
      }
    }
  }
  if (commandId === "/supervibe-preview") {
    for (const agentId of REQUIRED_PREVIEW_AGENTS) {
      if (!required.has(agentId)) {
        issues.push(issue(commandId, "missing-prototype-preview-agent", `${commandId}: prototype preview flow must require ${agentId}`));
      }
    }
  }
  return issues;
}

export function validateProviderBypassSourcePolicy(rootDir = process.cwd()) {
  const issues = [];
  const designPath = join(rootDir, "scripts", "lib", "design-agent-orchestration.mjs");
  if (existsSync(designPath)) {
    const designSource = readFileSync(designPath, "utf8");
    if (/id:\s*"hybrid"/.test(designSource) || /id:\s*"inline"/.test(designSource)) {
      issues.push(issue("/supervibe-design", "unsafe-design-degraded-mode-choice", "design degraded execution questions must not offer inline or hybrid continuation choices"));
    }
    if (
      /requestedMode\s*===\s*"hybrid"\)\s*return\s+"hybrid"/.test(designSource)
      || /requestedMode\s*===\s*"inline"\)\s*return\s+"inline"/.test(designSource)
      || /requiredAgentIds\.length\s*===\s*0\)\s*return\s+"inline"/.test(designSource)
    ) {
      issues.push(issue("/supervibe-design", "unsafe-design-execution-mode-return", "design execution mode derivation must not return inline or hybrid"));
    }
    if (/executionModes:\s*\[[^\]]*"inline"/s.test(designSource) || /executionModes:\s*\[[^\]]*"hybrid"/s.test(designSource)) {
      issues.push(issue("/supervibe-design", "unsafe-design-execution-mode-list", "design execution mode list must expose only real-agent and blocked states"));
    }
  }
  const codex = resolveHostAgentDispatcher("codex");
  if (!/Do not substitute a generic worker or explorer subagent/i.test(codex?.instructions || "")) {
    issues.push(issue("codex", "codex-generic-subagent-policy-missing", "Codex dispatcher instructions must forbid generic worker or explorer substitution for named Supervibe specialists"));
  }
  if (!/controller-authored inline edits/i.test(codex?.instructions || "")) {
    issues.push(issue("codex", "codex-inline-controller-policy-missing", "Codex dispatcher instructions must forbid controller-authored inline edits from satisfying specialist receipts"));
  }
  return issues;
}

export function formatCommandAgentEnforcementReport(result = {}) {
  const lines = [
    "SUPERVIBE_COMMAND_AGENT_ENFORCEMENT",
    `PASS: ${result.pass === true}`,
    `CHECKED: ${result.checked || 0}`,
    `SYNTHETIC_ACTIVE_CHECKED: ${result.syntheticChecked || 0}`,
    `ISSUES: ${(result.issues || []).length}`,
  ];
  for (const check of result.syntheticChecks || []) {
    lines.push(`SYNTHETIC_ACTIVE: ${check.command} strictReady=${check.strictReady === true} durableWritesAllowed=${check.durableWritesAllowed === true} receiptGate=${check.receiptGate || "unknown"}`);
  }
  for (const item of result.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.commandId} - ${item.message}`);
  }
  return lines.join("\n");
}

function syntheticWorkflowContext(commandId = "") {
  const context = {
    active: true,
    slug: "command-agent-enforcement-probe",
    handoffId: `${PROBE_HANDOFF_ID}-${sanitizeCommand(commandId)}`,
    workflowRunId: "",
    apply: true,
    verifyAgents: true,
    adds: 1,
    updates: 0,
    projectOnly: 0,
    conflicts: 0,
    memoryWrites: false,
  };
  return context;
}

function listAvailableAgentIds(rootDir) {
  const agentsDir = join(rootDir, "agents");
  const ids = new Set();
  if (!existsSync(agentsDir)) return ids;
  const visit = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        visit(path);
      } else if (entry.endsWith(".md")) {
        ids.add(entry.replace(/\.md$/, ""));
      }
    }
  };
  visit(agentsDir);
  return ids;
}

function issue(commandId, code, message) {
  return { commandId, code, message };
}

function sanitizeCommand(value = "") {
  return String(value || "command").replace(/^\//, "").replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const rootDir = resolve(options.root || process.cwd());
  const result = validateCommandAgentEnforcement(rootDir, {
    pluginRoot: options["plugin-root"] || options.pluginRoot,
    host: options.host,
    syntheticActiveProbe: options["no-synthetic-active-probe"] === true ? false : true,
  });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatCommandAgentEnforcementReport(result));
  process.exit(result.pass ? 0 : 1);
}
