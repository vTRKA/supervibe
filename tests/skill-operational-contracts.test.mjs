import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  validateSkillOperationalContracts,
} from "../scripts/validate-skill-operational-contracts.mjs";

test("skill operational validator rejects missing contracts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-skill-contracts-"));
  await mkdir(join(root, "skills", "weak"), { recursive: true });
  await writeFile(join(root, "skills", "weak", "SKILL.md"), "# Weak Skill\n\n## Procedure\n\nDo work.\n", "utf8");

  const result = validateSkillOperationalContracts(root);

  assert.equal(result.pass, false);
  assert.equal(result.checked, 1);
  assert.ok(result.issues.some((issue) => issue.code === "missing-output-contract"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-guard-rails"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-verification"));
});

test("current skills all expose operational contracts", () => {
  const result = validateSkillOperationalContracts(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
