import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compactClosedWorkItems,
  diagnoseCompactedMemory,
  extractDurableLearningsFromRun,
  extractDurableLearningsFromRecords,
  extractDurableLearningsFromText,
} from "../scripts/lib/autonomous-loop-learning-extractor.mjs";
import { diagnoseLoopRun } from "../scripts/lib/autonomous-loop-doctor.mjs";

async function tempRunDir(name) {
  return await mkdtemp(join(tmpdir(), `supervibe-${name}-`));
}

test("extractor keeps durable learnings and rejects secrets, prompts, stack traces, and speculation", async () => {
  const runDir = await tempRunDir("learnings");
  await writeFile(join(runDir, "progress.md"), [
    "LEARNING: repo convention: Run `npm test -- tests/foo.test.mjs` before marking docs tasks complete.",
    "GOTCHA: provider permissions missing should become a blocked state with a next safe action.",
    "RAW PROMPT: user pasted api_key=secret-value-that-must-not-ship",
    "Maybe rewrite all tests later.",
    "Error: one-off stack trace",
    "    at Object.fn (file.js:1:1)",
  ].join("\n"), "utf8");
  await writeFile(join(runDir, "final-report.md"), "VERIFIED COMMAND: npm run validate:plan-artifacts\n", "utf8");
  await writeFile(join(runDir, "failure-packets.jsonl"), [
    JSON.stringify({ taskId: "a", requeueReason: "provider_permission_missing", summary: "BLOCKER: MCP approval missing for tracker sync" }),
    JSON.stringify({ taskId: "b", requeueReason: "provider_permission_missing" }),
  ].join("\n"), "utf8");

  const result = await extractDurableLearningsFromRun(runDir);
  const inline = extractDurableLearningsFromText("TEST CONVENTION: Keep docs regression tests exact.", { source: "inline" });
  const fromRecords = extractDurableLearningsFromRecords([{ type: "gotcha", summary: "GOTCHA: Tracker sync can fall back to native graph." }]);
  const summaries = result.candidates.map((candidate) => candidate.summary).join("\n");

  assert.match(summaries, /Run `npm test -- tests\/foo\.test\.mjs`/);
  assert.match(summaries, /provider permissions missing/);
  assert.match(summaries, /npm run validate:plan-artifacts/);
  assert.match(summaries, /Recurring blocker: provider_permission_missing/);
  assert.doesNotMatch(summaries, /secret-value/);
  assert.doesNotMatch(summaries, /RAW PROMPT/);
  assert.equal(inline.candidates[0].type, "test-convention");
  assert.equal(fromRecords.candidates[0].type, "integration-gotcha");
  assert.ok(result.rejected.some((item) => item.reason === "sensitive-content"));
  assert.ok(result.rejected.some((item) => item.reason === "unresolved-speculation"));
});

test("closed work compaction preserves evidence and leaves open blockers uncompressed", async () => {
  const summary = compactClosedWorkItems({
    graph: {
      tasks: [
        { id: "t1", title: "Docs sync", status: "complete", evidence: ["final-report.md"] },
        { id: "t2", title: "Provider access", status: "blocked", blockedBy: ["approval"] },
      ],
    },
    evidenceIndex: {
      attempts: [{ taskId: "t1", outputPath: "attempts/a1.txt", verificationEvidence: ["npm test"] }],
    },
    commits: [{ taskId: "t1", sha: "abc123" }],
    rollbackNotes: [{ taskId: "t1", note: "Revert README section only" }],
  });

  assert.equal(summary.closedSummaries.length, 1);
  assert.equal(summary.openItems.length, 1);
  assert.deepEqual(summary.closedSummaries[0].evidencePaths.sort(), ["attempts/a1.txt", "final-report.md", "npm test"].sort());
  assert.deepEqual(summary.closedSummaries[0].commits, ["abc123"]);
  assert.equal(summary.openItems[0].taskId, "t2");
});

test("compacted memory doctor flags stale evidence links", async () => {
  const runDir = await tempRunDir("memory-doctor");
  await writeFile(join(runDir, "state.json"), JSON.stringify({ schema_version: 1, tasks: [] }), "utf8");
  await writeFile(join(runDir, "tasks.jsonl"), "", "utf8");
  await writeFile(join(runDir, "scores.jsonl"), "", "utf8");
  await writeFile(join(runDir, "side-effects.jsonl"), "", "utf8");
  await writeFile(join(runDir, "progress.md"), "# Progress\n", "utf8");
  await writeFile(join(runDir, "final-report.md"), "# Report\n", "utf8");
  await writeFile(join(runDir, "compacted-summary.json"), JSON.stringify({
    closedSummaries: [{ taskId: "t1", title: "Done", evidencePaths: ["missing-evidence.txt"] }],
  }, null, 2), "utf8");

  const direct = await diagnoseCompactedMemory({
    closedSummaries: [{ taskId: "t1", evidencePaths: ["missing-evidence.txt"] }],
  }, { rootDir: runDir });
  assert.equal(direct.ok, false);
  assert.equal(direct.issues[0].code, "stale-memory-summary");

  const doctor = await diagnoseLoopRun(runDir);
  assert.ok(doctor.issues.some((issue) => issue.code === "stale-memory-summary"));
});
