import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("command operational validator can run from a project root with explicit plugin root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-command-validator-project-"));
  try {
    const result = validateCommandOperationalContracts(projectRoot, {
      pluginRoot: process.cwd(),
    });

    assert.equal(result.pass, true, JSON.stringify(result.issues, null, 2));
    assert.ok(result.checked >= 15);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
