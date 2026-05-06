import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  archiveSupervibeArtifactGcCandidates,
  evaluateArtifactGcSchedule,
  scanSupervibeArtifactGc,
  writeArtifactGcScheduleRun,
} from "../scripts/lib/supervibe-artifact-gc.mjs";

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
