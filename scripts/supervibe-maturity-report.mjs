#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAgentSystemMaturityReport,
  formatAgentSystemMaturityReport,
} from "./lib/agent-system-maturity.mjs";
import { validateWorkItemGraph } from "./lib/supervibe-plan-to-work-items.mjs";
import { validateApiContract } from "./validate-api-contracts.mjs";
import { validateDecisionBrief } from "./validate-decision-briefs.mjs";
import { validatePlanReviewArtifact } from "./validate-plan-review-artifacts.mjs";

const REQUIRED_SCENARIOS = Object.freeze([
  "internal-application-audit",
  "external-research-source-truth",
  "source-of-truth-conflict-resolution",
  "documentation-summary-before-docs",
  "visual-chat-explanation-required",
  "raw-task-prevention",
  "regulated-domain-evidence",
  "plugin-update-local-drift",
  "workflow-chain-maturity-audit",
  "multi-plugin-host-instruction-coexistence",
]);

export async function buildMaturityDashboard({
  rootDir = process.cwd(),
  agentSystemReport = null,
} = {}) {
  const root = resolve(rootDir);
  const agentReport = agentSystemReport || await buildAgentSystemMaturityReport(root);
  const packageJson = readJson(join(root, "package.json"));
  const matrix = readText(join(root, "docs", "references", "agent-system-coverage-matrix.md"));
  const scenarios = readJson(join(root, "tests", "fixtures", "scenario-evals", "supervibe-user-flows.json"), []);
  const scenarioIds = new Set((scenarios || []).map((scenario) => scenario.id));
  const helper = readText(join(root, "scripts", "lib", "installer-managed-checkout.mjs"));
  const upgrade = readText(join(root, "scripts", "supervibe-upgrade.mjs"));
  const installSh = readText(join(root, "install.sh"));
  const installPs1 = readText(join(root, "install.ps1"));
  const updateSh = readText(join(root, "update.sh"));
  const updatePs1 = readText(join(root, "update.ps1"));
  const router = readText(join(root, "scripts", "lib", "supervibe-trigger-router.mjs"));
  const catalog = readText(join(root, "scripts", "lib", "supervibe-command-catalog.mjs"));
  const migrator = readText(join(root, "scripts", "lib", "supervibe-context-migrator.mjs"));
  const commandValidator = readText(join(root, "scripts", "validate-command-operational-contracts.mjs"));
  const commandDocs = readCommandDocs(join(root, "commands"));
  const artifactReadiness = inspectArtifactReadiness(root);

  const missingScenarios = REQUIRED_SCENARIOS.filter((id) => !scenarioIds.has(id));
  const sourceOfTruth = /Tier 1 sources are authoritative/.test(matrix)
    && /Conflict rule:/.test(matrix)
    && /Regulated Domain Policies/.test(matrix)
    && /Negative Source Patterns/.test(matrix);
  const visualExplanation = /Visual Chat Explanation Policy/.test(matrix)
    && /Browser-first visual packet/.test(matrix)
    && /accTitle:/.test(matrix)
    && /accDescr:/.test(matrix)
    && /Text fallback:/.test(matrix)
    && scenarioIds.has("visual-chat-explanation-required");
  const rawTaskPrevention = /Raw Task Prevention/.test(matrix)
    && /readiness score 9\/10/.test(matrix)
    && scenarioIds.has("raw-task-prevention");
  const updateSelfHeal = /restoreAllTracked/.test(helper)
    && /tracked local plugin drift in managed checkout/.test(helper)
    && /SUPERVIBE_RESTORE_PLUGIN_DRIFT/.test(upgrade)
    && /isManagedInstallPath/.test(upgrade)
    && [installSh, installPs1, updateSh, updatePs1].every((source) => /managed checkout tracked drift|tracked local plugin drift/.test(source));
  const routeCoverage = [
    "source_truth_research",
    "documentation_summary_gate",
    "visual_explanation",
    "task_readiness_intake",
    "plugin_update_repair",
    "workflow_chain_audit",
  ].every((intent) => router.includes(intent));
  const workflowChainAudit = /Workflow-chain maturity audit/.test(matrix)
    && scenarioIds.has("workflow-chain-maturity-audit")
    && /workflow-chain-audit/.test(catalog)
    && /workflow_chain_audit/.test(router)
    && /\/supervibe-audit --workflow-chain/.test(catalog)
    && /\/supervibe-audit --workflow-chain/.test(router);
  const hostInstructionCoexistence = /Host Instruction Coexistence/.test(matrix)
    && scenarioIds.has("multi-plugin-host-instruction-coexistence")
    && /externalManagedBlocks/.test(migrator)
    && /preserve-external-managed-blocks/.test(migrator)
    && /preserve-other-supervibe-managed-blocks/.test(migrator);
  const freshCommandDocs = commandDocs.filter((doc) => /^---\s*[\s\S]*?\nlast-verified\s*:/im.test(doc.text));
  const commandFreshness = commandDocs.length > 0
    && freshCommandDocs.length === commandDocs.length
    && /last-verified-frontmatter/.test(commandValidator);

  const checks = [
    { id: "agent-system-maturity", pass: agentReport.pass === true, evidence: `${agentReport.score || 0}/${agentReport.maxScore || 10}` },
    { id: "user-case-coverage", pass: missingScenarios.length === 0, evidence: missingScenarios.length ? `missing=${missingScenarios.join(",")}` : `${REQUIRED_SCENARIOS.length}/${REQUIRED_SCENARIOS.length} scenarios` },
    { id: "source-of-truth", pass: sourceOfTruth, evidence: sourceOfTruth ? "hierarchy/conflict/regulated/negative patterns present" : "source hierarchy incomplete" },
    { id: "visual-explanation", pass: visualExplanation, evidence: visualExplanation ? "browser-first visual packet and fallback present" : "visual explanation policy incomplete" },
    { id: "raw-task-prevention", pass: rawTaskPrevention, evidence: rawTaskPrevention ? "readiness 9/10 gate present" : "readiness gate incomplete" },
    { id: "update-self-heal", pass: updateSelfHeal, evidence: updateSelfHeal ? "managed checkout tracked drift restore wired" : "tracked drift restore incomplete" },
    { id: "route-coverage", pass: routeCoverage, evidence: routeCoverage ? "new audit/research/visual/update intents routed" : "route intents missing" },
    { id: "workflow-chain-audit", pass: workflowChainAudit, evidence: workflowChainAudit ? "workflow chain audit route, matrix row, and scenario present" : "workflow chain audit coverage incomplete" },
    { id: "host-instruction-coexistence", pass: hostInstructionCoexistence, evidence: hostInstructionCoexistence ? "external and other adapter managed blocks preserved" : "host instruction coexistence incomplete" },
    { id: "artifact-readiness", pass: artifactReadiness.pass, evidence: artifactReadiness.evidence },
    { id: "command-freshness", pass: commandFreshness, evidence: commandFreshness ? `${freshCommandDocs.length}/${commandDocs.length} command docs last-verified` : `${freshCommandDocs.length}/${commandDocs.length} command docs last-verified` },
  ];

  return {
    schemaVersion: 1,
    version: packageJson.version || "unknown",
    counts: {
      agents: countMarkdownFiles(join(root, "agents")),
      skills: countDirectories(join(root, "skills")),
      commands: countMarkdownFiles(join(root, "commands")),
      rules: countMarkdownFiles(join(root, "rules")),
      scenarios: scenarios.length || 0,
    },
    checks,
    agentSystemReport: agentReport,
    pass: checks.every((check) => check.pass),
  };
}

