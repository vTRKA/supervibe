#!/usr/bin/env node
// Comprehensive index health report (code RAG + graph + memory + grammars + watcher).
// User-facing transparency — confirms indexes are working at any moment.

import { CodeStore } from './lib/code-store.mjs';
import { MemoryStore } from './lib/memory-store.mjs';
import { SQLITE_NODE_MIN_VERSION, hasNodeSqliteSupport } from './lib/node-sqlite-runtime.mjs';
import { getBrokenLanguages } from './lib/grammar-loader.mjs';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listServers as listPreviewServers } from './lib/preview-server-manager.mjs';
import { getRegistry as getMcpRegistry } from './lib/mcp-registry.mjs';
import { defaultWorkItemDaemonPath, formatWorkItemWatchStatus, readWorkItemDaemonState } from './lib/supervibe-work-item-daemon.mjs';
import { defaultDelegatedInboxPath, formatDelegatedInbox, readDelegatedInbox } from './lib/supervibe-work-item-message-delegation.mjs';
import { buildRunDashboardModel, writeRunDashboardHtml } from './lib/supervibe-run-dashboard.mjs';
import { createIntegrationCatalog, formatIntegrationCatalog, summarizeIntegrationCatalog } from './lib/supervibe-external-integration-catalog.mjs';
import { createWorkItemIndex } from './lib/supervibe-work-item-query.mjs';
import { collectIndexHealthFromStore, evaluateIndexHealthGate, formatIndexHealth, formatIndexHealthGate } from './lib/supervibe-index-health.mjs';
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
import { formatIndexConfigStatus, loadIndexConfig } from './lib/supervibe-index-config.mjs';
import { resolveSupervibePluginRoot, resolveSupervibeProjectRoot } from './lib/supervibe-plugin-root.mjs';
import { CODEGRAPH_INDEX_COMMAND, MEMORY_WATCH_COMMAND, SOURCE_RAG_INDEX_COMMAND } from './lib/supervibe-command-catalog.mjs';

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

