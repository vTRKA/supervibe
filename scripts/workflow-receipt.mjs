#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import {
  issueWorkflowInvocationReceipt,
  pruneStaleWorkflowReceipts,
  readWorkflowReceipts,
  rebuildWorkflowReceiptLedger,
  reissueWorkflowInvocationReceipt,
  validateWorkflowReceiptTrust,
  validateWorkflowReceipts,
} from "./lib/supervibe-workflow-receipt-runtime.mjs";
import {
  formatWorkflowReceiptsReport,
} from "./validate-workflow-receipts.mjs";
import {
  assertReceiptOutputContracts,
} from "./lib/agent-output-contracts.mjs";

process.on("uncaughtException", reportWorkflowReceiptError);
process.on("unhandledRejection", reportWorkflowReceiptError);

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
  node scripts/workflow-receipt.mjs reissue --receipt <receipt-json> [--reason <text>]
  node scripts/workflow-receipt.mjs prune-stale [--apply]
  node scripts/workflow-receipt.mjs rebuild-ledger [--prune-stale]
  node scripts/workflow-receipt.mjs recovery-status
  node scripts/workflow-receipt.mjs validate

NOTES:
  issue writes a runtime-signed receipt, upserts the hash-chain ledger idempotently, and updates artifact-links.json.`;
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
  const rootDir = options["project-root"] || options.root || process.cwd();

  if (options.help || options.h) {
    console.log(usage());
    process.exit(0);
  }

  if (options.operation === "issue") {
    const command = options.command || options["workflow-command"] || options.cmd;
    const subjectType = inferSubjectType(options);
    const subjectId = inferSubjectId(options);
    const runTimestamp = options["run-timestamp"] || process.env.SUPERVIBE_RUN_TIMESTAMP || new Date().toISOString();
    assertReceiptOutputContracts({
      rootDir,
      command,
      stage: options.stage,
      subjectId,
      outputArtifacts: options.output,
    });
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
      secret: options.secret || null,
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

  if (options.operation === "reissue") {
    const result = await reissueWorkflowInvocationReceipt({
      rootDir,
      receiptPath: options.receipt || options.path,
      reason: options.reason || null,
      secret: options.secret || null,
    });
    console.log("SUPERVIBE_WORKFLOW_RECEIPT_REISSUED");
    console.log(`RECEIPT_ID: ${result.receipt.receiptId}`);
    console.log(`RECEIPT_PATH: ${result.receiptPath}`);
    console.log(`LEDGER_REBUILT: ${result.ledgerRepair?.retained ?? "unknown"}`);
    console.log(`PRUNED_LEDGER_ENTRIES: ${result.ledgerRepair?.pruned ?? "unknown"}`);
    process.exit(0);
  }

  if (options.operation === "prune-stale") {
    const result = await pruneStaleWorkflowReceipts({
      rootDir,
      apply: options.apply === true,
      secret: options.secret || null,
    });
    console.log("SUPERVIBE_WORKFLOW_RECEIPT_PRUNE_STALE");
    console.log(`APPLY: ${options.apply === true}`);
    console.log(`CHECKED: ${result.checked}`);
    console.log(`STALE: ${result.stale}`);
    console.log(`ARCHIVED: ${result.archived.length}`);
    console.log(`LEDGER_RETAINED: ${result.ledger.retained}`);
    for (const item of result.driftIssues) console.log(`STALE_RECEIPT: ${item}`);
    process.exit(result.pass ? 0 : 1);
  }

  if (options.operation === "rebuild-ledger") {
    const result = await rebuildWorkflowReceiptLedger({
      rootDir,
      pruneStale: options["prune-stale"] === true,
      secret: options.secret || null,
    });
    console.log("SUPERVIBE_WORKFLOW_RECEIPT_LEDGER_REBUILT");
    console.log(`CHECKED: ${result.checked}`);
    console.log(`RETAINED: ${result.retained}`);
    console.log(`PRUNED: ${result.pruned}`);
    console.log(`STALE: ${result.stale}`);
    for (const item of result.signatureIssues) console.log(`SIGNATURE_ISSUE: ${item}`);
    for (const item of result.driftIssues) console.log(`DRIFT_ISSUE: ${item}`);
    process.exit(result.signatureIssues.length === 0 ? 0 : 1);
  }

  if (options.operation === "recovery-status") {
    const receipts = readWorkflowReceipts(rootDir).filter((receipt) => !receipt.__invalidJson);
    const checks = receipts.map((receipt) => ({
      receipt,
      trust: validateWorkflowReceiptTrust(rootDir, receipt, { secret: options.secret || null }),
    }));
    const trusted = checks
      .filter((item) => item.trust.pass)
      .sort((left, right) => String(left.receipt.completedAt || "").localeCompare(String(right.receipt.completedAt || "")));
    const last = trusted[trusted.length - 1]?.receipt || null;
    const untrusted = checks.filter((item) => !item.trust.pass);
    console.log("SUPERVIBE_WORKFLOW_RECOVERY_STATUS");
    console.log(`RECEIPTS: ${receipts.length}`);
    console.log(`TRUSTED_RECEIPTS: ${trusted.length}`);
    console.log(`UNTRUSTED_RECEIPTS: ${untrusted.length}`);
    console.log(`LAST_TRUSTED_STAGE: ${last ? `${last.command}:${last.subjectType}:${last.subjectId}@${last.stage}` : "none"}`);
    console.log(`LAST_TRUSTED_COMPLETED_AT: ${last?.completedAt || "none"}`);
    for (const item of untrusted) {
      console.log(`DIRTY_RECEIPT: ${item.receipt.__file}`);
      for (const issue of item.trust.issues) console.log(`DIRTY_REASON: ${issue}`);
    }
    console.log(`NEXT_SAFE_ACTION: ${untrusted.length ? "run workflow-receipt reissue/prune-stale/rebuild-ledger, then rerun validators" : "continue from the last trusted stage or run the domain planner"}`);
    process.exit(0);
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

function reportWorkflowReceiptError(error) {
  console.error("SUPERVIBE_WORKFLOW_RECEIPT_ERROR");
  console.error(`ERROR: ${error?.message || error}`);
  console.error("NEXT_SAFE_ACTION: use a stable per-agent output JSON/summary for receipt outputs; for ledger drift run `node scripts/workflow-receipt.mjs recovery-status` then the printed repair command.");
  process.exit(2);
}
