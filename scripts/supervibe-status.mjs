#!/usr/bin/env node
// Comprehensive index health report (code RAG + graph + memory + grammars + watcher).
// User-facing transparency — confirms indexes are working at any moment.

import { MemoryStore } from './lib/memory-store.mjs';
import { SQLITE_NODE_MIN_VERSION, hasNodeSqliteSupport } from './lib/node-sqlite-runtime.mjs';
import { getBrokenLanguages } from './lib/grammar-loader.mjs';
import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectFrameworkDevServers, listServers as listPreviewServers } from './lib/preview-server-manager.mjs';
import { getRegistry as getMcpRegistry } from './lib/mcp-registry.mjs';
import { defaultWorkItemDaemonPath, formatWorkItemWatchStatus, readWorkItemDaemonState } from './lib/supervibe-work-item-daemon.mjs';
import { defaultDelegatedInboxPath, formatDelegatedInbox, readDelegatedInbox } from './lib/supervibe-work-item-message-delegation.mjs';
import { buildRunDashboardModel, writeRunDashboardHtml } from './lib/supervibe-run-dashboard.mjs';
import { createIntegrationCatalog, formatIntegrationCatalog, summarizeIntegrationCatalog } from './lib/supervibe-external-integration-catalog.mjs';
import { createWorkItemIndex, detectOrphanWorkItems, detectStaleWorkItems, groupWorkItemsByStatus } from './lib/supervibe-work-item-query.mjs';
import { resolveActiveWorkItemGraph } from './lib/supervibe-work-item-registry.mjs';
import { collectIndexHealthFromStore, evaluateIndexHealthGate, formatIndexHealth, formatIndexHealthGate } from './lib/supervibe-index-health.mjs';
import { applyCodeIndexFreshnessPolicyToGate, buildCodeIndexFreshnessStatus, buildMissingCodeIndexFreshnessStatus, formatCodeIndexFreshnessStatus, isMissingCodeIndexError, openCodeIndexReadSnapshot } from './lib/code-index-health-status.mjs';
import { applyStructuredWorkItemQuery, formatStructuredWorkItemQueryResult, parseWorkItemQuery } from './lib/supervibe-work-item-query-language.mjs';
import { applySavedView, defaultSavedViewsPath, formatSavedViewResult, listSavedViews, readSavedViewStore, saveCustomView, writeSavedViewStore } from './lib/supervibe-work-item-saved-views.mjs';
import { createRecurringWorkReport, createSlaReport, renderWorkReportMarkdown, writeWorkReportMarkdown } from './lib/supervibe-work-item-sla-reports.mjs';
import { runInteractiveCli } from './lib/supervibe-interactive-cli.mjs';
import { renderTerminalOutput } from './lib/supervibe-terminal-renderer.mjs';
import { formatEvalHarnessReport } from './lib/autonomous-loop-eval-harness.mjs';
import { formatPolicyProfileSummary, loadPolicyProfile } from './lib/supervibe-policy-profile-manager.mjs';
import { formatGovernanceStatus, resolveTeamGovernance } from './lib/supervibe-team-governance.mjs';
import { formatSemanticAnchorReport, parseSemanticAnchors } from './lib/supervibe-semantic-anchor-index.mjs';
import { formatAssignmentExplanation } from './lib/supervibe-assignment-explainer.mjs';
import { buildExecutionWaves, formatWaveStatus } from './lib/supervibe-wave-controller.mjs';
import { buildGcHints, formatGcHints } from './lib/supervibe-gc-hints.mjs';
import { buildMemoryHealthReport, formatMemoryHealthReport } from './lib/supervibe-memory-health.mjs';
import { buildAgentRetrievalTelemetryReportFromProject, formatAgentRetrievalTelemetryReport } from './lib/supervibe-agent-retrieval-telemetry.mjs';
import { evaluateIntentGoldenCorpus, formatIntentGoldenEvaluation } from './lib/supervibe-trigger-router.mjs';
import { buildCapabilityRegistry, formatCapabilityRegistryReport, validateCapabilityRegistry } from './lib/supervibe-capability-registry.mjs';
import { formatHostDiagnostics, selectHostAdapter } from './lib/supervibe-host-detector.mjs';
import { buildGenesisAgentRecommendation, buildGenesisDryRunReport, discoverGenesisStackFingerprint, formatGenesisDryRunReport } from './lib/supervibe-agent-recommendation.mjs';
import { formatWatcherDiagnostics, readWatcherDiagnostics } from './lib/supervibe-index-watcher.mjs';
import { formatPrivacyPolicyDiagnostics, summarizePrivacyPolicy } from './lib/supervibe-privacy-policy.mjs';
import { auditEvidenceLedger, formatEvidenceLedgerStatus } from './lib/supervibe-evidence-ledger.mjs';
import { checkpointDiagnostics, formatCheckpointDiagnostics } from './lib/supervibe-agent-checkpoints.mjs';
import { buildOrchestratedContextPackFromProject } from './lib/supervibe-context-orchestrator.mjs';
import { buildUserOutcomeReportFromContextPack, formatUserOutcomeReport } from './lib/supervibe-user-outcome-metrics.mjs';
import { buildPerformanceSloReport, formatPerformanceSloReport } from './lib/supervibe-performance-slo.mjs';
import { buildWorkspaceIsolationReport, formatWorkspaceIsolationReport } from './lib/supervibe-workspace-isolation.mjs';
import { defaultWorktreeRegistryPath, formatWorktreeSessionStatus } from './lib/supervibe-worktree-session-manager.mjs';
import { formatIndexConfigStatus, loadIndexConfig } from './lib/supervibe-index-config.mjs';
import { resolveSupervibePluginRoot, resolveSupervibeProjectRoot } from './lib/supervibe-plugin-root.mjs';
import { CODEGRAPH_INDEX_COMMAND, MEMORY_WATCH_COMMAND, SOURCE_RAG_INDEX_COMMAND } from './lib/supervibe-command-catalog.mjs';
import { diagnoseGraphExtractor } from './lib/code-graph.mjs';
import { validateEpicCompletion } from './lib/supervibe-epic-completion-validator.mjs';
import {
  buildCodeGraphReadinessUi,
  buildUnresolvedEdgeDiagnosticsFromStore,
  formatCodeGraphReadinessUi,
  formatUnresolvedEdgeDiagnostics,
} from './lib/supervibe-codegraph-ui-map.mjs';
import { buildArtifactSnapshotStatus, formatArtifactSnapshotStatus } from './supervibe-artifact-snapshot.mjs';
import { createPlanLifecycleReport, formatPlanLifecycleReport } from './supervibe-plan-lifecycle.mjs';
import { readWorkflowReceipts, validateWorkflowReceiptTrust } from './lib/supervibe-workflow-receipt-runtime.mjs';
import { buildRuntimeWorkflowReadiness } from './lib/supervibe-workflow-readiness-runtime.mjs';
import { formatWorkflowReadinessModel } from './lib/supervibe-workflow-readiness-model.mjs';

const args = parseArgs(process.argv.slice(2));
const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROJECT_ROOT = resolveSupervibeProjectRoot({ env: process.env, cwd: process.cwd() });
const PLUGIN_ROOT = args['plugin-root'] || resolveSupervibePluginRoot({ env: process.env, cwd: SCRIPT_PLUGIN_ROOT });
const noColor = args['no-color'] || !process.stdout.isTTY;
const sqliteAvailable = hasNodeSqliteSupport();

function color(s, c) {
  if (noColor) return s;
  const codes = { red: 31, green: 32, yellow: 33, cyan: 36, dim: 90 };
  return `\x1b[${codes[c] || 0}m${s}\x1b[0m`;
}

