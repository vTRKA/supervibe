import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  validateAgentProducerReceipts,
} from "./agent-producer-contract.mjs";
import { CodeStore } from "./code-store.mjs";
import {
  collectIndexHealthFromStore,
  evaluateIndexHealthGate,
} from "./supervibe-index-health.mjs";
import {
  validateCommandOperationalContracts,
} from "../validate-command-operational-contracts.mjs";
import {
  validateDynamicQuestionSystems,
} from "../validate-dynamic-question-systems.mjs";
import {
  validateRuleContentQuality,
} from "../validate-rule-content-quality.mjs";
import {
  validateAgentContentQuality,
} from "../validate-agent-content-quality.mjs";
import {
  validateSkillContentQuality,
} from "../validate-skill-content-quality.mjs";
import {
  validateWorkflowContinuation,
} from "../validate-workflow-continuation.mjs";
import {
  validateWorkflowReceipts,
} from "./supervibe-workflow-receipt-runtime.mjs";
import {
  buildAgentRetrievalTelemetryReportFromProject,
  isStrictAgentRetrievalTelemetryPass,
} from "./supervibe-agent-retrieval-telemetry.mjs";
import {
  evaluateCommandRouteMatrix,
  evaluateSemanticIntentMatrix,
  evaluateTriggerMatrix,
} from "./supervibe-trigger-evaluator.mjs";
import {
  buildRuntimeCommandAgentPlan,
} from "../command-agent-plan.mjs";

export const AGENT_SYSTEM_MATURITY_DIMENSIONS = Object.freeze([
  { id: "roster-coverage", max: 1.0 },
  { id: "command-orchestration", max: 1.0 },
  { id: "specialist-questions", max: 1.25 },
  { id: "stage-continuation", max: 1.0 },
  { id: "receipt-reliability", max: 1.25 },
  { id: "host-agent-telemetry", max: 1.25 },
  { id: "code-graph-readiness", max: 1.0 },
  { id: "eval-coverage", max: 1.0 },
  { id: "backlog-and-docs", max: 1.25 },
]);

export async function buildAgentSystemMaturityReport(rootDir = process.cwd(), options = {}) {
  const roster = countArtifacts(rootDir);
  const commandContracts = validateCommandOperationalContracts(rootDir);
  const dynamicQuestions = validateDynamicQuestionSystems();
  const ruleContentQuality = validateRuleContentQuality(rootDir);
  const agentContentQuality = validateAgentContentQuality(rootDir);
  const skillContentQuality = validateSkillContentQuality(rootDir);
  const continuation = validateWorkflowContinuation(rootDir, {
    pluginRoot: options.pluginRoot,
  });
  const workflowReceipts = validateWorkflowReceipts(rootDir, options.receiptOptions || {});
  const agentReceipts = validateAgentProducerReceipts(rootDir, {
    ...(options.receiptOptions || {}),
    requireHostAgentReceipts: true,
    minHostAgentReceipts: options.minHostAgentReceipts ?? 1,
    minAgentInvocations: options.minAgentInvocations ?? 10,
  });
  const retrievalTelemetry = await collectRetrievalTelemetryGate(rootDir);
  const indexGate = await collectCodeGraphGate(rootDir, { retrievalTelemetry });
  const routeReplay = collectRouteReplayGate(rootDir);
  const activeCommandReadiness = options.activeCommand
    ? collectActiveCommandReadiness(rootDir, {
      command: options.activeCommand,
      host: options.host,
      slug: options.slug,
      handoffId: options.handoffId,
      workflowRunId: options.workflowRunId,
      pluginRoot: options.pluginRoot,
    })
    : null;
  const docs = {
    ...inspectBacklogAndDocs(rootDir),
    ...routeReplay,
  };

  return scoreAgentSystemMaturity({
    roster,
    validators: {
      commandContracts,
      dynamicQuestions,
      ruleContentQuality,
      agentContentQuality,
      skillContentQuality,
      continuation,
      workflowReceipts,
      agentReceipts,
      ...(activeCommandReadiness ? { activeCommandReadiness } : {}),
    },
    indexGate,
    docs,
    thresholds: {
      minHostAgentReceipts: options.minHostAgentReceipts ?? 1,
      minAgentInvocations: options.minAgentInvocations ?? 10,
    },
  });
}