async function main() {
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
    const mcpReg = await getMcpRegistry({ refresh: false });
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

  console.log(color('Supervibe Index Status', 'cyan'));
  console.log(color('===================', 'dim'));
  console.log(`Project root: ${PROJECT_ROOT}\n`);

  // Code RAG + Graph
  const codeDbPath = join(PROJECT_ROOT, '.supervibe', 'memory', 'code.db');
  if (!existsSync(codeDbPath)) {
    console.log(color('✗ Code RAG + Graph: NOT INITIALIZED', 'red'));
    console.log(color(`  Run: ${SOURCE_RAG_INDEX_COMMAND}`, 'dim'));
    console.log(color('  Language coverage: NOT INITIALIZED', 'dim'));
  } else if (!sqliteAvailable) {
    console.log(color(`! Code RAG + Graph: requires Node.js ${SQLITE_NODE_MIN_VERSION}+ for node:sqlite`, 'yellow'));
    console.log(color(`  Current runtime: ${process.version}. Upgrade Node to read ${codeDbPath}`, 'dim'));
    console.log(color('  Language coverage: unavailable until Code RAG can be read', 'dim'));
  } else {
    const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: false });
    await store.init();
    const s = store.stats();
    const health = store.getGrammarHealth();
    const indexHealth = await collectIndexHealthFromStore(store, { rootDir: PROJECT_ROOT });
    const indexGate = evaluateIndexHealthGate(indexHealth, { strictGraph: args['strict-index-health'] });
    const graphBuildState = store.db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN graph_version > 0 THEN 1 ELSE 0 END) AS current
      FROM code_files
    `).get();
    store.close();

    const dbAge = Date.now() - statSync(codeDbPath).mtimeMs;
    const sourceCoveragePct = (Number(indexHealth.sourceCoverage || 0) * 100).toFixed(1);
    const coverageSummary = `${indexHealth.indexedSourceFiles}/${indexHealth.eligibleSourceFiles} source files indexed, ${sourceCoveragePct}% coverage`;
    const codeRagReady = indexGate.ready && s.totalChunks > 0;
    const graphNotBuilt = Number(graphBuildState.total || 0) > 0
      && Number(graphBuildState.current || 0) === 0
      && s.totalSymbols === 0;
    const graphWarnings = new Set((indexGate.warnings || []).map((item) => item.code));
    const graphTone = graphNotBuilt || graphWarnings.has('cross-resolution') || graphWarnings.has('symbol-coverage') ? 'yellow' : 'green';
    const graphPrefix = graphTone === 'yellow' ? '!' : '✓';
    console.log(color(`${codeRagReady ? '✓' : '!'} Code RAG: ${codeRagReady ? '' : 'PARTIAL - '}${s.totalFiles} files, ${s.totalChunks} chunks`, codeRagReady ? 'green' : 'yellow'));
    console.log(color(`  Source coverage: ${coverageSummary}`, codeRagReady ? 'dim' : 'yellow'));
    console.log(color(`${graphPrefix} Code Graph: ${graphNotBuilt ? 'not built in current source-readiness index' : `${s.totalSymbols} symbols, ${s.totalEdges} edges (${(s.edgeResolutionRate * 100).toFixed(0)}% cross-resolved)`}`, graphTone));
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
      console.log(color('  Files indexed; source RAG remains available. Check grammars/queries/<lang>.scm for graph repair.', 'dim'));
    } else if (health.length > 0) {
      console.log(color(`✓ All ${health.length} active language(s) extracting symbols`, 'green'));
    }
    if (!graphNotBuilt) {
      console.log(color(`  Language coverage: ${health.length - broken.length}/${Math.max(health.length, s.byLang.length)} active language(s), ${broken.length} broken`, broken.length > 0 ? 'yellow' : 'dim'));
    }
    const lowCoverage = health.filter(h => h.coverage < 0.5 && h.files > 5);
    for (const lc of lowCoverage) {
      console.log(color(`  ⚠  ${lc.language}: only ${(lc.coverage*100).toFixed(0)}% files have extracted symbols`, 'yellow'));
    }

    // Grammar runtime status (LFS pointers)
    const brokenState = getBrokenLanguages();
    if (brokenState.pointers.length > 0) {
      console.log(color(`⚠  Grammars are LFS pointers (need 'git lfs pull'): ${brokenState.pointers.join(', ')}`, 'yellow'));
      console.log(color(`   Affected languages will skip graph extraction (semantic RAG still works)`, 'dim'));
    }
    console.log();
    console.log(color(formatIndexHealthGate(indexGate), indexGate.ready ? 'green' : 'yellow'));
    if (args['index-health']) {
      console.log();
      console.log(color(formatIndexHealth(indexHealth), indexHealth.ok ? 'green' : 'yellow'));
    }
    if (args['strict-index-health'] && !indexGate.ready) {
      process.exitCode = 2;
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
  }

  console.log();

  // Index config
  const indexConfig = loadIndexConfig({ rootDir: PROJECT_ROOT });
  console.log(color(formatIndexConfigStatus(indexConfig), 'dim'));
  console.log();

  // Watcher status (heartbeat-based)
  const heartbeatPath = join(PROJECT_ROOT, '.supervibe', 'memory', '.watcher-heartbeat');
  if (existsSync(heartbeatPath)) {
    let ts;
    try { ts = parseInt(readFileSync(heartbeatPath, 'utf8'), 10); } catch { ts = 0; }
    const age = Date.now() - ts;
    if (age < 15000) {
      console.log(color(`✓ File watcher: running (heartbeat ${ageStr(age)})`, 'green'));
    } else {
      console.log(color(`⚠  File watcher: stale heartbeat (${ageStr(age)}); may have crashed`, 'yellow'));
      console.log(color(`   Run \`${MEMORY_WATCH_COMMAND}\` to restart`, 'dim'));
    }
  } else {
    console.log(color(`○ File watcher: not running. Run \`${MEMORY_WATCH_COMMAND}\` for auto-reindex`, 'dim'));
  }

  // Preview servers
  const previews = await listPreviewServers();
  console.log();
  if (previews.length === 0) {
    console.log(color('○ Preview servers: none running', 'dim'));
  } else {
    console.log(color(`✓ Preview servers: ${previews.length} running`, 'green'));
    for (const p of previews) {
      const url = `http://localhost:${p.port}`;
      const ago = ((Date.now() - new Date(p.startedAt).getTime()) / 1000 / 60).toFixed(1);
      console.log(color(`  ${url}  ${p.label}  (pid=${p.pid}, ${ago}m ago)`, 'dim'));
    }
  }

  // MCP registry
  console.log();
  const mcpReg = await getMcpRegistry({ refresh: false });
  if (mcpReg.mcps.length === 0) {
    console.log(color('○ MCPs: none registered (run `node scripts/discover-mcps.mjs` to scan)', 'dim'));
  } else {
    console.log(color(`✓ MCPs: ${mcpReg.mcps.length} available`, 'green'));
    for (const m of mcpReg.mcps) {
      console.log(color(`  ${m.name}  (${m.tools.length} tools)`, 'dim'));
    }
  }

  // Durable task tracker mapping
  console.log();
  const trackerMapPath = join(PROJECT_ROOT, '.supervibe', 'memory', 'loops', 'task-tracker-map.json');
  if (!existsSync(trackerMapPath)) {
    console.log(color('Task tracker sync: native graph only (no mapping yet)', 'dim'));
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
  const watchState = await readWorkItemDaemonState(defaultWorkItemDaemonPath(PROJECT_ROOT));
  console.log(color(formatWorkItemWatchStatus(watchState), watchState.watches?.some(w => w.status === 'active') ? 'green' : 'dim'));

  console.log();
  const inbox = await readDelegatedInbox(defaultDelegatedInboxPath(PROJECT_ROOT));
  console.log(color(formatDelegatedInbox(inbox), inbox.some(message => message.status === 'open') ? 'yellow' : 'dim'));

  // Agent telemetry
  console.log();
  const { readInvocations } = await import('./lib/agent-invocation-logger.mjs');
  const { detectUnderperformers } = await import('./lib/underperformer-detector.mjs');
  const { listKnownAgentIds } = await import('./lib/agent-id-registry.mjs');
  const allInv = await readInvocations({ limit: 10000 });
  if (allInv.length < 10) {
    console.log(color(`○ Agent telemetry: ${allInv.length} invocations logged (need ≥10 for analysis)`, 'dim'));
  } else {
    const knownAgentIds = await listKnownAgentIds({ rootDir: PROJECT_ROOT });
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

  if (!args['no-gc-hints']) {
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
  const booleans = new Set(['dashboard', 'integrations', 'json', 'block-network', 'no-color', 'interactive', 'eval-report', 'policy', 'role', 'anchors', 'waves', 'gc-hints', 'no-gc-hints', 'index-health', 'strict-index-health', 'intent-diagnostics', 'capabilities', 'host-diagnostics', 'stack-pack-diagnostics', 'watcher-diagnostics', 'index-policy-diagnostics', 'evidence-ledger', 'checkpoint-diagnostics', 'user-outcomes', 'performance-slo', 'workspace-isolation']);
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
