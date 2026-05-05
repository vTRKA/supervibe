import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  validateWorkflowContinuation,
} from "../validate-workflow-continuation.mjs";
import {
  validateWorkflowReceipts,
} from "./supervibe-workflow-receipt-runtime.mjs";

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
  const continuation = validateWorkflowContinuation(rootDir);
  const workflowReceipts = validateWorkflowReceipts(rootDir, options.receiptOptions || {});
  const agentReceipts = validateAgentProducerReceipts(rootDir, {
    ...(options.receiptOptions || {}),
    requireHostAgentReceipts: true,
    minHostAgentReceipts: options.minHostAgentReceipts ?? 1,
    minAgentInvocations: options.minAgentInvocations ?? 10,
  });
  const indexGate = await collectCodeGraphGate(rootDir);
  const docs = inspectBacklogAndDocs(rootDir);

  return scoreAgentSystemMaturity({
    roster,
    validators: {
      commandContracts,
      dynamicQuestions,
      continuation,
      workflowReceipts,
      agentReceipts,
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
    validators.commandContracts?.pass ? 1.0 : 0,
    `command contracts pass=${validators.commandContracts?.pass === true}`,
    "Run npm run validate:command-operational-contracts and fix missing real-agent routing rules.",
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
    `workflow continuation pass=${validators.continuation?.pass === true}`,
    "Restore NEXT_USER_ACTIONS and gated-stage continuation contracts.",
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
  const telemetryScore = agentReceiptTrustPass && hostReceipts >= minHostReceipts && invocations >= minInvocations
    ? 1.25
    : hostReceipts > 0 || invocations > 0
      ? 0.55
      : 0.25;
  add(
    "host-agent-telemetry",
    1.25,
    telemetryScore,
    `strictPass=${agentReceiptTrustPass}, trustedHostAgentReceipts=${hostReceipts}/${minHostReceipts}, receiptBoundAgentInvocations=${invocations}/${minInvocations}`,
    "Complete real host-agent stages and log each with node scripts/agent-invocation.mjs log ... --issue-receipt.",
  );

  const graphReady = indexGate.ready === true
    && indexGate.retrievalEnforcementPass === true
    && !String(indexGate.warnings || "").includes("symbol-coverage");
  add(
    "code-graph-readiness",
    1.0,
    graphReady ? 1.0 : indexGate.sourceReady ? 0.5 : 0,
    indexGate.evidence || "index status unavailable",
    "Run node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health.",
  );
  add(
    "eval-coverage",
    1.0,
    roster.testFiles >= 250 && docs.hasNegativeQuestionEval ? 1.0 : 0.65,
    `${roster.testFiles || 0} test files, negative specialist-question eval=${docs.hasNegativeQuestionEval === true}`,
    "Add negative fixtures for weak specialist questions, receipt drift, and stage recovery.",
  );
  add(
    "backlog-and-docs",
    1.25,
    (docs.hasReleaseHardeningNotes || docs.hasTenOutOfTenBacklog) && docs.hasMaturityScriptDocs ? 1.25 : 0.65,
    `release hardening notes=${(docs.hasReleaseHardeningNotes || docs.hasTenOutOfTenBacklog) === true}, maturity docs=${docs.hasMaturityScriptDocs === true}`,
    "Keep release hardening notes in CHANGELOG.md and durable operational docs instead of an ad hoc backlog file.",
  );

  const total = dimensions.reduce((sum, item) => sum + item.score, 0);
  return {
    schemaVersion: 1,
    score: Number(total.toFixed(2)),
    maxScore: 10,
    pass: total >= 10,
    status: total >= 10 ? "10-of-10-ready" : total >= 9 ? "near-10-operational-gaps" : "hardening-required",
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

async function collectCodeGraphGate(rootDir) {
  const enforcement = inspectRetrievalEnforcement(rootDir);
  if (!existsSync(join(rootDir, ".supervibe", "memory", "code.db"))) {
    return {
      ready: false,
      sourceReady: false,
      warnings: "missing-code-index",
      evidence: "code.db missing",
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
      evidence: `source=${gate.indexedSourceFiles}/${gate.eligibleSourceFiles}, failed=${(gate.failedGates || []).map((item) => item.code).join(",") || "none"}, warnings=${(gate.warnings || []).map((item) => item.code).join(",") || "none"}, retrievalEnforcement=${enforcement.pass}`,
      retrievalEnforcementPass: enforcement.pass,
    };
  } catch (error) {
    return {
      ready: false,
      sourceReady: false,
      warnings: "index-health-error",
      evidence: `index health error: ${error.message}`,
    };
  } finally {
    store.close();
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