function ageStr(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function graphEntryId(entry = {}) {
  return entry.itemId || entry.id || entry.taskId || null;
}

function entryStallState(entry = {}) {
  return entry.stall || entry.agentStall || null;
}

function isStalledEntry(entry = {}) {
  return String(entryStallState(entry)?.status || '').toLowerCase() === 'stalled';
}

function collectStalledItemsFromGraph(graph = {}) {
  const seen = new Set();
  const stalled = [];
  for (const entry of [...(graph.items || []), ...(graph.tasks || [])]) {
    const itemId = graphEntryId(entry);
    if (!itemId || seen.has(itemId) || !isStalledEntry(entry)) continue;
    seen.add(itemId);
    const stall = entryStallState(entry) || {};
    stalled.push({
      itemId,
      owner: entry.heartbeatOwner || entry.owner || entry.claimOwner || stall.owner || null,
      retryable: stall.retryable !== false,
      manualIntervention: stall.manualIntervention === true,
      recoveryAction: stall.recoveryAction || null,
      reason: stall.reason || entry.blockerReason || 'no-progress-timeout',
    });
  }
  return stalled;
}

function summarizeStalledItems(stalled = []) {
  return {
    retryable: stalled.filter((item) => item.retryable && !item.manualIntervention).length,
    manualIntervention: stalled.filter((item) => item.manualIntervention || !item.retryable).length,
  };
}

async function printActiveWorkGraphSummary() {
  const activeResolution = await resolveActiveWorkItemGraph({ rootDir: PROJECT_ROOT });
  const historicalResolution = activeResolution.status === 'none'
    ? resolveSingleUnarchivedTerminalWorkGraph(PROJECT_ROOT)
    : null;
  const resolution = historicalResolution || activeResolution;
  if (resolution.status === 'none') {
    console.log(color('Work graph: none active', 'dim'));
    console.log(color(`  NEXT_ACTION: ${resolution.nextAction}`, 'dim'));
    console.log(color('  FAST_START_COMMAND: /supervibe-loop --from-plan <plan-path> --start --fast-session', 'dim'));
    console.log(color('  RUNTIME_GATE: node scripts/supervibe-task-graph-maturity.mjs --require-active-graph', 'dim'));
    console.log(color('  UI_COMMAND: /supervibe-ui', 'dim'));
    return;
  }

  if (resolution.status === 'ambiguous') {
    console.log(color('Work graph: ambiguous active graphs', 'yellow'));
    console.log(color(`  CANDIDATES: ${resolution.candidates.length}`, 'yellow'));
    for (const candidate of resolution.candidates.slice(0, 5)) {
      console.log(color(`  - ${candidate.epicId}: ${candidate.graphPath}`, 'dim'));
    }
    console.log(color(`  NEXT_ACTION: ${resolution.nextAction}`, 'yellow'));
    return;
  }

  let graph;
  try {
    graph = JSON.parse(readFileSync(resolution.graphPath, 'utf8'));
  } catch (error) {
    console.log(color(`Work graph: unreadable active graph (${error.message})`, 'yellow'));
    console.log(color(`  PATH: ${resolution.graphPath}`, 'dim'));
    console.log(color('  NEXT_ACTION: repair or regenerate the active work-item graph', 'yellow'));
    return;
  }

  const index = createWorkItemIndex({
    graph,
    claims: graph.claims || [],
    gates: graph.gates || [],
    evidence: graph.evidence || [],
  });
  const grouped = groupWorkItemsByStatus(index);
  const stale = detectStaleWorkItems(index);
  const orphans = detectOrphanWorkItems(index, graph);
  const stalled = collectStalledItemsFromGraph(graph);
  const stalledSummary = summarizeStalledItems(stalled);
  const epicId = graph.epicId || graph.graph_id || graph.graphId || resolution.epicId || 'unknown';
  const workflowEvidenceMode = graph.metadata?.workflowEvidenceMode || 'legacy';
  const receiptPolicy = graph.metadata?.receiptPolicy || {};
  const startupReceiptsRequired = receiptPolicy.startupReceiptsRequired === true;
  const releaseProofRequiredAt = receiptPolicy.releaseProofRequiredAt || (workflowEvidenceMode === 'fast-session' ? 'release-handoff' : 'now');
  const legacyReceiptStatus = receiptPolicy.legacyReceipts?.status || 'unknown';
  const nextReady = grouped.ready[0]?.itemId || grouped.ready[0]?.id || 'none';
  const terminalCount = (grouped.done?.length || 0) + (grouped.skipped?.length || 0) + (grouped.cancelled?.length || 0);
  const total = index.length;
  const remaining = index.filter((item) => item.type !== 'epic' && item.effectiveStatus !== 'done');
  const driftCount = stale.length + orphans.length;
  let completionPass = false;
  try {
    completionPass = validateEpicCompletion(graph).pass === true;
  } catch {
    completionPass = false;
  }
  const archivedAt = graph.archivedAt || graph.archived_at || graph.metadata?.archivedAt || null;
  const archiveCandidate = !archivedAt && (completionPass || isOperationallyClosedWorkGraph(graph));
  const lifecycle = archivedAt ? 'archived' : archiveCandidate ? 'complete' : 'active';
  const nextAction = nextReady !== 'none'
    ? `claim ${nextReady} or run /supervibe-loop --claim-ready`
    : archiveCandidate
      ? 'finish here | verify the work | prepare release handoff'
      : 'validate completion or unblock remaining work';

  console.log(color('SUPERVIBE_ACTIVE_WORK_GRAPH', driftCount > 0 ? 'yellow' : 'green'));
  console.log(color(`  EPIC: ${epicId}`, 'dim'));
  console.log(color(`  PATH: ${resolution.graphPath}`, 'dim'));
  console.log(color(`  EVIDENCE_MODE: ${workflowEvidenceMode}`, workflowEvidenceMode === 'fast-session' ? 'green' : 'dim'));
  console.log(color(`  RECEIPTS_NOW: ${startupReceiptsRequired ? 'required' : 'not-required'}`, startupReceiptsRequired ? 'yellow' : 'green'));
  console.log(color(`  RELEASE_PROOF_REQUIRED_AT: ${releaseProofRequiredAt}`, releaseProofRequiredAt === 'now' ? 'yellow' : 'dim'));
  console.log(color(`  LEGACY_RECEIPTS: ${legacyReceiptStatus}`, legacyReceiptStatus === 'diagnostic-only' ? 'dim' : 'yellow'));
  console.log(color(`  TOTAL: ${total}`, 'dim'));
  console.log(color(`  READY: ${grouped.ready.length}`, grouped.ready.length > 0 ? 'green' : 'dim'));
  const inProgress = grouped.in_progress || grouped.claimed || [];
  console.log(color(`  IN_PROGRESS: ${inProgress.length}`, inProgress.length > 0 ? 'yellow' : 'dim'));
  console.log(color(`  BLOCKED: ${grouped.blocked.length}`, grouped.blocked.length > 0 ? 'yellow' : 'dim'));
  console.log(color(`  TERMINAL: ${terminalCount}`, 'dim'));
  console.log(color(`  STATE: ${lifecycle}`, archiveCandidate ? 'green' : 'dim'));
  console.log(color(`  STALE_CLAIMS: ${stale.length}`, stale.length > 0 ? 'yellow' : 'dim'));
  console.log(color(`  STALLED: ${stalled.length}`, stalled.length > 0 ? 'yellow' : 'dim'));
  console.log(color(`  RETRYABLE_STALLED: ${stalledSummary.retryable}`, stalledSummary.retryable > 0 ? 'yellow' : 'dim'));
  console.log(color(`  MANUAL_INTERVENTION: ${stalledSummary.manualIntervention}`, stalledSummary.manualIntervention > 0 ? 'red' : 'dim'));
  console.log(color(`  ORPHANS: ${orphans.length}`, orphans.length > 0 ? 'yellow' : 'dim'));
  console.log(color(`  NEXT_READY: ${nextReady}`, nextReady === 'none' ? 'dim' : 'green'));
  console.log(color(`  NEXT_ACTION: ${nextAction}`, driftCount > 0 ? 'yellow' : archiveCandidate ? 'green' : 'dim'));
  if (archiveCandidate) {
    console.log(color('  COMPLETION_HANDOFF: finish here | verify the work | prepare release handoff', 'green'));
  }
  if (stale.length > 0) {
    console.log(color(`  STALE_REPAIR_COMMAND: /supervibe-loop --recover-stale <item-id> --file ${resolution.graphPath}`, 'yellow'));
  }
  if (stalled.length > 0) {
    console.log(color(`  STALL_RECOVERY_COMMAND: /supervibe-loop --recover-stalled <item-id> --file ${resolution.graphPath}`, 'yellow'));
  }

  if (args.ready) {
    for (const item of grouped.ready) console.log(color(`  READY_ITEM: ${item.itemId || item.id} ${item.title || ''}`.trimEnd(), 'dim'));
  }
  if (args.blocked) {
    for (const item of grouped.blocked) {
      const reason = item.blockReason || item.blockerReason || item.blockerNextAction || 'blocked';
      console.log(color(`  BLOCKED_ITEM: ${item.itemId || item.id} ${reason}`, 'yellow'));
    }
  }
  if (args.remaining) {
    for (const item of remaining) {
      console.log(color(`  REMAINING_ITEM: ${item.itemId || item.id} ${item.effectiveStatus || item.status || 'open'} ${item.title || ''}`.trimEnd(), 'dim'));
    }
  }
  if (args.stale) {
    for (const item of stale) console.log(color(`  STALE_ITEM: ${item.itemId || item.id} ${item.claimOwner || item.owner || 'unknown-owner'}`, 'yellow'));
  }
  if (args.orphan) {
    for (const item of orphans) console.log(color(`  ORPHAN_ITEM: ${item.itemId || item.id} missing_parent=${item.parentId || 'none'}`, 'yellow'));
  }
}

function formatCompactIndexMaintenanceStatus(indexFreshness = {}) {
  return [
    'SUPERVIBE_CODE_INDEX_MAINTENANCE',
    `STATUS: ${indexFreshness.status || 'unknown'}`,
    `USER_BLOCKING: ${indexFreshness.status === 'failed' || indexFreshness.status === 'not-built'}`,
    `MODE_READY: ${indexFreshness.readyForMode === true}`,
    'DETAILS: run node scripts/supervibe-status.mjs --index-health',
    'NEXT_ACTION: automatic refresh at verification or release gate',
  ].join('\n');
}

function printWorktreeSessionRegistrySummary() {
  const registryPath = defaultWorktreeRegistryPath(PROJECT_ROOT);
  if (!existsSync(registryPath)) return;
  try {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const needsAttention = (registry.sessions || []).some((session) => ['stale', 'blocked', 'cleanup_blocked'].includes(session.status));
    console.log(color(formatWorktreeSessionStatus(registry), needsAttention ? 'yellow' : 'green'));
  } catch (error) {
    console.log(color(`SUPERVIBE_WORKTREE_SESSIONS\nSTATUS: unreadable\nPATH: ${registryPath}\nERROR: ${error.message}`, 'yellow'));
  }
}

function resolveSingleUnarchivedTerminalWorkGraph(rootDir) {
  const dir = join(rootDir, '.supervibe', 'memory', 'work-items');
  if (!existsSync(dir)) return null;
  const candidates = [];
  for (const name of readdirSync(dir)) {
    const graphPath = join(dir, name, 'graph.json');
    if (!existsSync(graphPath)) continue;
    try {
      const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
      const archivedAt = graph.archivedAt || graph.archived_at || graph.metadata?.archivedAt || null;
      if (archivedAt || !isOperationallyClosedWorkGraph(graph)) continue;
      candidates.push({
        status: 'active',
        graphPath,
        epicId: graph.epicId || graph.graph_id || graph.graphId || name,
      });
    } catch {
      continue;
    }
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function printPlanLifecycleSummary() {
  try {
    const report = createPlanLifecycleReport({ rootDir: PROJECT_ROOT });
    console.log(color(formatPlanLifecycleReport(report), report.staleActiveSource || report.archiveAction !== 'none' ? 'yellow' : 'green'));
  } catch (error) {
    console.log(color(`SUPERVIBE_PLAN_LIFECYCLE\nSTATUS: unreadable\nERROR: ${error.message}\nNEXT_ACTION: run node scripts/supervibe-plan-lifecycle.mjs --status`, 'yellow'));
  }
}

function printWorkflowReceiptRecoverySummary() {
  try {
    const receipts = readWorkflowReceipts(PROJECT_ROOT).filter((receipt) => !receipt.__invalidJson);
    const stale = [];
    for (const receipt of receipts) {
      const trust = validateWorkflowReceiptTrust(PROJECT_ROOT, receipt);
      const issues = trust.issues.filter(isReceiptDriftIssue);
      if (issues.length === 0) continue;
      stale.push({
        receiptId: receipt.receiptId || 'unknown',
        receiptPath: receipt.__file || 'unknown',
        driftSources: uniqueStrings(issues.map(extractReceiptDriftSource)),
        issues,
      });
    }
    const lines = [
      'SUPERVIBE_WORKFLOW_RECEIPT_RECOVERY',
      `  CHECKED: ${receipts.length}`,
      `  STALE: ${stale.length}`,
    ];
    for (const item of stale.slice(0, 5)) {
      lines.push(`  STALE_RECEIPT: ${item.receiptId}`);
      lines.push(`  RECEIPT_PATH: ${item.receiptPath}`);
      lines.push(`  DRIFT_SOURCE: ${item.driftSources.join(',') || 'unknown'}`);
      lines.push(`  REPAIR_COMMAND: node scripts/workflow-receipt.mjs reissue --receipt ${item.receiptPath}`);
      lines.push('  PRUNE_COMMAND: node scripts/workflow-receipt.mjs prune-stale --apply');
    }
    lines.push(`  NEXT_SAFE_ACTION: ${stale.length ? 'inspect with node scripts/workflow-receipt.mjs inspect; mutate only with explicit reissue/prune-stale --apply/rebuild-ledger' : 'receipt drift clean'}`);
    console.log(color(lines.join('\n'), stale.length ? 'yellow' : 'green'));
  } catch (error) {
    console.log(color(`SUPERVIBE_WORKFLOW_RECEIPT_RECOVERY\n  STATUS: unreadable\n  ERROR: ${error.message}\n  NEXT_SAFE_ACTION: run node scripts/workflow-receipt.mjs recovery-status`, 'yellow'));
  }
}

function isReceiptDriftIssue(issue = '') {
  return /output artifact (?:missing|hash mismatch)|artifact link .*missing|artifact link .*hash mismatch/i.test(String(issue || ''));
}

function extractReceiptDriftSource(issue = '') {
  const text = String(issue || '');
  const match = /:\s*(.+)$/.exec(text);
  return (match ? match[1] : text).trim();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function isOperationallyClosedWorkGraph(graph = {}) {
  const items = Array.isArray(graph.items) ? graph.items : [];
  const required = items.filter((item) => item.type !== 'epic' && item.type !== 'followup');
  if (required.length === 0) return false;
  return required.every((item) => isTerminalWorkStatus(item.status));
}

function isTerminalWorkStatus(status) {
  return ['done', 'complete', 'completed', 'closed', 'skipped', 'skip', 'cancelled', 'canceled'].includes(String(status || '').trim().toLowerCase());
}

function formatInlineCounts(counts = {}) {
  const entries = Object.entries(counts || {});
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(', ') : 'none';
}

function formatInlineSubsystemCoverage(coverage = {}) {
  const entries = Object.entries(coverage || {});
  return entries.length ? entries.map(([key, value]) => `${key}=${value.entries || 0}`).join(', ') : 'none';
}
function printMissingCodeIndexStatus(codeDbPath) {
  const freshness = buildMissingCodeIndexFreshnessStatus({ dbPath: codeDbPath });
  console.log(color(`x Code RAG: not-built (missing ${codeDbPath})`, 'red'));
  console.log(color(`  Repair command: ${freshness.repairCommand}`, 'dim'));
  console.log(color('x Code Graph: not-built (shares missing Code RAG database)', 'red'));
  console.log(color(`  Graph repair command: ${freshness.graphRepairCommand}`, 'dim'));
  console.log(color('  Language coverage: not-built', 'dim'));
  console.log();
  console.log(color(formatCodeIndexFreshnessStatus(freshness), 'yellow'));
}

async function main() {
  if (args.help || args.h) {
    console.log([
      'SUPERVIBE_STATUS_HELP',
      'USAGE:',
      '  node scripts/supervibe-status.mjs --one-screen [--file <graph.json>] [--strict]',
      '  node scripts/supervibe-status.mjs --next-only --file <graph.json> [--strict]',
      '  node scripts/supervibe-status.mjs --blocked-only --file <graph.json>',
      '  node scripts/supervibe-status.mjs --index-health',
      '  node scripts/supervibe-status.mjs --receipt-recovery',
      '  node scripts/supervibe-status.mjs --watcher-diagnostics',
      '  node scripts/supervibe-status.mjs --workflow-readiness --command <command>',
      '',
      'Default mode skips deep Code RAG/CodeGraph and receipt recovery diagnostics; use --index-health or --receipt-recovery for details.'
    ].join('\n'));
    return;
  }
  if (args.interactive) {
    const result = runInteractiveCli({
      mode: 'status',
      graphPath: args.file || '.supervibe/memory/work-items/<epic-id>/graph.json',
      isTTY: process.stdin.isTTY && process.stdout.isTTY,
    });
    console.log(result.output);
    if (!result.ok) process.exitCode = result.exitCode;
    return;
  }

  if (args['one-screen'] || args['next-only'] || args['blocked-only']) {
    const conciseGraphPath = args.file || (args.epic ? join(PROJECT_ROOT, '.supervibe', 'memory', 'work-items', args.epic, 'graph.json') : null);
    const concise = await buildConciseStatusModel({
      rootDir: PROJECT_ROOT,
      mode: args['blocked-only'] ? 'blocked-only' : args['one-screen'] ? 'one-screen' : 'next-only',
      graphPath: conciseGraphPath,
    });
    if (args.json) console.log(renderTerminalOutput({ data: concise, json: true }, { json: true }));
    else console.log(formatConciseStatusModel(concise));
    if (args.strict && concise.pass !== true) process.exitCode = 2;
    return;
  }

  if (args['intent-diagnostics']) {
    const fixturePath = args.file || join(PLUGIN_ROOT, 'tests', 'fixtures', 'intent-router', 'golden-corpus.json');
    const corpus = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const evaluation = evaluateIntentGoldenCorpus(corpus);
    if (args.json) console.log(renderTerminalOutput({ data: evaluation, json: true }, { json: true }));
    else console.log(formatIntentGoldenEvaluation(evaluation));
    if (!evaluation.pass) process.exitCode = 2;
    return;
  }

  if (args.capabilities) {
    const registry = buildCapabilityRegistry({
      rootDir: PLUGIN_ROOT,
      pluginRoot: PLUGIN_ROOT,
      projectRoot: PROJECT_ROOT,
      adapterId: args.host,
      env: process.env,
    });
    const validation = validateCapabilityRegistry(registry);
    if (args.json) console.log(renderTerminalOutput({ data: { registry, validation }, json: true }, { json: true }));
    else console.log(formatCapabilityRegistryReport(registry, validation));
    if (!validation.pass) process.exitCode = 2;
    return;
  }

  if (args['host-diagnostics']) {
    const diagnostics = selectHostAdapter({
      rootDir: PROJECT_ROOT,
      env: process.env,
    });
    if (args.json) console.log(renderTerminalOutput({ data: diagnostics, json: true }, { json: true }));
    else console.log(formatHostDiagnostics(diagnostics));
    return;
  }

  if (args['genesis-dry-run']) {
    const targetRoot = args['genesis-dry-run'];
    const report = buildGenesisDryRunReport({
      targetRoot,
      pluginRoot: PLUGIN_ROOT,
      env: process.env,
      selectedProfile: args.profile || 'minimal',
      addOns: args.addons ? String(args.addons).split(',').filter(Boolean) : [],
      explicitStackTags: args['stack-tags'] ? String(args['stack-tags']).split(/[,\s]+/).filter(Boolean) : [],
      stackText: args.request || '',
    });
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatGenesisDryRunReport(report));
    return;
  }

  if (args['stack-pack-diagnostics']) {
    const targetRoot = args.target || PROJECT_ROOT;
    const packPath = join(PLUGIN_ROOT, 'stack-packs', 'tauri-react-rust-postgres', 'pack.yaml');
    const fingerprint = discoverGenesisStackFingerprint({ rootDir: targetRoot });
    const recommendation = buildGenesisAgentRecommendation({
      rootDir: PLUGIN_ROOT,
      fingerprint,
      selectedProfile: args.profile || 'minimal',
      addOns: [],
    });
    const missing = recommendation.missingSpecialists.map((entry) => entry.agentId);
    const output = [
      'SUPERVIBE_STACK_PACK_DIAGNOSTICS',
      `PACK: tauri-react-rust-postgres`,
      `PACK_FILE: ${existsSync(packPath) ? 'present' : 'missing'}`,
      `TARGET: ${targetRoot}`,
      `STACK: ${fingerprint.tags.join(', ') || 'unknown'}`,
      `SELECTED_AGENTS: ${recommendation.selectedAgents.join(', ') || 'none'}`,
      `MISSING_SPECIALISTS: ${missing.join(', ') || 'none'}`,
    ].join('\n');
    if (args.json) console.log(renderTerminalOutput({ data: { packPath, packExists: existsSync(packPath), fingerprint, recommendation }, json: true }, { json: true }));
    else console.log(output);
    if (!existsSync(packPath) || missing.length > 0) process.exitCode = 2;
    return;
  }

  if (args['watcher-diagnostics']) {
    const diagnostics = readWatcherDiagnostics({ rootDir: PROJECT_ROOT });
    if (args.json) console.log(renderTerminalOutput({ data: diagnostics, json: true }, { json: true }));
    else console.log(formatWatcherDiagnostics(diagnostics));
    return;
  }

  if (args['index-policy-diagnostics']) {
    const summary = summarizePrivacyPolicy(['.env', '.env.local', 'backup.rar', 'assets/logo.png', 'config/local.json', 'dist/app.js', 'src/main.ts']);
    if (args.json) console.log(renderTerminalOutput({ data: summary, json: true }, { json: true }));
    else console.log(formatPrivacyPolicyDiagnostics(summary));
    return;
  }

  if (args['evidence-ledger']) {
    const report = await auditEvidenceLedger({ rootDir: PROJECT_ROOT });
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatEvidenceLedgerStatus(report));
    if (!report.pass) process.exitCode = 2;
    return;
  }

  if (args['checkpoint-diagnostics']) {
    const report = await checkpointDiagnostics({ rootDir: PROJECT_ROOT });
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatCheckpointDiagnostics(report));
    if (!report.pass) process.exitCode = 2;
    return;
  }

  if (args['user-outcomes']) {
    const pack = await buildOrchestratedContextPackFromProject({ rootDir: PROJECT_ROOT, query: args.query || "status user outcome metrics" });
    const report = buildUserOutcomeReportFromContextPack(pack);
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatUserOutcomeReport(report));
    if (!report.pass) process.exitCode = 2;
    return;
  }

  if (args['performance-slo'] && args['workspace-isolation']) {
    const performanceSlo = buildPerformanceSloReport({ rootDir: PROJECT_ROOT });
    const workspaceIsolation = buildWorkspaceIsolationReport({ rootDir: PROJECT_ROOT });
    if (args.json) {
      console.log(renderTerminalOutput({ data: { performanceSlo, workspaceIsolation }, json: true }, { json: true }));
    } else {
      console.log([formatPerformanceSloReport(performanceSlo), formatWorkspaceIsolationReport(workspaceIsolation)].join("\n\n"));
    }
    if (!performanceSlo.pass || !workspaceIsolation.pass) process.exitCode = 2;
    return;
  }

  if (args['performance-slo']) {
    const report = buildPerformanceSloReport({ rootDir: PROJECT_ROOT });
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatPerformanceSloReport(report));
    if (!report.pass) process.exitCode = 2;
    return;
  }

  if (args['workspace-isolation']) {
    const report = buildWorkspaceIsolationReport({ rootDir: PROJECT_ROOT });
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatWorkspaceIsolationReport(report));
    if (!report.pass) process.exitCode = 2;
    return;
  }

  if (args['eval-report']) {
    const reportPath = args.file || join(PROJECT_ROOT, '.supervibe', 'audits', 'autonomous-loop-evals', 'latest-report.json');
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatEvalHarnessReport(report));
    return;
  }

  if (args.policy) {
    const profile = await loadPolicyProfile({
      rootDir: PROJECT_ROOT,
      profileName: args['policy-profile'] || process.env.SUPERVIBE_POLICY_PROFILE || 'guided',
    });
    if (args.json) console.log(renderTerminalOutput({ data: profile, json: true }, { json: true }));
    else console.log(formatPolicyProfileSummary(profile));
    return;
  }

  if (args.role) {
    const governance = resolveTeamGovernance({
      role: args['team-role'] || process.env.SUPERVIBE_ROLE || 'maintainer',
      branch: args.branch || '',
    });
    if (args.json) console.log(renderTerminalOutput({ data: governance, json: true }, { json: true }));
    else console.log(formatGovernanceStatus(governance));
    return;
  }

  if (args.anchors) {
    if (!args.file) throw new Error('--anchors requires --file <source-file>');
    const anchors = parseSemanticAnchors(readFileSync(args.file, 'utf8'), { filePath: args.file });
    if (args.json) console.log(renderTerminalOutput({ data: { anchors }, json: true }, { json: true }));
    else console.log(formatSemanticAnchorReport({ anchors }));
    return;
  }

  if (args.waves) {
    if (!args.file) throw new Error('--waves requires --file <state.json>');
    const state = JSON.parse(readFileSync(args.file, 'utf8'));
    const plan = buildExecutionWaves({
      tasks: state.tasks || [],
      worktreeSessions: state.worktree_sessions || state.worktreeSessions || [],
      reviewers: ['quality-gate-reviewer'],
    });
    if (args.json) console.log(renderTerminalOutput({ data: plan, json: true }, { json: true }));
    else console.log(formatWaveStatus(plan));
    return;
  }

  if (args['gc-hints']) {
    const hints = await buildGcHints({ rootDir: PROJECT_ROOT, now: args.now || new Date().toISOString() });
    if (args.json) console.log(renderTerminalOutput({ data: hints, json: true }, { json: true }));
    else console.log(formatGcHints(hints));
    return;
  }

  if (args['memory-health']) {
    const report = await buildMemoryHealthReport({ rootDir: PROJECT_ROOT, now: args.now || new Date().toISOString() });
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatMemoryHealthReport(report));
    if (args.strict && !report.pass) process.exitCode = 2;
    return;
  }

  if (args['agent-retrieval-health']) {
    const report = await buildAgentRetrievalTelemetryReportFromProject({ rootDir: PROJECT_ROOT });
    if (args.json) console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
    else console.log(formatAgentRetrievalTelemetryReport(report));
    if (args.strict && !report.pass) process.exitCode = 2;
    return;
  }

  if (args.assignment) {
    if (!args.file) throw new Error('--assignment requires --file <state.json>');
    const state = JSON.parse(readFileSync(args.file, 'utf8'));
    const dispatch = (state.dispatches || []).find((item) => item.taskId === args.assignment);
    const explanation = dispatch?.assignmentExplanation || { taskId: args.assignment, whyWorker: 'assignment explanation not found' };
    if (args.json) console.log(renderTerminalOutput({ data: explanation, json: true }, { json: true }));
    else console.log(formatAssignmentExplanation(explanation));
    return;
  }

  if (args.dashboard) {
    const statePath = args.file;
    if (!statePath) throw new Error('--dashboard requires --file <state.json>');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const outPath = args.out || statePath.replace(/state\.json$/, 'dashboard.html');
    const graph = normalizeGraph(state.task_graph || state.taskGraph || state);
    const workItemIndex = createWorkItemIndex({ graph, now: args.now || new Date().toISOString() });
    const views = listSavedViews(await readSavedViewStore(args['views-file'] || defaultSavedViewsPath(PROJECT_ROOT)));
    const model = buildRunDashboardModel({
      state,
      delegatedMessages: await readDelegatedInbox(defaultDelegatedInboxPath(PROJECT_ROOT)),
      savedViews: views,
      workItemIndex,
      generatedAt: 'deterministic-local',
    });
    const result = await writeRunDashboardHtml(outPath, model);
    console.log(`SUPERVIBE_DASHBOARD\nFILE: ${result.outPath}\nBYTES: ${result.bytes}`);
    return;
  }

  if (args.integrations) {
    const mcpReg = await getMcpRegistry({ refresh: false, includeRuntimePalette: true });
    const catalog = createIntegrationCatalog({
      availableCommands: detectAvailableCommands(['git', 'gh', 'jira', 'linear', 'notion']),
      mcpRegistry: mcpReg,
      env: process.env,
      policy: { blockNetwork: args['block-network'] },
    });
    if (args.json) console.log(JSON.stringify({ catalog, summary: summarizeIntegrationCatalog(catalog) }, null, 2));
    else console.log(formatIntegrationCatalog(catalog));
    return;
  }

  if (args['save-view']) {
    if (!args.query) throw new Error('--save-view requires --query "<filters>"');
    const viewsPath = args['views-file'] || defaultSavedViewsPath(PROJECT_ROOT);
    const store = await readSavedViewStore(viewsPath);
    const next = saveCustomView(store, {
      name: args['save-view'],
      query: args.query,
      displayColumns: args.columns ? String(args.columns).split(',') : undefined,
      owner: args.owner || null,
      scope: args.scope || 'local',
    });
    await writeSavedViewStore(viewsPath, next);
    console.log('SUPERVIBE_SAVED_VIEW');
    console.log(`VIEW: ${args['save-view']}`);
    console.log(`QUERY: ${args.query}`);
    console.log(`FILE: ${viewsPath}`);
    return;
  }

  if (args.view || args.query) {
    const graph = loadGraphForStatusArgs(args);
    const index = createWorkItemIndex({ graph, now: args.now || new Date().toISOString() });
    if (args.view) {
      const store = await readSavedViewStore(args['views-file'] || defaultSavedViewsPath(PROJECT_ROOT));
      const result = applySavedView(index, args.view, store, {
        now: args.now || new Date().toISOString(),
        graph,
        currentOwner: args.owner || 'me',
      });
      if (args.json) console.log(renderTerminalOutput({ data: result, json: true }, { json: true }));
      else console.log(formatSavedViewResult(result));
    } else {
      const result = applyStructuredWorkItemQuery(index, parseWorkItemQuery(args.query), {
        now: args.now || new Date().toISOString(),
        graph,
        currentOwner: args.owner || 'me',
      });
      if (args.json) console.log(renderTerminalOutput({ data: result, json: true }, { json: true }));
      else console.log(formatStructuredWorkItemQueryResult(result));
    }
    return;
  }

  if (args.report) {
    const graph = loadGraphForStatusArgs(args);
    const index = createWorkItemIndex({ graph, now: args.now || new Date().toISOString() });
    const report = args.report === 'sla'
      ? createSlaReport(index, { now: args.now || new Date().toISOString(), slaHours: args['sla-hours'] || 48 })
      : createRecurringWorkReport(index, { type: args.report, now: args.now || new Date().toISOString(), releaseGates: graph.releaseGates || graph.release_gates || [] });
    if (args.json) {
      console.log(renderTerminalOutput({ data: report, json: true }, { json: true }));
      return;
    }
    if (args.out) {
      const result = await writeWorkReportMarkdown(args.out, report);
      console.log('SUPERVIBE_WORK_REPORT');
      console.log(`TYPE: ${report.type}`);
      console.log(`FILE: ${result.outPath}`);
      console.log(`BYTES: ${result.bytes}`);
    } else {
      console.log(renderWorkReportMarkdown(report));
    }
    return;
  }

  const wantsIndexHealthDetails = Boolean(args['index-health'] || args['strict-index-health']);
  const wantsStatusDetails = Boolean(args.details);
  console.log(color(wantsIndexHealthDetails ? 'Supervibe Index Status' : 'Supervibe Status', 'cyan'));
  console.log(color('===================', 'dim'));
  console.log(`Project root: ${PROJECT_ROOT}\n`);

  if (wantsIndexHealthDetails) {
  // Code RAG + Graph
  const codeDbPath = join(PROJECT_ROOT, '.supervibe', 'memory', 'code.db');
  if (!existsSync(codeDbPath)) {
    printMissingCodeIndexStatus(codeDbPath);
  } else if (!sqliteAvailable) {
    console.log(color(`! Code RAG + Graph: requires Node.js ${SQLITE_NODE_MIN_VERSION}+ for node:sqlite`, 'yellow'));
    console.log(color(`  Current runtime: ${process.version}. Upgrade Node to read ${codeDbPath}`, 'dim'));
    console.log(color('  Language coverage: unavailable until Code RAG can be read', 'dim'));
  } else {
    let readSnapshot = null;
    try {
      readSnapshot = await openCodeIndexReadSnapshot({
        rootDir: PROJECT_ROOT,
        useEmbeddings: false,
        purpose: 'status',
      });
    } catch (error) {
      if (!isMissingCodeIndexError(error)) throw error;
      printMissingCodeIndexStatus(codeDbPath);
    }
    if (readSnapshot) {
      const store = readSnapshot.store;
      const s = store.stats();
      const health = store.getGrammarHealth();
      const indexHealth = await collectIndexHealthFromStore(store, { rootDir: PROJECT_ROOT });
      const rawIndexGate = evaluateIndexHealthGate(indexHealth, { strictGraph: args['strict-index-health'] });
      const indexFreshness = buildCodeIndexFreshnessStatus({
        health: indexHealth,
        gate: rawIndexGate,
        strict: Boolean(args['strict-index-health']),
        repairAvailable: true,
        snapshot: readSnapshot.snapshot,
      });
      const indexGate = applyCodeIndexFreshnessPolicyToGate(rawIndexGate, indexFreshness);
      const unresolvedDiagnostics = buildUnresolvedEdgeDiagnosticsFromStore(store);
      const watcherDiagnostics = readWatcherDiagnostics({ rootDir: PROJECT_ROOT });
      const graphReadinessUi = buildCodeGraphReadinessUi({
        indexGate,
        unresolvedDiagnostics,
        watcherDiagnostics,
        graphStats: s,
      });
      const graphBuildState = store.db.prepare(`
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN graph_version > 0 THEN 1 ELSE 0 END) AS current
        FROM code_files
      `).get();
      store.close();

      const dbAge = Date.now() - statSync(codeDbPath).mtimeMs;
      const sourceCoveragePct = (Number(indexHealth.sourceCoverage || 0) * 100).toFixed(1);
      const coverageSummary = `${indexHealth.indexedSourceFiles}/${indexHealth.eligibleSourceFiles} source files indexed, ${sourceCoveragePct}% coverage`;
      const readyEmpty = Number(indexHealth.eligibleSourceFiles || 0) === 0;
      const codeRagReady = readyEmpty || (indexFreshness.readyForMode && s.totalChunks > 0);
      const codeRagHealthy = codeRagReady && indexFreshness.status === 'ready';
      const codeRagStatusLabel = readyEmpty
        ? 'READY_EMPTY - '
        : indexFreshness.status === 'ready'
          ? ''
          : `${String(indexFreshness.status || 'unknown').toUpperCase()} - `;
      const graphNotBuilt = Number(graphBuildState.total || 0) > 0
        && Number(graphBuildState.current || 0) === 0
        && s.totalSymbols === 0;
      const graphWarnings = new Set((indexGate.warnings || []).map((item) => item.code));
      const graphTone = graphNotBuilt || graphWarnings.has('cross-resolution') || graphWarnings.has('symbol-coverage') ? 'yellow' : 'green';
      const graphPrefix = graphTone === 'yellow' ? '!' : '✓';
      console.log(color(`${codeRagHealthy ? '\u2713' : '!'} Code RAG: ${codeRagStatusLabel}${s.totalFiles} files, ${s.totalChunks} chunks`, codeRagHealthy ? 'green' : 'yellow'));
      console.log(color(`  Source coverage: ${coverageSummary}`, codeRagHealthy ? 'dim' : 'yellow'));
      console.log(color(`  Read snapshot: ${readSnapshot.snapshot.mode}, age ${ageStr(readSnapshot.snapshot.dbAgeMs || 0)}, retries ${readSnapshot.snapshot.retryCount || 0}`, 'dim'));
      const embeddingHealth = indexHealth.embeddingHealth || {};
      const chunkEntityHealth = indexHealth.chunkEntityHealth || {};
      const semanticAnchorHealth = indexHealth.semanticAnchorHealth || {};
      const retrievalLaneSummary = (indexHealth.retrievalLanes || [])
        .slice(0, 4)
        .map((lane) => `${lane.fileRole}/${lane.language}:${lane.chunks}`)
        .join(' ') || 'none';
      console.log(color(`  Semantic embeddings: ${embeddingHealth.status || 'unknown'} (${embeddingHealth.embeddedChunks || 0}/${embeddingHealth.totalChunks || 0} chunks)`, embeddingHealth.semanticActive ? 'dim' : 'yellow'));
      console.log(color(`  Chunk entities: ${chunkEntityHealth.status || 'unknown'} (${chunkEntityHealth.linkedChunks || 0}/${chunkEntityHealth.totalChunks || 0} chunks, entities=${chunkEntityHealth.totalEntities || 0})`, chunkEntityHealth.rebuildRequired ? 'yellow' : 'dim'));
      console.log(color(`  Semantic anchors: ${semanticAnchorHealth.status || 'unknown'} (${semanticAnchorHealth.totalAnchors || 0} total, derived=${semanticAnchorHealth.derivedAnchors || 0})`, semanticAnchorHealth.totalAnchors > 0 ? 'dim' : 'yellow'));
      console.log(color(`  Retrieval lanes: ${retrievalLaneSummary}`, 'dim'));
      console.log(color(`${graphPrefix} Code Graph: ${graphNotBuilt ? 'not built in current source-readiness index' : `${s.totalSymbols} symbols, ${s.totalEdges} edges (${(s.edgeResolutionRate * 100).toFixed(0)}% cross-resolved)`}`, graphTone));
      const eligibleEdges = indexHealth.eligibleProjectEdges || {};
      console.log(color(`  Eligible project edges: ${eligibleEdges.resolved || 0}/${eligibleEdges.deterministic || 0} deterministic resolved (${((Number(eligibleEdges.rate || 0)) * 100).toFixed(0)}%); ignored=${eligibleEdges.ignored || 0}, ambiguous=${eligibleEdges.ambiguous || 0}`, 'dim'));
      const codeGraphReleaseBlocking = Boolean(graphNotBuilt || graphWarnings.has('cross-resolution') || graphWarnings.has('symbol-coverage') || !indexFreshness.strictReady);
      console.log(color(`  DEV_START_BLOCKING: false`, 'dim'));
      console.log(color(`  RELEASE_BLOCKING: ${codeGraphReleaseBlocking}`, codeGraphReleaseBlocking ? 'yellow' : 'dim'));
      console.log(color(`  RELEASE_REPAIR_COMMAND: ${codeGraphReleaseBlocking ? CODEGRAPH_INDEX_COMMAND : 'none'}`, codeGraphReleaseBlocking ? 'yellow' : 'dim'));
      if (graphNotBuilt) {
        console.log(color(`  Graph note: run \`${CODEGRAPH_INDEX_COMMAND}\` when graph data is needed.`, 'yellow'));
      }
      if (graphWarnings.has('cross-resolution')) {
        console.log(color('  Graph warning: cross-file edge resolution is low; source RAG can still be ready.', 'yellow'));
      }
      console.log(color(`  Last update: ${ageStr(dbAge)}`, 'dim'));
      if (s.byLang.length > 0) {
        const langs = s.byLang.slice(0, 5).map(l => `${l.language}(${l.n})`).join(' ');
        console.log(color(`  Languages: ${langs}`, 'dim'));
      }

      // Grammar health
      const broken = graphNotBuilt ? [] : health.filter(h => !h.healthy);
      if (graphNotBuilt) {
        console.log(color('  Language coverage: graph not built in current source-readiness index', 'dim'));
      } else if (broken.length > 0) {
        console.log(color(`! Graph extraction degraded for: ${broken.map(b => b.language).join(', ')}`, 'yellow'));
        for (const item of broken) {
          const diagnostic = await diagnoseGraphExtractor(item.language);
          const detail = item.reason || 'unknown symbol coverage issue';
          console.log(color(`  Graph detail: ${item.language}: ${detail}; extractor=${diagnostic.reasonCode} (${diagnostic.reason})`, 'yellow'));
        }
        console.log(color('  Files indexed; source RAG remains available. Check grammars/queries/<lang>.scm for graph repair.', 'dim'));
      } else if (health.length > 0) {
        console.log(color(`✓ All ${health.length} active language(s) extracting symbols`, 'green'));
      }
      if (!graphNotBuilt) {
        console.log(color(`  Language coverage: ${health.length - broken.length}/${Math.max(health.length, s.byLang.length)} active language(s), ${broken.length} broken`, broken.length > 0 ? 'yellow' : 'dim'));
      }
      const lowCoverageLanguages = new Set(
        [...(indexGate.failedGates || []), ...(indexGate.warnings || [])]
          .filter((item) => item.code === 'symbol-coverage' && item.language)
          .map((item) => item.language),
      );
      const lowCoverage = health.filter((h) => lowCoverageLanguages.has(h.language));
      for (const lc of lowCoverage) {
        console.log(color(`  Graph note: ${lc.language} symbols found in ${(lc.coverage * 100).toFixed(0)}% of indexed files; source RAG remains available for indexed files.`, 'yellow'));
      }

      // Grammar runtime status (missing/truncated WASM)
      const brokenState = getBrokenLanguages();
      if (brokenState.pointers.length > 0) {
        console.log(color(`⚠  Grammars are missing or truncated: ${brokenState.pointers.join(', ')}`, 'yellow'));
        console.log(color(`   Affected languages will skip graph extraction (semantic RAG still works)`, 'dim'));
      }
      if (args['index-health'] || args['strict-index-health']) {
        console.log();
        console.log(color(formatIndexHealthGate(indexGate), indexGate.ready ? 'green' : 'yellow'));
        console.log();
        console.log(color(formatCodeIndexFreshnessStatus(indexFreshness), indexFreshness.status === 'ready' ? 'green' : 'yellow'));
        console.log();
        console.log(color(formatCodeGraphReadinessUi(graphReadinessUi), graphReadinessUi.ready ? 'green' : 'yellow'));
        console.log();
        console.log(color(formatUnresolvedEdgeDiagnostics(unresolvedDiagnostics), unresolvedDiagnostics.total > 0 ? 'yellow' : 'green'));
        if (args['index-health']) {
          console.log();
          console.log(color(formatIndexHealth(indexHealth), indexHealth.ok ? 'green' : 'yellow'));
        }
        if (args['strict-index-health'] && !indexFreshness.strictReady) {
          process.exitCode = 2;
        }
      }
    }
  }
  }

  console.log();

  // Memory
  const memDbPath = join(PROJECT_ROOT, '.supervibe', 'memory', 'memory.db');
  if (!existsSync(memDbPath)) {
    console.log(color('○ Memory: not yet built (no entries indexed)', 'yellow'));
  } else if (!sqliteAvailable) {
    console.log(color(`! Memory: requires Node.js ${SQLITE_NODE_MIN_VERSION}+ for node:sqlite`, 'yellow'));
    console.log(color(`  Current runtime: ${process.version}. Upgrade Node to read ${memDbPath}`, 'dim'));
  } else {
    const mem = new MemoryStore(PROJECT_ROOT, { useEmbeddings: false });
    await mem.init();
    const ms = mem.stats();
    mem.close();
    const memAge = Date.now() - statSync(memDbPath).mtimeMs;
    console.log(color(`✓ Memory: ${ms.totalEntries} entries, ${ms.uniqueTags} tags`, 'green'));
    console.log(color(`  Last update: ${ageStr(memAge)}`, 'dim'));
    if (wantsStatusDetails) {
      const memoryHealth = await buildMemoryHealthReport({ rootDir: PROJECT_ROOT, now: args.now || new Date().toISOString() });
      const quality = memoryHealth.qualityGate || {};
      const qualityColor = quality.pass ? 'green' : 'yellow';
      console.log(color(`  Quality gate: ${quality.status || 'unknown'} (${memoryHealth.maturityScore}/10)`, qualityColor));
      console.log(color(`  Freshness: ${formatInlineCounts(quality.freshness)}`, qualityColor));
      console.log(color(`  Subsystem coverage: ${formatInlineSubsystemCoverage(quality.subsystemCoverage)}`, qualityColor));
      console.log(color(`  Missing subsystems: ${(quality.missingSubsystems || []).join(', ') || 'none'}`, qualityColor));
      console.log(color(`  Backfill candidates: ${quality.backfillCandidateCount ?? 'unknown'}`, qualityColor));
      console.log(color(`  Repair: ${quality.repairCommand || 'none'}`, 'dim'));
    } else {
      console.log(color('  Health details hidden (run `node scripts/supervibe-status.mjs --details` or `--memory-health`)', 'dim'));
    }
  }

  console.log();

  // Index config
  if (wantsStatusDetails || args['index-health'] || args['watcher-diagnostics']) {
  const indexConfig = loadIndexConfig({ rootDir: PROJECT_ROOT });
  console.log(color(formatIndexConfigStatus(indexConfig), 'dim'));
  console.log();

  // Watcher status (heartbeat-based)
  const watcherDiagnostics = readWatcherDiagnostics({ rootDir: PROJECT_ROOT });
  const heartbeat = watcherDiagnostics.heartbeat || {};
  if (heartbeat.status === 'running') {
    console.log(color(`✓ File watcher: running (heartbeat ${ageStr(heartbeat.ageMs || 0)})`, 'green'));
  } else if (heartbeat.status === 'stale') {
    console.log(color(`⚠  File watcher: stale heartbeat (${ageStr(heartbeat.ageMs || 0)}); freshness-sensitive readiness is blocked until restart or rebuild`, 'yellow'));
    console.log(color(`   Run \`${MEMORY_WATCH_COMMAND}\` to restart`, 'dim'));
    console.log(color(`   Rebuild stale indexes with \`${SOURCE_RAG_INDEX_COMMAND}\``, 'dim'));
  } else if (heartbeat.status === 'corrupt') {
    console.log(color(`! File watcher: corrupt heartbeat (${heartbeat.error || 'unknown error'}); restart watcher or rebuild indexes`, 'yellow'));
    console.log(color(`   Run \`${MEMORY_WATCH_COMMAND}\` to restart`, 'dim'));
  } else {
    console.log(color(`○ File watcher: not running. Run \`${MEMORY_WATCH_COMMAND}\` for auto-reindex`, 'dim'));
    console.log(color(`   Manual rebuild: \`${SOURCE_RAG_INDEX_COMMAND}\``, 'dim'));
  }

  } else {
    console.log(color('Index maintenance: details hidden (run `node scripts/supervibe-status.mjs --index-health` or `--details`)', 'dim'));
  }

  // Preview servers
  const previews = await listPreviewServers();
  const detectedDevServers = (await detectFrameworkDevServers({ rootDir: PROJECT_ROOT }))
    .filter((server) => !previews.some((preview) => Number(preview.port) === Number(server.port)));
  const visibleServers = [...previews, ...detectedDevServers];
  previews.push(...detectedDevServers.map((server) => ({
    ...server,
    pid: "unmanaged",
    startedAt: new Date().toISOString(),
    label: `${server.label} (detected framework dev server; unmanaged)`,
  })));
  console.log();
  if (visibleServers.length === 0) {
    console.log(color('○ Preview servers: none running', 'dim'));
  } else {
    const driftedPreviews = previews.filter((preview) => preview.driftStatus && preview.driftStatus !== 'ok');
    console.log(color(`${driftedPreviews.length ? '!' : '✓'} Preview servers: ${previews.length} running${driftedPreviews.length ? `; registry drift=${driftedPreviews.length}` : ''}`, driftedPreviews.length ? 'yellow' : 'green'));
    for (const p of previews) {
      const url = `http://localhost:${p.port}`;
      const ago = ((Date.now() - new Date(p.startedAt).getTime()) / 1000 / 60).toFixed(1);
      const feedbackNote = p.managed === false && p.feedbackOverlay === false
        ? `; feedback overlay: not injected; proxy with \`${p.proxyCommand}\``
        : p.feedbackOverlay === false
          ? '; feedback overlay: off'
          : '';
      const driftNote = p.driftStatus && p.driftStatus !== 'ok'
        ? `; registry drift: ${(p.driftReasons || []).join(',') || p.driftStatus}`
        : '';
      console.log(color(`  ${url}  ${p.label}  (pid=${p.pid}, ${ago}m ago${feedbackNote}${driftNote})`, p.driftStatus && p.driftStatus !== 'ok' ? 'yellow' : 'dim'));
    }
  }

  // MCP registry
  console.log();
  const mcpReg = await getMcpRegistry({ refresh: false, includeRuntimePalette: true });
  if (mcpReg.mcps.length === 0) {
    console.log(color('\u25cb MCPs: none registered (run `node scripts/discover-mcps.mjs` to scan)', 'dim'));
  } else {
    const capabilityStates = new Map((mcpReg.agentHandoff?.capabilities || []).map((item) => [item.capabilityId, item]));
    const runtimeAvailable = new Set(
      [...capabilityStates.values()]
        .filter((item) => item.state === 'runtime-available')
        .map((item) => item.capabilityId),
    );
    console.log(color(`\u2713 MCPs: ${mcpReg.mcps.length} registered, ${runtimeAvailable.size} runtime available`, 'green'));
    for (const m of mcpReg.mcps) {
      const capability = capabilityStates.get(m.capabilityId);
      const stateNote = capability?.state ? `; ${capability.state}` : '';
      console.log(color(`  ${m.name}  (${m.tools.length} tools${stateNote})`, 'dim'));
    }
  }
  if (mcpReg.agentHandoff) {
    console.log(color(`  Runtime palette: ${mcpReg.agentHandoff.runtimePaletteProvided ? 'provided' : 'not-provided'} (${mcpReg.agentHandoff.runtimeToolCount || 0} tools)`, 'dim'));
    for (const capability of (mcpReg.agentHandoff.capabilities || []).slice(0, 6)) {
      console.log(color(`  CAPABILITY: ${capability.capabilityId} state=${capability.state} confidenceCap=${capability.confidenceCap} fallback=${capability.fallback || 'none'}`, 'dim'));
    }
  }

  // Durable task tracker mapping
  console.log();
  const trackerMapPath = join(PROJECT_ROOT, '.supervibe', 'memory', 'loops', 'task-tracker-map.json');
  if (!existsSync(trackerMapPath)) {
    console.log(color('Task tracker sync: native graph only (no external mapping yet; not full tracker sync)', 'dim'));
  } else {
    try {
      const mapping = JSON.parse(readFileSync(trackerMapPath, 'utf8'));
      const mapped = Object.keys(mapping.items || {}).length;
      console.log(color(`Task tracker sync: ${mapping.status || 'unknown'} (${mapped} mapped items, adapter=${mapping.adapterId || 'native-json'})`, 'green'));
    } catch {
      console.log(color('Task tracker sync: mapping exists but could not be parsed', 'yellow'));
    }
  }

  console.log();
  await printActiveWorkGraphSummary();
  printPlanLifecycleSummary();
  if (args['receipt-recovery'] || args.details) {
    printWorkflowReceiptRecoverySummary();
  } else {
    console.log(color('Workflow receipts: details hidden (run `sv receipts status` or `node scripts/supervibe-status.mjs --receipt-recovery`)', 'dim'));
  }
  printWorktreeSessionRegistrySummary();

  console.log();
  if (wantsStatusDetails) {
    const artifactSnapshotStatus = await buildArtifactSnapshotStatus({ rootDir: PROJECT_ROOT });
    console.log(color(formatArtifactSnapshotStatus(artifactSnapshotStatus), artifactSnapshotStatus.mutationBlocked ? 'yellow' : 'green'));
  } else {
    console.log(color('Artifact snapshots: details hidden (run `node scripts/supervibe-status.mjs --details`)', 'dim'));
  }

  console.log();
  const watchState = await readWorkItemDaemonState(defaultWorkItemDaemonPath(PROJECT_ROOT));
  console.log(color(formatWorkItemWatchStatus(watchState), watchState.watches?.some(w => w.status === 'active') ? 'green' : 'dim'));

  console.log();
  const inbox = await readDelegatedInbox(defaultDelegatedInboxPath(PROJECT_ROOT));
  console.log(color(formatDelegatedInbox(inbox), inbox.some(message => message.status === 'open') ? 'yellow' : 'dim'));

  // Agent telemetry
  if (wantsStatusDetails) {
  console.log();
  const { readInvocations } = await import('./lib/agent-invocation-logger.mjs');
  const { detectUnderperformers } = await import('./lib/underperformer-detector.mjs');
  const { listKnownAgentIds } = await import('./lib/agent-id-registry.mjs');
  const allInv = await readInvocations({ limit: 10000 });
  const knownAgentIds = await listKnownAgentIds({ rootDir: PROJECT_ROOT });
  if (allInv.length === 0 && knownAgentIds.size > 0) {
    console.log(color(`Agent telemetry: agents installed, but zero real invocations logged`, 'yellow'));
    console.log(color(`  Log real runs with node scripts/agent-invocation.mjs log --agent <agent-id> --host <host> --host-invocation-id <runtime-id> --task <summary> --confidence <0-10>`, 'dim'));
  } else if (allInv.length < 10) {
    console.log(color(`○ Agent telemetry: ${allInv.length} invocations logged (need ≥10 for analysis)`, 'dim'));
  } else {
    const flagged = detectUnderperformers(allInv, { knownAgentIds });
    if (flagged.length === 0) {
      console.log(color(`✓ Agent telemetry: ${allInv.length} invocations, no underperformers`, 'green'));
    } else {
      console.log(color(`⚠ Agent telemetry: ${flagged.length} underperformers detected (run /supervibe-strengthen)`, 'yellow'));
      for (const f of flagged) {
        console.log(color(`  - ${f.agent_id}: ${f.reason} (${f.value})`, 'dim'));
      }
    }
  }

  } else {
    console.log();
    console.log(color('Agent telemetry: details hidden (run `node scripts/supervibe-status.mjs --details`)', 'dim'));
  }

  if (args['workflow-readiness']) {
    console.log();
    const readiness = await buildRuntimeWorkflowReadiness({
      rootDir: PROJECT_ROOT,
      command: args.command || '/supervibe-audit',
      profile: args.profile || 'development',
    });
    console.log(color(formatWorkflowReadinessModel(readiness), readiness.pass ? 'green' : 'yellow'));
  }

  if ((args['gc-hints'] || args.details) && !args['no-gc-hints']) {
    console.log();
    try {
      console.log(color(formatGcHints(await buildGcHints({ rootDir: PROJECT_ROOT })), 'dim'));
    } catch (error) {
      console.log(color(`SUPERVIBE_GC_HINTS\nNEEDS_ATTENTION: unknown\nNEXT_ACTION: inspect GC manually (${error.message})`, 'yellow'));
    }
  }
}

