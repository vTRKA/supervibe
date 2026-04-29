import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendPlanAmendment, createAmendment } from "../scripts/lib/autonomous-loop-plan-updater.mjs";

test("amendments cap confidence until resolved", async () => {
  const amendment = createAmendment({ sourceTaskId: "t1", reason: "missing test" });
  assert.equal(amendment.confidenceCapUntilResolved, 8);
  const dir = await mkdtemp(join(tmpdir(), "supervibe-loop-plan-"));
  const plan = join(dir, "plan.md");
  await writeFile(plan, "# Plan\n", "utf8");
  await appendPlanAmendment(plan, amendment);
  assert.match(await readFile(plan, "utf8"), /Loop Amendments/);
});
