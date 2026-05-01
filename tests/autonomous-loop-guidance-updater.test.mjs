import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  GUIDANCE_APPROVAL_TOKEN,
  applyGuidanceUpdatePlan,
  createGuidanceUpdatePlan,
  recordRejectedLearningCandidates,
  renderGuidanceBlock,
} from "../scripts/lib/autonomous-loop-guidance-updater.mjs";

async function tempRoot(name) {
  return await mkdtemp(join(tmpdir(), `supervibe-${name}-`));
}

test("guidance update plan groups scoped candidates and requires review before writing", async () => {
  const rootDir = await tempRoot("guidance-plan");
  await writeFile(join(rootDir, "AGENTS.md"), "# Root Guidance\n", "utf8");

  const plan = await createGuidanceUpdatePlan([
    { id: "l1", type: "repo-convention", scope: "repo convention", summary: "Use graph export before diagnosing loop scheduling.", evidence: ["progress.md"] },
    { id: "l2", type: "command-convention", scope: "command convention", summary: "Document new loop flags in commands/supervibe-loop.md.", evidence: ["final-report.md"] },
  ], { rootDir });

  assert.equal(plan.requiresReview, true);
  assert.equal(plan.proposedUpdates.length, 2);
  assert.match(renderGuidanceBlock(plan.proposedUpdates[0].candidates), /Reviewed Autonomous Loop Learnings/);

  const blocked = await applyGuidanceUpdatePlan(plan, { rootDir });
  assert.equal(blocked.applied, false);
  assert.equal(blocked.status, "blocked");
  assert.equal(await readFile(join(rootDir, "AGENTS.md"), "utf8"), "# Root Guidance\n");
});

test("approved guidance updates write reviewed blocks and skip duplicates", async () => {
  const rootDir = await tempRoot("guidance-apply");
  await writeFile(join(rootDir, "AGENTS.md"), "# Root Guidance\n", "utf8");

  const candidates = [
    { id: "l1", type: "test-convention", scope: "test convention", summary: "Run docs tests before marking README sync complete.", evidence: ["tests/readme-autonomous-loop-docs.test.mjs"] },
  ];
  const plan = await createGuidanceUpdatePlan(candidates, { rootDir });
  const applied = await applyGuidanceUpdatePlan(plan, {
    rootDir,
    approval: { approved: true, token: GUIDANCE_APPROVAL_TOKEN, reviewedBy: "quality-gate-reviewer" },
  });

  assert.deepEqual(applied.changedFiles, ["AGENTS.md"]);
  const content = await readFile(join(rootDir, "AGENTS.md"), "utf8");
  assert.match(content, /Reviewed Autonomous Loop Learnings/);
  assert.match(content, /Run docs tests/);

  const duplicatePlan = await createGuidanceUpdatePlan(candidates, { rootDir });
  assert.equal(duplicatePlan.proposedUpdates.length, 0);
  assert.equal(duplicatePlan.duplicateCandidates.length, 1);
});

test("guidance update plan preserves a Claude-only host instruction file when it is the existing project surface", async () => {
  const rootDir = await tempRoot("guidance-claude-host");
  await writeFile(join(rootDir, "CLAUDE.md"), "# Claude Host Guidance\n", "utf8");

  const plan = await createGuidanceUpdatePlan([
    { id: "l1", type: "repo-convention", scope: "repo convention", summary: "Keep loop diagnostics in the active host instruction file.", evidence: ["final-report.md"] },
  ], { rootDir });
  const applied = await applyGuidanceUpdatePlan(plan, {
    rootDir,
    approval: { approved: true, token: GUIDANCE_APPROVAL_TOKEN },
  });

  assert.deepEqual(applied.changedFiles, ["CLAUDE.md"]);
  const content = await readFile(join(rootDir, "CLAUDE.md"), "utf8");
  assert.match(content, /Reviewed Autonomous Loop Learnings/);
});

test("rejected learning candidates are archived instead of written to guidance", async () => {
  const rootDir = await tempRoot("guidance-rejected");
  const result = await recordRejectedLearningCandidates([
    { id: "bad", type: "repo-convention", scope: "repo convention", summary: "Maybe keep unresolved behavior" },
  ], join(rootDir, "archive"), { reason: "unresolved speculation" });

  assert.equal(result.count, 1);
  const archived = JSON.parse(await readFile(result.path, "utf8"));
  assert.equal(archived.reason, "unresolved speculation");
  assert.equal(archived.candidates[0].id, "bad");
});
