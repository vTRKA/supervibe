import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  FLIGHT_RECORDER_PATH_FOR_TEST,
  logFlightRecorderEvent,
  readFlightRecorderEvents,
} from "../scripts/lib/agent-invocation-logger.mjs";

test("flight recorder writes redacted OTel-style task events", async () => {
  const rootDir = join(tmpdir(), `supervibe-flight-recorder-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  try {
    await mkdir(rootDir, { recursive: true });
    FLIGHT_RECORDER_PATH_FOR_TEST(join(rootDir, "flight-recorder.jsonl"));

    const record = await logFlightRecorderEvent({
      traceId: "trace-1",
      spanId: "span-1",
      agentId: "repo-researcher",
      taskId: "T9",
      skillId: "supervibe:executing-plans",
      modelClass: "frontier",
      toolClass: "filesystem-read",
      approvalState: "not-required",
      retrievalIds: ["memory:final-upgrade"],
      verificationCommands: ["node --test tests/agent-flight-recorder.test.mjs"],
      score: 9.4,
      outcome: "passed with token sk-test-secret",
    });

    assert.equal(record.redactionStatus, "redacted");
    assert.doesNotMatch(JSON.stringify(record), /sk-test-secret/);
    assert.equal(record.otel.name, "supervibe.agent.task");

    const events = await readFlightRecorderEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].taskId, "T9");
    assert.equal(events[0].toolClass, "filesystem-read");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
