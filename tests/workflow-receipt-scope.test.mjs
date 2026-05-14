import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  issueWorkflowInvocationReceipt,
  rebuildWorkflowReceiptLedger,
  reissueWorkflowInvocationReceipt,
  validateScopedWorkflowReceipts,
  validateWorkflowReceipts,
  workflowReceiptMatchesScope,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("scoped workflow validation filters by command, handoff, stage, artifact hash, subject, and host invocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-scope-"));
  try {
    const scopedArtifact = ".supervibe/artifacts/loops/ship-t6/scoped.md";
    const otherArtifact = ".supervibe/artifacts/loops/ship-t6/other.md";
    await writeUtf8(root, scopedArtifact, "# Scoped\n");
    await writeUtf8(root, otherArtifact, "# Other\n");

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "ship-runner",
      stage: "work-item-execution",
      invocationReason: "scoped run proof",
      outputArtifacts: [scopedArtifact],
      startedAt: "2026-05-14T00:00:00.000Z",
      completedAt: "2026-05-14T00:01:00.000Z",
      handoffId: "ship-t6",
      hostInvocation: { source: "codex-spawn-agent", invocationId: "codex-run-scoped" },
      secret: "test-secret",
    });
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "ship-runner",
      stage: "final-review-sweep",
      invocationReason: "other stage proof",
      outputArtifacts: [otherArtifact],
      startedAt: "2026-05-14T00:02:00.000Z",
      completedAt: "2026-05-14T00:03:00.000Z",
      handoffId: "ship-t6-other",
      hostInvocation: { source: "codex-spawn-agent", invocationId: "codex-run-other" },
      secret: "test-secret",
    });

    const global = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(global.pass, true);
    assert.equal(global.checked, 2);

    const scoped = validateScopedWorkflowReceipts(root, {
      command: "/supervibe-loop",
      handoffId: "ship-t6",
      stages: ["work-item-execution"],
      artifactHashes: [sha256("# Scoped\n")],
      subjectIds: ["ship-runner"],
      hostInvocation: { source: "codex-spawn-agent", invocationId: "codex-run-scoped" },
      secret: "test-secret",
    });

    assert.equal(scoped.pass, true);
    assert.equal(scoped.checked, 1);
    assert.equal(scoped.receipts, 1);
    assert.deepEqual(scoped.issues, []);
    assert.equal(workflowReceiptMatchesScope({
      command: "/supervibe-loop",
      handoffId: "ship-t6",
      stage: "work-item-execution",
      subjectId: "ship-runner",
      outputHashes: [{ path: scopedArtifact, sha256: sha256("# Scoped\n") }],
      hostInvocation: { source: "codex-spawn-agent", invocationId: "codex-run-scoped" },
    }, {
      command: "/supervibe-loop",
      handoff: "ship-t6",
      stage: "work-item-execution",
      subjectId: "ship-runner",
      artifactHash: sha256("# Scoped\n"),
      hostInvocationId: "codex-run-scoped",
      hostInvocationSource: "codex-spawn-agent",
    }), true);
    assert.deepEqual(scoped.scope.subjectIds, ["ship-runner"]);
    assert.deepEqual(scoped.scope.artifactHashes, [sha256("# Scoped\n")]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scoped workflow validation fails stale artifact hashes and recovers through reissue, rebuild, and recovery-status", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-scope-recovery-"));
  try {
    const artifact = ".supervibe/artifacts/loops/ship-t6/scoped.md";
    await writeUtf8(root, artifact, "# Before\n");
    const issued = await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "ship-runner",
      stage: "work-item-execution",
      invocationReason: "scoped run proof",
      outputArtifacts: [artifact],
      startedAt: "2026-05-14T00:00:00.000Z",
      completedAt: "2026-05-14T00:01:00.000Z",
      handoffId: "ship-t6",
      secret: "test-secret",
    });

    await writeUtf8(root, artifact, "# After\n");
    const stale = validateScopedWorkflowReceipts(root, {
      command: "/supervibe-loop",
      handoffId: "ship-t6",
      stage: "work-item-execution",
      artifactHashes: [sha256("# Before\n")],
      subjectId: "ship-runner",
      secret: "test-secret",
    });

    assert.equal(stale.pass, false);
    assert.ok(stale.issues.some((issue) => /output artifact hash mismatch/.test(issue.message)));

    await reissueWorkflowInvocationReceipt({
      rootDir: root,
      receiptPath: issued.receiptPath,
      reason: "artifact intentionally updated before stage-scoped validation",
      secret: "test-secret",
      rebuildLedger: false,
    });
    const rebuilt = await rebuildWorkflowReceiptLedger({ rootDir: root, secret: "test-secret" });
    assert.equal(rebuilt.signatureIssues.length, 0);

    const recovered = validateScopedWorkflowReceipts(root, {
      command: "/supervibe-loop",
      handoffId: "ship-t6",
      stage: "work-item-execution",
      artifactHash: sha256("# After\n"),
      subjectId: "ship-runner",
      secret: "test-secret",
    });

    assert.equal(recovered.pass, true);
    assert.equal(recovered.checked, 1);

    const { stdout } = await execFileAsync(process.execPath, [
      "scripts/workflow-receipt.mjs",
      "recovery-status",
      "--root",
      root,
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });
    assert.match(stdout, /SUPERVIBE_WORKFLOW_RECOVERY_STATUS/);
    assert.match(stdout, /UNTRUSTED_RECEIPTS: 0/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scoped workflow validator CLI documents scoped trust fast path while global validation remains available", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-workflow-scope-cli-"));
  try {
    const artifact = ".supervibe/artifacts/loops/ship-t6/scoped.md";
    await writeUtf8(root, artifact, "# Scoped\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "ship-runner",
      stage: "work-item-execution",
      invocationReason: "scoped run proof",
      outputArtifacts: [artifact],
      startedAt: "2026-05-14T00:00:00.000Z",
      completedAt: "2026-05-14T00:01:00.000Z",
      handoffId: "ship-t6",
      secret: "test-secret",
    });

    const scoped = await execFileAsync(process.execPath, [
      "scripts/validate-workflow-receipts.mjs",
      "--root",
      root,
      "--command",
      "/supervibe-loop",
      "--handoff-id",
      "ship-t6",
      "--stage",
      "work-item-execution",
      "--subject-id",
      "ship-runner",
      "--artifact-hash",
      sha256("# Scoped\n"),
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });
    assert.match(scoped.stdout, /SCOPE: scoped/);
    assert.match(scoped.stdout, /CHECKED: 1/);
    assert.match(scoped.stdout, /BATCHING_OPTIMIZATION: scoped-trust-fast-path/);

    const global = await execFileAsync(process.execPath, [
      "scripts/validate-workflow-receipts.mjs",
      "--root",
      root,
      "--secret",
      "test-secret",
    ], { cwd: REPO_ROOT });
    assert.match(global.stdout, /CHECKED: 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
