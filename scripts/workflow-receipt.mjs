#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import {
  issueWorkflowInvocationReceipt,
  validateWorkflowReceipts,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  formatWorkflowReceiptsReport,
} from "./validate-workflow-receipts.mjs";

function parseArgs(argv) {
  const operation = argv[2] || "help";
  const options = { operation, input: [], output: [] };
  for (let index = 3; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }
    index += 1;
    if (key === "input" || key === "output") {
      options[key].push(...value.split(",").map((part) => part.trim()).filter(Boolean));
    } else {
      options[key] = value;
    }
  }
  return options;
}

function usage() {
  return `SUPERVIBE_WORKFLOW_RECEIPT
USAGE:
  node scripts/workflow-receipt.mjs issue --command /supervibe-plan --subject-type skill --subject-id supervibe:writing-plans --stage <stage> --reason <text> --output <path> --handoff <id>
  node scripts/workflow-receipt.mjs issue --command /supervibe-design --agent creative-director --host-invocation-id <id> --stage <stage> --reason <text> --input <path> --output <path> --slug <prototype-slug>
  node scripts/workflow-receipt.mjs issue --command /supervibe-design --skill supervibe:brandbook --stage <stage> --reason <text> --output <path> --handoff <id>
  node scripts/workflow-receipt.mjs validate

NOTES:
  issue writes a runtime-signed receipt, appends the hash-chain ledger, and updates artifact-links.json.`;
}

function inferSubjectType(options) {
  if (options["subject-type"]) return options["subject-type"];
  if (options.agent) return "agent";
  if (options.skill) return "skill";
  if (options.reviewer) return "reviewer";
  if (options.worker) return "worker";
  if (options.validator) return "validator";
  if (options.tool) return "tool";
  return "command";
}

function inferSubjectId(options) {
  return options["subject-id"]
    || options.agent
    || options.skill
    || options.reviewer
    || options.worker
    || options.validator
    || options.tool
    || options["workflow-command"]
    || options.command
    || options.cmd;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const rootDir = options.root || process.cwd();

  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }

  if (options.operation === "issue") {
    const command = options.command || options["workflow-command"] || options.cmd;
    const subjectType = inferSubjectType(options);
    const subjectId = inferSubjectId(options);
    const runTimestamp = options["run-timestamp"] || process.env.SUPERVIBE_RUN_TIMESTAMP || new Date().toISOString();
    const result = await issueWorkflowInvocationReceipt({
      rootDir,
      command,
      subjectType,
      subjectId,
      agentId: options.agent || null,
      skillId: options.skill || null,
      stage: options.stage,
      invocationReason: options.reason,
      inputEvidence: options.input,
      outputArtifacts: options.output,
      startedAt: options.startedAt || runTimestamp,
      completedAt: options.completedAt || runTimestamp,
      runTimestamp,
      handoffId: options.handoff || options.slug,
      receiptDir: options["receipt-dir"] || null,
      hostInvocation: buildHostInvocation(options),
    });
    console.log("SUPERVIBE_WORKFLOW_RECEIPT_ISSUED");
    console.log(`RECEIPT_ID: ${result.receipt.receiptId}`);
    console.log(`RECEIPT_PATH: ${result.receiptPath}`);
    console.log(`ARTIFACT_LINKS: ${result.artifactLinksPath}`);
    console.log(`LEDGER_ENTRY: ${result.ledgerEntry.entryHash}`);
    console.log(`RUN_TIMESTAMP: ${result.receipt.runtime.runTimestamp}`);
    if (result.receipt.hostInvocation?.evidencePath) {
      console.log(`HOST_INVOCATION_EVIDENCE: ${result.receipt.hostInvocation.evidencePath}`);
    }
    process.exit(0);
  }

  if (options.operation === "validate") {
    const result = validateWorkflowReceipts(rootDir);
    console.log(formatWorkflowReceiptsReport(result));
    process.exit(result.pass ? 0 : 1);
  }

  console.log(usage());
  process.exit(options.operation === "help" ? 0 : 1);
}

function buildHostInvocation(options) {
  const invocationId = options["host-invocation-id"] || options["invocation-id"];
  const evidencePath = options["host-trace"] || options["host-invocation-evidence"];
  if (!invocationId && !evidencePath) return null;
  return {
    source: options["host-invocation-source"] || (evidencePath ? "host-trace-file" : "agent-invocations-jsonl"),
    invocationId: invocationId || options["host-trace-id"] || evidencePath,
    evidencePath: evidencePath || null,
    traceId: options["host-trace-id"] || null,
    spanId: options["host-span-id"] || null,
  };
}