export function scoreAgentSystemMaturity({
  roster = {},
  validators = {},
  indexGate = {},
  docs = {},
  thresholds = {},
} = {}) {
  const dimensions = [];
  const add = (id, max, score, evidence, nextAction = null) => {
    const normalized = Math.max(0, Math.min(max, Number(score) || 0));
    dimensions.push({
      id,
      max,
      score: Number(normalized.toFixed(2)),
      pass: normalized >= max,
      evidence,
      nextAction,
    });
  };

  add(
    "roster-coverage",
    1.0,
    roster.agents >= 80 && roster.skills >= 50 && roster.commands >= 15 && roster.rules >= 25 ? 1.0 : 0.5,
    `${roster.agents || 0} agents, ${roster.skills || 0} skills, ${roster.commands || 0} commands, ${roster.rules || 0} rules`,
    "Keep registry and version surfaces synced when adding roles.",
  );
  add(
    "command-orchestration",
    1.0,
    validators.commandContracts?.pass && validators.activeCommandReadiness?.pass !== false ? 1.0 : 0,
    activeCommandEvidence(validators),
    validators.activeCommandReadiness?.pass === false
      ? "Fix active command readiness: provision/connect missing callable host agents, run scoped specialists, issue runtime receipts, then rerun command-agent-plan --active before claiming 10/10."
      : "Run npm run validate:command-operational-contracts and fix missing real-agent routing rules.",
  );
  add(
    "specialist-questions",
    1.25,
    validators.dynamicQuestions?.pass ? 1.25 : 0,
    `dynamic question systems pass=${validators.dynamicQuestions?.pass === true}`,
    "Fix SpecialistQuestionContract provenance, context, artifact impact, and skip/default behavior.",
  );
  add(
    "stage-continuation",
    1.0,
    validators.continuation?.pass ? 1.0 : 0,
    workflowContinuationEvidence(validators.continuation),
    workflowContinuationNextAction(validators.continuation),
  );
  add(
    "receipt-reliability",
    1.25,
    validators.workflowReceipts?.pass ? 1.25 : 0,
    `workflow receipts pass=${validators.workflowReceipts?.pass === true}, receipts=${validators.workflowReceipts?.receipts || 0}`,
    "Run workflow-receipt recovery-status, reissue drifted receipts, or prune stale entries.",
  );

  const hostReceipts = validators.agentReceipts?.trustedHostAgentReceipts
    ?? validators.agentReceipts?.agentReceipts
    ?? validators.agentReceipts?.hostAgentReceipts
    ?? 0;
  const invocations = validators.agentReceipts?.agentInvocations || 0;
  const minHostReceipts = thresholds.minHostAgentReceipts ?? 1;
  const minInvocations = thresholds.minAgentInvocations ?? 10;
  const agentReceiptTrustPass = validators.agentReceipts?.pass === true;
  const distribution = assessAgentInvocationDistribution(validators.agentReceipts);
  const telemetryBaseScore = agentReceiptTrustPass && hostReceipts >= minHostReceipts && invocations >= minInvocations
    ? 1.25
    : hostReceipts > 0 || invocations > 0
      ? 0.55
      : 0.25;
  const telemetryScore = distribution.blocking
    ? Math.min(telemetryBaseScore, 0.55)
    : telemetryBaseScore;
  const distributionEvidence = distribution.evidence ? `, ${distribution.evidence}` : "";
  add(
    "host-agent-telemetry",
    1.25,
    telemetryScore,
    `strictPass=${agentReceiptTrustPass}, trustedHostAgentReceipts=${hostReceipts}/${minHostReceipts}, receiptBoundAgentInvocations=${invocations}/${minInvocations}${distributionEvidence}`,
    distribution.blocking
      ? "Agent invocation distribution is too concentrated while required specialist subjects are missing; run the missing specialists and issue scoped receipts."
      : "Complete real host-agent stages and log each with node scripts/agent-invocation.mjs log ... --issue-receipt.",
  );

  const retrievalTelemetryReady = (
    indexGate.retrievalTelemetryStrictPass !== false
      && Number(indexGate.retrievalTelemetryMaturityScore ?? 10) >= 10
  ) || isRetrievalTelemetryOnlySampleGap(indexGate);
  const graphReady = indexGate.ready === true
    && indexGate.retrievalEnforcementPass === true
    && Number(indexGate.missingOrStale ?? Number.NaN) === 0
    && !String(indexGate.warnings || "").includes("symbol-coverage");
  const codeGraphEvidence = retrievalTelemetryReady
    ? (indexGate.evidence || "index status unavailable")
    : `${indexGate.evidence || "index status unavailable"}, retrievalTelemetryStrictPass=false (tracked outside code-graph-readiness)`;
  add(
    "code-graph-readiness",
    1.0,
    graphReady ? 1.0 : indexGate.sourceReady ? 0.5 : 0,
    codeGraphEvidence,
    graphReady
      ? null
      : "Run node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health, confirm node scripts/build-code-index.mjs --root . --list-missing reports MISSING_OR_STALE: 0, then rerun node scripts/supervibe-agent-maturity.mjs.",
  );
  add(
    "eval-coverage",
    1.0,
    roster.testFiles >= 250 && docs.hasNegativeQuestionEval && docs.routeReplayPass !== false ? 1.0 : 0.65,
    `${roster.testFiles || 0} test files, negative specialist-question eval=${docs.hasNegativeQuestionEval === true}, route replay=${docs.routeReplayEvidence ?? (docs.routeReplayPass !== false)}`,
    "Add negative fixtures for weak specialist questions, receipt drift, stage recovery, and command/trigger route regressions.",
  );
  add(
    "backlog-and-docs",
    1.25,
    (docs.hasReleaseHardeningNotes || docs.hasTenOutOfTenBacklog)
      && docs.hasMaturityScriptDocs
      && validators.ruleContentQuality?.pass === true
      && validators.agentContentQuality?.pass === true
      && validators.skillContentQuality?.pass === true
      ? 1.25
      : 0.65,
    `release hardening notes=${(docs.hasReleaseHardeningNotes || docs.hasTenOutOfTenBacklog) === true}, maturity docs=${docs.hasMaturityScriptDocs === true}, rule content quality=${validators.ruleContentQuality?.pass === true}, agent content quality=${validators.agentContentQuality?.pass === true}, skill content quality=${validators.skillContentQuality?.pass === true}`,
    "Keep release hardening notes in CHANGELOG.md and durable operational docs, and run npm run validate:agent-content-quality, npm run validate:skill-content-quality, and npm run validate:rule-content-quality after artifact edits.",
  );

  const total = dimensions.reduce((sum, item) => sum + item.score, 0);
  const active = validators.activeCommandReadiness || null;
  const globalScore = Number(total.toFixed(2));
  const activeWorkflowScore = active ? (active.pass === true ? 10 : 9) : null;
  return {
    schemaVersion: 1,
    score: Number(total.toFixed(2)),
    maxScore: 10,
    pass: total >= 10,
    status: total >= 10 ? "10-of-10-ready" : total >= 9 ? "near-10-operational-gaps" : "hardening-required",
    globalMaturity: {
      score: globalScore,
      maxScore: 10,
      pass: globalScore >= 10,
      status: globalScore >= 10 ? "global-10-of-10-ready" : "global-hardening-required",
    },
    activeWorkflowMaturity: active ? {
      command: active.command || "unknown",
      score: activeWorkflowScore,
      maxScore: 10,
      pass: active.pass === true,
      status: active.pass === true ? "active-workflow-10-of-10-ready" : "active-workflow-blocked",
      receiptGate: active.receiptGate || null,
    } : null,
    dimensions,
    blockers: dimensions.filter((item) => !item.pass).map((item) => ({
      id: item.id,
      evidence: item.evidence,
      nextAction: item.nextAction,
    })),
  };
}