main().catch(err => { console.error('supervibe-status error:', err); process.exit(1); });

function parseArgs(argv) {
  const parsed = { _: [] };
  const booleans = new Set(['dashboard', 'integrations', 'json', 'block-network', 'no-color', 'interactive', 'eval-report', 'policy', 'role', 'anchors', 'waves', 'gc-hints', 'memory-health', 'agent-retrieval-health', 'strict', 'no-gc-hints', 'index-health', 'strict-index-health', 'receipt-recovery', 'details', 'intent-diagnostics', 'capabilities', 'host-diagnostics', 'stack-pack-diagnostics', 'watcher-diagnostics', 'index-policy-diagnostics', 'evidence-ledger', 'checkpoint-diagnostics', 'user-outcomes', 'performance-slo', 'workspace-isolation', 'workflow-readiness', 'help', 'h', 'one-screen', 'next-only', 'blocked-only', 'ready', 'blocked', 'remaining', 'stale', 'orphan']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (booleans.has(key)) parsed[key] = true;
    else {
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

async function buildConciseStatusModel({ rootDir = PROJECT_ROOT, mode = 'next-only', graphPath = null } = {}) {
  const explicitGraphPath = graphPath ? resolvePath(rootDir, graphPath) : null;
  const active = explicitGraphPath ? null : await resolveActiveWorkItemGraph({ rootDir });
  const resolution = explicitGraphPath
    ? { status: 'explicit', graphPath: explicitGraphPath, epicId: null, nextAction: `inspect ${explicitGraphPath}` }
    : active.status === 'none' ? resolveSingleUnarchivedTerminalWorkGraph(rootDir) || active : active;
  const receiptHealth = mode === 'one-screen' ? buildWorkflowReceiptHealth(rootDir) : null;
  const base = conciseStatusBase(mode, resolution, receiptHealth);
  if (resolution.status === 'none') return withConciseBlocks(base, 'blocked', resolution.nextAction || 'atomize or select an active work graph', 'no active work graph', [conciseBlock('activeWorkGraph', 'broken-state', 'no active work graph')]);
  if (resolution.status === 'ambiguous') return withConciseBlocks(base, 'blocked', resolution.nextAction || 'resolve active work graph ambiguity', 'multiple active work graphs found', [conciseBlock('activeWorkGraph', 'broken-state', 'ambiguous active work graphs')]);

  let graph;
  try {
    graph = JSON.parse(readFileSync(resolution.graphPath, 'utf8'));
  } catch (error) {
    return withConciseBlocks({ ...base, activeGraph: { ...base.activeGraph, error: error.message } }, 'blocked', 'repair or regenerate the active work-item graph', 'active work graph is unreadable', [conciseBlock('activeWorkGraph', 'broken-state', 'unreadable active work graph')]);
  }

  const index = createWorkItemIndex({ graph, claims: graph.claims || [], gates: graph.gates || [], evidence: graph.evidence || [] });
  const grouped = groupWorkItemsByStatus(index);
  const stale = detectStaleWorkItems(index);
  const orphans = detectOrphanWorkItems(index, graph);
  const stalled = collectStalledItemsFromGraph(graph);
  const blocked = grouped.blocked || [];
  const progress = buildOneScreenGraphProgress(index, grouped);
  const blocks = [
    ...stale.map((item) => conciseBlock(item.itemId || item.id || 'stale', 'missing-receipt', 'stale claim or work item state')),
    ...orphans.map((item) => conciseBlock(item.itemId || item.id || 'orphan', 'broken-state', 'orphan work item missing parent')),
    ...stalled.map((item) => conciseBlock(item.itemId || 'stalled', item.manualIntervention || !item.retryable ? 'missing-approval' : 'optional-cleanup', item.reason || 'stalled work item')),
    ...blocked.map((item) => conciseBlock(item.itemId || item.id || 'blocked', 'missing-approval', item.blockReason || item.blockerReason || item.blockerNextAction || 'blocked work item')),
  ];
  const nextReady = grouped.ready[0]?.itemId || grouped.ready[0]?.id || null;
  const archiveCandidate = isArchiveCandidate(graph);
  const action = conciseNextAction({ resolution, stale, stalled, blocked, nextReady, archiveCandidate });
  return withConciseBlocks({
    ...base,
    activeGraph: {
      status: 'active',
      epicId: graph.epicId || graph.graph_id || graph.graphId || resolution.epicId || 'unknown',
      path: resolution.graphPath,
      ...progress,
      stale: stale.length,
      stalled: stalled.length,
      orphan: orphans.length,
      archiveCandidate,
    },
  }, action.status, action.command, action.why, blocks, action);
}

function buildOneScreenGraphProgress(index = [], grouped = {}) {
  const workItems = index.filter((item) => !isEpicWorkItem(item));
  const done = workItems.filter((item) => isTerminalWorkStatus(item.effectiveStatus || item.status)).length;
  return {
    total: workItems.length,
    done,
    percent: workItems.length ? Math.round((done / workItems.length) * 100) : 0,
    ready: countNonEpicItems(grouped.ready),
    claimed: countUniqueNonEpicItems([...(grouped.in_progress || []), ...(grouped.claimed || [])]),
    blocked: countNonEpicItems(grouped.blocked),
  };
}

function countNonEpicItems(items = []) {
  return (items || []).filter((item) => !isEpicWorkItem(item)).length;
}

function countUniqueNonEpicItems(items = []) {
  const seen = new Set();
  for (const item of items || []) {
    if (isEpicWorkItem(item)) continue;
    const id = item.itemId || item.id || item.taskId || JSON.stringify(item);
    seen.add(id);
  }
  return seen.size;
}

function isEpicWorkItem(item = {}) {
  return String(item.type || '').toLowerCase() === 'epic';
}

function buildWorkflowReceiptHealth(rootDir = PROJECT_ROOT) {
  try {
    const receipts = readWorkflowReceipts(rootDir);
    const invalid = receipts.filter((receipt) => receipt.__invalidJson).length;
    let stale = 0;
    let untrusted = 0;
    for (const receipt of receipts) {
      if (receipt.__invalidJson) continue;
      const trust = validateWorkflowReceiptTrust(rootDir, receipt);
      if (trust.trusted === false || trust.pass === false) untrusted += 1;
      if ((trust.issues || []).some(isReceiptDriftIssue)) stale += 1;
    }
    const healthy = invalid === 0 && stale === 0 && untrusted === 0;
    return {
      status: healthy ? 'ok' : 'attention',
      checked: receipts.length,
      invalid,
      stale,
      untrusted,
      nextAction: healthy ? 'receipt trust clean' : 'run node scripts/workflow-receipt.mjs recovery-status',
    };
  } catch (error) {
    return {
      status: 'unreadable',
      checked: 0,
      invalid: 0,
      stale: 0,
      untrusted: 0,
      error: error.message,
      nextAction: 'run node scripts/workflow-receipt.mjs recovery-status',
    };
  }
}

function conciseStatusBase(mode, resolution = {}, receiptHealth = null) {
  return {
    schemaVersion: 1,
    kind: 'supervibe-status-concise',
    mode,
    pass: false,
    status: 'blocked',
    activeGraph: { status: resolution.status || 'unknown', epicId: resolution.epicId || null, path: resolution.graphPath || null },
    receiptHealth,
    primaryBlocker: null,
    nextAction: { status: 'blocked', why: 'active work graph is not ready', command: resolution.nextAction || 'inspect active work graph', safe_to_run: false, requires_user_approval: false, blocks: [] },
  };
}

function conciseNextAction({ resolution, stale = [], stalled = [], blocked = [], nextReady = null, archiveCandidate = false } = {}) {
  const graphPathArg = shellArg(resolution.graphPath);
  if (stale.length) return { status: 'blocked', why: 'stale work graph state must be recovered before continuing', command: `/supervibe-loop --recover-stale <item-id> --file ${graphPathArg}`, safe_to_run: true, requires_user_approval: false };
  if (stalled.length) {
    const manual = stalled.some((item) => item.manualIntervention || !item.retryable);
    return { status: manual ? 'requires_approval' : 'blocked', why: 'stalled work item needs recovery', command: `/supervibe-loop --recover-stalled <item-id> --file ${graphPathArg}`, safe_to_run: !manual, requires_user_approval: manual };
  }
  if (nextReady) return { status: 'ready', why: 'active work graph has a ready item', command: `claim ${nextReady} or run /supervibe-loop --claim-ready`, safe_to_run: true, requires_user_approval: false };
  if (blocked.length) return { status: 'blocked', why: 'active work graph has blocked work and no ready item', command: 'inspect blockers with node scripts/supervibe-status.mjs --blocked', safe_to_run: true, requires_user_approval: false };
  if (archiveCandidate) return { status: 'complete', why: 'active work graph appears complete', command: 'finish here | verify the work | prepare release handoff', safe_to_run: true, requires_user_approval: false };
  return { status: 'blocked', why: 'no ready item was found', command: 'validate completion or unblock remaining work', safe_to_run: false, requires_user_approval: false };
}

function shellArg(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/[\s"'`$]/.test(text)) return text;
  return `'${text.replace(/'/g, "''")}'`;
}

function isArchiveCandidate(graph = {}) {
  try {
    const archivedAt = graph.archivedAt || graph.archived_at || graph.metadata?.archivedAt || null;
    return !archivedAt && (validateEpicCompletion(graph).pass === true || isOperationallyClosedWorkGraph(graph));
  } catch {
    return isOperationallyClosedWorkGraph(graph);
  }
}

function conciseBlock(id, blockerClass, summary) {
  return { id, blocker_class: blockerClass, summary };
}

function withConciseBlocks(model = {}, status, command, why, blocks = [], action = {}) {
  const blockedStatus = ['blocked', 'requires_approval'].includes(String(status || '').toLowerCase());
  const pass = !blockedStatus && blocks.length === 0 && action.safe_to_run !== false;
  return {
    ...model,
    pass,
    status,
    primaryBlocker: blocks[0]?.id || null,
    nextAction: {
      status,
      why,
      command,
      safe_to_run: action.safe_to_run === true,
      requires_user_approval: action.requires_user_approval === true,
      blocks,
    },
  };
}

function formatConciseStatusModel(model = {}) {
  if (model.mode === 'blocked-only') return formatBlockedOnlyStatus(model);
  if (model.mode === 'one-screen') return formatOneScreenStatus(model);
  const action = model.nextAction || {};
  return [
    'SUPERVIBE_STATUS_NEXT',
    `PASS: ${model.pass === true}`,
    `STATUS: ${action.status || model.status || 'unknown'}`,
    `ACTIVE_GRAPH: ${model.activeGraph?.epicId || model.activeGraph?.status || 'unknown'}`,
    `PRIMARY_BLOCKER: ${model.primaryBlocker || 'none'}`,
    `NEXT_ACTION: ${action.command || 'unknown'}`,
    `WHY: ${action.why || 'unknown'}`,
    `SAFE_TO_RUN: ${action.safe_to_run === true}`,
    `REQUIRES_USER_APPROVAL: ${action.requires_user_approval === true}`,
    `BLOCKS: ${formatConciseBlocks(action.blocks || [])}`,
  ].join('\n');
}

function formatOneScreenStatus(model = {}) {
  const graph = model.activeGraph || {};
  const receipts = model.receiptHealth || {};
  const action = model.nextAction || {};
  const receiptProblems = (receipts.invalid || 0) + (receipts.stale || 0) + (receipts.untrusted || 0);
  const lines = [
    'SUPERVIBE_STATUS_ONE_SCREEN',
    `STATUS: ${action.status || model.status || 'unknown'} | PASS: ${model.pass === true}`,
    `GRAPH: ${graph.epicId || graph.status || 'unknown'} | ${graph.done ?? 0}/${graph.total ?? 0} done (${graph.percent ?? 0}%)`,
    `WORK: ready=${graph.ready ?? 0} claimed=${graph.claimed ?? 0} blocked=${graph.blocked ?? 0} stale=${graph.stale ?? 0} stalled=${graph.stalled ?? 0} orphan=${graph.orphan ?? 0}`,
    `RECEIPTS: ${receipts.status || 'unknown'} checked=${receipts.checked ?? 0} problems=${receiptProblems}`,
    `NEXT: ${action.command || 'unknown'}`,
    `WHY: ${action.why || 'unknown'}`,
  ];
  if (receipts.nextAction && receipts.status && receipts.status !== 'ok') lines.push(`RECEIPT_ACTION: ${receipts.nextAction}`);
  if (model.primaryBlocker) lines.push(`PRIMARY_BLOCKER: ${model.primaryBlocker}`);
  return lines.join('\n');
}
function formatBlockedOnlyStatus(model = {}) {
  const blocks = model.nextAction?.blocks || [];
  const action = model.nextAction || {};
  const blocked = blocks.length > 0 || ['blocked', 'requires_approval'].includes(String(model.status || action.status || '').toLowerCase());
  const lines = [
    'SUPERVIBE_STATUS_BLOCKERS',
    `PASS: ${model.pass === true}`,
    `STATUS: ${model.status || 'unknown'}`,
    `ACTIVE_GRAPH: ${model.activeGraph?.epicId || model.activeGraph?.status || 'unknown'}`,
    `PRIMARY_BLOCKER: ${model.primaryBlocker || 'none'}`,
    `BLOCKED: ${blocked}`,
    `BLOCK_COUNT: ${blocks.length}`,
  ];
  for (const block of blocks.slice(0, 10)) lines.push(`BLOCKER: ${block.id || 'unknown'} class=${block.blocker_class || 'unknown'} summary="${block.summary || 'none'}"`);
  if (blocks.length > 10) lines.push(`HIDDEN_BLOCKERS: ${blocks.length - 10}`);
  if (blocks.length === 0) lines.push(`NEXT_ACTION: ${blocked ? action.command || 'validate completion or unblock remaining work' : 'continue with the approved workflow'}`);
  return lines.join('\n');
}

function formatConciseBlocks(blocks = []) {
  if (!blocks.length) return 'none';
  const visible = blocks.slice(0, 5).map((block) => `${block.id || 'unknown'}:${block.blocker_class || 'unknown'}`);
  if (blocks.length > 5) visible.push(`+${blocks.length - 5} more`);
  return visible.join(',');
}

function loadGraphForStatusArgs(statusArgs) {
  const graphPath = statusArgs.file || (statusArgs.epic ? join(PROJECT_ROOT, '.supervibe', 'memory', 'work-items', statusArgs.epic, 'graph.json') : null);
  if (!graphPath) throw new Error('--view, --query, and --report require --file <graph.json|state.json> or --epic <id>');
  const raw = JSON.parse(readFileSync(graphPath, 'utf8'));
  return normalizeGraph(raw);
}

function normalizeGraph(raw = {}) {
  if (raw.items && raw.tasks) return raw;
  if (raw.task_graph || raw.taskGraph) return normalizeGraph(raw.task_graph || raw.taskGraph);
  const tasks = raw.tasks || [];
  return {
    epicId: raw.epicId || raw.run_id || raw.runId || 'status-graph',
    items: (raw.items || tasks.map((task) => ({
      itemId: task.itemId || task.id,
      title: task.title || task.goal || task.id,
      type: task.type || 'task',
      status: task.status,
      labels: task.labels || [],
      owner: task.owner || task.assignee,
      repo: task.repo,
      package: task.package,
      dueAt: task.dueAt || task.dueDate,
      policyRiskLevel: task.policyRiskLevel || task.risk,
    }))),
    tasks,
    releaseGates: raw.releaseGates || raw.release_gates || [],
  };
}

function detectAvailableCommands(names) {
  const path = process.env.PATH || '';
  return names.filter((name) => new RegExp(`(^|[;:])[^;:]*${name}(?:\\.exe)?`, 'i').test(path) || name === 'git');
}
