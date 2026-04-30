#!/usr/bin/env node
// Comprehensive index health report (code RAG + graph + memory + grammars + watcher).
// User-facing transparency — confirms indexes are working at any moment.

import { CodeStore } from './lib/code-store.mjs';
import { MemoryStore } from './lib/memory-store.mjs';
import { getBrokenLanguages } from './lib/grammar-loader.mjs';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listServers as listPreviewServers } from './lib/preview-server-manager.mjs';
import { getRegistry as getMcpRegistry } from './lib/mcp-registry.mjs';
import { defaultWorkItemDaemonPath, formatWorkItemWatchStatus, readWorkItemDaemonState } from './lib/supervibe-work-item-daemon.mjs';
import { defaultDelegatedInboxPath, formatDelegatedInbox, readDelegatedInbox } from './lib/supervibe-work-item-message-delegation.mjs';
import { buildRunDashboardModel, writeRunDashboardHtml } from './lib/supervibe-run-dashboard.mjs';
import { createIntegrationCatalog, formatIntegrationCatalog, summarizeIntegrationCatalog } from './lib/supervibe-external-integration-catalog.mjs';
import { createWorkItemIndex } from './lib/supervibe-work-item-query.mjs';
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

const PROJECT_ROOT = process.cwd();
const noColor = process.argv.includes('--no-color') || !process.stdout.isTTY;
const args = parseArgs(process.argv.slice(2));

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
      graphPath: args.file || '.claude/memory/work-items/<epic-id>/graph.json',
      isTTY: process.stdin.isTTY && process.stdout.isTTY,
    });
    console.log(result.output);
    if (!result.ok) process.exitCode = result.exitCode;
    return;
  }

  if (args['eval-report']) {
    const reportPath = args.file || join(PROJECT_ROOT, 'docs', 'audits', 'autonomous-loop-evals', 'latest-report.json');
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
  const codeDbPath = join(PROJECT_ROOT, '.claude', 'memory', 'code.db');
  if (!existsSync(codeDbPath)) {
    console.log(color('✗ Code RAG + Graph: NOT INITIALIZED', 'red'));
    console.log(color('  Run: npm run code:index', 'dim'));
  } else {
    const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: false });
    await store.init();
    const s = store.stats();
    const health = store.getGrammarHealth();
    store.close();

    const dbAge = Date.now() - statSync(codeDbPath).mtimeMs;
    console.log(color(`✓ Code RAG: ${s.totalFiles} files, ${s.totalChunks} chunks`, 'green'));
    console.log(color(`✓ Code Graph: ${s.totalSymbols} symbols, ${s.totalEdges} edges (${(s.edgeResolutionRate * 100).toFixed(0)}% cross-resolved)`, 'green'));
    console.log(color(`  Last update: ${ageStr(dbAge)}`, 'dim'));
    if (s.byLang.length > 0) {
      const langs = s.byLang.slice(0, 5).map(l => `${l.language}(${l.n})`).join(' ');
      console.log(color(`  Languages: ${langs}`, 'dim'));
    }

    // Grammar health
    const broken = health.filter(h => !h.healthy);
    if (broken.length > 0) {
      console.log(color(`✗ Grammar queries broken for: ${broken.map(b => b.language).join(', ')}`, 'red'));
      console.log(color('  Files indexed but no symbols extracted — check grammars/queries/<lang>.scm', 'dim'));
    } else if (health.length > 0) {
      console.log(color(`✓ All ${health.length} active language(s) extracting symbols`, 'green'));
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
  }

  console.log();

  // Memory
  const memDbPath = join(PROJECT_ROOT, '.claude', 'memory', 'memory.db');
  if (!existsSync(memDbPath)) {
    console.log(color('○ Memory: not yet built (no entries indexed)', 'yellow'));
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

  // Watcher status (heartbeat-based)
  const heartbeatPath = join(PROJECT_ROOT, '.claude', 'memory', '.watcher-heartbeat');
  if (existsSync(heartbeatPath)) {
    let ts;
    try { ts = parseInt(readFileSync(heartbeatPath, 'utf8'), 10); } catch { ts = 0; }
    const age = Date.now() - ts;
    if (age < 15000) {
      console.log(color(`✓ File watcher: running (heartbeat ${ageStr(age)})`, 'green'));
    } else {
      console.log(color(`⚠  File watcher: stale heartbeat (${ageStr(age)}); may have crashed`, 'yellow'));
      console.log(color('   Run `npm run memory:watch` to restart', 'dim'));
    }
  } else {
    console.log(color('○ File watcher: not running. Run `npm run memory:watch` for auto-reindex', 'dim'));
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
  const trackerMapPath = join(PROJECT_ROOT, '.claude', 'memory', 'loops', 'task-tracker-map.json');
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
  const allInv = await readInvocations({ limit: 10000 });
  if (allInv.length < 10) {
    console.log(color(`○ Agent telemetry: ${allInv.length} invocations logged (need ≥10 for analysis)`, 'dim'));
  } else {
    const flagged = detectUnderperformers(allInv);
    if (flagged.length === 0) {
      console.log(color(`✓ Agent telemetry: ${allInv.length} invocations, no underperformers`, 'green'));
    } else {
      console.log(color(`⚠ Agent telemetry: ${flagged.length} underperformers detected (run /supervibe-strengthen)`, 'yellow'));
      for (const f of flagged) {
        console.log(color(`  - ${f.agent_id}: ${f.reason} (${f.value})`, 'dim'));
      }
    }
  }
}

main().catch(err => { console.error('supervibe-status error:', err); process.exit(1); });

function parseArgs(argv) {
  const parsed = { _: [] };
  const booleans = new Set(['dashboard', 'integrations', 'json', 'block-network', 'no-color', 'interactive', 'eval-report', 'policy', 'role', 'anchors', 'waves']);
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
  const graphPath = statusArgs.file || (statusArgs.epic ? join(PROJECT_ROOT, '.claude', 'memory', 'work-items', statusArgs.epic, 'graph.json') : null);
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
