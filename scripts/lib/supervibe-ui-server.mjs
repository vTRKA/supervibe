import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createWorkItemIndex, groupWorkItemsByStatus } from "./supervibe-work-item-query.mjs";
import { mutateWorkItemGraphFile } from "./supervibe-work-item-actions.mjs";
import { buildContextPack } from "./supervibe-context-pack.mjs";
import { scanWorkItemGc } from "./supervibe-work-item-gc.mjs";
import { buildExecutionWaves } from "./supervibe-wave-controller.mjs";
import { buildRunDashboardModel } from "./supervibe-run-dashboard.mjs";
import { createRecurringWorkReport, createSlaReport, renderWorkReportMarkdown } from "./supervibe-work-item-sla-reports.mjs";

export function createSupervibeUiServer({
  rootDir = process.cwd(),
  graphPath = null,
  token = randomBytes(16).toString("hex"),
} = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname === "/") return sendHtml(res, renderSupervibeUiHtml({ token, graphPath }));
      if (url.pathname === "/api/graph") {
        const file = resolveSafe(rootDir, url.searchParams.get("file") || graphPath);
        const graph = JSON.parse(await readFile(file, "utf8"));
        const index = createWorkItemIndex({ graph, claims: graph.claims || [], gates: graph.gates || [], evidence: graph.evidence || [] });
        return sendJson(res, { graphPath: file, graphId: graph.graph_id || graph.graphId || graph.epicId, title: graph.title, grouped: groupWorkItemsByStatus(index), items: index });
      }
      if (url.pathname === "/api/context-pack") {
        const file = resolveSafe(rootDir, url.searchParams.get("file") || graphPath);
        const pack = await buildContextPack({ rootDir, graphPath: file, itemId: url.searchParams.get("item") || null });
        return sendJson(res, pack);
      }
      if (url.pathname === "/api/run") {
        const file = resolveSafe(rootDir, url.searchParams.get("file"));
        const state = JSON.parse(await readFile(file, "utf8"));
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
        });
      }
      if (url.pathname === "/api/report") {
        const file = resolveSafe(rootDir, url.searchParams.get("file") || graphPath);
        const type = url.searchParams.get("type") || "sla";
        const graph = JSON.parse(await readFile(file, "utf8"));
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
        assertToken(req, token);
        const body = await readJsonBody(req);
        const file = resolveSafe(rootDir, body.file || graphPath);
        const result = await mutateWorkItemGraphFile(file, { ...body, dryRun: body.apply !== true });
        return sendJson(res, result);
      }
      return sendJson(res, { error: "not found" }, 404);
    } catch (err) {
      return sendJson(res, { error: err.message }, 400);
    }
  });
  return { server, token };
}

