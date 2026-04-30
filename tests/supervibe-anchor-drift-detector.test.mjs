import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  detectAnchorDrift,
  fixDerivedAnchorIndex,
  formatAnchorDriftReport,
} from "../scripts/lib/supervibe-anchor-drift-detector.mjs";

test("anchor drift detects missing files, renamed symbols, duplicate IDs, missing verification, and deleted-code summaries", () => {
  const anchors = [
    { anchorId: "auth.login", filePath: "src/auth.ts", symbolName: "loginUser", verificationRefs: [] },
    { anchorId: "auth.login", filePath: "src/auth.ts", symbolName: "loginUser", verificationRefs: [] },
    { anchorId: "billing.price", filePath: "src/missing.ts", symbolName: "price", verificationRefs: ["npm test -- billing"] },
  ];
  const drift = detectAnchorDrift({
    anchors,
    files: { "src/auth.ts": "export function signIn() {}" },
    symbols: [{ filePath: "src/auth.ts", name: "signIn" }],
    summaries: [{ summaryId: "sum-1", filePath: "src/deleted.ts", accepted: true }],
    contracts: [{ contractId: "flc-1", filePath: "src/auth.ts", contentHash: "old" }],
    fileSnapshots: { "src/auth.ts": { contentHash: "new", text: "export function signIn() {}" } },
  });

  assert.equal(drift.ok, false);
  assert.ok(drift.issues.some((issue) => issue.code === "duplicate-anchor-id"));
  assert.ok(drift.issues.some((issue) => issue.code === "anchor-file-missing"));
  assert.ok(drift.issues.some((issue) => issue.code === "anchor-symbol-renamed"));
  assert.ok(drift.issues.some((issue) => issue.code === "anchor-verification-missing"));
  assert.ok(drift.issues.some((issue) => issue.code === "summary-for-deleted-code"));
  assert.match(formatAnchorDriftReport(drift), /RISKY_FIXES/);
});

test("anchor doctor fix mode writes derived index only after backup", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-anchor-fix-"));
  const result = await fixDerivedAnchorIndex({
    rootDir,
    anchors: [{ anchorId: "a", filePath: "src/a.ts", symbolName: "a" }],
  });
  const written = JSON.parse(await readFile(result.outPath, "utf8"));

  assert.equal(result.changed, true);
  assert.equal(result.sourceCommentsModified, false);
  assert.equal(result.backupPath.endsWith(".bak"), true);
  assert.equal(written.anchors.length, 1);
});
