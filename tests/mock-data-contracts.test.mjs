import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateMockDataContracts,
} from "../scripts/validate-mock-data-contracts.mjs";

test("mock-data contract validator rejects missing gates", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-mock-data-contracts-"));
  const files = {
    "commands/supervibe-design.md": "# /supervibe-design\nmock-contract.json",
    "skills/prototype/SKILL.md": "# Prototype\nData-fed mock",
    "agents/_design/prototype-builder.md": "# prototype-builder",
    "skills/prototype-handoff/SKILL.md": "# Prototype Handoff",
    "rules/prototype-to-production.md": "# Prototype to Production",
    "agents/_ops/mock-data-designer.md": "# mock-data-designer\nConfidence: <N>.<dd>/10",
    "skills/mock-data-contract/SKILL.md": "# Mock Data Contract",
    "rules/mock-data-contract.md": "# Mock Data Contract",
    "templates/mock-data/mock-contract.json.tpl": "{}",
    "templates/mock-data/mock-scenarios.json.tpl": "{}",
    "templates/mock-data/backend-integration.md.tpl": "# Backend Integration",
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateMockDataContracts(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.file === "commands/supervibe-design.md"));
  assert.ok(result.issues.some((issue) => issue.file === "skills/prototype-handoff/SKILL.md"));
  assert.ok(result.issues.some((issue) => issue.file === "templates/mock-data/mock-scenarios.json.tpl"));
});

test("current plugin surfaces preserve mock-data contract gates", () => {
  const result = validateMockDataContracts(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
