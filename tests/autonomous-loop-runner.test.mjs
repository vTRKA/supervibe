import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runAutonomousLoop } from "../scripts/lib/autonomous-loop-runner.mjs";

test("runner executes dry-run request and writes loop state", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-"));
  const result = await runAutonomousLoop({ rootDir, request: "validate integrations", dryRun: true, maxLoops: 20 });
  assert.equal(result.status, "COMPLETE");
  assert.ok(result.finalScore >= 9);
  assert.equal(result.state.final_acceptance.pass, true);
  assert.equal(result.state.plugin_version, "0.0.0");
  assert.match(result.reportPath, /final-report\.md$/);
});

test("runner sizes default loop budget for plan tasks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-loop-plan-"));
  const planPath = join(rootDir, "plan.md");
  const items = Array.from({ length: 21 }, (_, index) => `- [ ] **Step ${index + 1}: Verify local item ${index + 1}**`);
  await writeFile(planPath, `# Plan\n\n${items.join("\n")}\n`, "utf8");
  const result = await runAutonomousLoop({ rootDir, plan: planPath, dryRun: true });
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.state.tasks.length, 21);
  assert.equal(result.stopReason, null);
  assert.equal(result.state.final_acceptance.score, 10);
});