export function formatAgentSystemMaturityReport(report = {}) {
  const lines = [
    "SUPERVIBE_AGENT_SYSTEM_MATURITY",
    `PASS: ${report.pass === true}`,
    `SCORE: ${report.score || 0}/${report.maxScore || 10}`,
    `GLOBAL_MATURITY_SCORE: ${report.globalMaturity?.score ?? report.score ?? 0}/${report.globalMaturity?.maxScore || 10}`,
    `GLOBAL_MATURITY_STATUS: ${report.globalMaturity?.status || "unknown"}`,
    `ACTIVE_WORKFLOW_MATURITY_SCORE: ${report.activeWorkflowMaturity ? `${report.activeWorkflowMaturity.score}/${report.activeWorkflowMaturity.maxScore}` : "none"}`,
    `ACTIVE_WORKFLOW_MATURITY_STATUS: ${report.activeWorkflowMaturity?.status || "none"}`,
    `STATUS: ${report.status || "unknown"}`,
    "DIMENSIONS:",
  ];
  for (const item of report.dimensions || []) {
    lines.push(`- ${item.id}: ${item.score}/${item.max} pass=${item.pass} evidence="${item.evidence}"`);
  }
  lines.push(`BLOCKERS: ${(report.blockers || []).length}`);
  for (const blocker of report.blockers || []) {
    lines.push(`BLOCKER: ${blocker.id} - ${blocker.evidence}`);
    lines.push(`NEXT_ACTION: ${blocker.nextAction}`);
  }
  return lines.join("\n");
}

