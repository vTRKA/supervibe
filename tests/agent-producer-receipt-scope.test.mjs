import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function appendInvocation(root, {
  invocationId,
  agentId = "quality-gate-reviewer",
  taskSummary = "stage scoped review",
} = {}) {
  await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
  await appendFile(join(root, ".supervibe", "memory", "agent-invocations.jsonl"), JSON.stringify({
    schemaVersion: 1,
    invocation_id: invocationId,
    ts: "2026-05-14T00:00:30.000Z",
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: 9.1,
  }) + "\n", "utf8");
  return {
    source: "agent-invocations-jsonl",
    invocationId,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("scoped agent producer CLI filters by command, handoff, stage, artifact hash, subject, and host invocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-scope-"));
  try {
    const artifact = ".supervibe/artifacts/_agent-outputs/codex-review-1/agent-output.json";
    const otherArtifact = ".supervibe/artifacts/_agent-outputs/codex-review-2/agent-output.json";
    const content = JSON.stringify({ status: "pass", stage: "work-item-execution" }, null, 2) + "\n";
    await writeUtf8(root, artifact, content);
    await writeUtf8(root, otherArtifact, JSON.stringify({ status: "pass", stage: "final-review-sweep" }, null, 2) + "\n");
    const hostInvocation = await appendInvocation(root, { invocationId: "codex-review-1" });
    const otherInvocation = await appendInvocation(root, { invocationId: "codex-review-2" });

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "reviewer",
      subjectId: "quality-gate-reviewer",
      agentId: "quality-gate-reviewer",
      stage: "work-item-execution",
      invocationReason: "stage scoped review",
      outputArtifacts: [artifact],
      startedAt: "2026-05-14T00:00:00.000Z",
      completedAt: "2026-05-14T00:01:00.000Z",
      handoffId: "ship-t6",
      hostInvocation,
      secret: "test-secret",
    });
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "reviewer",
      subjectId: "quality-gate-reviewer",
      agentId: "quality-gate-reviewer",
      stage: "final-review-sweep",
      invocationReason: "other review",
      outputArtifacts: [otherArtifact],
      startedAt: "2026-05-14T00:02:00.000Z",
      completedAt: "2026-05-14T00:03:00.000Z",
      handoffId: "ship-t6-other",
      hostInvocation: otherInvocation,
      secret: "test-secret",
    });

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/validate-agent-producer-receipts.mjs",
      "--root",
      root,
      "--command",
      "/supervibe-loop",
      "--handoff-id",
      "ship-t6",
      "--stage",
      "work-item-execution",
      "--subject-id",
      "quality-gate-reviewer",
      "--artifact",
      artifact,
      "--artifact-hash",
      sha256(content),
      "--host-invocation-source",
      "agent-invocations-jsonl",
      "--host-invocation-id",
      "codex-review-1",
      "--min-host-agent-receipts",
      "1",
      "--min-agent-invocations",
      "1",
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });

    assert.match(stdout, /SCOPE: scoped/);
    assert.match(stdout, /PASS: true/);
    assert.match(stdout, /CHECKED: 1/);
    assert.match(stdout, /TRUSTED_HOST_AGENT_RECEIPTS: 1/);
    assert.match(stdout, /BATCHING_OPTIMIZATION: scoped-trust-fast-path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scoped agent producer CLI rejects stale artifact hashes and wrong host invocation scope", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-scope-stale-"));
  try {
    const artifact = ".supervibe/artifacts/_agent-outputs/codex-review-1/agent-output.json";
    const before = JSON.stringify({ status: "pass", version: 1 }, null, 2) + "\n";
    await writeUtf8(root, artifact, before);
    const hostInvocation = await appendInvocation(root, { invocationId: "codex-review-1" });
    await appendInvocation(root, { invocationId: "codex-review-other" });
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "reviewer",
      subjectId: "quality-gate-reviewer",
      agentId: "quality-gate-reviewer",
      stage: "work-item-execution",
      invocationReason: "stage scoped review",
      outputArtifacts: [artifact],
      startedAt: "2026-05-14T00:00:00.000Z",
      completedAt: "2026-05-14T00:01:00.000Z",
      handoffId: "ship-t6",
      hostInvocation,
      secret: "test-secret",
    });
    await writeUtf8(root, artifact, JSON.stringify({ status: "pass", version: 2 }, null, 2) + "\n");

    let staleError = null;
    try {
      await execFileAsync(process.execPath, [
        "scripts/validate-agent-producer-receipts.mjs",
        "--root",
        root,
        "--command",
        "/supervibe-loop",
        "--handoff-id",
        "ship-t6",
        "--stage",
        "work-item-execution",
        "--subject-id",
        "quality-gate-reviewer",
        "--artifact",
        artifact,
        "--artifact-hash",
        sha256(before),
        "--host-invocation-id",
        "codex-review-1",
        "--secret",
        "test-secret",
      ], { cwd: REPO_ROOT });
    } catch (error) {
      staleError = error;
    }
    assert.ok(staleError);
    assert.match(staleError.stdout, /PASS: false/);
    assert.match(staleError.stdout, /output artifact hash mismatch/);

    let hostError = null;
    try {
      await execFileAsync(process.execPath, [
        "scripts/validate-agent-producer-receipts.mjs",
        "--root",
        root,
        "--command",
        "/supervibe-loop",
        "--handoff-id",
        "ship-t6",
        "--stage",
        "work-item-execution",
        "--subject-id",
        "quality-gate-reviewer",
        "--host-invocation-id",
        "codex-review-other",
        "--secret",
        "test-secret",
      ], { cwd: REPO_ROOT });
    } catch (error) {
      hostError = error;
    }
    assert.ok(hostError);
    assert.match(hostError.stdout, /missing-scoped-agent-producer-receipt/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
