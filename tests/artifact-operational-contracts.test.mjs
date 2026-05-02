import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCommandOperationalContracts,
} from "../scripts/validate-command-operational-contracts.mjs";
import {
  validateSkillOperationalContracts,
} from "../scripts/validate-skill-operational-contracts.mjs";

test("skills keep operational contracts for high-risk orchestration flows", () => {
  const result = validateSkillOperationalContracts(process.cwd());

  assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
  assert.ok(result.checked >= 50);
});

test("commands expose invocation, safety, output, and continuation contracts", () => {
  const result = validateCommandOperationalContracts(process.cwd());

  assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
  assert.ok(result.checked >= 15);
});
