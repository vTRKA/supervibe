import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  GRAPH_EXPORT_FORMATS,
  createGraphInspection,
  exportGraph,
  renderDot,
  renderMermaid,
  renderText,
} from "../scripts/lib/autonomous-loop-graph-export.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const state = {
  run_id: "loop-graph",
  status: "PARTIAL",
  tasks: [
    { id: "t1", goal: "Done", status: "complete", dependencies: [] },
    { id: "t2", goal: "Ready next", status: "open", dependencies: ["t1"], requeueReason: "verification_failed" },
    { id: "t3", goal: "Blocked later", status: "open", dependencies: ["t2"] },
  ],
  scores: [{ taskId: "t1", finalScore: 10 }],
  claims: [{ taskId: "t2", claimId: "claim-t2", status: "active" }],
  gates: [{ taskId: "t2", gateId: "gate-t2", status: "open" }],
  preflight: { max_concurrent_agents: 2 },
};

test("graph inspection overlays status, score, claim, gate, and ready front", () => {
  const inspection = createGraphInspection(state);
  const t2 = inspection.nodes.find((node) => node.id === "t2");

  assert.deepEqual(inspection.edges, [
    { from: "t1", to: "t2", type: "depends-on" },
    { from: "t2", to: "t3", type: "depends-on" },
  ]);
  assert.equal(t2.ready, true);
  assert.equal(t2.claim.claimId, "claim-t2");
  assert.equal(t2.gates[0].gateId, "gate-t2");
  assert.equal(t2.requeueReason, "verification_failed");
});

test("graph export renders json, mermaid, dot, and text deterministically", () => {
  const json = JSON.parse(exportGraph(state, { format: "json" }));
  assert.equal(json.graphId, "loop-graph");

  const mermaid = exportGraph(state, { format: "mermaid" });
  assert.ok(GRAPH_EXPORT_FORMATS.includes("mermaid"));
  assert.match(mermaid, /^flowchart TD/m);
  assert.match(mermaid, /n_t1 --> n_t2/);
  assert.equal(renderMermaid(createGraphInspection(state)), mermaid);

  const dot = exportGraph(state, { format: "dot" });
  assert.match(dot, /^digraph "loop-graph"/);
  assert.match(dot, /"t1" -> "t2";/);
  assert.equal(renderDot(createGraphInspection(state)), dot);

  const text = exportGraph(state, { format: "text" });
  assert.match(text, /Ready: t2/);
  assert.match(text, />> t2 \[open\] Ready next/);
  assert.match(text, /score=none claim=claim-t2 gates=1 requeue=verification_failed/);
  assert.equal(renderText(createGraphInspection(state)), text);
});

test("loop CLI graph command reads state and prints selected format", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-graph-cli-"));
  const statePath = join(dir, "state.json");
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "graph",
    "--file",
    statePath,
    "--format",
    "dot",
  ], { cwd: ROOT });

  assert.match(stdout, /^digraph "loop-graph"/);
  assert.match(stdout, /"t1" -> "t2";/);
});
