import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { CodeStore } from "./code-store.mjs";
import { MemoryStore } from "./memory-store.mjs";
import { SQLITE_NODE_MIN_VERSION, hasNodeSqliteSupport } from "./node-sqlite-runtime.mjs";
import { createWorkItemIndex, groupWorkItemsByStatus } from "./supervibe-work-item-query.mjs";
import { mutateWorkItemGraphFile } from "./supervibe-work-item-actions.mjs";
import { buildContextPack } from "./supervibe-context-pack.mjs";
import { createWorkflowFlowModel } from "./supervibe-workflow-flow-model.mjs";
import { scanWorkItemGc } from "./supervibe-work-item-gc.mjs";
import { buildExecutionWaves } from "./supervibe-wave-controller.mjs";
import { buildRunDashboardModel } from "./supervibe-run-dashboard.mjs";
import { createRecurringWorkReport, createSlaReport, renderWorkReportMarkdown } from "./supervibe-work-item-sla-reports.mjs";

export { createWorkflowFlowModel } from "./supervibe-workflow-flow-model.mjs";

export function createSupervibeUiServer({
  rootDir = process.cwd(),
  graphPath = null,
} = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/favicon.ico") {
        res.writeHead(204, { "cache-control": "no-store" });
        return res.end();
      }
      if (url.pathname === "/") return sendHtml(res, renderSupervibeUiHtml({ graphPath }));
      if (url.pathname === "/api/index-status") {
        return sendJson(res, await buildIndexStatus({ rootDir }));
      }
      if (url.pathname === "/api/graph") {
        const file = resolveSafe(rootDir, url.searchParams.get("file") || graphPath);
        const graph = await readJsonFile(file);
        const index = createWorkItemIndex({ graph, claims: graph.claims || [], gates: graph.gates || [], evidence: graph.evidence || [] });
        const grouped = groupWorkItemsByStatus(index);
        const kanban = createKanbanModel({ graph, index });
        const flow = createWorkflowFlowModel({ graph, index, grouped });
        return sendJson(res, { graphPath: file, graphId: graph.graph_id || graph.graphId || graph.epicId, title: graph.title, grouped, items: index, kanban, flow });
      }
      if (url.pathname === "/api/context-pack") {
        const file = resolveSafe(rootDir, url.searchParams.get("file") || graphPath);
        const pack = await buildContextPack({ rootDir, graphPath: file, itemId: url.searchParams.get("item") || null });
        return sendJson(res, pack);
      }
      if (url.pathname === "/api/run") {
        const file = resolveSafe(rootDir, url.searchParams.get("file"));
        const state = await readJsonFile(file);
        const graph = normalizeStateGraph(state);
        const index = createWorkItemIndex({
          graph,
          claims: state.claims || [],
          gates: state.gates || [],
          evidence: state.evidence || [],
          delegatedMessages: state.delegatedMessages || state.delegated_messages || [],
        });
        const waves = buildExecutionWaves({
          tasks: state.tasks || graph.tasks || [],
          worktreeSessions: state.worktree_sessions || state.worktreeSessions || [],
          claims: state.claims || [],
        });
        const dashboard = buildRunDashboardModel({
          state,
          workItemIndex: index,
          delegatedMessages: state.delegatedMessages || state.delegated_messages || [],
          evidence: state.evidence || [],
          generatedAt: new Date().toISOString(),
        });
        const flow = createWorkflowFlowModel({ run: state, index, waves, dashboard });
        return sendJson(res, {
          runPath: file,
          runId: state.run_id || state.runId || "unknown",
          status: state.status || "unknown",
          confidence: state.run_score ?? state.finalScore ?? state.confidence ?? null,
          activeTask: state.active_task || state.activeTask || null,
          nextAction: state.next_action || state.nextAction || null,
          stopReason: state.stop_reason || state.stopReason || null,
          waves,
          dashboard,
          tasks: state.tasks || [],
          gates: state.gates || [],
          reports: dashboard.reports || [],
          flow,
        });
      }
      if (url.pathname === "/api/report") {
        const file = resolveSafe(rootDir, url.searchParams.get("file") || graphPath);
        const type = url.searchParams.get("type") || "sla";
        const graph = await readJsonFile(file);
        const index = createWorkItemIndex({
          graph,
          claims: graph.claims || [],
          gates: graph.gates || [],
          evidence: graph.evidence || [],
          delegatedMessages: graph.delegatedMessages || [],
        });
        const report = type === "sla"
          ? createSlaReport(index)
          : createRecurringWorkReport(index, { type, releaseGates: graph.releaseGates || graph.release_gates || [] });
        return sendJson(res, { report, markdown: renderWorkReportMarkdown(report) });
      }
      if (url.pathname === "/api/gc") {
        const scan = await scanWorkItemGc({ rootDir });
        return sendJson(res, scan);
      }
      if (url.pathname === "/api/action" && req.method === "POST") {
        const body = await readJsonBody(req);
        if (body.apply === true && body.confirm !== "apply-local") {
          throw new Error("apply requires confirm=apply-local after preview");
        }
        const file = resolveSafe(rootDir, body.file || graphPath);
        const result = await mutateWorkItemGraphFile(file, { ...body, dryRun: body.apply !== true });
        return sendJson(res, result);
      }
      return sendJson(res, { error: "not found" }, 404);
    } catch (err) {
      return sendJson(res, { error: err.message }, 400);
    }
  });
  return { server };
}