function countArtifacts(rootDir) {
  return {
    agents: countMarkdownFiles(join(rootDir, "agents")),
    skills: countDirectories(join(rootDir, "skills")),
    commands: countMarkdownFiles(join(rootDir, "commands")),
    rules: countMarkdownFiles(join(rootDir, "rules")),
    testFiles: countFiles(join(rootDir, "tests"), /\.test\.mjs$/),
  };
}

async function collectCodeGraphGate(rootDir, { retrievalTelemetry = null } = {}) {
  const enforcement = inspectRetrievalEnforcement(rootDir);
  const missing = inspectMissingOrStaleIndex(rootDir);
  if (!existsSync(join(rootDir, ".supervibe", "memory", "code.db"))) {
    return {
      ready: false,
      sourceReady: false,
      warnings: "missing-code-index",
      missingOrStale: missing.count,
      evidence: `code.db missing, missingOrStale=${missing.count ?? "unknown"}`,
    };
  }
  const store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: true });
  try {
    await store.init();
    const health = await collectIndexHealthFromStore(store, { rootDir });
    const gate = evaluateIndexHealthGate(health, { strictGraph: true });
    return {
      ready: gate.ready,
      sourceReady: (gate.failedGates || []).every((item) => item.code !== "source-coverage"),
      warnings: (gate.warnings || []).map((item) => item.code).join(","),
      missingOrStale: missing.count,
      evidence: `source=${gate.indexedSourceFiles}/${gate.eligibleSourceFiles}, failed=${(gate.failedGates || []).map((item) => item.code).join(",") || "none"}, warnings=${(gate.warnings || []).map((item) => item.code).join(",") || "none"}, missingOrStale=${missing.count ?? "unknown"}, retrievalEnforcement=${enforcement.pass}, retrievalTelemetry=${retrievalTelemetry?.maturityScore ?? "unknown"}/10`,
      retrievalEnforcementPass: enforcement.pass,
      retrievalTelemetryMaturityScore: retrievalTelemetry?.maturityScore ?? null,
      retrievalTelemetryStrictPass: retrievalTelemetry ? isStrictAgentRetrievalTelemetryPass(retrievalTelemetry) : false,
      retrievalTelemetryGlobalViolations: retrievalTelemetry?.globalViolations || [],
    };
  } catch (error) {
    return {
      ready: false,
      sourceReady: false,
      warnings: "index-health-error",
      missingOrStale: missing.count,
      evidence: `index health error: ${error.message}, missingOrStale=${missing.count ?? "unknown"}`,
    };
  } finally {
    store.close();
  }
}

function isRetrievalTelemetryOnlySampleGap(indexGate = {}) {
  const violations = indexGate.retrievalTelemetryGlobalViolations || [];
  return indexGate.retrievalTelemetryStrictPass === false
    && Number(indexGate.retrievalTelemetryMaturityScore || 0) >= 9
    && violations.length > 0
    && violations.every((violation) => /insufficient invocation sample|no agent has enough retrieval samples/i.test(String(violation)));
}