export function formatMaturityDashboard(report = {}) {
  const lines = [
    "SUPERVIBE_MATURITY_REPORT",
    `PASS: ${report.pass === true}`,
    `VERSION: ${report.version || "unknown"}`,
    `AGENTS: ${report.counts?.agents ?? 0}`,
    `SKILLS: ${report.counts?.skills ?? 0}`,
    `COMMANDS: ${report.counts?.commands ?? 0}`,
    `RULES: ${report.counts?.rules ?? 0}`,
    `SCENARIOS: ${report.counts?.scenarios ?? 0}`,
  ];
  for (const check of report.checks || []) {
    lines.push(`${check.id.toUpperCase().replace(/-/g, "_")}: ${check.pass ? "pass" : "fail"} (${check.evidence})`);
  }
  if (report.agentSystemReport) {
    lines.push("");
    lines.push(formatAgentSystemMaturityReport(report.agentSystemReport));
  }
  return lines.join("\n");
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function readJson(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function countMarkdownFiles(dir) {
  return countFiles(dir, /\.md$/);
}

function readCommandDocs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const path = join(dir, entry.name);
      return { file: entry.name, text: readText(path) };
    });
}

function inspectArtifactReadiness(root) {
  const requiredFiles = [
    "docs/templates/decision-brief-template.md",
    "docs/templates/api-contract-template.md",
    "docs/templates/plan-review-template.md",
    "scripts/validate-decision-briefs.mjs",
    "scripts/validate-api-contracts.mjs",
    "scripts/validate-plan-review-artifacts.mjs",
    "scripts/validate-work-item-graphs.mjs",
  ];
  const missing = requiredFiles.filter((file) => !existsSync(join(root, file)));
  const decisionFixtures = readMarkdownFiles(join(root, "tests", "fixtures", "artifacts", "decision-briefs"));
  const apiFixtures = readMarkdownFiles(join(root, "tests", "fixtures", "artifacts", "api-contracts"));
  const planReviewFixtures = readMarkdownFiles(join(root, "tests", "fixtures", "artifacts", "plan-reviews"));
  const workItemFixtures = readJsonFiles(join(root, "tests", "fixtures", "artifacts", "work-item-graphs"));
  const decisionFailures = decisionFixtures
    .map((file) => ({ file, issues: validateDecisionBrief(readText(file)) }))
    .filter((item) => item.issues.length > 0);
  const apiFailures = apiFixtures
    .map((file) => ({ file, issues: validateApiContract(readText(file)) }))
    .filter((item) => item.issues.length > 0);
  const planReviewFailures = planReviewFixtures
    .map((file) => ({ file, issues: validatePlanReviewArtifact(readText(file)) }))
    .filter((item) => item.issues.length > 0);
  const workItemFailures = workItemFixtures
    .map((file) => ({ file, validation: validateWorkItemGraph(readJson(file, {})) }))
    .filter((item) => !item.validation.valid);
  const pass = missing.length === 0
    && decisionFixtures.length > 0
    && apiFixtures.length > 0
    && planReviewFixtures.length > 0
    && workItemFixtures.length > 0
    && decisionFailures.length === 0
    && apiFailures.length === 0
    && planReviewFailures.length === 0
    && workItemFailures.length === 0;
  const problems = [
    missing.length ? `missing=${missing.join(",")}` : null,
    decisionFixtures.length === 0 ? "decisionFixtures=0" : null,
    apiFixtures.length === 0 ? "apiContractFixtures=0" : null,
    planReviewFixtures.length === 0 ? "planReviewFixtures=0" : null,
    workItemFixtures.length === 0 ? "workItemGraphFixtures=0" : null,
    decisionFailures.length ? `decisionFailures=${decisionFailures.length}` : null,
    apiFailures.length ? `apiFailures=${apiFailures.length}` : null,
    planReviewFailures.length ? `planReviewFailures=${planReviewFailures.length}` : null,
    workItemFailures.length ? `workItemGraphFailures=${workItemFailures.length}` : null,
  ].filter(Boolean);
  return {
    pass,
    evidence: pass
      ? `decisionBriefFixtures=${decisionFixtures.length}, apiContractFixtures=${apiFixtures.length}, planReviewFixtures=${planReviewFixtures.length}, workItemGraphFixtures=${workItemFixtures.length}, validators=4`
      : problems.join("; "),
  };
}

function readMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readMarkdownFiles(path));
    else if (entry.name.endsWith(".md")) out.push(path);
  }
  return out;
}

function readJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readJsonFiles(path));
    else if (entry.name.endsWith(".json")) out.push(path);
  }
  return out;
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
  const report = await buildMaturityDashboard({ rootDir: options.root || process.cwd() });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatMaturityDashboard(report));
  }
  process.exit(report.pass ? 0 : 1);
}
