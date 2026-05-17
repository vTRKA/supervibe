import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SEARCH_MEMORY = join(process.cwd(), "scripts", "search-memory.mjs");

test("search-memory --graph warns when direct search misses but knowledge graph has matches", () => {
  const root = mkdtempSync(join(tmpdir(), "supervibe-memory-graph-fallback-"));
  const dir = join(root, ".supervibe", "memory", "decisions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fast-loop-context.md"), [
    "---",
    "id: fast-loop-context",
    "type: decision",
    "date: 2026-05-17",
    "tags: [fast-loop, graph-start, receipt-policy]",
    "agent: codex",
    "confidence: 10",
    "freshness: fresh",
    "relationships: []",
    "---",
    "Decision references scripts/supervibe-loop.mjs without relying on direct sqlite search.",
    "",
  ].join("\n"), "utf8");

  const output = execFileSync(process.execPath, [
    SEARCH_MEMORY,
    "--query", "fast-loop",
    "--graph",
    "--limit", "1",
    "--busy-timeout-ms", "1000",
  ], { cwd: root, encoding: "utf8" });

  assert.match(output, /SUPERVIBE_PROJECT_KNOWLEDGE_GRAPH/);
  assert.match(output, /MEMORY_SEARCH_GRAPH_FALLBACK/);
  assert.match(output, /DIRECT_MATCHES: 0/);
  assert.match(output, /GRAPH_MATCHED_NODES: [1-9]/);
  assert.match(output, /No memory entries matched./);
  assert.match(output, /direct memory search missed, but graph context exists/);
  assert.doesNotMatch(output, /your task may be novel territory/);
});
