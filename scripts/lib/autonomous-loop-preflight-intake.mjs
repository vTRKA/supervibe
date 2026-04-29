import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nowIso, versionEnvelope } from "./autonomous-loop-constants.mjs";

export function classifyPreflight({ request = "", tasks = [] } = {}) {
  const text = `${request} ${tasks.map((task) => `${task.goal} ${task.category}`).join(" ")}`.toLowerCase();
  if (!text.trim() || /^(status|help|stop)\b/.test(text.trim())) return "none";
  if (/(server|docker|deploy|production|staging|credential|mcp|integration|design|feature|remote)/.test(text)) return "full";
  return "quick";
}

export function buildPreflight({ request = "", tasks = [], options = {} } = {}) {
  const preflightClass = classifyPreflight({ request, tasks });
  const environmentTarget = options.environmentTarget || inferEnvironmentTarget(request, tasks);
  const autonomyLevel = options.autonomyLevel || (environmentTarget === "production" ? "production-prep" : "implement-and-test");
  const missingData = [];

  if (environmentTarget === "production" && !options.productionApprovalPolicy) {
    missingData.push("production approval policy");
  }
  if (/(server|deploy|remote|production)/i.test(request) && !options.serverAccessReference) {
    missingData.push("server access reference");
  }

  return versionEnvelope({
    created_at: nowIso(),
    preflight_class: preflightClass,
    objective: request || "Execute autonomous loop",
    success_criteria: options.successCriteria || ["All required tasks score at least 9.0"],
    scope_in: options.scopeIn || ["repository-local changes"],
    scope_out: options.scopeOut || ["unapproved production mutations", "raw secret handling"],
    autonomy_level: autonomyLevel,
    max_loops: Number(options.maxLoops || 20),
    max_runtime_minutes: Number(options.maxRuntimeMinutes || 60),
    max_concurrent_agents: Number(options.maxConcurrentAgents || 3),
    allowed_write_scope: options.allowedWriteScope || ["project"],
    required_checks: options.requiredChecks || ["focused tests", "policy guard", "confidence score"],
    environment_target: environmentTarget,
    mcp_tools_allowed: options.mcpToolsAllowed || [],
    server_access_needed: missingData.includes("server access reference"),
    deployment_approval_policy: options.productionApprovalPolicy || "ask-before-production-action",
    approval_lease: {
      scope: options.approvalScope || "local-read-write",
      environment: environmentTarget,
      tools: options.mcpToolsAllowed || [],
      budget: {
        max_loops: Number(options.maxLoops || 20),
        max_runtime_minutes: Number(options.maxRuntimeMinutes || 60),
        max_concurrent_agents: Number(options.maxConcurrentAgents || 3),
      },
      duration: `${Number(options.approvalExpiresAfterLoops || 20)} loops`,
      expires_after_loops: Number(options.approvalExpiresAfterLoops || 20),
      expires_at: new Date(Date.now() + Number(options.maxRuntimeMinutes || 60) * 60 * 1000).toISOString(),
      renewal_triggers: ["risk_escalation", "environment_change", "budget_change", "credential_scope_change"],
    },
    rollback_expectation: options.rollbackExpectation || "document rollback or cleanup before side effects",
    secret_handling_policy: "references-only-no-raw-secret-logging",
    assumptions: options.assumptions || [],
    missing_data: missingData,
    blocked_actions: missingData.length > 0 ? ["remote mutation", "production deploy"] : [],
    approval_requirements: ["production deploy", "destructive migration", "remote mutation", "credential rotation"],
    confidence_score: missingData.length > 0 ? 6.0 : preflightClass === "none" ? 10.0 : 9.0,
  });
}

export async function writePreflightArtifact(loopDir, preflight) {
  await mkdir(loopDir, { recursive: true });
  const filePath = join(loopDir, "preflight.json");
  await writeFile(filePath, `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
  return filePath;
}

export function createPreflightQuestions(preflight) {
  const questions = [];
  if (!preflight.objective) questions.push("What is the exact objective for this run?");
  if (preflight.missing_data.includes("server access reference")) {
    questions.push("Which SSH host alias, cloud profile, or deployment target name should be used?");
  }
  if (preflight.missing_data.includes("production approval policy")) {
    questions.push("Should the loop stop at production-prep or ask for production approval before deploy?");
  }
  return questions;
}

function inferEnvironmentTarget(request, tasks) {
  const text = `${request} ${tasks.map((task) => task.goal).join(" ")}`.toLowerCase();
  if (text.includes("production")) return "production";
  if (text.includes("staging")) return "staging";
  if (text.includes("docker")) return "docker";
  if (text.includes("server") || text.includes("deploy")) return "remote";
  return "local";
}
