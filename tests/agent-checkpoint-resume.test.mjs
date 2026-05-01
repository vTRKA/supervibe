import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkpointDiagnostics,
  createAgentCheckpoint,
  formatCheckpointDiagnostics,
  resumeAgentCheckpoint,
  writeAgentCheckpoint,
} from "../scripts/lib/supervibe-agent-checkpoints.mjs";

test("checkpoint validation requires retrieval policy, evidence IDs and next safe action", () => {
  const checkpoint = createAgentCheckpoint({
    taskId: "T32",
    selectedAgent: "worker",
    retrievalPolicy: { memory: "mandatory", rag: "mandatory", codegraph: "mandatory" },
    ragChunkIds: ["chunk-1"],
    verificationCommands: ["node --test"],
  });

  assert.equal(checkpoint.validation.pass, false, "checkpoint missing retrieval policy, evidence IDs or next safe action");
  assert.match(checkpoint.validation.failures.join("\n"), /checkpoint missing retrieval policy, evidence IDs or next safe action/);
});

test("checkpoint resume revalidates stale context and blocks repeated side effects", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-checkpoints-"));
  const checkpoint = await writeAgentCheckpoint({
    taskId: "T32",
    userIntent: "continue remediation",
    selectedAgent: "worker",
    retrievalPolicy: { memory: "mandatory", rag: "mandatory", codegraph: "mandatory", reason: "implementation task" },
    memoryIds: ["memory-1"],
    ragChunkIds: ["chunk-1"],
    graphSymbols: ["writeAgentCheckpoint"],
    completedSideEffects: [{ id: "write-files", command: "apply_patch", approved: true, ledgerId: "evidence-1" }],
    verificationCommands: ["node --test tests/agent-checkpoint-resume.test.mjs"],
    nextSafeAction: "run verification",
    contextGeneratedAt: "2026-05-01T00:00:00.000Z",
  }, { rootDir });

  assert.equal(checkpoint.validation.pass, true);
  const staleResume = resumeAgentCheckpoint(checkpoint, {
    now: "2026-05-02T00:00:00.000Z",
    maxContextAgeMinutes: 60,
  });
  assert.equal(staleResume.pass, false);
  assert.equal(staleResume.nextSafeAction, "revalidate stale context before continuing");

  const repeatedWrite = resumeAgentCheckpoint(checkpoint, {
    now: "2026-05-01T00:10:00.000Z",
    requestedSideEffect: "write-files",
  });
  assert.equal(repeatedWrite.pass, false);
  assert.match(repeatedWrite.replayGuard, /do not repeat write operation/);

  const diagnostics = await checkpointDiagnostics({ rootDir });
  assert.equal(diagnostics.pass, true, formatCheckpointDiagnostics(diagnostics));
  assert.match(formatCheckpointDiagnostics(diagnostics), /CHECKPOINTS: 1/);
});
