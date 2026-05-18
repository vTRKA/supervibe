import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  archiveSupervibeArtifactGcCandidates,
  evaluateArtifactGcSchedule,
  filterArtifactGcAutoCandidates,
  scanSupervibeArtifactGc,
  writeArtifactGcScheduleRun,
  verifyCompactManifestDigest,
} from "../scripts/lib/supervibe-artifact-gc.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
  return absPath;
}

test("artifact GC finds stale .supervibe runtime noise and preserves receipt-linked outputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-"));
  try {
    await writeUtf8(root, ".supervibe/memory/workflow-receipts-stale/old/receipt.json", "{}\n");
    await writeUtf8(root, ".supervibe/memory/preview-servers.json", "{}\n");
    await writeUtf8(root, ".supervibe/memory/code.db", "cache\n");
    await writeUtf8(root, ".supervibe/servers/preview.log", "server log\n");
    const oldOutput = await writeUtf8(root, ".supervibe/artifacts/_agent-outputs/old/output.json", "{}\n");
    await writeUtf8(root, ".supervibe/artifacts/_agent-outputs/linked/output.json", "{}\n");
    await writeUtf8(root, ".supervibe/artifacts/_workflow-invocations/supervibe-design/run/receipt.json", `${JSON.stringify({
      schemaVersion: 1,
      outputArtifacts: [".supervibe/artifacts/_agent-outputs/linked/output.json"],
    }, null, 2)}\n`);
    await utimes(oldOutput, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
    await utimes(join(root, ".supervibe", "artifacts", "_agent-outputs", "old"), new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));

    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      retentionDays: 14,
    });

    const candidates = scan.candidates.map((item) => `${item.relPath}:${item.reason}`);
    assert.ok(candidates.some((item) => item.includes(".supervibe/memory/workflow-receipts-stale/old:stale-receipt-archive")));
    assert.ok(candidates.some((item) => item.includes(".supervibe/memory/preview-servers.json:runtime-state")));
    assert.ok(candidates.some((item) => item.includes(".supervibe/servers/preview.log:preview-log")));
    assert.ok(candidates.some((item) => item.includes(".supervibe/artifacts/_agent-outputs/old:unreferenced-agent-output")));
    assert.ok(scan.activeNoise.some((item) => item.relPath === ".supervibe/memory/code.db" && item.reason === "runtime-cache"));
    assert.ok(scan.activeNoise.some((item) => item.relPath === ".supervibe/artifacts/_agent-outputs/linked" && item.reason === "receipt-linked-agent-output"));
    assert.ok(scan.activeNoise.some((item) => item.relPath === ".supervibe/memory/code.db" && item.tier === "regenerable-cache"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC marks old trusted receipt-linked agent outputs as compactable", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-compactable-"));
  try {
    const outputRel = ".supervibe/artifacts/_agent-outputs/run-1/agent-output.json";
    const summaryRel = ".supervibe/artifacts/_agent-outputs/run-1/summary.md";
    await writeUtf8(root, outputRel, `${JSON.stringify({
      schemaVersion: 1,
      invocationId: "run-1",
      agentId: "quality-gate-reviewer",
      taskSummary: "verified compaction fixture",
    }, null, 2)}\n`);
    await writeUtf8(root, summaryRel, "# Agent Output\n\nverified compaction fixture\n");

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:verification",
      stage: "verification",
      invocationReason: "agent output is trusted proof",
      outputArtifacts: [outputRel],
      startedAt: "2026-05-01T00:00:00.000Z",
      completedAt: "2026-05-01T00:01:00.000Z",
      handoffId: "compactable-agent-output",
    });

    const old = new Date("2026-04-01T00:00:00.000Z");
    await utimes(join(root, ...outputRel.split("/")), old, old);
    await utimes(join(root, ...summaryRel.split("/")), old, old);
    await utimes(join(root, ".supervibe", "artifacts", "_agent-outputs", "run-1"), old, old);

    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      retentionDays: 14,
      compactAgentOutputDays: 14,
    });

    assert.ok(scan.compactable.some((item) => item.relPath === ".supervibe/artifacts/_agent-outputs/run-1" && item.reason === "compactable-agent-output"));
    assert.ok(scan.compactable.some((item) => item.tier === "required"));
    assert.equal(scan.summary.compactable, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC apply compacts trusted agent-output JSON into gzip archive plus live manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-compact-apply-"));
  try {
    const outputRel = ".supervibe/artifacts/_agent-outputs/run-2/agent-output.json";
    const summaryRel = ".supervibe/artifacts/_agent-outputs/run-2/summary.md";
    const original = `${JSON.stringify({
      schemaVersion: 1,
      invocationId: "run-2",
      agentId: "repo-researcher",
      taskSummary: "large proof payload",
    }, null, 2)}\n`;
    await writeUtf8(root, outputRel, original);
    await writeUtf8(root, summaryRel, "# Agent Output\n\nlarge proof payload\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:verification",
      stage: "verification",
      invocationReason: "agent output is trusted proof",
      outputArtifacts: [outputRel],
      startedAt: "2026-05-01T00:00:00.000Z",
      completedAt: "2026-05-01T00:01:00.000Z",
      handoffId: "compact-agent-output",
    });
    const old = new Date("2026-04-01T00:00:00.000Z");
    await utimes(join(root, ...outputRel.split("/")), old, old);
    await utimes(join(root, ...summaryRel.split("/")), old, old);
    await utimes(join(root, ".supervibe", "artifacts", "_agent-outputs", "run-2"), old, old);

    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      retentionDays: 14,
      compactAgentOutputDays: 14,
    });
    const result = await archiveSupervibeArtifactGcCandidates(scan, {
      rootDir: root,
      dryRun: false,
      runTimestamp: "2026-05-06T00:00:00.000Z",
    });

    assert.equal(result.compacted.length, 1);
    const manifest = JSON.parse(await readFile(join(root, ...outputRel.split("/")), "utf8"));
    assert.equal(manifest.type, "supervibe-agent-output-compact-manifest");
    assert.equal(manifest.originalPath, outputRel);
    assert.match(manifest.originalSha256, /^[a-f0-9]{64}$/);
    assert.match(manifest.archiveSha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.originalBytes, Buffer.byteLength(original));
    assert.equal(manifest.receiptIds.length, 1);
    assert.equal(manifest.digest.type, "receipt-linked-agent-output-digest");
    assert.equal(manifest.digest.receiptCount, manifest.receiptIds.length);
    assert.equal(existsSync(join(root, ...summaryRel.split("/"))), true);
    const archived = await readFile(join(root, ...manifest.archivePath.split("/")));
    assert.equal(gunzipSync(archived).toString("utf8"), original);
    const verified = await verifyCompactManifestDigest({ rootDir: root, manifestPath: outputRel });
    assert.equal(verified.pass, true);
    const afterCompactScan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      retentionDays: 14,
      compactAgentOutputDays: 14,
    });
    assert.equal(afterCompactScan.compactable.some((item) => item.relPath === ".supervibe/artifacts/_agent-outputs/run-2"), false);
    assert.ok(afterCompactScan.activeNoise.some((item) => item.relPath === ".supervibe/artifacts/_agent-outputs/run-2" && item.reason === "receipt-linked-agent-output-compact-manifest"));

    await writeFile(join(root, ...manifest.archivePath.split("/")), gzipSync(Buffer.from("different payload\n", "utf8")));
    const corrupted = await verifyCompactManifestDigest({ rootDir: root, manifestPath: outputRel });
    assert.equal(corrupted.pass, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC compact manifest verification rejects traversal paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-compact-traversal-"));
  try {
    const manifestRel = ".supervibe/artifacts/_agent-outputs/run-3/agent-output.json";
    await writeUtf8(root, manifestRel, `${JSON.stringify({
      type: "supervibe-agent-output-compact-manifest",
      archivePath: "../../outside.gz",
      archiveSha256: "0".repeat(64),
      originalSha256: "0".repeat(64),
    }, null, 2)}\n`);

    await assert.rejects(
      () => verifyCompactManifestDigest({ rootDir: root, manifestPath: manifestRel }),
      /compact manifest archivePath/,
    );
    await assert.rejects(
      () => verifyCompactManifestDigest({ rootDir: root, manifestPath: "../outside.json" }),
      /manifestPath/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("artifact GC reports archive cleanup by TTL and size cap without touching live state", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-archive-policy-"));
  try {
    const oldArchive = await writeUtf8(root, ".supervibe/.archive/gc/old/old.json", "old archive\n");
    const olderArchive = await writeUtf8(root, ".supervibe/.archive/gc/older/older.json", "older archive payload\n");
    const newArchive = await writeUtf8(root, ".supervibe/.archive/gc/new/new.json", "new archive payload\n");
    await utimes(oldArchive, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
    await utimes(olderArchive, new Date("2025-12-01T00:00:00.000Z"), new Date("2025-12-01T00:00:00.000Z"));
    await utimes(newArchive, new Date("2026-05-05T00:00:00.000Z"), new Date("2026-05-05T00:00:00.000Z"));

    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      archiveRetentionDays: 30,
      maxArchiveBytes: 20,
    });

    assert.ok(scan.archiveCleanup.some((item) => item.relPath === ".supervibe/.archive/gc/old/old.json" && item.reason === "archive-ttl"));
    assert.ok(scan.archiveCleanup.some((item) => item.relPath === ".supervibe/.archive/gc/older/older.json" && item.reason === "archive-ttl"));
    assert.ok(scan.archiveCleanup.some((item) => item.reason === "archive-size-cap"));
    assert.ok(!scan.archiveCleanup.some((item) => item.relPath === ".supervibe/.archive/gc/new/new.json" && item.reason === "archive-ttl"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC archive cleanup removes snapshot-backed archive outputs and unprotected archive folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-archive-protected-"));
  try {
    const protectedRel = ".supervibe/.archive/gc/protected/proof.json";
    const unprotectedRel = ".supervibe/.archive/gc/old/nested/old.json";
    const protectedArchive = await writeUtf8(root, protectedRel, "protected archive proof\n");
    const oldArchive = await writeUtf8(root, unprotectedRel, "unprotected archive payload\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:verification",
      stage: "verification",
      invocationReason: "archive proof must remain restorable",
      outputArtifacts: [protectedRel],
      startedAt: "2026-05-01T00:00:00.000Z",
      completedAt: "2026-05-01T00:01:00.000Z",
      handoffId: "protected-archive-output",
    });
    const old = new Date("2026-01-01T00:00:00.000Z");
    await utimes(protectedArchive, old, old);
    await utimes(oldArchive, old, old);

    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      archiveRetentionDays: 1,
      maxArchiveBytes: 1,
    });
    assert.ok(scan.archiveCleanup.some((item) => item.relPath === unprotectedRel));
    assert.ok(scan.archiveCleanup.some((item) => item.relPath === protectedRel));

    const result = await archiveSupervibeArtifactGcCandidates(scan, {
      rootDir: root,
      dryRun: false,
      runTimestamp: "2026-05-06T00:00:00.000Z",
    });
    assert.deepEqual(result.errors, []);
    assert.equal(existsSync(join(root, ...protectedRel.split("/"))), false);
    assert.equal(existsSync(join(root, ...unprotectedRel.split("/"))), false);
    assert.equal(existsSync(join(root, ".supervibe", ".archive", "gc", "old")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC purge deletes candidates instead of archiving them", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-purge-"));
  try {
    await writeUtf8(root, ".supervibe/memory/workflow-receipts-stale/old/receipt.json", "{}\n");
    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
    });
    const result = await archiveSupervibeArtifactGcCandidates(scan, {
      rootDir: root,
      dryRun: false,
      purge: true,
      runTimestamp: "2026-05-06T00:00:00.000Z",
    });

    assert.equal(result.deleted.length, 1);
    assert.equal(result.archived.length, 0);
    assert.deepEqual(result.errors, []);
    assert.equal(existsSync(join(root, ".supervibe", "memory", "workflow-receipts-stale", "old")), false);
    assert.equal(existsSync(join(root, ".supervibe", ".archive", "gc")), false);
    assert.ok(result.auditLogPath.startsWith(".supervibe/artifacts/_gc-runs/"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC apply archives candidates outside active memory", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-apply-"));
  try {
    await writeUtf8(root, ".supervibe/memory/workflow-receipts-stale/old/receipt.json", "{}\n");
    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
    });
    const result = await archiveSupervibeArtifactGcCandidates(scan, {
      rootDir: root,
      dryRun: false,
      runTimestamp: "2026-05-06T00:00:00.000Z",
    });

    assert.equal(result.archived.length, 1);
    assert.equal(existsSync(join(root, ".supervibe", "memory", "workflow-receipts-stale", "old")), false);
    assert.ok(result.archived[0].archivePath.startsWith(".supervibe/.archive/gc/"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC purgeArchives removes unprotected and snapshot-backed archive files", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-purge-archives-"));
  try {
    const protectedRel = ".supervibe/.archive/gc/protected/proof.json";
    const unprotectedRel = ".supervibe/.archive/gc/old/old.json";
    await writeUtf8(root, protectedRel, "protected archive proof\n");
    await writeUtf8(root, unprotectedRel, "old archive payload\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:verification",
      stage: "verification",
      invocationReason: "archive proof must remain restorable",
      outputArtifacts: [protectedRel],
      startedAt: "2026-05-01T00:00:00.000Z",
      completedAt: "2026-05-01T00:01:00.000Z",
      handoffId: "protected-archive-purge-output",
    });

    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      purgeArchives: true,
    });
    assert.ok(scan.archiveCleanup.some((item) => item.relPath === unprotectedRel && item.reason === "archive-purge"));
    assert.ok(scan.archiveCleanup.some((item) => item.relPath === protectedRel && item.reason === "archive-purge"));

    const result = await archiveSupervibeArtifactGcCandidates(scan, {
      rootDir: root,
      dryRun: false,
      runTimestamp: "2026-05-06T00:00:00.000Z",
    });
    assert.deepEqual(result.errors, []);
    assert.equal(existsSync(join(root, ...protectedRel.split("/"))), false);
    assert.equal(existsSync(join(root, ...unprotectedRel.split("/"))), false);
    assert.equal(existsSync(join(root, ".supervibe", ".archive")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC classifies old untrusted workflow receipts and temp invocation folders as auto-safe candidates", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-workflow-temp-"));
  try {
    const receiptRel = ".supervibe/artifacts/_workflow-invocations/supervibe-loop/old-run/untrusted.json";
    const scratchRel = ".supervibe/artifacts/_workflow-invocations/supervibe-loop/temp-run/scratch.json";
    await writeUtf8(root, receiptRel, JSON.stringify({
      schemaVersion: 1,
      receiptId: "old-untrusted",
      command: "/supervibe-loop",
      subjectType: "command",
      subjectId: "supervibe-loop",
      stage: "temp",
      outputArtifacts: [],
    }, null, 2) + "\n");
    await writeUtf8(root, scratchRel, "{\"temporary\":true}\n");
    const old = new Date("2026-01-01T00:00:00.000Z");
    await utimes(join(root, ...receiptRel.split("/")), old, old);
    await utimes(join(root, ...scratchRel.split("/")), old, old);
    await utimes(join(root, ".supervibe", "artifacts", "_workflow-invocations", "supervibe-loop", "old-run"), old, old);
    await utimes(join(root, ".supervibe", "artifacts", "_workflow-invocations", "supervibe-loop", "temp-run"), old, old);

    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      retentionDays: 14,
      workflowArtifactRetentionDays: 30,
    });
    const candidates = scan.candidates.map((item) => `${item.relPath}:${item.reason}`);
    assert.ok(candidates.includes(`${receiptRel}:stale-untrusted-workflow-receipt`));
    assert.ok(candidates.some((item) => item.includes(".supervibe/artifacts/_workflow-invocations/supervibe-loop/temp-run:stale-workflow-temp-artifact")));

    const auto = filterArtifactGcAutoCandidates({
      ...scan,
      candidates: [...scan.candidates, { relPath: ".supervibe/artifacts/manual-review.json", reason: "manual-review-required" }],
      summary: { ...scan.summary, candidates: scan.candidates.length + 1 },
    });
    assert.equal(auto.candidates.some((item) => item.reason === "manual-review-required"), false);
    assert.ok(auto.candidates.some((item) => item.reason === "stale-untrusted-workflow-receipt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact GC keeps old trusted workflow receipts out of auto archive candidates", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-trusted-receipt-"));
  try {
    const outputRel = ".supervibe/artifacts/_agent-outputs/trusted-run/agent-output.json";
    await writeUtf8(root, outputRel, "{\"ok\":true}\n");
    const issued = await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/codex-task",
      subjectType: "skill",
      subjectId: "supervibe:verification",
      stage: "verification",
      invocationReason: "trusted receipt remains provenance",
      outputArtifacts: [outputRel],
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:01:00.000Z",
      handoffId: "trusted-old-receipt",
    });
    const old = new Date("2026-01-01T00:00:00.000Z");
    await utimes(join(root, ...issued.receiptPath.split("/")), old, old);
    await utimes(join(root, ".supervibe", "artifacts", "_workflow-invocations", "codex-task", "trusted-old-receipt"), old, old);

    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      workflowArtifactRetentionDays: 30,
    });

    assert.equal(scan.candidates.some((item) => item.relPath === issued.receiptPath), false);
    assert.ok(scan.activeNoise.some((item) => item.relPath === issued.receiptPath && item.reason === "trusted-workflow-receipt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("artifact GC schedule records last run and suppresses not-due runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-gc-schedule-"));
  try {
    await writeUtf8(root, ".supervibe/memory/workflow-receipts-stale/old/receipt.json", "{}\n");
    const scan = await scanSupervibeArtifactGc({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
    });
    const due = await evaluateArtifactGcSchedule({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
      scan,
    });
    assert.equal(due.due, true);
    assert.equal(due.candidates, 1);

    await writeArtifactGcScheduleRun({
      rootDir: root,
      now: "2026-05-06T00:00:00.000Z",
    });
    const notDue = await evaluateArtifactGcSchedule({
      rootDir: root,
      now: "2026-05-07T00:00:00.000Z",
      scan,
    });
    assert.equal(notDue.due, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
