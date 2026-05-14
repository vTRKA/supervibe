import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCodeIndexFreshnessPolicyToGate,
  buildCodeIndexFreshnessStatus,
  buildMissingCodeIndexFreshnessStatus,
  formatCodeIndexFreshnessStatus,
} from "../scripts/lib/code-index-health-status.mjs";

test("code index freshness treats tiny content drift as repairable in development", () => {
  const freshness = buildCodeIndexFreshnessStatus({
    health: {
      staleRows: [],
      contentChangedRows: [{ path: "a.js" }, { path: "b.js" }],
      partialIndexedFiles: [],
    },
    gate: { failedGates: [{ code: "content-stale", message: "content changed" }] },
    strict: false,
    repairableContentChangedRows: 2,
    snapshot: { mode: "read-only-transaction", retryCount: 1 },
  });

  assert.equal(freshness.status, "repairable-stale");
  assert.equal(freshness.devReady, true);
  assert.equal(freshness.strictReady, false);
  assert.deepEqual(freshness.effectiveFailedGates, []);

  const gate = applyCodeIndexFreshnessPolicyToGate({ ready: false, failedGates: [{ code: "content-stale" }] }, freshness);
  assert.equal(gate.ready, true);
  assert.equal(gate.failedGates.length, 0);
  assert.match(formatCodeIndexFreshnessStatus(freshness), /STATUS: repairable-stale/);
  assert.match(formatCodeIndexFreshnessStatus(freshness), /READ_SNAPSHOT_MODE: read-only-transaction/);
});

test("code index freshness keeps strict release gates failed", () => {
  const freshness = buildCodeIndexFreshnessStatus({
    health: { staleRows: [], contentChangedRows: [{ path: "a.js" }] },
    gate: { failedGates: [{ code: "content-stale", message: "content changed" }] },
    strict: true,
    repairableContentChangedRows: 2,
  });

  assert.equal(freshness.status, "failed");
  assert.equal(freshness.readyForMode, false);
  assert.equal(freshness.strictReady, false);
  assert.equal(freshness.failedGates.length, 1);
});

test("missing code index freshness reports not-built with repair commands", () => {
  const freshness = buildMissingCodeIndexFreshnessStatus({ dbPath: ".supervibe/memory/code.db" });

  assert.equal(freshness.status, "not-built");
  assert.equal(freshness.readyForMode, false);
  assert.match(formatCodeIndexFreshnessStatus(freshness), /STATUS: not-built/);
  assert.match(formatCodeIndexFreshnessStatus(freshness), /REPAIR_COMMAND: .*build-code-index/);
  assert.match(formatCodeIndexFreshnessStatus(freshness), /GRAPH_REPAIR_COMMAND: .*build-code-index/);
  assert.match(formatCodeIndexFreshnessStatus(freshness), /READ_SNAPSHOT_MODE: none/);
});