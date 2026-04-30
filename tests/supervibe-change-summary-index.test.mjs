import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  activeChangeSummaries,
  appendChangeSummary,
  compactChangeSummaries,
  createChangeSummary,
  formatChangeSummaryReport,
  readChangeSummaries,
} from "../scripts/lib/supervibe-change-summary-index.mjs";

test("change summaries record what changed, why, evidence, and verification without secrets", () => {
  const summary = createChangeSummary({
    taskId: "task-1",
    filePath: "src/auth.ts",
    summary: "Added token=abcdefghijklmnopqrstuvwxyz handling",
    why: "Preserve login behavior",
    preserve: ["No raw password logs"],
    evidenceRefs: ["tests/auth.test.ts"],
    verificationRefs: ["npm test -- auth"],
    commit: "abc123",
  });

  assert.equal(summary.taskId, "task-1");
  assert.equal(summary.filePath, "src/auth.ts");
  assert.equal(JSON.stringify(summary).includes("abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(summary.accepted, true);
  assert.equal(summary.speculative, false);
});

test("change summary JSONL dedupes and keeps rejected summaries out of active context", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-change-summary-"));
  const ledgerPath = join(rootDir, "summaries.jsonl");
  const first = await appendChangeSummary(ledgerPath, {
    taskId: "task-1",
    filePath: "src/a.ts",
    summary: "Changed parser",
    why: "Fix edge case",
    evidenceRefs: ["evidence"],
    verificationRefs: ["npm test -- a"],
  });
  await appendChangeSummary(ledgerPath, { ...first });
  await appendChangeSummary(ledgerPath, {
    taskId: "task-2",
    filePath: "src/a.ts",
    summary: "Speculative future cleanup",
    accepted: false,
    speculative: true,
  });
  const summaries = await readChangeSummaries(ledgerPath);
  const compacted = compactChangeSummaries(summaries);
  const active = activeChangeSummaries(compacted);

  assert.equal(summaries.length, 3);
  assert.equal(compacted.length, 2);
  assert.equal(active.length, 1);
  assert.equal(active[0].summaryId, first.summaryId);
  assert.match(formatChangeSummaryReport(compacted), /ACTIVE: 1/);
});
