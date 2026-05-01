import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProjectKnowledgeGraph,
  formatKnowledgeGraphSearch,
  queryProjectKnowledgeGraph,
} from "../scripts/lib/supervibe-project-knowledge-graph.mjs";

test("project knowledge graph links memory, files, symbols and temporal supersession", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-knowledge-graph-"));
  await mkdir(join(rootDir, ".claude", "memory", "decisions"), { recursive: true });
  await mkdir(join(rootDir, "scripts", "lib"), { recursive: true });
  await writeFile(join(rootDir, "scripts", "lib", "feedback.mjs"), "export function feedbackWebsocket() { return true; }\n", "utf8");
  await writeFile(join(rootDir, ".claude", "memory", "decisions", "old.md"), [
    "---",
    "id: feedback-websocket-v1",
    "type: decision",
    "date: 2025-01-01",
    "tags: [feedback, websocket]",
    "agent: test-agent",
    "confidence: 9",
    "---",
    "Old decision touches scripts/lib/feedback.mjs.",
  ].join("\n"), "utf8");
  await writeFile(join(rootDir, ".claude", "memory", "decisions", "new.md"), [
    "---",
    "id: feedback-websocket-v2",
    "type: decision",
    "date: 2026-05-01",
    "tags: [feedback, websocket]",
    "supersedes: [feedback-websocket-v1]",
    "contradicts: [feedback-websocket-v1]",
    "agent: test-agent",
    "confidence: 10",
    "---",
    "New decision updates scripts/lib/feedback.mjs and symbol feedbackWebsocket.",
  ].join("\n"), "utf8");

  const graph = await buildProjectKnowledgeGraph({ rootDir, now: "2026-05-01T00:00:00.000Z" });

  assert.ok(graph.nodes.some((node) => node.id === "memory:feedback-websocket-v2"), "knowledge graph missing decision, symbol, task, agent or supersession edge");
  assert.ok(graph.nodes.some((node) => node.id.includes("feedbackWebsocket")), "knowledge graph missing decision, symbol, task, agent or supersession edge");
  assert.ok(graph.edges.some((edge) => edge.type === "supersedes"), "knowledge graph missing decision, symbol, task, agent or supersession edge");
  assert.ok(graph.edges.some((edge) => edge.type === "contradicts"), "knowledge graph missing decision, symbol, task, agent or supersession edge");

  const current = queryProjectKnowledgeGraph(graph, { query: "feedback websocket", includeHistory: false });
  const history = queryProjectKnowledgeGraph(graph, { query: "feedback websocket", includeHistory: true });
  assert.ok(history.nodes.length >= current.nodes.length);
  assert.match(formatKnowledgeGraphSearch(graph, { query: "feedback websocket", includeHistory: true }), /SUPERVIBE_PROJECT_KNOWLEDGE_GRAPH/);
});
