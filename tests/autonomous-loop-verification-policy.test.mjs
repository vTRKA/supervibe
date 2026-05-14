import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVerificationPolicyToMatrix,
  filterVerificationCommandsForEpicPhase,
  isHeavyVerificationCommand,
  isReleaseOnlyVerificationCommand,
} from "../scripts/lib/autonomous-loop-verification-policy.mjs";

test("heavy verification command classifier still catches global checks", () => {
  for (const command of [
    "npm run check",
    "npm test",
    "npm run check:release-strict",
    "npm run validate:epic-completion",
    "node --test",
    "node --test tests/a.test.mjs tests/b.test.mjs tests/c.test.mjs tests/d.test.mjs",
  ]) {
    assert.equal(isHeavyVerificationCommand(command), true, command);
  }

  for (const command of [
    "node --test tests/intent-continuation-routing.test.mjs",
    'node scripts/supervibe-commands.mjs --match "continue"',
    "npm run validate:trigger-replay",
    "npm run validate:workflow-receipts",
  ]) {
    assert.equal(isHeavyVerificationCommand(command), false, command);
  }
});

test("release-only classifier catches all tests and validators", () => {
  for (const command of [
    "node --test tests/intent-continuation-routing.test.mjs",
    "npm run validate:trigger-replay",
    "npm run validate:workflow-receipts",
    "node scripts/validate-work-item-graphs.mjs",
    "npx vitest run src/a.test.ts",
    "pytest tests/test_flow.py",
  ]) {
    assert.equal(isReleaseOnlyVerificationCommand(command), true, command);
  }

  assert.equal(isReleaseOnlyVerificationCommand("node scripts/supervibe-commands.mjs --match continue"), false);
});

test("open epic defers tests and validators to final release gate", () => {
  const policy = filterVerificationCommandsForEpicPhase([
    "npm run check",
    "node --test tests/intent-continuation-routing.test.mjs",
    "npm run validate:workflow-receipts",
    "node scripts/supervibe-commands.mjs --match continue",
  ], {
    epicComplete: false,
  });

  assert.deepEqual(policy.runnableCommands, [
    "node scripts/supervibe-commands.mjs --match continue",
  ]);
  assert.deepEqual(policy.deferredCommands.map((item) => item.command), [
    "npm run check",
    "node --test tests/intent-continuation-routing.test.mjs",
    "npm run validate:workflow-receipts",
  ]);
  assert.deepEqual([...new Set(policy.deferredCommands.map((item) => item.reason))], ["deferred-until-release-gate"]);
});

test("completed epic or explicit final mode allows release-only verification", () => {
  assert.deepEqual(filterVerificationCommandsForEpicPhase(["node --test tests/a.test.mjs"], {
    epicComplete: true,
  }).runnableCommands, ["node --test tests/a.test.mjs"]);

  assert.deepEqual(filterVerificationCommandsForEpicPhase(["npm run validate:workflow-receipts"], {
    allowHeavy: true,
  }).runnableCommands, ["npm run validate:workflow-receipts"]);
});

test("verification matrix records deferred release-only commands without sending them to workers", () => {
  const policy = filterVerificationCommandsForEpicPhase(["npm run validate:workflow-receipts"], {
    epicComplete: false,
  });
  const matrix = applyVerificationPolicyToMatrix([{
    scenarioId: "verify-t1",
    taskId: "t1",
    command: "npm run validate:workflow-receipts",
    expectedOutcome: "exits 0",
  }], policy);

  assert.equal(matrix[0].command, null);
  assert.equal(matrix[0].deferredCommand, "npm run validate:workflow-receipts");
  assert.equal(matrix[0].deferredReason, "deferred-until-release-gate");
  assert.match(matrix[0].expectedOutcome, /final release gate/);
});