export function renderSupervibeUiHtml({ token, graphPath = "" } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Supervibe Control Plane</title>
  <style>
    body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;background:#f6f7f8;color:#202124}
    header{background:#123c3a;color:#fff;padding:18px 22px}
    main{display:grid;grid-template-columns:320px 1fr;gap:14px;padding:14px}
    section{background:#fff;border:1px solid #d9dee3;border-radius:8px;padding:12px}
    input,select,button,textarea{font:inherit} input,textarea{width:100%;box-sizing:border-box}
    button{border:1px solid #9aa5b1;background:#fff;border-radius:6px;padding:6px 9px;cursor:pointer}
    button.primary{background:#145c58;color:#fff;border-color:#145c58}
    .item{border:1px solid #d9dee3;border-radius:6px;padding:8px;margin:8px 0}
    .flow{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin:8px 0 14px}
    .flow span{border:1px solid #d9dee3;border-radius:6px;padding:6px;font-size:12px;text-align:center;background:#f8faf9}
    .flow span.active{border-color:#145c58;background:#e6f2ef;color:#123c3a;font-weight:700}
    .status{font-size:12px;text-transform:uppercase;color:#5f6b76}
    pre{white-space:pre-wrap;background:#f1f3f4;border-radius:6px;padding:10px;max-height:420px;overflow:auto}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
  </style>
</head>
<body>
  <header><h1>Supervibe Control Plane</h1><div>Local-first task, epic, context, and GC visibility</div></header>
  <main>
    <section>
      <h2>Flow</h2>
      <div class="flow" id="flow"><span class="active">PRD/Plan</span><span>Atomize</span><span>Execute</span><span>Verify</span><span>Close</span><span>Archive</span></div>
      <h2>Graph</h2>
      <input id="graphPath" value="${escapeHtml(graphPath || "")}" placeholder=".claude/memory/work-items/<epic>/graph.json">
      <p><button class="primary" onclick="loadGraph()">Load</button> <button onclick="loadGc()">GC Preview</button></p>
      <h3>Context Pack</h3>
      <input id="contextItem" placeholder="item id">
      <p><button onclick="loadContext()">Preview Context</button></p>
      <h3>Loop State</h3>
      <input id="statePath" placeholder=".claude/memory/loops/<run-id>/state.json">
      <p><button onclick="loadRun()">Load Run</button> <button onclick="loadReport()">SLA Report</button></p>
      <h3>Action</h3>
      <input id="actionItem" placeholder="item id">
      <select id="actionType"><option>claim</option><option>defer</option><option>close</option><option>reopen</option></select>
      <input id="actionUntil" placeholder="until ISO for defer">
      <textarea id="actionReason" placeholder="reason"></textarea>
      <p><button onclick="previewAction()">Preview</button> <button class="primary" onclick="applyAction()">Apply Local</button></p>
    </section>
    <section>
      <h2>Status</h2>
      <div class="status">Next Action / Confidence</div>
      <div id="runCards" class="grid"></div>
      <div id="summary" class="grid"></div>
      <h2>Items</h2>
      <div id="items"></div>
      <h2>Output</h2>
      <pre id="output">Load a graph to start.</pre>
    </section>
  </main>
<script>
const token = ${JSON.stringify(token)};
function graphFile(){ return document.getElementById('graphPath').value; }
async function loadGraph(){
  const res = await fetch('/api/graph?file=' + encodeURIComponent(graphFile()));
  const data = await res.json();
  document.getElementById('output').textContent = JSON.stringify(data, null, 2);
  document.getElementById('runCards').innerHTML = '';
  setFlow('Atomize');
  const g = data.grouped || {};
  document.getElementById('summary').innerHTML = ['ready','blocked','claimed','deferred','review','done'].map(k => '<div class="item"><div class="status">'+k+'</div><strong>'+(g[k]?.length||0)+'</strong></div>').join('');
  document.getElementById('items').innerHTML = (data.items || []).map(item => '<div class="item"><div class="status">'+(item.effectiveStatus||item.status||'unknown')+'</div><strong>'+item.itemId+'</strong> '+escapeHtmlJs(item.title||'')+'<br><button onclick="setItem(\\''+item.itemId+'\\')">select</button></div>').join('');
}
async function loadContext(){
  const res = await fetch('/api/context-pack?file=' + encodeURIComponent(graphFile()) + '&item=' + encodeURIComponent(document.getElementById('contextItem').value));
  const data = await res.json();
  document.getElementById('output').textContent = data.markdown || JSON.stringify(data, null, 2);
}
async function loadGc(){
  const res = await fetch('/api/gc');
  document.getElementById('output').textContent = JSON.stringify(await res.json(), null, 2);
}
async function loadRun(){
  const res = await fetch('/api/run?file=' + encodeURIComponent(document.getElementById('statePath').value));
  const data = await res.json();
  document.getElementById('output').textContent = JSON.stringify(data, null, 2);
  const w = data.waves || {};
  setFlow(data.status === 'COMPLETE' ? 'Close' : 'Execute');
  document.getElementById('runCards').innerHTML = ['status','confidence','nextAction','stopReason'].map(k => '<div class="item"><div class="status">'+k+'</div><strong>'+summaryValue(k, data, w)+'</strong></div>').join('');
  document.getElementById('summary').innerHTML = ['currentWave','reports','gates'].map(k => '<div class="item"><div class="status">'+k+'</div><strong>'+summaryValue(k, data, w)+'</strong></div>').join('');
  document.getElementById('items').innerHTML = (data.tasks || []).map(task => '<div class="item"><div class="status">'+(task.status||'unknown')+'</div><strong>'+task.id+'</strong> '+escapeHtmlJs(task.title||task.goal||'')+'</div>').join('');
}
async function loadReport(){
  const res = await fetch('/api/report?file=' + encodeURIComponent(graphFile()) + '&type=sla');
  const data = await res.json();
  document.getElementById('output').textContent = data.markdown || JSON.stringify(data, null, 2);
}
function setItem(id){ document.getElementById('contextItem').value=id; document.getElementById('actionItem').value=id; }
async function sendAction(apply){
  const body = { file: graphFile(), itemId: document.getElementById('actionItem').value, type: document.getElementById('actionType').value, until: document.getElementById('actionUntil').value, reason: document.getElementById('actionReason').value, actor: 'ui-user', apply };
  const res = await fetch('/api/action', {method:'POST', headers:{'content-type':'application/json','x-supervibe-ui-token':token}, body: JSON.stringify(body)});
  document.getElementById('output').textContent = JSON.stringify(await res.json(), null, 2);
  if (apply) loadGraph();
}
function previewAction(){ sendAction(false); }
function applyAction(){ sendAction(true); }
function summaryValue(k, data, waves){
  if (k === 'status') return data.status || 'unknown';
  if (k === 'confidence') return data.confidence ?? data.dashboard?.observability?.confidenceTrend?.slice(-1)?.[0]?.score ?? 'unknown';
  if (k === 'nextAction') return data.nextAction || 'inspect status';
  if (k === 'stopReason') return data.stopReason || 'none';
  if (k === 'currentWave') return waves.currentWave?.waveId || 'none';
  if (k === 'reports') return (data.reports || []).length;
  if (k === 'gates') return (data.gates || []).length;
  return '';
}
function setFlow(active){
  const labels = ['PRD/Plan','Atomize','Execute','Verify','Close','Archive'];
  document.getElementById('flow').innerHTML = labels.map(label => '<span class="'+(label===active?'active':'')+'">'+label+'</span>').join('');
}
function escapeHtmlJs(s){ return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
</script>
</body>
</html>`;
}

function resolveSafe(rootDir, file) {
  if (!file) throw new Error("graph file is required");
  const root = resolve(rootDir);
  const full = resolve(rootDir, file);
  if (!full.startsWith(root)) throw new Error("path escapes project root");
  return full;
}

function assertToken(req, token) {
  if (req.headers["x-supervibe-ui-token"] !== token) throw new Error("missing or invalid UI token");
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
