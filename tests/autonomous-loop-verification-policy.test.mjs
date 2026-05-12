import assert from "node:assert/strict";
import test from "node:test";

import {
  applyVerificationPolicyToMatrix,
  filterVerificationCommandsForEpicPhase,
  isHeavyVerificationCommand,
} from "../scripts/lib/autonomous-loop-verification-policy.mjs";

test("heavy verification command classifier catches global checks", () => {
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
    "node scripts/supervibe-commands.mjs --match \"Продолжи\"",
    "npm run validate:trigger-replay",
    "npm run validate:workflow-receipts",
  ]) {
    assert.equal(isHeavyVerificationCommand(command), false, command);
  }
});

test("open epic defers heavy verification and keeps targeted checks runnable", () => {
  const policy = filterVerificationCommandsForEpicPhase([
    "npm run check",
    "node --test tests/intent-continuation-routing.test.mjs",
  ], {
    epicComplete: false,
  });

  assert.deepEqual(policy.runnableCommands, [
    "node --test tests/intent-continuation-routing.test.mjs",
  ]);
  assert.deepEqual(policy.deferredCommands.map((item) => item.command), ["npm run check"]);
});

test("completed epic or explicit final mode allows heavy verification", () => {
  assert.deepEqual(filterVerificationCommandsForEpicPhase(["npm run check"], {
    epicComplete: true,
  }).runnableCommands, ["npm run check"]);

  assert.deepEqual(filterVerificationCommandsForEpicPhase(["npm run check"], {
    allowHeavy: true,
  }).runnableCommands, ["npm run check"]);
});

test("verification matrix records deferred heavy commands without sending them to workers", () => {
  const policy = filterVerificationCommandsForEpicPhase(["npm run check"], {
    epicComplete: false,
  });
  const matrix = applyVerificationPolicyToMatrix([{
    scenarioId: "verify-t1",
    taskId: "t1",
    command: "npm run check",
    expectedOutcome: "exits 0",
  }], policy);

  assert.equal(matrix[0].command, null);
  assert.equal(matrix[0].deferredCommand, "npm run check");
  assert.equal(matrix[0].deferredReason, "deferred-until-epic-complete");
});
