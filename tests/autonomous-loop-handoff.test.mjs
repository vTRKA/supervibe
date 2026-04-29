import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendHandoff, createHandoff, validateHandoff } from "../scripts/lib/autonomous-loop-handoff.mjs";

test("handoff validates required evidence fields", async () => {
  const handoff = createHandoff({
    sourceAgent: "stack-developer",
    targetAgent: "quality-gate-reviewer",
    taskId: "t1",
    summary: "done",
    confidenceScore: 9,
  });
  assert.equal(validateHandoff(handoff).valid, true);
  const dir = await mkdtemp(join(tmpdir(), "supervibe-loop-handoff-"));
  const file = join(dir, "handoffs.jsonl");
  await appendHandoff(file, handoff);
  assert.equal(JSON.parse((await readFile(file, "utf8")).trim()).taskId, "t1");
});
