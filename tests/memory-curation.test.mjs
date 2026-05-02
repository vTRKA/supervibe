import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  annotateMemorySearchResults,
  curateProjectMemory,
  formatMemoryCurationReport,
} from "../scripts/lib/supervibe-memory-curator.mjs";
import { searchMemory } from "../scripts/lib/memory-store.mjs";

const buildMemoryIndexScript = join(process.cwd(), "scripts", "build-memory-index.mjs");
const searchMemoryScript = join(process.cwd(), "scripts", "search-memory.mjs");

test("memory curator rebuilds markdown entries into searchable index", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-curation-"));
  const decisionsDir = join(rootDir, ".supervibe", "memory", "decisions");
  await mkdir(decisionsDir, { recursive: true });
  await writeFile(join(decisionsDir, "old-feedback.md"), [
    "---",
    "id: old-feedback-websocket",
    "type: decision",
    "date: 2024-01-01",
    "tags: [feedback, websocket]",
    "agent: test-agent",
    "confidence: 9",
    "---",
    "Feedback websocket used a legacy event envelope.",
  ].join("\n"), "utf8");
  await writeFile(join(decisionsDir, "new-feedback.md"), [
    "---",
    "id: feedback-websocket-v2",
    "type: decision",
    "date: 2026-05-01",
    "tags: [feedback, websocket]",
    "supersedes: [old-feedback-websocket]",
    "contradicts: [old-feedback-websocket]",
    "agent: test-agent",
    "confidence: 10",
    "---",
    "Feedback websocket now uses the reviewed v2 event envelope.",
  ].join("\n"), "utf8");

  const report = await curateProjectMemory({
    rootDir,
    now: "2026-05-01T00:00:00.000Z",
    rebuildSqlite: true,
    useEmbeddings: false,
  });

  assert.equal(report.pass, true, formatMemoryCurationReport(report));
  assert.equal(report.markdownEntries, 2, "memory markdown entry missing from searchable index");
  assert.equal(report.sqliteEntries, 2, "memory markdown entry missing from searchable index");
  assert.equal(report.lifecycle.byId["old-feedback-websocket"].freshness, "superseded");
  assert.equal(report.contradictions.length, 1);

  const results = await searchMemory(rootDir, { query: "feedback websocket", semantic: false });
  const annotated = annotateMemorySearchResults(results, report);
  assert.ok(annotated.some((entry) => entry.id === "feedback-websocket-v2"));
  assert.ok(annotated.some((entry) => entry.id === "old-feedback-websocket" && entry.stale));
});

test("memory search hides superseded entries by default and exposes them only as history", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-current-only-"));
  const decisionsDir = join(rootDir, ".supervibe", "memory", "decisions");
  await mkdir(decisionsDir, { recursive: true });
  await writeFile(join(decisionsDir, "old-feedback.md"), [
    "---",
    "id: old-feedback-websocket",
    "type: decision",
    "date: 2024-01-01",
    "tags: [feedback, websocket]",
    "agent: test-agent",
    "confidence: 9",
    "---",
    "Feedback websocket uses legacy event envelope.",
  ].join("\n"), "utf8");
  await writeFile(join(decisionsDir, "new-feedback.md"), [
    "---",
    "id: feedback-websocket-v2",
    "type: decision",
    "date: 2026-05-01",
    "tags: [feedback, websocket]",
    "supersedes: [old-feedback-websocket]",
    "agent: test-agent",
    "confidence: 10",
    "---",
    "Feedback websocket uses reviewed v2 event envelope.",
  ].join("\n"), "utf8");

  execFileSync(process.execPath, [buildMemoryIndexScript, "--now", "2026-05-01T00:00:00.000Z"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  const currentOnly = execFileSync(process.execPath, [searchMemoryScript, "--query", "feedback websocket", "--limit", "5"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  const withHistory = execFileSync(process.execPath, [searchMemoryScript, "--query", "feedback websocket", "--limit", "5", "--include-superseded"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  assert.match(currentOnly, /feedback-websocket-v2/);
  assert.doesNotMatch(currentOnly, /old-feedback-websocket/);
  assert.match(withHistory, /feedback-websocket-v2/);
  assert.match(withHistory, /old-feedback-websocket/);
  assert.match(withHistory, /Freshness: superseded \(stale\)/);
});

test("memory curator queues missing references and near-duplicate active entries", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-quality-"));
  const decisionsDir = join(rootDir, ".supervibe", "memory", "decisions");
  await mkdir(decisionsDir, { recursive: true });
  await mkdir(join(rootDir, "scripts"), { recursive: true });
  await writeFile(join(rootDir, "scripts", "existing.mjs"), "export const ok = true;\n", "utf8");
  await writeFile(join(decisionsDir, "checkout-a.md"), [
    "---",
    "id: checkout-token-budget-a",
    "type: decision",
    "date: 2026-05-01",
    "tags: [commands, validation]",
    "agent: test-agent",
    "confidence: 10",
    "---",
    "Checkout token budget keeps active context concise and cites `scripts/existing.mjs` plus `scripts/missing.mjs`.",
  ].join("\n"), "utf8");
  await writeFile(join(decisionsDir, "checkout-b.md"), [
    "---",
    "id: checkout-token-budget-b",
    "type: decision",
    "date: 2026-05-01",
    "tags: [commands, validation]",
    "agent: test-agent",
    "confidence: 10",
    "---",
    "Checkout token budget keeps active context concise and cites `scripts/existing.mjs` plus `scripts/missing.mjs`.",
  ].join("\n"), "utf8");

  const report = await curateProjectMemory({
    rootDir,
    now: "2026-05-01T00:00:00.000Z",
    rebuildSqlite: false,
  });

  assert.equal(report.referenceIssues.length, 2);
  assert.ok(report.referenceIssues.every((issue) => issue.reference === "scripts/missing.mjs"));
  assert.equal(report.duplicateCandidates.length, 1);
  assert.deepEqual(report.duplicateCandidates[0].ids, ["checkout-token-budget-a", "checkout-token-budget-b"]);
  assert.equal(report.lifecycle.candidateQueues.referenceReview.length, 2);
  assert.equal(report.lifecycle.candidateQueues.duplicateReview.length, 1);
  assert.match(formatMemoryCurationReport(report), /REF_MISSING: checkout-token-budget-a -> scripts\/missing\.mjs/);
  assert.match(formatMemoryCurationReport(report), /DUPLICATE: checkout-token-budget-a ~ checkout-token-budget-b/);
});
