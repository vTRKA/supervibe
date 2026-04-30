import assert from "node:assert/strict";
import test from "node:test";
import {
  createIntegrationCatalog,
  formatIntegrationCatalog,
  INTEGRATION_CAPABILITY_LEVELS,
  summarizeIntegrationCatalog,
} from "../scripts/lib/supervibe-external-integration-catalog.mjs";

test("integration catalog is read-only by default and keeps native graph fallback safest", () => {
  const catalog = createIntegrationCatalog({
    availableCommands: ["git", "gh"],
    mcpRegistry: { mcps: [{ name: "issues", tools: ["read", "write"] }] },
  });
  const summary = summarizeIntegrationCatalog(catalog);

  assert.equal(catalog.nativeGraphFallback, "native-json");
  assert.equal(catalog.safestAdapter.id, "native-json");
  assert.ok(INTEGRATION_CAPABILITY_LEVELS.includes("network-write"));
  assert.ok(summary.networkWriteAvailable);
  assert.ok(summary.approvals.some((approval) => approval.id === "gh"));
  assert.match(formatIntegrationCatalog(catalog), /gh: network-write/);
});

test("integration catalog blocks network-backed adapters under policy and preserves local fallback", () => {
  const catalog = createIntegrationCatalog({
    availableCommands: ["git", "gh", "linear"],
    policy: { blockNetwork: true },
  });

  assert.equal(catalog.safestAdapter.id, "native-json");
  assert.equal(catalog.integrations.find((item) => item.id === "gh").level, "blocked");
  assert.match(formatIntegrationCatalog(catalog), /resolve policy block/);
});
