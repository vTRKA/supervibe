import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createFederatedSyncBundle,
  createSyncConflictReport,
  importFederatedSyncBundle,
  readFederatedSyncBundle,
  validateFederatedSyncBundle,
  writeFederatedSyncBundle,
} from "../scripts/lib/supervibe-federated-sync-bundle.mjs";
import { summarizeTrackerMappingForBundle } from "../scripts/lib/supervibe-task-tracker-sync.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("federated sync bundle round-trips with checksums and redaction", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-sync-bundle-"));
  const bundle = createFederatedSyncBundle({
    graph: { items: [{ itemId: "t1", title: "Secret token=secret-value-that-must-redact" }] },
    status: { run_id: "run1", status: "IN_PROGRESS" },
    comments: [{ body: "ok" }],
    evidence: [{ path: "C:\\Users\\alice\\repo\\file.js" }],
    mapping: { items: { t1: { nativeId: "t1", externalId: "EXT-1" } } },
    packageVersion: "1.8.1",
    sourceRoot: "C:\\Users\\alice\\repo",
  });
  await writeFederatedSyncBundle(bundle, dir);
  const loaded = await readFederatedSyncBundle(dir);
  const validation = validateFederatedSyncBundle(loaded, { expectedPackageVersion: "1.8.1" });

  assert.equal(validation.valid, true);
  assert.doesNotMatch(JSON.stringify(loaded.files["graph.json"]), /secret-value-that-must-redact/);
  assert.doesNotMatch(JSON.stringify(loaded.files["evidence.json"]), /C:\\Users\\alice/);
  assert.equal((await importFederatedSyncBundle(dir, { dryRun: true, expectedPackageVersion: "1.8.1" })).remoteMutation, false);
  assert.equal(summarizeTrackerMappingForBundle(bundle.files["mapping.json"]).mapped, 1);
});

test("federated sync bundle validation catches checksum drift and version mismatch", () => {
  const bundle = createFederatedSyncBundle({
    graph: { items: [{ itemId: "t1" }] },
    packageVersion: "1.8.1",
  });
  bundle.files["graph.json"].items[0].title = "changed";
  const validation = validateFederatedSyncBundle(bundle, { expectedPackageVersion: "1.8.2" });

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "package-version-mismatch"));
  assert.ok(validation.issues.some((issue) => issue.code === "bundle-checksum-mismatch"));
});

test("sync conflict report explains local-only, remote-only, both-changed, duplicate, and stale states", () => {
  const report = createSyncConflictReport({
    localGraph: { items: [{ itemId: "a", title: "local" }, { itemId: "b", title: "same" }] },
    incomingGraph: { items: [{ itemId: "b", title: "changed" }, { itemId: "c", title: "remote" }, { itemId: "c", title: "dupe" }] },
    mapping: { items: { b: { nativeId: "b", status: "stale" } } },
  });

  assert.deepEqual(report.localOnly, ["a"]);
  assert.deepEqual(report.remoteOnly, ["c"]);
  assert.deepEqual(report.bothChanged, ["b"]);
  assert.deepEqual(report.duplicate, ["c"]);
  assert.deepEqual(report.stale, ["b"]);
});

test("loop CLI exports and imports sync bundle in dry-run mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-sync-cli-"));
  const runDir = join(dir, "run1");
  const outDir = join(dir, "bundle");
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "state.json"), JSON.stringify({
    run_id: "run1",
    status: "IN_PROGRESS",
    tasks: [{ id: "t1", goal: "work", status: "open", dependencies: [] }],
  }), "utf8");

  const exportResult = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--export-sync-bundle",
    runDir,
    "--out",
    outDir,
  ], { cwd: ROOT });
  assert.match(exportResult.stdout, /SUPERVIBE_SYNC_BUNDLE_EXPORT/);

  const importResult = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--import-sync-bundle",
    outDir,
    "--dry-run",
  ], { cwd: ROOT });
  assert.match(importResult.stdout, /DRY_RUN: true/);
  assert.match(importResult.stdout, /REMOTE_MUTATION: false/);
});
