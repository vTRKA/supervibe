import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCapabilityRegistry } from "../scripts/lib/supervibe-capability-registry.mjs";
import {
  buildLocalToolMetadataContract,
  formatLocalToolMetadataReport,
  validateLocalToolMetadataContract,
} from "../scripts/lib/supervibe-tool-metadata-contract.mjs";

test("local tool metadata contract is complete and deterministic", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const registry = buildCapabilityRegistry({ rootDir: process.cwd() });
  const contract = buildLocalToolMetadataContract({ registry, packageJson });
  const validation = validateLocalToolMetadataContract(contract);

  assert.equal(validation.pass, true, formatLocalToolMetadataReport(contract, validation));
  assert.ok(contract.items.some((item) => item.stableName === "/supervibe-genesis"));
  assert.ok(contract.items.some((item) => item.stableName === "supervibe:genesis"));
  assert.ok(contract.items.some((item) => item.stableName === "npm:supervibe:context-eval"));
  assert.deepEqual(contract.deterministicOrder, contract.items.map((item) => item.stableName));
  for (const item of contract.items) {
    assert.ok(item.inputShape, "tool metadata missing input shape, context requirement, approval policy or deterministic order");
    assert.ok(item.approvalPolicy, "tool metadata missing input shape, context requirement, approval policy or deterministic order");
    assert.ok(item.requiredContextSources.length, "tool metadata missing input shape, context requirement, approval policy or deterministic order");
  }
});
