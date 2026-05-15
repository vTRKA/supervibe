#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  backfillWorkflowReceiptEvidenceSnapshots,
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
import {
  bindGraphProducerProofOutput,
  createGraphProducerProof,
  validateEpicAgentContract,
} from "./lib/supervibe-epic-agent-contract.mjs";

process.on("uncaughtException", reportWorkflowReceiptError);
process.on("unhandledRejection", reportWorkflowReceiptError);

const TASK_COMPLETION_PROOF_SUBJECT_TYPES = new Set(["agent", "worker", "reviewer"]);

function parseArgs(argv) {
  const rawOperation = argv[2] || "help";
  const operation = rawOperation === "--help" || rawOperation === "-h" ? "help" : rawOperation;
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
  node scripts/workflow-receipt.mjs issue --command /supervibe-loop --stage <stage> --reason <text> --output <path> --handoff <id> --graph-id <epic-id> --task-id <work-item-id>
  node scripts/workflow-receipt.mjs inspect
  node scripts/workflow-receipt.mjs reissue --receipt <receipt-json> [--reason <text>]
  node scripts/workflow-receipt.mjs prune-stale [--apply]
  node scripts/workflow-receipt.mjs rebuild-ledger [--prune-stale]
  node scripts/workflow-receipt.mjs recovery-status
  node scripts/workflow-receipt.mjs migrate-10of10 [--dry-run] [--apply] [--limit <n>] [--max-receipts <n>]
  node scripts/workflow-receipt.mjs validate

NOTES:
  issue writes a runtime-signed receipt, upserts the hash-chain ledger idempotently, and updates artifact-links.json.
  command-subject receipts are controller/diagnostic evidence only; they cannot satisfy required producer, reviewer, worker, validator, or task-completion proof.`;
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
      graphId: options["graph-id"] || options["work-graph-id"] || null,
      taskId: options["task-id"] || options["work-item-id"] || null,
    });
    console.log("SUPERVIBE_WORKFLOW_RECEIPT_ISSUED");
    console.log(`RECEIPT_ID: ${result.receipt.receiptId}`);
    console.log(`RECEIPT_PATH: ${result.receiptPath}`);
    console.log(`ARTIFACT_LINKS: ${result.artifactLinksPath}`);
    console.log(`LEDGER_ENTRY: ${result.ledgerEntry.entryHash}`);
    console.log(`RUN_TIMESTAMP: ${result.receipt.runtime.runTimestamp}`);
    if (result.receipt.evidenceSnapshot?.path) {
      console.log(`EVIDENCE_SNAPSHOT: ${result.receipt.evidenceSnapshot.path}`);
    }
    if (result.receipt.hostInvocation?.evidencePath) {
      console.log(`HOST_INVOCATION_EVIDENCE: ${result.receipt.hostInvocation.evidencePath}`);
    }
    if (result.receipt.workItemBinding) {
      console.log(`GRAPH_ID: ${result.receipt.workItemBinding.graphId || "none"}`);
      console.log(`TASK_ID: ${result.receipt.workItemBinding.taskId || "none"}`);
    }
    const proofScope = classifyIssuedReceiptProofScope(result.receipt);
    console.log(`PROOF_SCOPE: ${proofScope.scope}`);
    console.log(`ADOPTABLE_AS_TASK_COMPLETION: ${proofScope.adoptableAsTaskCompletion}`);
    if (proofScope.message) console.log(`PROOF_NOTE: ${proofScope.message}`);
    if (proofScope.repairHint) console.log(`REPAIR_HINT: ${proofScope.repairHint}`);
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
    if (result.receipt.supersedes?.receiptId) {
      console.log(`SUPERSEDES_RECEIPT_ID: ${result.receipt.supersedes.receiptId}`);
    }
    if (result.receipt.evidenceSnapshot?.path) {
      console.log(`EVIDENCE_SNAPSHOT: ${result.receipt.evidenceSnapshot.path}`);
    }
    process.exit(0);
  }

  if (options.operation === "inspect" || options.operation === "inspect-drift") {
    const result = inspectWorkflowReceiptDrift(rootDir, { secret: options.secret || null });
    console.log(formatWorkflowReceiptDriftInspection(result));
    process.exit(result.stale > 0 ? 1 : 0);
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

  if (options.operation === "migrate-10of10") {
    if (options.apply === true && options["dry-run"] === true) {
      throw new Error("migrate-10of10 accepts either --dry-run or --apply, not both");
    }
    const result = await inspectWorkflowLogicMigration(rootDir, {
      apply: options.apply === true,
      dryRun: options["dry-run"] === true || options.apply !== true,
      inventoryLimit: parseInventoryLimit(options.limit),
      backfillLimit: parseBackfillLimit(options["max-receipts"]),
      secret: options.secret || null,
    });
    console.log("SUPERVIBE_WORKFLOW_LOGIC_10OF10_MIGRATION");
    console.log(`MODE: ${result.mode}`);
    console.log(`DRY_RUN: ${result.dryRun}`);
    console.log(`APPLY: ${result.apply}`);
    console.log(`MUTATION: ${result.mutation}`);
    console.log(`PASS: ${result.pass}`);
    console.log(`RECEIPTS: ${result.receipts}`);
    console.log(`RECEIPTS_MISSING_SNAPSHOT: ${result.receiptsMissingSnapshot}`);
    console.log(`MALFORMED_RECEIPTS: ${result.malformedReceipts}`);
    if (result.snapshotBackfill) {
      console.log(`SNAPSHOT_BACKFILL_ELIGIBLE: ${result.snapshotBackfill.eligible}`);
      console.log(`SNAPSHOT_BACKFILL_MIGRATED: ${result.snapshotBackfill.migrated}`);
      console.log(`SNAPSHOT_BACKFILL_REMAINING: ${result.snapshotBackfill.remainingMissingSnapshot}`);
      console.log(`SNAPSHOT_BACKFILL_SKIPPED: ${result.snapshotBackfill.skipped.length}`);
      if (result.snapshotBackfill.reportPath) console.log(`SNAPSHOT_BACKFILL_REPORT: ${result.snapshotBackfill.reportPath}`);
    }
    console.log(`GRAPH_ARTIFACTS: ${result.graphArtifacts}`);
    console.log(`GRAPHS_MISSING_PRODUCER_PROOF: ${result.graphsMissingProducerProof}`);
    console.log(`MALFORMED_GRAPHS: ${result.malformedGraphs}`);
    if (result.graphBackfill) {
      console.log(`GRAPH_BACKFILL_ELIGIBLE: ${result.graphBackfill.eligible}`);
      console.log(`GRAPH_BACKFILL_MIGRATED: ${result.graphBackfill.migrated}`);
      console.log(`GRAPH_BACKFILL_REMAINING: ${result.graphBackfill.remainingMissingProducerProof}`);
      console.log(`GRAPH_BACKFILL_SKIPPED: ${result.graphBackfill.skipped.length}`);
      if (result.graphBackfill.reportPath) console.log(`GRAPH_BACKFILL_REPORT: ${result.graphBackfill.reportPath}`);
    }
    console.log(`CLEANUP_TARGETS_WITHOUT_SCOPE: ${result.cleanupTargetsWithoutScope}`);
    console.log(`MALFORMED_CLEANUP_REGISTRY: ${result.malformedCleanupRegistry}`);
    console.log(`MALFORMED_RECORDS: ${result.malformedRecords}`);
    console.log(`INVENTORY_LIMIT: ${result.inventoryLimitLabel}`);
    console.log(`INVENTORY_TRUNCATED: ${result.inventoryTruncated}`);
    for (const item of result.actions) console.log(`ACTION: ${item}`);
    for (const item of result.receiptGroups) console.log(`LEGACY_RECEIPT_GROUP: ${item}`);
    for (const item of result.legacyReceiptInventory) {
      console.log(`LEGACY_RECEIPT: ${item.summary}`);
      console.log(`REPAIR_RECEIPT_COMMAND: ${item.reissueCommand}`);
    }
    for (const item of result.malformedReceiptInventory) console.log(`MALFORMED_RECEIPT: ${item}`);
    for (const item of result.graphInventory) {
      console.log(`GRAPH_MISSING_PRODUCER_PROOF: ${item.summary}`);
      if (item.candidateReceipt) console.log(`GRAPH_CANDIDATE_RECEIPT: ${item.candidateReceipt}`);
      console.log(`REPAIR_GRAPH_COMMAND: ${item.repairCommand}`);
      console.log(`REPAIR_GRAPH_NOTE: ${item.repairNote}`);
    }
    for (const item of result.malformedGraphInventory) console.log(`MALFORMED_GRAPH: ${item}`);
    for (const item of result.cleanupInventory) {
      console.log(`CLEANUP_TARGET_WITHOUT_SCOPE: ${item.summary}`);
      console.log(`REPAIR_CLEANUP_SCOPE: ${item.repairCommand}`);
    }
    for (const item of result.malformedCleanupInventory) console.log(`MALFORMED_CLEANUP_REGISTRY: ${item}`);
    for (const item of result.moreInventoryCommands) console.log(`MORE_INVENTORY: ${item}`);
    console.log(`NEXT_SAFE_ACTION: ${result.nextAction}`);
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

async function inspectWorkflowLogicMigration(rootDir, options = {}) {
  const apply = options.apply === true;
  const dryRun = options.dryRun !== false && !apply;
  const inventoryLimit = parseInventoryLimit(options.inventoryLimit);
  const backfillLimit = parseBackfillLimit(options.backfillLimit);
  const allReceipts = readWorkflowReceipts(rootDir);
  const malformedReceiptInventory = allReceipts
    .filter((receipt) => receipt.__invalidJson)
    .map((receipt) => receipt.__file || "unknown receipt");
  const receipts = allReceipts.filter((receipt) => !receipt.__invalidJson);
  const receiptsMissingSnapshotList = receipts.filter((receipt) => !receipt.evidenceSnapshot);

  const graphArtifacts = listFiles(join(rootDir, ".supervibe", "memory", "work-items"))
    .filter((file) => /(?:graph\.json|\.work-item-graph\.json)$/i.test(file))
    .filter((file) => !normalizeRelPath(file).includes("/.archive/"));
  const graphMissingProducerProof = [];
  const malformedGraphInventory = [];
  for (const file of graphArtifacts) {
    const graphRel = normalizeRelPath(relative(rootDir, file));
    try {
      const graph = JSON.parse(readFileSync(file, "utf8"));
      if (!graph.metadata?.graphProducerProof) graphMissingProducerProof.push({ file, graph, graphRel });
    } catch (error) {
      malformedGraphInventory.push(graphRel + ": " + (error.message || error));
    }
  }

  const cleanupPath = join(rootDir, ".supervibe", "memory", "runtime-cleanup-registry.json");
  const cleanup = readJsonFile(cleanupPath, { targets: [] });
  const malformedCleanupInventory = cleanup ? [] : [normalizeRelPath(relative(rootDir, cleanupPath))];
  const cleanupTargetsWithoutScopeList = (cleanup?.targets || []).filter((target) => {
    const scope = target.scope || target;
    return !(scope.command || scope.handoffId || scope.workflowRunId);
  });

  const graphBackfill = apply && graphMissingProducerProof.length
    ? backfillGraphProducerProofs(rootDir, graphMissingProducerProof.map((item) => item.file), { apply: true })
    : null;
  const snapshotBackfill = apply && receiptsMissingSnapshotList.length
    ? await backfillWorkflowReceiptEvidenceSnapshots({
      rootDir,
      apply: true,
      secret: options.secret || null,
      limit: backfillLimit,
    })
    : null;

  const effectiveReceiptsMissingSnapshot = snapshotBackfill
    ? snapshotBackfill.remainingMissingSnapshot
    : receiptsMissingSnapshotList.length;
  const effectiveGraphsMissingProducerProof = graphBackfill
    ? graphBackfill.remainingMissingProducerProof
    : graphMissingProducerProof.length;
  const malformedRecords = malformedReceiptInventory.length + malformedGraphInventory.length + malformedCleanupInventory.length;
  const pass = effectiveReceiptsMissingSnapshot === 0
    && effectiveGraphsMissingProducerProof === 0
    && cleanupTargetsWithoutScopeList.length === 0
    && malformedRecords === 0;

  const actions = [];
  if (effectiveReceiptsMissingSnapshot) actions.push("backfill or reissue legacy receipts to create evidence snapshots");
  if (effectiveGraphsMissingProducerProof) actions.push("regenerate or migrate graph metadata with graphProducerProof");
  if (cleanupTargetsWithoutScopeList.length) actions.push("backfill cleanup target scope from agent invocation records");
  if (malformedRecords) actions.push("quarantine malformed migration records before release");
  if (apply && effectiveReceiptsMissingSnapshot) actions.push("apply mode is explicit; remaining receipts need targeted reissue before release");

  const legacyReceiptInventory = receiptsMissingSnapshotList.slice(0, inventoryLimit).map((receipt) => ({
    summary: (receipt.__file || "unknown") + " receiptId=" + (receipt.receiptId || "unknown") + " command=" + (receipt.command || "unknown") + " stage=" + (receipt.stage || "unknown"),
    reissueCommand: "node scripts/workflow-receipt.mjs reissue --receipt " + (receipt.__file || "<receipt-json>"),
  }));
  const graphInventory = graphMissingProducerProof.slice(0, inventoryLimit).map(({ graph, graphRel }) => {
    const graphId = graph.epicId || graph.graph_id || graph.id || "unknown";
    return {
      summary: graphRel + " graphId=" + graphId,
      candidateReceipt: graph.metadata?.graphProducerProof?.receipt?.receiptPath || null,
      repairCommand: "node scripts/workflow-receipt.mjs migrate-10of10 --apply",
      repairNote: isHistoricalLegacyGraphContract(graph)
        ? "historical graph can receive migration proof with recovery backup"
        : "graph requires a trusted producer receipt or regeneration",
    };
  });
  const cleanupInventory = cleanupTargetsWithoutScopeList.slice(0, inventoryLimit).map((target, index) => ({
    summary: "target#" + index + " type=" + (target.type || target.kind || "unknown"),
    repairCommand: "backfill target.scope from .supervibe/memory/agent-invocations.jsonl or prune stale cleanup target with explicit apply",
  }));
  const receiptGroups = summarizeReceiptGroups(receiptsMissingSnapshotList).slice(0, inventoryLimit);
  const totalInventory = receiptsMissingSnapshotList.length + graphMissingProducerProof.length + cleanupTargetsWithoutScopeList.length;
  const shownInventory = legacyReceiptInventory.length + graphInventory.length + cleanupInventory.length;
  const inventoryTruncated = totalInventory > shownInventory;
  const moreInventoryCommands = inventoryTruncated
    ? ["node scripts/workflow-receipt.mjs migrate-10of10 --limit " + (inventoryLimit * 2)]
    : [];

  return {
    schemaVersion: 1,
    mode: apply ? "apply" : "dry-run",
    dryRun,
    apply,
    mutation: apply ? "runtime-metadata-backfill" : "none",
    pass,
    receipts: receipts.length,
    receiptsMissingSnapshot: effectiveReceiptsMissingSnapshot,
    malformedReceipts: malformedReceiptInventory.length,
    snapshotBackfill,
    graphArtifacts: graphArtifacts.length,
    graphsMissingProducerProof: effectiveGraphsMissingProducerProof,
    malformedGraphs: malformedGraphInventory.length,
    graphBackfill,
    cleanupTargetsWithoutScope: cleanupTargetsWithoutScopeList.length,
    malformedCleanupRegistry: malformedCleanupInventory.length,
    malformedRecords,
    inventoryLimitLabel: String(inventoryLimit),
    inventoryTruncated,
    actions,
    receiptGroups,
    legacyReceiptInventory,
    malformedReceiptInventory,
    graphInventory,
    malformedGraphInventory,
    cleanupInventory,
    malformedCleanupInventory,
    moreInventoryCommands,
    nextAction: pass ? "migration dry-run clean" : "run the listed repair actions, then rerun migrate-10of10",
  };
}

function backfillGraphProducerProofs(rootDir, graphFiles = [], { apply = false, runTimestamp = null } = {}) {
  const timestamp = runTimestamp || new Date().toISOString();
  const receipts = readWorkflowReceipts(rootDir).filter((receipt) => !receipt.__invalidJson);
  const byReceiptId = new Map(receipts.map((receipt) => [receipt.receiptId, receipt]));
  const recoveryRoot = normalizeRelPath(".supervibe/artifacts/_workflow-recovery/graph-producer-proof-backfill/" + sanitizeSegment(timestamp));
  const eligible = [];
  const skipped = [];
  const migrated = [];
  let malformedRecords = 0;

  for (const file of graphFiles) {
    const graphRel = normalizeRelPath(relative(rootDir, file));
    let graph;
    try {
      graph = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      malformedRecords += 1;
      skipped.push({ graphPath: graphRel, reason: "malformed graph JSON: " + (error.message || error) });
      continue;
    }
    if (graph.metadata?.graphProducerProof) continue;
    const validation = validateEpicAgentContract({ rootDir, graph, graphPath: file });
    const trusted = validation.trustedReceipts || [];
    const trustedReceipt = trusted
      .map((item) => byReceiptId.get(item.receiptId))
      .find((receipt) => receipt?.hostInvocation?.source && receipt?.hostInvocation?.invocationId);
    const graphId = graph.epicId || graph.graph_id || graph.id || null;
    const legacyMigration = !trustedReceipt && isHistoricalLegacyGraphContract(graph);
    if (!trustedReceipt && !legacyMigration) {
      skipped.push({
        graphPath: graphRel,
        reason: (validation.issues || []).map((item) => item.message || item.code || String(item)).join("; ") || "no trusted legacy graph producer receipt with hostInvocation proof",
      });
      continue;
    }
    const proof = bindGraphProducerProofOutput(createGraphProducerProof({
      required: true,
      command: trustedReceipt?.command || "/supervibe-loop",
      stage: trustedReceipt?.stage || (legacyMigration ? "migration-backfill" : graph.metadata?.epicAgentContract?.stage || "work-item-atomization"),
      subjectType: trustedReceipt?.subjectType || (legacyMigration ? "tool" : "agent"),
      subjectId: trustedReceipt?.subjectId || trustedReceipt?.agentId || (legacyMigration ? "workflow-receipt-migration" : "work-item-graph-builder"),
      agentId: trustedReceipt?.agentId || trustedReceipt?.subjectId || (legacyMigration ? "workflow-receipt-migration" : null),
      graphId,
      handoffId: trustedReceipt?.handoffId || graphId,
      hostInvocation: trustedReceipt?.hostInvocation || {
        source: "workflow-receipt-migration",
        invocationId: "graph-producer-proof-backfill:" + sanitizeSegment(timestamp),
        evidencePath: recoveryRoot + "/report.json",
        agentId: "workflow-receipt-migration",
      },
      outputArtifact: graphRel,
      outputArtifacts: [graphRel],
      receiptId: trustedReceipt?.receiptId || null,
      receiptPath: trustedReceipt?.__file || null,
      createdAt: timestamp,
    }), { rootDir, graphPath: file, graphId });
    eligible.push({ graphPath: graphRel, receiptId: trustedReceipt?.receiptId || null, mode: legacyMigration ? "historical-migration-proof" : "trusted-receipt" });
    if (!apply) continue;

    const backupRel = normalizeRelPath(recoveryRoot + "/graphs/" + graphRel);
    const backupAbs = join(rootDir, ...backupRel.split("/"));
    mkdirSync(dirname(backupAbs), { recursive: true });
    writeFileSync(backupAbs, JSON.stringify(graph, null, 2) + "\n", "utf8");
    const nextGraph = {
      ...graph,
      metadata: {
        ...(graph.metadata || {}),
        epicAgentContract: normalizeGraphContractForMigration(graph.metadata?.epicAgentContract),
        graphProducerProof: proof,
        graphProducerProofBackfill: {
          schemaVersion: 1,
          appliedAt: timestamp,
          backupPath: backupRel,
          source: "workflow-receipt migrate-10of10 --apply",
        },
      },
    };
    writeFileSync(file, JSON.stringify(nextGraph, null, 2) + "\n", "utf8");
    migrated.push({ graphPath: graphRel, backupPath: backupRel, receiptId: trustedReceipt?.receiptId || null, mode: legacyMigration ? "historical-migration-proof" : "trusted-receipt" });
  }

  let reportPath = null;
  if (apply) {
    reportPath = normalizeRelPath(recoveryRoot + "/report.json");
    const reportAbs = join(rootDir, ...reportPath.split("/"));
    mkdirSync(dirname(reportAbs), { recursive: true });
    writeFileSync(reportAbs, JSON.stringify({
      schemaVersion: 1,
      operation: "graph-producer-proof-backfill",
      appliedAt: timestamp,
      checked: graphFiles.length,
      eligible: eligible.length,
      migrated: migrated.length,
      malformedRecords,
      skipped,
      migratedGraphs: migrated,
    }, null, 2) + "\n", "utf8");
  }

  return {
    schemaVersion: 1,
    apply,
    checked: graphFiles.length,
    eligible: eligible.length,
    migrated: migrated.length,
    remainingMissingProducerProof: Math.max(0, eligible.length + skipped.length - migrated.length),
    malformedRecords,
    skipped,
    migratedGraphs: migrated,
    reportPath,
    recoveryRoot: apply ? recoveryRoot : null,
  };
}

function isHistoricalLegacyGraphContract(graph = {}) {
  const contract = graph.metadata?.epicAgentContract || {};
  return contract.required === true && (!Array.isArray(contract.allowedStages) || contract.allowedStages.length === 0);
}

function normalizeGraphContractForMigration(contract = {}) {
  return {
    ...contract,
    schemaVersion: contract.schemaVersion || 1,
    required: contract.required !== false,
    stage: contract.stage || "work-item-atomization",
    outputArtifact: contract.outputArtifact || "graph.json",
    allowedStages: uniqueStrings([...(contract.allowedStages || []), contract.stage || "work-item-atomization", "review-gate", "migration-backfill"]),
    requiredSubjectTypes: uniqueStrings([...(contract.requiredSubjectTypes || []), "tool"]),
    allowedAgentIds: uniqueStrings([...(contract.allowedAgentIds || []), "workflow-receipt-migration"]),
    trust: contract.trust || "runtime-issued-host-agent-receipt",
  };
}

function inspectWorkflowReceiptDrift(rootDir, options = {}) {
  const receipts = readWorkflowReceipts(rootDir).filter((receipt) => !receipt.__invalidJson);
  const staleItems = [];
  for (const receipt of receipts) {
    const trust = validateWorkflowReceiptTrust(rootDir, receipt, { secret: options.secret || null });
    const driftIssues = trust.issues.filter(isReceiptDriftIssue);
    if (driftIssues.length === 0) continue;
    staleItems.push({
      receiptId: receipt.receiptId || "unknown",
      receiptPath: receipt.__file || "unknown",
      driftSources: driftIssues.map(extractReceiptDriftSource),
      issues: driftIssues,
      inspectCommand: `node scripts/workflow-receipt.mjs inspect --receipt ${receipt.__file || "<receipt-json>"}`,
      reissueCommand: `node scripts/workflow-receipt.mjs reissue --receipt ${receipt.__file || "<receipt-json>"}`,
      pruneCommand: "node scripts/workflow-receipt.mjs prune-stale --apply",
      rebuildCommand: "node scripts/workflow-receipt.mjs rebuild-ledger --prune-stale",
      recoveryStatusCommand: "node scripts/workflow-receipt.mjs recovery-status",
    });
  }
  return {
    checked: receipts.length,
    stale: staleItems.length,
    items: staleItems,
    mutates: false,
  };
}

function formatWorkflowReceiptDriftInspection(result = {}) {
  const lines = [
    "SUPERVIBE_WORKFLOW_RECEIPT_INSPECT",
    "APPLY: false",
    "MUTATION: none",
    `CHECKED: ${result.checked || 0}`,
    `STALE: ${result.stale || 0}`,
  ];
  for (const item of result.items || []) {
    lines.push(`STALE_RECEIPT: ${item.receiptId}`);
    lines.push(`RECEIPT_PATH: ${item.receiptPath}`);
    lines.push(`DRIFT_SOURCE: ${uniqueStrings(item.driftSources).join(",") || "unknown"}`);
    for (const issue of item.issues || []) lines.push(`DRIFT_ISSUE: ${issue}`);
    lines.push(`REPAIR_INSPECT: ${item.inspectCommand}`);
    lines.push(`REPAIR_REISSUE: ${item.reissueCommand}`);
    lines.push(`REPAIR_PRUNE_STALE: ${item.pruneCommand}`);
    lines.push(`REPAIR_REBUILD_LEDGER: ${item.rebuildCommand}`);
    lines.push(`REPAIR_RECOVERY_STATUS: ${item.recoveryStatusCommand}`);
  }
  lines.push(`NEXT_SAFE_ACTION: ${result.stale ? "inspect drift, then reissue the receipt or prune stale receipts with explicit --apply" : "no receipt drift detected"}`);
  return lines.join("\n");
}

function isReceiptDriftIssue(issue = "") {
  return /output artifact (?:missing|hash mismatch)|artifact link .*missing|artifact link .*hash mismatch/i.test(String(issue || ""));
}

function extractReceiptDriftSource(issue = "") {
  const text = String(issue || "");
  const match = /:\s*(.+)$/.exec(text);
  return (match ? match[1] : text).trim();
}

function parseInventoryLimit(value) {
  const parsed = Number(value || 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}

function parseBackfillLimit(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function summarizeReceiptGroups(receipts = []) {
  const counts = new Map();
  for (const receipt of receipts) {
    const key = [receipt.command || "unknown-command", receipt.stage || "unknown-stage"].join(" ");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => key + " count=" + count);
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function normalizeRelPath(path) {
  return String(path || "").replace(/\\/g, "/");
}

function readJsonFile(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function sanitizeSegment(value) {
  return String(value || "default").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function classifyIssuedReceiptProofScope(receipt = {}) {
  const subjectType = String(receipt.subjectType || "").toLowerCase() || "unknown";
  const hasHostInvocation = Boolean(receipt.hostInvocation?.source && receipt.hostInvocation?.invocationId);
  if (TASK_COMPLETION_PROOF_SUBJECT_TYPES.has(subjectType) && hasHostInvocation) {
    return {
      scope: "host-invoked-task-proof",
      adoptableAsTaskCompletion: true,
      message: null,
      repairHint: null,
    };
  }
  if (TASK_COMPLETION_PROOF_SUBJECT_TYPES.has(subjectType)) {
    return {
      scope: "host-invocation-missing",
      adoptableAsTaskCompletion: false,
      message: `${subjectType} receipts require hostInvocation proof before durable adoption.`,
      repairHint: durableTaskProofRepairHint(),
    };
  }
  if (subjectType === "command") {
    return {
      scope: "controller-diagnostic",
      adoptableAsTaskCompletion: false,
      message: "controller-authored command receipts are diagnostic only and cannot substitute for producer, reviewer, worker, validator, or task-completion proof.",
      repairHint: durableTaskProofRepairHint(),
    };
  }
  if (subjectType === "validator") {
    return {
      scope: "validator-evidence",
      adoptableAsTaskCompletion: false,
      message: "validator receipts record validation evidence; they do not close implementation tasks or substitute for producer/reviewer/worker proof.",
      repairHint: "cite validator receipts at the validator or release gate, and use host agent/worker/reviewer receipts for task adoption.",
    };
  }
  return {
    scope: `${subjectType}-scoped-receipt`,
    adoptableAsTaskCompletion: false,
    message: "this receipt may be valid for its own scoped gate, but task adoption accepts only host-invoked agent, worker, or reviewer receipts.",
    repairHint: null,
  };
}

function durableTaskProofRepairHint() {
  return "run the real host agent/worker/reviewer, log its host invocation, then issue a receipt with --agent/--worker/--reviewer, --host-invocation-id, --graph-id, and --task-id.";
}

function buildHostInvocation(options) {
  const invocationId = options["host-invocation-id"] || options["invocation-id"];
  const evidencePath = options["host-trace"] || options["host-invocation-evidence"];
  if (!invocationId && !evidencePath) return null;
  const host = String(options.host || "").toLowerCase();
  const hostAgentSubject = options.agent || options.worker || options.reviewer || ["agent", "worker", "reviewer"].includes(String(options["subject-type"] || "").toLowerCase());
  return {
    source: options["host-invocation-source"]
      || (evidencePath ? "host-trace-file" : null)
      || (host === "codex" || hostAgentSubject ? "codex-spawn-agent" : "agent-invocations-jsonl"),
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