function assessAgentInvocationDistribution(agentReceipts = {}) {
  const byAgent = agentReceipts.invocationsByAgent || agentReceipts.agentInvocationsByAgent || agentReceipts.invocationDistribution || null;
  if (!byAgent || typeof byAgent !== "object") return { blocking: false, evidence: "" };
  const entries = Object.entries(byAgent)
    .map(([agentId, count]) => [agentId, Number(count) || 0])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0 || entries.length === 0) return { blocking: false, evidence: "" };
  const [topAgentId, topCount] = entries[0];
  const topShare = topCount / total;
  const missingSubjects = unique([
    ...(agentReceipts.missingSubjects || []),
    ...(agentReceipts.missingAgents || []),
    ...(agentReceipts.requiredMissingSubjects || []),
  ]).filter((subject) => subject !== "supervibe-orchestrator");
  const skewed = topShare >= 0.8 && total >= 5;
  const blocking = skewed && missingSubjects.length > 0;
  if (!skewed) return { blocking: false, evidence: "" };
  return {
    blocking,
    evidence: `distributionWarning=${topAgentId}:${topCount}/${total}${missingSubjects.length ? ` missing=${missingSubjects.join("|")}` : ""}`,
  };
}

function inspectMissingOrStaleIndex(rootDir) {
  const scriptPath = join(rootDir, "scripts", "build-code-index.mjs");
  if (!existsSync(scriptPath)) {
    return { count: null, pass: false, evidence: "build-code-index.mjs missing" };
  }
  const result = spawnSync(process.execPath, [scriptPath, "--root", rootDir, "--list-missing"], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    return { count: null, pass: false, evidence: `list-missing error: ${result.error.message}` };
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const match = /MISSING_OR_STALE:\s*(\d+)/.exec(output);
  if (!match || result.status !== 0) {
    return {
      count: null,
      pass: false,
      evidence: `list-missing unavailable: ${output.split(/\r?\n/).slice(0, 4).join(" | ") || "no output"}`,
    };
  }
  const count = Number(match[1]);
  return {
    count,
    pass: count === 0,
    evidence: `MISSING_OR_STALE: ${count}`,
  };
}

async function collectRetrievalTelemetryGate(rootDir) {
  try {
    return await buildAgentRetrievalTelemetryReportFromProject({ rootDir });
  } catch {
    return {
      pass: false,
      maturityScore: 0,
      summary: {},
      globalViolations: ["retrieval telemetry unavailable"],
    };
  }
}

function inspectRetrievalEnforcement(rootDir) {
  const loggerPath = join(rootDir, "scripts", "lib", "agent-invocation-logger.mjs");
  const cliPath = join(rootDir, "scripts", "agent-invocation.mjs");
  const telemetryPath = join(rootDir, "scripts", "lib", "supervibe-agent-retrieval-telemetry.mjs");
  const logger = existsSync(loggerPath) ? readFileSync(loggerPath, "utf8") : "";
  const cli = existsSync(cliPath) ? readFileSync(cliPath, "utf8") : "";
  const telemetry = existsSync(telemetryPath) ? readFileSync(telemetryPath, "utf8") : "";
  return {
    pass: /appendEvidenceRecord/.test(logger)
      && /retrieval-policy/.test(cli)
      && /evidence-ledger\.jsonl/.test(cli)
      && /isRetrievalTelemetryScoredInvocation/.test(telemetry),
  };
}

function collectRouteReplayGate(rootDir) {
  const workflow = evaluateTriggerMatrix(undefined, { pluginRoot: rootDir, projectRoot: rootDir });
  const semantic = evaluateSemanticIntentMatrix(undefined, { pluginRoot: rootDir, projectRoot: rootDir });
  const commandRoutes = evaluateCommandRouteMatrix(undefined, { pluginRoot: rootDir, projectRoot: rootDir });
  const failed = [
    ...workflow.failed.map((item) => `workflow:${item.id}`),
    ...semantic.failed.map((item) => `semantic:${item.id}`),
    ...commandRoutes.failed.map((item) => `command:${item.id}`),
  ];
  return {
    routeReplayPass: workflow.pass && semantic.pass && commandRoutes.pass,
    routeReplayEvidence: `workflow=${workflow.passed}/${workflow.total}, semantic=${semantic.passed}/${semantic.total}, command=${commandRoutes.passed}/${commandRoutes.total}${failed.length ? `, failed=${failed.join(",")}` : ""}`,
  };
}

function collectActiveCommandReadiness(rootDir, {
  command,
  host = null,
  slug = "",
  handoffId = "",
  workflowRunId = "",
  pluginRoot = rootDir,
} = {}) {
  try {
    const report = buildRuntimeCommandAgentPlan({
      command,
      projectRoot: rootDir,
      pluginRoot,
      host,
      workflowContext: {
        active: true,
        slug,
        handoffId,
        workflowRunId,
      },
    });
    const plan = report.plan || {};
    const readyForActiveDurableWork = report.pass === true && plan.durableWritesAllowed === true;
    return {
      pass: readyForActiveDurableWork,
      command: plan.commandId || command,
      executionMode: plan.executionMode,
      callableAgentsReady: plan.callableAgentsReady === true,
      durableWritesAllowed: plan.durableWritesAllowed === true,
      receiptGate: plan.receiptGate || null,
      scopedReceiptGateActive: plan.scopedReceiptGateActive === true,
      missingScopedReceipts: plan.scopedReceiptTrust?.missingSubjects || [],
      missingCallableAgents: plan.missingCallableAgents || [],
      missingAgents: plan.missingAgents || [],
      qualityImpact: plan.qualityImpact || "",
    };
  } catch (error) {
    return {
      pass: false,
      command,
      executionMode: "inspection-error",
      callableAgentsReady: false,
      missingCallableAgents: [],
      missingAgents: [],
      qualityImpact: error.message,
    };
  }
}

function activeCommandEvidence(validators = {}) {
  const base = `command contracts pass=${validators.commandContracts?.pass === true}`;
  const active = validators.activeCommandReadiness;
  if (!active) return base;
  const missingCallable = (active.missingCallableAgents || []).join("|") || "none";
  const missingScoped = (active.missingScopedReceipts || []).join("|") || "none";
  return `${base}, activeCommand=${active.command || "unknown"}, activePass=${active.pass === true}, executionMode=${active.executionMode || "unknown"}, callableAgentsReady=${active.callableAgentsReady === true}, durableWritesAllowed=${active.durableWritesAllowed === true}, receiptGate=${active.receiptGate || "none"}, missingCallable=${missingCallable}, missingScoped=${missingScoped}`;
}

function workflowContinuationEvidence(continuation = {}) {
  const issues = Array.isArray(continuation.issues) ? continuation.issues : [];
  if (continuation.pass === true) {
    return `workflow continuation pass=true, checked=${continuation.checked || 0}, issues=0`;
  }
  const issueSummary = issues
    .slice(0, 3)
    .map((issue) => `${issue.file || "unknown"}:${issue.code || "issue"}`)
    .join("|") || "unavailable";
  return `workflow continuation pass=false, checked=${continuation.checked || 0}, issues=${issues.length}, firstIssues=${issueSummary}`;
}

function workflowContinuationNextAction(continuation = {}) {
  if (continuation.pass === true) return null;
  const issues = Array.isArray(continuation.issues) ? continuation.issues : [];
  if (issues.length === 0) {
    return "Rerun node scripts/validate-workflow-continuation.mjs and inspect why continuation status is unavailable.";
  }
  const first = issues[0];
  return `Fix ${first.file || "workflow continuation artifact"}: ${first.message || first.code || "missing continuation evidence"}`;
}

function inspectBacklogAndDocs(rootDir) {
  const changelogPath = join(rootDir, "CHANGELOG.md");
  const releaseSecurityPath = join(rootDir, "docs", "release-security.md");
  const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "";
  const releaseSecurity = existsSync(releaseSecurityPath) ? readFileSync(releaseSecurityPath, "utf8") : "";
  const releaseDocs = `${changelog}\n${releaseSecurity}`;
  return {
    hasTenOutOfTenBacklog: /10\/10 Agent System Hardening|Agent System 10\/10/i.test(releaseDocs),
    hasReleaseHardeningNotes: /agent runtime|receipt-bound|deploy verification|compose config|dependency-health/i.test(releaseDocs),
    hasMaturityScriptDocs: /supervibe-agent-maturity|agent-system maturity|agent runtime|receipt-bound/i.test(releaseDocs),
    hasNegativeQuestionEval: /context-free-specialist-question|catalog-copy-specialist-question|negative specialist/i.test(releaseDocs)
      || existsSync(join(rootDir, "tests", "specialist-question-contract.test.mjs")),
  };
}

function countMarkdownFiles(dir) {
  return countFiles(dir, /\.md$/);
}

function countDirectories(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

function countFiles(dir, pattern) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(path, pattern);
    else if (pattern.test(entry.name)) count += 1;
  }
  return count;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}
