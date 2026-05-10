import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  rebuildAgentTrendLogs,
  formatAgentTrendLogReport,
} from "../scripts/rebuild-agent-trend-logs.mjs";

test("agent trend log rebuild materializes effectiveness and confidence logs", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-agent-trends-"));
  try {
    const memoryDir = join(rootDir, ".supervibe", "memory");
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, "agent-invocations.jsonl"), [
      JSON.stringify({
        ts: "2026-05-06T00:00:00.000Z",
        invocation_id: "host-1",
        agent_id: "repo-researcher",
        task_summary: "Map retrieval telemetry",
        confidence_score: 9,
        confidence_details: {
          readinessScore: 10,
          riskPenalty: 1,
          finalScore: 9,
          status: "pass",
        },
        retrieval_enforcement: { schemaVersion: 1 },
        structured_output: { json: ".supervibe/artifacts/_agent-outputs/host-1/agent-output.json" },
      }),
      JSON.stringify({
        ts: "2026-05-06T00:01:00.000Z",
        invocation_id: "host-2",
        agent_id: "quality-gate-reviewer",
        task_summary: "Review missing evidence",
        confidence_score: 8,
      }),
    ].join("\n") + "\n", "utf8");

    const report = await rebuildAgentTrendLogs({ rootDir, now: "2026-05-06T00:02:00.000Z" });
    assert.equal(report.pass, true, formatAgentTrendLogReport(report));
    assert.equal(report.effectivenessEntries, 2);
    assert.equal(report.confidenceEntries, 2);

    const effectiveness = (await readFile(join(memoryDir, "effectiveness.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    const confidence = (await readFile(join(rootDir, ".supervibe", "confidence-log.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(effectiveness[0].outcome, "success");
    assert.equal(effectiveness[1].blockers.includes("legacy-pre-enforcement"), true);
    assert.equal(confidence[0].gate, "pass");
    assert.equal(confidence[0].confidenceDetails.finalScore, 9);
    assert.equal(confidence[1].gate, "review");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
