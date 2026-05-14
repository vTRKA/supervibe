import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  buildAgentRetrievalTelemetryReport,
  isStrictAgentRetrievalTelemetryPass,
  writeStrengtheningTasks,
} from "../scripts/lib/supervibe-agent-retrieval-telemetry.mjs";

const execFileAsync = promisify(execFile);

function healthyReviewerInvocations(agentId = "code-reviewer") {
  return Array.from({ length: 6 }, (_, index) => ({
    ts: `2026-05-12T00:00:0${index}.000Z`,
    agent_id: agentId,
    subject_type: "reviewer",
    task_summary: "review retrieval telemetry with cited evidence",
    confidence_score: 7.8,
    retrieval_enforcement: { schemaVersion: 1, evidenceLedger: "written", evidencePass: true },
    retrieval_policy: { memory: "mandatory", rag: "mandatory", codegraph: "mandatory" },
    subtool_usage: { memory: 1, rag: 1, codegraph: 1 },
    evidence_gate: { pass: true, score: 10 },
  }));
}

test("reviewer confidence telemetry is advisory and separate from strict retrieval health", () => {
  const invocations = healthyReviewerInvocations();
  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: invocations.map((entry) => ({
      taskId: entry.task_summary,
      agentId: entry.agent_id,
      gate: { pass: true, score: 10 },
    })),
    thresholds: { minSample: 5, confidence: 8.5 },
  });

  assert.equal(report.pass, true);
  assert.equal(report.maturityScore, 10);
  assert.equal(isStrictAgentRetrievalTelemetryPass(report), true);
  assert.equal(report.summary.retrievalStrengtheningTasks, 0);
  assert.equal(report.summary.advisoryStrengtheningTasks, 1);

  const advisoryTask = report.advisoryStrengtheningTasks[0];
  assert.equal(advisoryTask.category, "confidence");
  assert.equal(advisoryTask.role, "reviewer");
  assert.equal(advisoryTask.blocking, false);

  assert.ok(report.nonBlockingTelemetry.some((item) => item.code === "confidence-advisory-strengthening"));
  assert.ok(report.agents[0].recommendedActions.some((item) => item.category === "confidence" && item.blocking === false));
});

test("legacy skipped invocations are explicit non-blocking telemetry without score changes", () => {
  const invocations = Array.from({ length: 10 }, (_, index) => ({
    ts: `2026-05-12T00:00:${String(index).padStart(2, "0")}.000Z`,
    agent_id: `legacy-reviewer-${index}`,
    task_summary: "legacy reviewer invocation before retrieval enforcement",
    confidence_score: 8,
  }));

  const report = buildAgentRetrievalTelemetryReport({
    invocations,
    evidenceEntries: [],
    thresholds: { minSample: 5 },
  });

  assert.equal(report.pass, true);
  assert.equal(report.maturityScore, 10);
  assert.equal(isStrictAgentRetrievalTelemetryPass(report), true);
  assert.equal(report.summary.invocations, 0);
  assert.equal(report.summary.legacySkipped, 10);
  assert.equal(report.sampleStatus, "ready-no-post-enforcement-samples");

  const legacyTelemetry = report.nonBlockingTelemetry.find((item) => item.code === "legacy-invocations-skipped");
  assert.ok(legacyTelemetry);
  assert.equal(legacyTelemetry.blocking, false);
  assert.equal(legacyTelemetry.count, 10);
  assert.equal(legacyTelemetry.recoveryPolicy, "T0");
});

test("generated strengthening state carries T0 recovery policy and advisory split", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-reviewer-telemetry-"));
  try {
    const invocations = healthyReviewerInvocations("quality-gate-reviewer");
    const report = buildAgentRetrievalTelemetryReport({
      invocations,
      evidenceEntries: invocations.map((entry) => ({
        taskId: entry.task_summary,
        agentId: entry.agent_id,
        gate: { pass: true, score: 10 },
      })),
      thresholds: { minSample: 5, confidence: 8.5 },
    });

    const result = await writeStrengtheningTasks(report, { rootDir });
    const payload = JSON.parse(await readFile(result.outPath, "utf8"));

    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.generatedState.owner, "supervibe-runtime");
    assert.equal(payload.generatedState.recoveryPolicy.id, "T0");
    assert.equal(payload.generatedState.recoveryPolicy.generatedState, true);
    assert.match(payload.generatedState.recoveryPolicy.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(payload.retrievalTasks.length, 0);
    assert.equal(payload.advisoryTasks.length, 1);
    assert.equal(payload.advisoryTasks[0].blocking, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("memory health auto mode reports typed non-blocking maturity gaps with owner and expiry", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-memory-maturity-path-"));
  try {
    await writeFixture(rootDir, ".supervibe/memory/decisions/current.md", [
      "---",
      "id: current-memory-maturity",
      "type: decision",
      "date: 2026-05-12",
      "tags: [memory]",
      "agent: memory-curator",
      "confidence: 10",
      "---",
      "Memory health keeps source-backed entries current.",
    ].join("\n"));
    await writeFixture(rootDir, ".supervibe/artifacts/plans/runtime-plan.md", [
      "Decision: add source-backed memory entries for reviewer telemetry.",
      "Bug: thin memory should surface as a typed non-blocking gap before strict release.",
    ].join("\n"));

    const script = join(process.cwd(), "scripts", "supervibe-memory-health.mjs");
    const { stdout } = await execFileAsync(process.execPath, [
      script,
      "--root",
      rootDir,
      "--json",
      "--now",
      "2026-05-12T00:00:00.000Z",
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const report = JSON.parse(stdout);

    assert.equal(report.pass, true);
    assert.equal(report.qualityGate.status, "mature-with-non-blocking-gaps");
    assert.equal(report.memoryMaturity.status, "non-blocking-gaps");
    assert.ok(report.nonBlockingGaps.length >= 1);

    const gap = report.nonBlockingGaps[0];
    assert.equal(gap.blocking, false);
    assert.equal(gap.owner, "memory-curator");
    assert.equal(gap.recoveryPolicy, "T0");
    assert.match(gap.expiresAt, /^2026-05-26T00:00:00\.000Z$/);
    assert.equal(report.generatedState.recoveryPolicy.id, "T0");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

async function writeFixture(rootDir, relativePath, content) {
  const fullPath = join(rootDir, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${content}\n`, "utf8");
}
