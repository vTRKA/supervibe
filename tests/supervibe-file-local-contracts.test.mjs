import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFileLocalContractContext,
  detectFileLocalContractDrift,
  extractFileLocalContracts,
  fileLocalContractsToTaskPatch,
  formatFileLocalContractSummary,
} from "../scripts/lib/supervibe-file-local-contracts.mjs";

test("file-local contracts extract purpose, IO, invariants, dependencies, and forbidden changes", () => {
  const content = [
    "// @supervibe-contract purpose=\"Parse payments\" inputs=\"raw payload\" outputs=\"normalized payment\" sideEffects=\"none\" invariant=\"idempotency key required\" depends=\"currency.ts\" forbidden=\"network call\"",
    "export function parsePayment(raw) {",
    "  return raw;",
    "}",
  ].join("\n");
  const contracts = extractFileLocalContracts(content, { filePath: "src/payment.ts" });

  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].filePath, "src/payment.ts");
  assert.equal(contracts[0].purpose, "Parse payments");
  assert.deepEqual(contracts[0].inputs, ["raw payload"]);
  assert.deepEqual(contracts[0].outputs, ["normalized payment"]);
  assert.ok(contracts[0].forbiddenChanges.includes("network call"));
  assert.equal(contracts[0].overridesSharedContracts, false);
});

test("task packets include only relevant file-local contracts", () => {
  const contracts = [
    { contractId: "flc-a", filePath: "src/a.ts", purpose: "A", invariants: ["keep A"] },
    { contractId: "flc-b", filePath: "src/b.ts", purpose: "B", invariants: ["keep B"] },
  ];
  const context = buildFileLocalContractContext({
    task: { id: "task-1", targetFiles: ["src/a.ts"] },
    contracts,
  });
  const patch = fileLocalContractsToTaskPatch(context);

  assert.equal(context.contracts.length, 1);
  assert.equal(context.contracts[0].contractId, "flc-a");
  assert.equal(context.sharedProjectContractsRemainAuthoritative, true);
  assert.deepEqual(patch.fileLocalContractRefs, ["flc-a"]);
});

test("contract drift appears when file hashes or anchored assumptions change", () => {
  const contracts = [{
    contractId: "flc-a",
    filePath: "src/a.ts",
    contentHash: "old",
    invariants: ["old invariant"],
    verificationRefs: ["npm test -- a"],
  }];
  const drift = detectFileLocalContractDrift({
    contracts,
    fileSnapshots: { "src/a.ts": { contentHash: "new", text: "export const a = 1;" } },
  });

  assert.equal(drift.ok, false);
  assert.ok(drift.issues.some((issue) => issue.code === "file-contract-hash-drift"));
  assert.match(formatFileLocalContractSummary({ contracts, drift }), /DRIFT: 1/);
});