export function renderSupervibeUiHtml({ graphPath = "" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Supervibe Control Plane</title>
  <style>
    :root{--bg:#f6f8fa;--panel:#fff;--ink:#17212b;--muted:#657382;--line:#d9e1e8;--teal:#17615d;--blue:#2457a6;--amber:#a65f00;--red:#b42318;--green:#18794e;--soft:#eef6f4;--shadow:0 10px 24px rgba(20,34,46,.08)}
    *{box-sizing:border-box}
    body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;background:var(--bg);color:var(--ink);font-size:14px}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 18px;background:#fff;color:var(--ink);border-top:3px solid var(--teal);border-bottom:1px solid var(--line);box-shadow:0 2px 10px rgba(20,34,46,.04)}
    .topbar h1{margin:0;font-size:18px;letter-spacing:0;font-weight:720}
    .topbar small{display:block;color:var(--muted);margin-top:3px}
    .topbar-meta{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--line);padding:5px 9px;font-size:12px;background:#f8fafb;color:#344453;min-width:0;max-width:100%;overflow-wrap:anywhere}
    main{display:grid;grid-template-columns:minmax(280px,340px) minmax(0,1fr);gap:14px;padding:14px;max-width:1500px;margin:0 auto}
    .panel,.workspace{background:var(--panel);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow)}
    .panel{padding:12px;margin-bottom:12px}
    .workspace{min-width:0;overflow:hidden}
    h2{font-size:13px;text-transform:uppercase;color:#465562;letter-spacing:0;margin:0 0 10px}
    h3{font-size:15px;margin:0 0 8px}
    label{display:block;font-size:12px;color:var(--muted);margin:10px 0 5px}
    input,select,button,textarea{font:inherit}
    input,textarea,select{width:100%;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink);padding:8px}
    textarea{min-height:68px;resize:vertical}
    button{border:1px solid #aeb9c4;background:#fff;border-radius:6px;padding:7px 10px;cursor:pointer;color:#17212b}
    button.primary{background:var(--teal);border-color:var(--teal);color:#fff}
    button.ghost{background:#f8fafb}
    button.warn{background:#fff8ed;border-color:#e0a34a;color:#704300}
    button:disabled{opacity:.55;cursor:not-allowed}
    .button-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);padding:8px 8px 0;background:#f9fbfc;overflow:auto}
    .tab-button{border:0;border-bottom:3px solid transparent;border-radius:6px 6px 0 0;background:transparent;padding:9px 11px;white-space:nowrap;color:#465562}
    .tab-button.active{background:#fff;border-bottom-color:var(--teal);color:#102b35;font-weight:700}
    .tab{display:none;padding:14px}
    .tab.active{display:block}
    .banner{margin:14px 14px 0;border-radius:8px;border:1px solid var(--line);padding:10px 12px;background:#f8fafb;color:#3f4b57}
    .banner.ok{border-color:#b7dec9;background:#eef8f2;color:#145c38}
    .banner.warn{border-color:#f0d095;background:#fff8e8;color:#704300}
    .banner.error{border-color:#efb4ad;background:#fff1f0;color:#8a1f16}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
    .metric{border:1px solid var(--line);border-radius:8px;padding:10px;background:#fff;min-height:82px}
    .metric strong{display:block;font-size:24px;line-height:1.15;margin-top:3px}
    .metric span,.muted{color:var(--muted);font-size:12px}
    .metric.ready{border-left:4px solid var(--green)}
    .metric.warn{border-left:4px solid var(--amber)}
    .metric.error{border-left:4px solid var(--red)}
    .metric.info{border-left:4px solid var(--blue)}
    .metric.claimed{border-left:4px solid var(--blue)}
    .flow{display:grid;grid-template-columns:repeat(6,minmax(118px,1fr));gap:6px;margin:14px 14px 0}
    .flow-step{border:1px solid var(--line);border-radius:6px;padding:8px;background:#f8fafb;color:#51606c;min-width:0}
    .flow-step strong{display:block;font-size:12px;line-height:1.2;text-transform:uppercase;color:#3f4c58}
    .flow-step small{display:block;margin-top:4px;font-size:11px;line-height:1.25;color:var(--muted);overflow-wrap:anywhere}
    .flow-step.complete{border-color:#b7dec9;background:#eef8f2}
    .flow-step.complete strong{color:#145c38}
    .flow-step.current{border-color:var(--teal);background:var(--soft);box-shadow:inset 0 0 0 1px rgba(23,97,93,.14)}
    .flow-step.current strong{color:#123c3a}
    .flow-step.blocked{border-color:#efb4ad;background:#fff1f0}
    .flow-step.blocked strong{color:#8a1f16}
    .list{display:grid;gap:8px}
    .item{border:1px solid var(--line);border-radius:8px;padding:10px;background:#fff}
    .item-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
    .kanban-shell{display:grid;gap:12px}
    .kanban-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;border:1px solid var(--line);border-radius:8px;background:#f8fafb;padding:10px}
    .kanban-title{display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0}
    .kanban-title strong{font-size:16px;min-width:0;overflow-wrap:anywhere;word-break:break-word}
    .kanban-board{display:grid;grid-template-columns:repeat(7,minmax(210px,1fr));gap:10px;overflow:auto;padding-bottom:4px}
    .kanban-column{min-width:210px;border:1px solid var(--line);border-radius:8px;background:#f8fafb;display:flex;flex-direction:column;max-height:calc(100vh - 260px)}
    .kanban-column-head{position:sticky;top:0;z-index:1;background:#fff;border-bottom:1px solid var(--line);border-radius:8px 8px 0 0;padding:9px 10px;display:flex;justify-content:space-between;gap:8px;align-items:center}
    .kanban-column-head strong{font-size:13px;text-transform:uppercase;color:#3f4c58}
    .kanban-cards{display:grid;gap:8px;padding:8px;overflow-y:auto;overflow-x:hidden}
    .kanban-card{border:1px solid var(--line);border-left:4px solid var(--blue);border-radius:8px;background:#fff;padding:9px;min-height:132px;display:grid;gap:7px;min-width:0;max-width:100%;width:100%}
    .kanban-card.ready{border-left-color:var(--green)}.kanban-card.blocked,.kanban-card.gate,.kanban-card.stale{border-left-color:var(--red)}.kanban-card.claimed{border-left-color:var(--blue)}.kanban-card.deferred{border-left-color:var(--amber)}.kanban-card.done{border-left-color:var(--teal)}
    .kanban-card-title{font-weight:700;line-height:1.25;overflow-wrap:anywhere;word-break:break-word}
    .kanban-card-subrow{min-height:16px;font-size:11px}
    .kanban-meta{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
    .kanban-meta .tag{margin:0}
    .kanban-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
    .kanban-card-foot button{padding:5px 8px;font-size:12px}
    .status{font-size:11px;text-transform:uppercase;color:#5f6b76;letter-spacing:0}
    .tag{display:inline-block;border-radius:999px;padding:3px 7px;font-size:11px;background:#edf2f7;color:#384858;margin:2px 4px 2px 0;min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
    .tag.ready{background:#e9f7ef;color:#145c38}.tag.blocked,.tag.error{background:#fff1f0;color:#8a1f16}.tag.claimed{background:#eaf1ff;color:#173f80}.tag.deferred,.tag.warn{background:#fff8e8;color:#704300}.tag.done{background:#edf8f4;color:#17615d}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}
    th,td{text-align:left;border-bottom:1px solid var(--line);padding:8px;vertical-align:top}
    th{font-size:12px;color:#465562;background:#f8fafb;text-transform:uppercase}
    pre{white-space:pre-wrap;background:#101820;color:#e9eef2;border-radius:8px;padding:12px;max-height:430px;overflow:auto}
    .split{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(260px,.9fr);gap:12px}
    .index-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,360px);gap:12px;align-items:start}
    .index-cards{display:grid;gap:10px}
    .map-section{margin-top:12px}
    .empty{border:1px dashed #b8c3cc;border-radius:8px;padding:20px;text-align:center;color:#64727f;background:#fbfcfd}
    .map-wrap{border:1px solid var(--line);border-radius:8px;background:#fbfcfd;margin:10px 0 12px;overflow:hidden}
    .map-head{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);background:#fff}
    .map-head strong{font-size:14px}
    .map-head span{color:var(--muted);font-size:12px}
    .map-body{display:block}
    .map-canvas{min-height:330px;max-height:500px;overflow:auto;background:linear-gradient(180deg,#fbfcfd,#f5f8fa)}
    .map-svg{display:block;min-width:900px;width:100%;height:auto}
    .map-link{stroke:#b8c4ce;stroke-width:1.4;fill:none}
    .map-link.strong{stroke:#8aa59e;stroke-width:2}
    .map-node{cursor:pointer;outline:none}
    .map-node circle{stroke:#fff;stroke-width:2;filter:drop-shadow(0 3px 5px rgba(20,34,46,.16))}
    .map-node text{font-size:11px;fill:#23313d;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}
    .map-node .node-sub{font-size:10px;fill:#617080}
    .map-node.system circle{fill:#17615d}.map-node.language circle,.map-node.type circle{fill:#2457a6}.map-node.file circle,.map-node.entry circle{fill:#7b5e1f}.map-node.symbol circle{fill:#8b3d67}.map-node.tag circle{fill:#60713c}.map-node.kind circle{fill:#596579}
    .map-side{border-top:1px solid var(--line);background:#fff;padding:10px;min-width:0}
    .map-side h3{font-size:14px;margin-bottom:6px}
    .map-side p{margin:6px 0;word-break:break-word}
    .map-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
    .legend-dot{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#53616f}
    .legend-dot::before{content:"";width:9px;height:9px;border-radius:50%;background:#8a98a8}
    .legend-dot.system::before{background:#17615d}.legend-dot.language::before,.legend-dot.type::before{background:#2457a6}.legend-dot.file::before,.legend-dot.entry::before{background:#7b5e1f}.legend-dot.symbol::before{background:#8b3d67}.legend-dot.tag::before{background:#60713c}
    .section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 8px}
    .section-title h3{margin:0}
    @media (max-width:900px){main{grid-template-columns:1fr}.topbar{align-items:flex-start;flex-direction:column}.topbar-meta{justify-content:flex-start}.flow{grid-template-columns:repeat(2,1fr)}.split,.index-layout{grid-template-columns:1fr}.kanban-toolbar{grid-template-columns:1fr}.kanban-board{grid-template-columns:repeat(7,230px)}.kanban-column{max-height:none}}
    @media (max-width:900px){.map-canvas{max-height:420px}}
  </style>
</head>
<body>
  <header class="topbar">
    <div><h1>Supervibe UI</h1><small>Local control plane for work, loops, and project intelligence</small></div>
    <div class="topbar-meta"><span class="pill" id="overallPill">Index status: checking</span><span class="pill">Bind: 127.0.0.1</span><span class="pill">Auth: local only</span></div>
  </header>
  <main>
    <aside>
    <section class="panel">
      <h2>Start</h2>
      <label for="graphPath">Work graph</label>
      <input id="graphPath" value="${escapeHtml(graphPath || "")}" placeholder=".claude/memory/work-items/<epic>/graph.json">
      <div class="button-row"><button class="primary" id="loadGraphBtn">Load graph</button><button class="ghost" id="refreshStatusBtn">Refresh indexes</button></div>
      <label for="statePath">Loop state</label>
      <input id="statePath" placeholder=".claude/memory/loops/<run-id>/state.json">
      <div class="button-row"><button id="loadRunBtn">Load run</button><button id="loadReportBtn">SLA report</button><button id="loadGcBtn">GC preview</button></div>
    </section>
    <section class="panel">
      <h2>Selected item</h2>
      <input id="contextItem" placeholder="item id">
      <div class="button-row"><button id="loadContextBtn">Context pack</button></div>
    </section>
    <section class="panel">
      <h2>Local action</h2>
      <input id="actionItem" placeholder="item id">
      <select id="actionType"><option>claim</option><option>defer</option><option>close</option><option>reopen</option></select>
      <input id="actionUntil" placeholder="until ISO for defer">
      <textarea id="actionReason" placeholder="reason"></textarea>
      <div class="button-row"><button id="previewActionBtn">Preview</button><button class="primary" id="applyActionBtn" disabled>Apply local</button></div>
      <p class="muted">Apply unlocks only after previewing the same action.</p>
    </section>
    </aside>
    <section class="workspace">
      <nav class="tabs" id="tabs">
        <button class="tab-button active" data-tab="overview">Overview</button>
        <button class="tab-button" data-tab="kanban">Kanban</button>
        <button class="tab-button" data-tab="items">Work items</button>
        <button class="tab-button" data-tab="run">Loop run</button>
        <button class="tab-button" data-tab="rag">RAG</button>
        <button class="tab-button" data-tab="memory">Memory</button>
        <button class="tab-button" data-tab="codegraph">CodeGraph</button>
        <button class="tab-button" data-tab="raw">Raw</button>
      </nav>
      <div id="banner" class="banner">Open a graph or refresh indexes.</div>
      <div class="flow" id="flow"></div>
      <div class="tab active" id="tab-overview">
        <div id="indexCards" class="grid"></div>
        <h3>Work summary</h3>
        <div id="summary" class="grid"></div>
      </div>
      <div class="tab" id="tab-kanban"><div id="kanban"></div></div>
      <div class="tab" id="tab-items"><div id="items"></div></div>
      <div class="tab" id="tab-run"><div id="runCards" class="grid"></div><div id="runDetails" class="list" style="margin-top:10px"></div></div>
      <div class="tab" id="tab-rag"><div id="ragPanel"></div></div>
      <div class="tab" id="tab-memory"><div id="memoryPanel"></div></div>
      <div class="tab" id="tab-codegraph"><div id="codeGraphPanel"></div></div>
      <div class="tab" id="tab-raw"><pre id="output">No data loaded yet.</pre></div>
    </section>
  </main>
<script>
const state = { graph: null, run: null, index: null, selectedItem: null, lastPreviewKey: null, maps: {}, kanban: null, flow: null };
const statusOrder = ['ready','claimed','blocked','delegated','deferred','review','done'];
document.querySelectorAll('.tab-button').forEach(function(btn){ btn.addEventListener('click', function(){ setTab(btn.dataset.tab); }); });
document.getElementById('loadGraphBtn').addEventListener('click', loadGraph);
document.getElementById('refreshStatusBtn').addEventListener('click', loadIndexStatus);
document.getElementById('loadRunBtn').addEventListener('click', loadRun);
document.getElementById('loadReportBtn').addEventListener('click', loadReport);
document.getElementById('loadGcBtn').addEventListener('click', loadGc);
document.getElementById('loadContextBtn').addEventListener('click', loadContext);
document.getElementById('previewActionBtn').addEventListener('click', function(){ sendAction(false); });
document.getElementById('applyActionBtn').addEventListener('click', function(){ sendAction(true); });
setFlow(defaultFlowModel());
loadIndexStatus().then(function(){ if (graphFile()) loadGraph(); });

function graphFile(){ return document.getElementById('graphPath').value.trim(); }
function setTab(name){
  document.querySelectorAll('.tab-button').forEach(function(btn){ btn.classList.toggle('active', btn.dataset.tab === name); });
  document.querySelectorAll('.tab').forEach(function(tab){ tab.classList.toggle('active', tab.id === 'tab-' + name); });
}
async function requestJson(url, options){
  setBanner('info', 'Loading...');
  const res = await fetch(url, options);
  const data = await res.json().catch(function(){ return { error: 'Invalid JSON response' }; });
  if (!res.ok || data.error) {
    const message = data.error || ('HTTP ' + res.status);
    setBanner('error', message);
    throw new Error(message);
  }
  setBanner('ok', 'Ready');
  return data;
}
async function loadIndexStatus(){
  try {
    state.index = await requestJson('/api/index-status');
    renderIndexStatus();
  } catch (err) {
    renderIndexStatus();
  }
}
async function loadGraph(){
  try {
    if (!graphFile()) throw new Error('Graph file is required');
    const data = await requestJson('/api/graph?file=' + encodeURIComponent(graphFile()));
    state.graph = data;
    setRaw(data);
    setFlow(data.flow);
    renderGraph(data);
    setTab('overview');
  } catch (err) { setRaw({ error: err.message }); }
}
async function loadContext(){
  try {
    const item = document.getElementById('contextItem').value.trim();
    const data = await requestJson('/api/context-pack?file=' + encodeURIComponent(graphFile()) + '&item=' + encodeURIComponent(item));
    setRaw(data.markdown || data);
    setTab('raw');
  } catch (err) { setRaw({ error: err.message }); }
}
async function loadGc(){
  try {
    const data = await requestJson('/api/gc');
    setRaw(data);
    setBanner(data.candidates && data.candidates.length ? 'warn' : 'ok', data.candidates && data.candidates.length ? 'Cleanup candidates found' : 'No cleanup candidates found');
    setTab('raw');
  } catch (err) { setRaw({ error: err.message }); }
}
async function loadRun(){
  try {
    const file = document.getElementById('statePath').value.trim();
    if (!file) throw new Error('Loop state file is required');
    const data = await requestJson('/api/run?file=' + encodeURIComponent(file));
    state.run = data;
    setRaw(data);
    setFlow(data.flow);
    renderRun(data);
    setTab('run');
  } catch (err) { setRaw({ error: err.message }); }
}
async function loadReport(){
  try {
    if (!graphFile()) throw new Error('Graph file is required');
    const data = await requestJson('/api/report?file=' + encodeURIComponent(graphFile()) + '&type=sla');
    setRaw(data.markdown || data);
    setTab('raw');
  } catch (err) { setRaw({ error: err.message }); }
}
async function sendAction(apply){
  try {
    const body = actionBody(apply);
    const key = actionKey(body);
    if (apply && key !== state.lastPreviewKey) throw new Error('Preview this exact action before applying it.');
    const data = await requestJson('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    setRaw(data);
    if (!apply) {
      state.lastPreviewKey = key;
      document.getElementById('applyActionBtn').disabled = false;
      setBanner('warn', 'Preview ready. Apply local is now enabled for this exact action.');
    } else {
      state.lastPreviewKey = null;
      document.getElementById('applyActionBtn').disabled = true;
      setBanner('ok', 'Local graph updated.');
      await loadGraph();
    }
  } catch (err) { setRaw({ error: err.message }); }
}
function actionBody(apply){
  return {
    file: graphFile(),
    itemId: document.getElementById('actionItem').value.trim(),
    type: document.getElementById('actionType').value,
    until: document.getElementById('actionUntil').value.trim(),
    reason: document.getElementById('actionReason').value.trim(),
    actor: 'ui-user',
    apply: apply,
    confirm: apply ? 'apply-local' : undefined
  };
}
function actionKey(body){ return [body.file, body.itemId, body.type, body.until, body.reason].join('|'); }
function renderGraph(data){
  const grouped = data.grouped || {};
  state.kanban = data.kanban || null;
  document.getElementById('summary').innerHTML = statusOrder.map(function(k){
    const count = (grouped[k] || []).length;
    return metric(k, count, 'work items', count > 0 ? (k === 'blocked' ? 'error' : k === 'deferred' ? 'warn' : 'ready') : 'info');
  }).join('');
  renderKanban(data.kanban);
  const items = data.items || [];
  document.getElementById('items').innerHTML = items.length ? '<div class="list">' + items.map(renderItem).join('') + '</div>' : empty('No work items loaded');
}
function renderKanban(model){
  const el = document.getElementById('kanban');
  if (!el) return;
  if (!model || !model.columns) { el.innerHTML = empty('No kanban data loaded'); return; }
  const project = model.project || {};
  const epicChips = (model.epics || []).map(function(epic){
    return '<span class="tag">'+escapeHtmlJs(truncateLabel(epic.title || epic.id, 32))+' <span class="muted">ID '+escapeHtmlJs(epic.id)+'</span></span>';
  }).join('');
  const agentChips = (model.agents || []).map(function(agent){
    return '<span class="tag claimed">'+escapeHtmlJs(agent.agent)+' '+escapeHtmlJs(agent.count)+'</span>';
  }).join('');
  const columns = model.columns.map(function(column){
    const cards = column.items.length ? column.items.map(renderKanbanCard).join('') : empty('No tasks');
    return '<section class="kanban-column"><div class="kanban-column-head"><strong>'+escapeHtmlJs(column.label)+'</strong><span class="tag '+toneClass(column.id)+'">'+escapeHtmlJs(column.items.length)+'</span></div><div class="kanban-cards">'+cards+'</div></section>';
  }).join('');
  el.innerHTML = '<div class="kanban-shell"><div class="kanban-toolbar"><div><div class="kanban-title"><strong>'+escapeHtmlJs(project.title || 'Work board')+'</strong><span class="pill">'+escapeHtmlJs(project.graphId || 'graph')+'</span><span class="pill">'+escapeHtmlJs(project.totalTasks || 0)+' task(s)</span></div><div class="kanban-meta" style="margin-top:8px">'+(epicChips || '<span class="tag">no epic</span>')+'</div></div><div class="kanban-meta">'+(agentChips || '<span class="tag">unassigned</span>')+'</div></div><div class="kanban-board">'+columns+'</div></div>';
}
function renderKanbanCard(card){
  const blockerLabels = card.blockedByLabels || card.blockedBy || [];
  const blocker = blockerLabels.length ? '<span class="tag blocked">blocked by '+escapeHtmlJs(blockerLabels.join(', '))+'</span>' : '';
  const verification = card.verificationCount ? '<span class="tag ready">'+escapeHtmlJs(card.verificationCount)+' check(s)</span>' : '';
  const scope = card.writeScopeCount ? '<span class="tag">'+escapeHtmlJs(card.writeScopeCount)+' file(s)</span>' : '';
  const title = displayWorkTitle(card.title, card.id);
  const technicalId = card.id && title !== card.id ? '<span class="muted">ID '+escapeHtmlJs(card.id)+'</span>' : '';
  return '<article class="kanban-card '+toneClass(card.status)+'"><div><div class="kanban-card-title">'+escapeHtmlJs(title)+'</div><div class="kanban-card-subrow">'+technicalId+'</div></div><div class="kanban-meta"><span class="tag">'+escapeHtmlJs(card.epicTitle || card.epicId || 'epic')+'</span><span class="tag claimed">'+escapeHtmlJs(card.agent || 'unassigned')+'</span><span class="tag">'+escapeHtmlJs(card.priority || 'normal')+'</span>'+blocker+verification+scope+'</div><div class="kanban-card-foot"><span class="muted">'+escapeHtmlJs(card.type || 'task')+'</span><button data-id="'+escapeHtmlJs(card.id)+'" onclick="selectItem(this.dataset.id)">Select</button></div></article>';
}
function renderItem(item){
  const id = item.itemId || item.id || 'unknown';
  const status = item.effectiveStatus || item.status || 'unknown';
  const title = displayWorkTitle(item.title || item.goal, id);
  const technicalId = title !== id ? '<span class="tag">ID '+escapeHtmlJs(id)+'</span>' : '';
  return '<article class="item"><div class="item-head"><div><span class="tag '+toneClass(status)+'">'+escapeHtmlJs(status)+'</span><strong>'+escapeHtmlJs(title)+'</strong> '+technicalId+'</div><button data-id="'+escapeHtmlJs(id)+'" onclick="selectItem(this.dataset.id)">Select</button></div><div class="muted">'+escapeHtmlJs((item.type || 'task') + formatOwner(item))+'</div></article>';
}
function selectItem(id){
  state.selectedItem = id;
  document.getElementById('contextItem').value = id;
  document.getElementById('actionItem').value = id;
  setBanner('ok', 'Selected ' + id);
}
function renderRun(data){
  const waves = data.waves || {};
  document.getElementById('runCards').innerHTML = [
    metric('Status', data.status || 'unknown', 'loop state', toneClass(data.status)),
    metric('Confidence', data.confidence == null ? 'unknown' : data.confidence, 'score', 'info'),
    metric('Next action', data.nextAction || 'inspect', 'runner handoff', 'ready'),
    metric('Stop reason', data.stopReason || 'none', 'blocker', data.stopReason ? 'warn' : 'ready')
  ].join('');
  document.getElementById('runDetails').innerHTML = '<div class="grid">' + [
    metric('Current wave', waves.currentWave && waves.currentWave.waveId ? waves.currentWave.waveId : 'none', 'execution wave', 'info'),
    metric('Reports', (data.reports || []).length, 'available', 'info'),
    metric('Gates', (data.gates || []).length, 'release checks', (data.gates || []).length ? 'warn' : 'ready')
  ].join('') + '</div>';
}
function renderIndexStatus(){
  const index = state.index || {};
  const cards = [index.codeRag, index.memory, index.codeGraph].filter(Boolean).map(function(item){
    return metric(item.label, statusLabel(item.status), item.message || item.nextAction || '', item.status);
  }).join('');
  document.getElementById('indexCards').innerHTML = cards || empty('Index status unavailable');
  const overall = index.overall || {};
  document.getElementById('overallPill').textContent = 'Index status: ' + (overall.status || 'unknown');
  renderIndexPanel('ragPanel', index.codeRag, ['files','chunks','languages','lastUpdate']);
  renderIndexPanel('memoryPanel', index.memory, ['entries','tags','types','lastUpdate']);
  renderIndexPanel('codeGraphPanel', index.codeGraph, ['symbols','edges','resolvedEdges','resolutionRate','lastUpdate']);
}
function renderIndexPanel(id, data, fields){
  const el = document.getElementById(id);
  if (!data) { el.innerHTML = empty('No data'); return; }
  state.maps[id] = data.map || { nodes: [], edges: [] };
  const metrics = fields.map(function(field){
    return metric(labelize(field), valueFor(data, field), field === 'resolutionRate' ? 'cross resolved' : '', data.status);
  }).join('');
  let detail = '';
  if (data.languages && data.languages.length) {
    if (data.label === 'Code RAG') {
      detail += '<h3>Languages</h3><table><thead><tr><th>Language</th><th>Files</th></tr></thead><tbody>' + data.languages.map(function(lang){
        return '<tr><td>'+escapeHtmlJs(lang.language)+'</td><td>'+escapeHtmlJs(lang.files)+'</td></tr>';
      }).join('') + '</tbody></table>';
    } else {
      detail += '<h3>Languages</h3><table><thead><tr><th>Language</th><th>Files</th><th>Symbols</th><th>Coverage</th></tr></thead><tbody>' + data.languages.map(function(lang){
        return '<tr><td>'+escapeHtmlJs(lang.language)+'</td><td>'+escapeHtmlJs(lang.files)+'</td><td>'+escapeHtmlJs(lang.filesWithSymbols == null ? '-' : lang.filesWithSymbols)+'</td><td>'+escapeHtmlJs(lang.coverage == null ? '-' : Math.round(lang.coverage * 100) + '%')+'</td></tr>';
      }).join('') + '</tbody></table>';
    }
  }
  if (data.byType && data.byType.length) {
    detail += '<h3>Memory types</h3><table><thead><tr><th>Type</th><th>Entries</th></tr></thead><tbody>' + data.byType.map(function(row){
      return '<tr><td>'+escapeHtmlJs(row.type)+'</td><td>'+escapeHtmlJs(row.n)+'</td></tr>';
    }).join('') + '</tbody></table>';
  }
  el.innerHTML = '<div class="index-layout"><div class="grid">'+metrics+'</div><div class="index-cards"><div class="item"><div class="status">State</div><h3>'+escapeHtmlJs(statusLabel(data.status))+'</h3><p>'+escapeHtmlJs(data.message || '')+'</p><p class="muted">'+escapeHtmlJs(data.nextAction || '')+'</p></div><div id="'+id+'Selection" class="item">'+nodeDetails((data.map && data.map.nodes && data.map.nodes[0]) || null)+'</div></div></div><div class="map-section">'+renderNetworkGraph(id, data.map, data.label)+'</div><div class="section-title"><h3>Details</h3><span class="muted">'+escapeHtmlJs((data.map && data.map.edges ? data.map.edges.length : 0) + ' relationship(s)')+'</span></div>'+detail;
}
function renderNetworkGraph(panelId, graph, label){
  if (!graph || !graph.nodes || graph.nodes.length === 0) return empty('No map data yet');
  const layout = layoutGraph(graph);
  const links = (graph.edges || []).map(function(edge){
    const a = layout.positions[edge.from];
    const b = layout.positions[edge.to];
    if (!a || !b) return '';
    const cls = edge.weight && edge.weight > 1 ? 'map-link strong' : 'map-link';
    return '<path class="'+cls+'" d="M '+a.x+' '+a.y+' C '+(a.x+90)+' '+a.y+', '+(b.x-90)+' '+b.y+', '+b.x+' '+b.y+'"><title>'+escapeHtmlJs(edge.label || edge.kind || 'relates')+'</title></path>';
  }).join('');
  const nodes = graph.nodes.map(function(node){
    const p = layout.positions[node.id];
    if (!p) return '';
    const radius = node.type === 'system' ? 20 : node.type === 'symbol' ? 15 : 14;
    const labelX = p.x + radius + 8;
    const sub = node.value == null ? '' : '<text class="node-sub" x="'+labelX+'" y="'+(p.y + 16)+'" text-anchor="start">'+escapeHtmlJs(compactValue(node.value))+'</text>';
    return '<g class="map-node '+escapeHtmlJs(node.type || 'item')+'" tabindex="0" role="button" onclick="selectMapNode(\\''+escapeJs(panelId)+'\\',\\''+escapeJs(node.id)+'\\')" transform="translate(0 0)"><circle cx="'+p.x+'" cy="'+p.y+'" r="'+radius+'"></circle><text x="'+labelX+'" y="'+(p.y + 3)+'" text-anchor="start">'+escapeHtmlJs(truncateLabel(node.label || node.id, 26))+'</text>'+sub+'<title>'+escapeHtmlJs(node.detail || node.label || node.id)+'</title></g>';
  }).join('');
  const legend = ['system','language','file','symbol','type','entry','tag'].filter(function(type){ return graph.nodes.some(function(node){ return node.type === type; }); }).map(function(type){
    return '<span class="legend-dot '+type+'">'+escapeHtmlJs(labelize(type))+'</span>';
  }).join('');
  return '<div class="map-wrap"><div class="map-head"><strong>'+escapeHtmlJs(label || graph.label || 'Relationship map')+'</strong><span>'+graph.nodes.length+' node(s), '+(graph.edges || []).length+' link(s)</span></div><div class="map-body"><div class="map-canvas"><svg class="map-svg" viewBox="0 0 '+layout.width+' '+layout.height+'" role="img" aria-label="'+escapeHtmlJs(label || 'relationship map')+'">'+links+nodes+'</svg></div><aside class="map-side"><div class="status">Selected node</div><div id="'+panelId+'Side">'+nodeDetails(graph.nodes[0])+'</div><div class="map-legend">'+legend+'</div></aside></div></div>';
}
function layoutGraph(graph){
  const columns = { system: [], group: [], leaf: [], other: [] };
  graph.nodes.forEach(function(node){
    if (node.type === 'system') columns.system.push(node);
    else if (['language','type','tag','kind'].includes(node.type)) columns.group.push(node);
    else if (['file','symbol','entry'].includes(node.type)) columns.leaf.push(node);
    else columns.other.push(node);
  });
  const maxRows = Math.max(columns.system.length, columns.group.length, columns.leaf.length, columns.other.length, 5);
  const height = Math.max(340, 90 + maxRows * 66);
  const width = 980;
  const x = { system: 80, group: 260, other: 500, leaf: 640 };
  const positions = {};
  Object.entries(columns).forEach(function(entry){
    const key = entry[0], nodes = entry[1];
    const top = key === 'system' ? 118 : 74;
    const step = key === 'system' || (key === 'group' && nodes.length <= 3) ? 72 : 66;
    nodes.forEach(function(node, index){ positions[node.id] = { x: x[key], y: Math.round(top + step * index) }; });
  });
  return { width, height, positions };
}
function selectMapNode(panelId, nodeId){
  const graph = state.maps[panelId];
  const node = graph && graph.nodes ? graph.nodes.find(function(item){ return item.id === nodeId; }) : null;
  const side = document.getElementById(panelId + 'Side');
  const duplicate = document.getElementById(panelId + 'Selection');
  if (side) side.innerHTML = nodeDetails(node);
  if (duplicate) duplicate.innerHTML = nodeDetails(node);
}
function nodeDetails(node){
  if (!node) return '<h3>No node selected</h3><p class="muted">Open a map and select a node.</p>';
  const value = node.value == null ? '' : '<p><span class="tag info">'+escapeHtmlJs(compactValue(node.value))+'</span></p>';
  return '<h3>'+escapeHtmlJs(node.label || node.id)+'</h3><p class="muted">'+escapeHtmlJs(labelize(node.type || 'node'))+'</p>'+value+'<p>'+escapeHtmlJs(node.detail || node.path || '')+'</p>';
}
function metric(label, value, hint, tone){
  return '<div class="metric '+toneClass(tone)+'"><span>'+escapeHtmlJs(label)+'</span><strong>'+escapeHtmlJs(value == null ? 'unknown' : value)+'</strong><span>'+escapeHtmlJs(hint || '')+'</span></div>';
}
function valueFor(data, field){
  if (field === 'languages') return data.languages ? data.languages.length : 0;
  if (field === 'types') return data.byType ? data.byType.length : 0;
  if (field === 'resolutionRate') return data.resolutionRate == null ? 'unknown' : Math.round(data.resolutionRate * 100) + '%';
  if (field === 'lastUpdate') return data.lastUpdate ? new Date(data.lastUpdate).toLocaleString() : 'none';
  return data[field];
}
function statusLabel(status){
  if (status === 'ready') return 'Ready';
  if (status === 'not_initialized') return 'Not initialized';
  if (status === 'unavailable') return 'Unavailable';
  if (status === 'empty') return 'Empty';
  if (status === 'error') return 'Error';
  return status || 'unknown';
}
function toneClass(value){
  const v = String(value || '').toLowerCase();
  if (v.includes('ready') || v.includes('done') || v.includes('complete') || v.includes('closed')) return 'ready';
  if (v.includes('blocked') || v.includes('error') || v.includes('fail')) return 'error';
  if (v.includes('defer') || v.includes('warn') || v.includes('unavailable') || v.includes('not_initialized')) return 'warn';
  if (v.includes('claim')) return 'claimed';
  return 'info';
}
function formatOwner(item){ return item.owner ? ' - owner: ' + item.owner : ''; }
function labelize(value){ return String(value).replace(/([A-Z])/g, ' $1').replace(/^./, function(ch){ return ch.toUpperCase(); }); }
function truncateLabel(value, max){ const s = String(value || ''); return s.length > max ? s.slice(0, max - 1) + '...' : s; }
function compactValue(value){ return typeof value === 'number' ? value.toLocaleString() : value; }
function displayWorkTitle(title, id){
  const value = String(title || '').trim();
  if (value) return value;
  return humanizeWorkId(id);
}
function humanizeWorkId(id){
  return String(id || 'work item')
    .replace(/^[A-Z]+[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\\b\\w/g, function(ch){ return ch.toUpperCase(); });
}
function escapeJs(value){
  const slash = String.fromCharCode(92);
  return String(value)
    .split(slash).join(slash + slash)
    .split("'").join(slash + "'")
    .split(String.fromCharCode(10)).join(slash + "n")
    .split(String.fromCharCode(13)).join("");
}
function empty(text){ return '<div class="empty">'+escapeHtmlJs(text)+'</div>'; }
function defaultFlowModel(){
  return {
    activeId: 'plan',
    steps: [
      { id: 'plan', label: 'Plan', state: 'current', active: true, hint: 'No graph loaded' },
      { id: 'atomize', label: 'Atomize', state: 'pending', hint: 'Waiting for graph' },
      { id: 'execute', label: 'Execute', state: 'pending', hint: 'Waiting for tasks' },
      { id: 'verify', label: 'Verify', state: 'pending', hint: 'Waiting for execution' },
      { id: 'close', label: 'Close', state: 'pending', hint: 'Waiting for verification' },
      { id: 'archive', label: 'Archive', state: 'pending', hint: 'Waiting for close' },
    ],
  };
}
function setFlow(model){
  const el = document.getElementById('flow');
  if (!el) return;
  const safeModel = normalizeFlowModel(model);
  state.flow = safeModel;
  el.innerHTML = safeModel.steps.map(renderFlowStep).join('');
}
function normalizeFlowModel(model){
  if (!model || !Array.isArray(model.steps)) return defaultFlowModel();
  const activeId = model.activeId || (model.steps.find(function(step){ return step.active; }) || {}).id || 'plan';
  return {
    activeId: activeId,
    steps: model.steps.map(function(step){
      const id = step.id || labelize(step.label || 'phase').toLowerCase();
      return {
        id: id,
        label: step.label || labelize(id),
        state: ['complete','current','pending','blocked'].includes(step.state) ? step.state : 'pending',
        active: Boolean(step.active || id === activeId),
        hint: step.hint || '',
      };
    }),
  };
}
function renderFlowStep(step){
  const classes = ['flow-step', step.state];
  const current = step.active ? ' aria-current="step"' : '';
  return '<div class="'+classes.join(' ')+'" data-phase="'+escapeHtmlJs(step.id)+'"'+current+'><strong>'+escapeHtmlJs(step.label)+'</strong><small>'+escapeHtmlJs(step.hint || step.state)+'</small></div>';
}
function setBanner(kind, message){
  const el = document.getElementById('banner');
  el.className = 'banner ' + (kind || '');
  el.textContent = message;
}
function setRaw(data){
  document.getElementById('output').textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}
function escapeHtmlJs(value){ return String(value).replace(/[&<>"']/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]; }); }
</script>
</body>
</html>`;
}

export function createKanbanModel({ graph = {}, index = [] } = {}) {
  const graphId = graph.graph_id || graph.graphId || graph.epicId || "work";
  const epicItems = index.filter((item) => item.type === "epic");
  const fallbackEpic = epicItems[0] || {
    itemId: graph.epicId || graphId,
    title: graph.title || graphId,
  };
  const epicById = new Map(epicItems.map((item) => [item.itemId || item.id, item]));
  const titleById = new Map(index.map((item) => {
    const id = item.itemId || item.id;
    return [id, workItemDisplayTitle(item, id)];
  }).filter(([id]) => id));
  if (!epicById.has(fallbackEpic.itemId)) epicById.set(fallbackEpic.itemId, fallbackEpic);
  const taskCards = index
    .filter((item) => item.type !== "epic")
    .map((item) => workItemToKanbanCard(item, graph, fallbackEpic, epicById, titleById));
  const columns = KANBAN_COLUMNS.map((column) => ({
    ...column,
    items: taskCards.filter((card) => card.column === column.id),
  }));
  const agents = [...taskCards.reduce((acc, card) => {
    const key = card.agent || "unassigned";
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map()).entries()]
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count || a.agent.localeCompare(b.agent));

  return {
    project: {
      graphId,
      title: graph.title || fallbackEpic.title || graphId,
      source: graph.source?.path || graph.sourcePath || null,
      totalTasks: taskCards.length,
    },
    epics: [...epicById.values()].map((epic) => ({
      id: epic.itemId || epic.id,
      title: epic.title || epic.goal || epic.itemId || epic.id,
      status: epic.effectiveStatus || epic.status || "summary",
    })),
    agents,
    columns,
  };
}

const KANBAN_COLUMNS = Object.freeze([
  { id: "ready", label: "Ready" },
  { id: "claimed", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "delegated", label: "Delegated" },
  { id: "deferred", label: "Deferred" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
]);

function workItemToKanbanCard(item, graph, fallbackEpic, epicById, titleById) {
  const id = item.itemId || item.id || "unknown";
  const epicId = item.epicId || item.parentEpicId || graph.epicId || graph.graph_id || graph.graphId || fallbackEpic.itemId;
  const epic = epicById.get(epicId) || fallbackEpic;
  const status = item.effectiveStatus || item.status || "ready";
  const blockedBy = normalizeBlockers(item.blockedBy || item.blocked_by || item.task?.dependencies || item.dependencies || []);
  return {
    id,
    title: workItemDisplayTitle(item, id),
    type: item.type || "task",
    status,
    column: kanbanColumnFor(item, status),
    epicId,
    epicTitle: epic?.title || epic?.goal || epicId,
    agent: item.owner || item.assignee || item.claims?.[0]?.agentId || item.task?.owner || null,
    priority: item.priority || item.severity || item.risk || "normal",
    blockedBy,
    blockedByLabels: blockedBy.map((blockedId) => titleById.get(blockedId) || humanizeWorkId(blockedId)),
    verificationCount: (item.verificationCommands || item.task?.verificationCommands || []).length,
    writeScopeCount: (item.writeScope || item.task?.writeScope || []).length,
  };
}

function workItemDisplayTitle(item, id) {
  return item?.title || item?.goal || item?.summary || humanizeWorkId(id);
}

function normalizeBlockers(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function humanizeWorkId(id) {
  return String(id || "work item")
    .replace(/^[A-Z]+[-_]/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function kanbanColumnFor(item, status) {
  if (item.type === "review" || item.type === "gate") return "review";
  if (status === "gate" || status === "stale") return "blocked";
  if (KANBAN_COLUMNS.some((column) => column.id === status)) return status;
  if (["complete", "completed", "closed"].includes(String(status).toLowerCase())) return "done";
  if (["open", "todo", "pending"].includes(String(status).toLowerCase())) return "ready";
  return "ready";
}

async function buildIndexStatus({ rootDir = process.cwd() } = {}) {
  const codeDbPath = resolve(rootDir, ".claude", "memory", "code.db");
  const memoryDbPath = resolve(rootDir, ".claude", "memory", "memory.db");
  const sqliteAvailable = hasNodeSqliteSupport();
  const result = {
    generatedAt: new Date().toISOString(),
    overall: { status: "unknown", ready: 0, total: 3 },
    codeRag: baseIndexState("Code RAG", codeDbPath),
    codeGraph: baseIndexState("CodeGraph", codeDbPath),
    memory: baseIndexState("Memory", memoryDbPath),
  };

  if (!sqliteAvailable) {
    const message = `Node.js ${SQLITE_NODE_MIN_VERSION}+ is required for node:sqlite. Current runtime: ${process.version}.`;
    result.codeRag = { ...result.codeRag, status: "unavailable", message, nextAction: "Upgrade Node.js and run npm run code:index." };
    result.codeGraph = { ...result.codeGraph, status: "unavailable", message, nextAction: "Upgrade Node.js and run npm run code:index." };
    result.memory = { ...result.memory, status: "unavailable", message, nextAction: "Upgrade Node.js and rebuild memory." };
    result.overall.status = "unavailable";
    return result;
  }

  if (!existsSync(codeDbPath)) {
    result.codeRag = {
      ...result.codeRag,
      status: "not_initialized",
      message: "No code.db found.",
      nextAction: "Run npm run code:index from the project root.",
    };
    result.codeGraph = {
      ...result.codeGraph,
      status: "not_initialized",
      message: "No code.db found.",
      nextAction: "Run npm run code:index from the project root.",
    };
  } else {
    const store = new CodeStore(rootDir, { useEmbeddings: false });
    try {
      await store.init();
      const stats = store.stats();
      const grammarHealth = store.getGrammarHealth();
      const maps = buildCodeIndexMaps(store, stats, grammarHealth);
      const lastUpdate = statSync(codeDbPath).mtime.toISOString();
      result.codeRag = {
        ...result.codeRag,
        status: stats.totalChunks > 0 ? "ready" : "empty",
        message: `${stats.totalFiles} file(s), ${stats.totalChunks} chunk(s).`,
        nextAction: stats.totalChunks > 0 ? "Code retrieval is available." : "Run npm run code:index to populate chunks.",
        files: stats.totalFiles,
        chunks: stats.totalChunks,
        languages: stats.byLang.map((row) => ({ language: row.language, files: row.n })),
        lastUpdate,
        map: maps.rag,
      };
      result.codeGraph = {
        ...result.codeGraph,
        status: stats.totalSymbols > 0 ? "ready" : "empty",
        message: `${stats.totalSymbols} symbol(s), ${stats.totalEdges} edge(s).`,
        nextAction: stats.totalSymbols > 0 ? "Code graph is available." : "Run npm run code:index and check grammar coverage.",
        symbols: stats.totalSymbols,
        edges: stats.totalEdges,
        resolvedEdges: stats.resolvedEdges,
        resolutionRate: stats.edgeResolutionRate,
        languages: grammarHealth,
        lastUpdate,
        map: maps.codeGraph,
      };
    } catch (error) {
      result.codeRag = { ...result.codeRag, status: "error", message: error.message, nextAction: "Run npm run code:index or inspect code.db." };
      result.codeGraph = { ...result.codeGraph, status: "error", message: error.message, nextAction: "Run npm run code:index or inspect grammar files." };
    } finally {
      store.close();
    }
  }

  if (!existsSync(memoryDbPath)) {
    result.memory = {
      ...result.memory,
      status: "not_initialized",
      message: "No memory.db found.",
      nextAction: "Add memory or run the memory indexing workflow.",
    };
  } else {
    const store = new MemoryStore(rootDir, { useEmbeddings: false });
    try {
      await store.init();
      const stats = store.stats();
      result.memory = {
        ...result.memory,
        status: stats.totalEntries > 0 ? "ready" : "empty",
        message: `${stats.totalEntries} memory ${plural(stats.totalEntries, "entry", "entries")}, ${stats.uniqueTags} ${plural(stats.uniqueTags, "tag", "tags")}.`,
        nextAction: stats.totalEntries > 0 ? "Project memory is available." : "Add project memory entries when decisions are made.",
        entries: stats.totalEntries,
        tags: stats.uniqueTags,
        byType: stats.byType,
        lastUpdate: statSync(memoryDbPath).mtime.toISOString(),
        map: buildMemoryIndexMap(store, stats),
      };
    } catch (error) {
      result.memory = { ...result.memory, status: "error", message: error.message, nextAction: "Inspect memory.db or rebuild memory." };
    } finally {
      store.close();
    }
  }

  const states = [result.codeRag, result.memory, result.codeGraph];
  result.overall.ready = states.filter((item) => item.status === "ready").length;
  result.overall.status = result.overall.ready === result.overall.total
    ? "ready"
    : states.some((item) => item.status === "error" || item.status === "unavailable")
      ? "needs_attention"
      : "partial";
  return result;
}

function baseIndexState(label, path) {
  return {
    label,
    status: "unknown",
    path,
    message: "Not checked yet.",
    nextAction: "Refresh status.",
    map: createRelationshipMap(label, [
      { id: mapId(label, "root"), label, type: "system", detail: path || "Index not checked yet." },
    ], []),
  };
}

function buildCodeIndexMaps(store, stats, grammarHealth = []) {
  const languageRows = stats.byLang || [];
  const fileRows = safeAll(store, `
    SELECT cf.path AS path, cf.language AS language, COUNT(cc.chunk_idx) AS chunks
    FROM code_files cf
    LEFT JOIN code_chunks cc ON cc.path = cf.path
    GROUP BY cf.path, cf.language
    ORDER BY chunks DESC, cf.path
    LIMIT 12
  `);
  const symbolRows = safeAll(store, `
    SELECT s.id AS id, s.name AS name, s.kind AS kind, s.path AS path, cf.language AS language,
           (SELECT COUNT(*) FROM code_edges WHERE from_id = s.id) AS outDegree,
           (SELECT COUNT(*) FROM code_edges WHERE to_id = s.id) AS inDegree
    FROM code_symbols s
    LEFT JOIN code_files cf ON cf.path = s.path
    ORDER BY (inDegree + outDegree) DESC, s.path, s.start_line
    LIMIT 14
  `);
  const topSymbolIds = new Set(symbolRows.map((row) => row.id));
  const edgeRows = safeAll(store, `
    SELECT from_id AS fromId, to_id AS toId, to_name AS toName, kind
    FROM code_edges
    ORDER BY kind, to_name
    LIMIT 250
  `).filter((edge) => topSymbolIds.has(edge.fromId) && edge.toId && topSymbolIds.has(edge.toId)).slice(0, 28);

  const ragNodes = [{ id: "rag", label: "Code RAG", type: "system", value: stats.totalChunks, detail: `${stats.totalFiles} indexed file(s), ${stats.totalChunks} chunk(s).` }];
  const ragEdges = [];
  for (const row of languageRows.slice(0, 8)) {
    const id = `rag:lang:${row.language}`;
    ragNodes.push({ id, label: row.language, type: "language", value: row.n, detail: `${row.n} indexed file(s).` });
    ragEdges.push({ from: "rag", to: id, label: "indexes" });
  }
  for (const row of fileRows) {
    const langId = `rag:lang:${row.language}`;
    const fileId = `rag:file:${row.path}`;
    ragNodes.push({ id: fileId, label: basename(row.path), type: "file", value: row.chunks, path: row.path, detail: `${row.path}: ${row.chunks} chunk(s).` });
    ragEdges.push({ from: langId, to: fileId, label: "chunks", weight: row.chunks });
  }

  const graphNodes = [{ id: "codegraph", label: "CodeGraph", type: "system", value: stats.totalSymbols, detail: `${stats.totalSymbols} symbol(s), ${stats.totalEdges} edge(s).` }];
  const graphEdges = [];
  for (const row of grammarHealth.slice(0, 8)) {
    const id = `cg:lang:${row.language}`;
    graphNodes.push({ id, label: row.language, type: "language", value: row.filesWithSymbols, detail: `${row.filesWithSymbols}/${row.files} file(s) with symbols.` });
    graphEdges.push({ from: "codegraph", to: id, label: "parses" });
  }
  for (const row of symbolRows) {
    const id = `cg:symbol:${row.id}`;
    const langId = `cg:lang:${row.language || "unknown"}`;
    graphNodes.push({ id, label: row.name, type: "symbol", value: row.inDegree + row.outDegree, path: row.path, detail: `${row.kind} in ${row.path}; in ${row.inDegree}, out ${row.outDegree}.` });
    if (graphNodes.some((node) => node.id === langId)) {
      graphEdges.push({ from: langId, to: id, label: "defines" });
    } else {
      graphEdges.push({ from: "codegraph", to: id, label: "defines" });
    }
  }
  for (const edge of edgeRows) {
    graphEdges.push({ from: `cg:symbol:${edge.fromId}`, to: `cg:symbol:${edge.toId}`, label: edge.kind, kind: edge.kind, weight: 2 });
  }

  return {
    rag: createRelationshipMap("Code RAG map", ragNodes, ragEdges),
    codeGraph: createRelationshipMap("CodeGraph map", graphNodes, graphEdges),
  };
}

function buildMemoryIndexMap(store, stats) {
  const entryRows = safeAll(store, `
    SELECT id, type, tags_csv AS tagsCsv, confidence, file, summary
    FROM entries
    ORDER BY date DESC, indexed_at DESC, id
    LIMIT 12
  `);
  const tagRows = safeAll(store, `
    SELECT tag, COUNT(*) AS n
    FROM tags
    GROUP BY tag
    ORDER BY n DESC, tag
    LIMIT 8
  `);
  const nodes = [{ id: "memory", label: "Memory", type: "system", value: stats.totalEntries, detail: `${stats.totalEntries} memory ${plural(stats.totalEntries, "entry", "entries")}, ${stats.uniqueTags} ${plural(stats.uniqueTags, "tag", "tags")}.` }];
  const edges = [];
  for (const row of stats.byType || []) {
    const id = `mem:type:${row.type}`;
    nodes.push({ id, label: row.type, type: "type", value: row.n, detail: `${row.n} ${row.type} ${plural(row.n, "entry", "entries")}.` });
    edges.push({ from: "memory", to: id, label: "groups" });
  }
  for (const row of tagRows) {
    const id = `mem:tag:${row.tag}`;
    nodes.push({ id, label: `#${row.tag}`, type: "tag", value: row.n, detail: `${row.n} tagged ${plural(row.n, "entry", "entries")}.` });
    edges.push({ from: "memory", to: id, label: "tags" });
  }
  for (const row of entryRows) {
    const id = `mem:entry:${row.id}`;
    nodes.push({ id, label: row.id, type: "entry", value: row.confidence, path: row.file, detail: `${row.summary || row.file || row.id}` });
    edges.push({ from: `mem:type:${row.type}`, to: id, label: "contains" });
    for (const tag of String(row.tagsCsv || "").split(",").filter(Boolean).slice(0, 3)) {
      const tagId = `mem:tag:${tag}`;
      if (nodes.some((node) => node.id === tagId)) edges.push({ from: tagId, to: id, label: "labels" });
    }
  }
  return createRelationshipMap("Memory map", nodes, edges);
}

function createRelationshipMap(label, nodes, edges) {
  const limitedNodes = nodes.slice(0, 32);
  const known = new Set(limitedNodes.map((node) => node.id));
  return {
    label,
    nodes: limitedNodes,
    edges: edges.filter((edge) => known.has(edge.from) && known.has(edge.to)).slice(0, 48),
  };
}

function safeAll(store, sql) {
  try {
    return store.db.prepare(sql).all();
  } catch {
    return [];
  }
}

function mapId(label, suffix) {
  return `${String(label || "index").toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${suffix}`;
}

function basename(path = "") {
  return String(path).split(/[\\/]/).pop() || path;
}

function plural(value, one, many) {
  return Number(value) === 1 ? one : many;
}

function resolveSafe(rootDir, file) {
  if (!file) throw new Error("graph file is required");
  const root = resolve(rootDir);
  const full = resolve(rootDir, file);
  if (!full.startsWith(root)) throw new Error("path escapes project root");
  return full;
}

function normalizeStateGraph(state = {}) {
  if (state.task_graph || state.taskGraph) return state.task_graph || state.taskGraph;
  const tasks = state.tasks || [];
  return {
    kind: "supervibe-work-item-graph",
    graph_id: state.epicId || state.epic_id || state.run_id || state.runId || "loop-state",
    title: state.title || state.request || state.run_id || "Loop state",
    items: [
      {
        itemId: state.epicId || state.epic_id || state.run_id || state.runId || "loop-state",
        type: "epic",
        status: state.status || "open",
        title: state.title || state.request || "Loop state",
      },
      ...tasks.map((task) => ({
        itemId: task.id,
        type: task.type || "task",
        status: task.status || "open",
        title: task.title || task.goal || task.id,
        writeScope: task.writeScope || [],
        acceptanceCriteria: task.acceptanceCriteria || task.acceptance || [],
        verificationCommands: task.verificationCommands || task.verification || [],
        policyRiskLevel: task.policyRiskLevel || task.risk,
      })),
    ],
    tasks: tasks.map((task) => ({
      id: task.id,
      status: task.status || "open",
      dependencies: task.dependencies || [],
      writeScope: task.writeScope || [],
      createdAt: task.createdAt || state.started_at || state.startedAt,
    })),
  };
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function readJsonFile(path) {
  return JSON.parse(stripBom(await readFile(path, "utf8")));
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function sendHtml(res, html) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(data, null, 2)}\n`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
