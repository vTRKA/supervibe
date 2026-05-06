import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixtureRequest, runFixture } from "../scripts/lib/autonomous-loop-e2e-harness.mjs";

test("e2e fixture dry-run reaches final report", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-e2e-"));
  const result = await runFixture(rootDir, "local-node-app");
  assert.ok(result.finalScore >= 9);
  assert.equal(result.stopReason, null);
  assert.match(fixtureRequest("docker-compose-app"), /Docker Compose/);
});

test("e2e fixture can stop for user goal acceptance after system pass", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-e2e-acceptance-"));
  const result = await runFixture(rootDir, "local-node-app", { requireUserAcceptance: true });
  assert.equal(result.status, "AWAITING_USER_ACCEPTANCE");
  assert.equal(result.state.system_acceptance.pass, true);
  assert.equal(result.state.user_goal_acceptance.required, true);
  assert.equal(result.state.user_goal_acceptance.status, "pending");
  assert.equal(result.state.final_acceptance.pass, false);
});
