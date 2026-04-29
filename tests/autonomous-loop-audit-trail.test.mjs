import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendAuditEvent, createAuditEvent, finalReportProvenance } from "../scripts/lib/autonomous-loop-audit-trail.mjs";

test("audit events and provenance are structured", () => {
  assert.equal(createAuditEvent("dispatch").type, "dispatch");
  assert.deepEqual(finalReportProvenance({ tasks: [{ id: "t1" }] }).taskIds, ["t1"]);
});

test("audit events append as jsonl", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-loop-audit-"));
  const file = join(dir, "events.jsonl");
  const event = await appendAuditEvent(file, "score", { taskId: "t1" });
  const content = await readFile(file, "utf8");
  assert.equal(JSON.parse(content.trim()).type, "score");
  assert.equal(event.payload.taskId, "t1");
});
