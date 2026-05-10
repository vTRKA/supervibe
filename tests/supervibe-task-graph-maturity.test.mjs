import assert from "node:assert/strict";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildTaskGraphMaturityReport } from "../scripts/lib/supervibe-task-graph-maturity.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("task graph maturity includes source snapshot, strict evidence, and MCP tracker dimensions", () => {
  const report = buildTaskGraphMaturityReport(ROOT);
  const byId = new Map(report.dimensions.map((dimension) => [dimension.id, dimension]));

  assert.equal(byId.get("source-plan-snapshots")?.pass, true);
  assert.equal(byId.get("strict-completion-evidence")?.pass, true);
  assert.equal(byId.get("mcp-tracker-wiring")?.pass, true);
});
