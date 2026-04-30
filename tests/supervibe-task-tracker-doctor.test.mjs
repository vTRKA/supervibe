import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { atomizePlanToWorkItems } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import {
  diagnoseTaskTracker,
  formatTaskTrackerDoctorReport,
  repairTaskTracker,
} from "../scripts/lib/supervibe-task-tracker-doctor.mjs";
import { createTrackerMapping, writeTrackerMapping } from "../scripts/lib/supervibe-task-tracker-sync.mjs";

function graph() {
  return atomizePlanToWorkItems(`# Plan

## Task 1: Build feature
**Acceptance Criteria:**
- Works
\`\`\`bash
npm test
\`\`\`
`, { epicId: "epic-doctor", planPath: "docs/plans/doctor.md", planReviewPassed: true });
}

test("task tracker doctor reports missing mappings, duplicate external tasks, orphans, stale claims, and worktree drift", () => {
  const workGraph = graph();
  const taskId = workGraph.items.find((item) => item.type !== "epic").itemId;
  const diagnosis = diagnoseTaskTracker({
    graph: workGraph,
    mapping: {
      graphId: workGraph.epicId,
      items: {
        [taskId]: { nativeId: taskId, externalId: "EXT-1" },
        orphan: { nativeId: "orphan", externalId: "EXT-1" },
      },
    },
    externalState: { tasks: [{ externalId: "EXT-orphan" }] },
    claims: [{ taskId, claimId: "claim-1", status: "active", expiresAt: "2000-01-01T00:00:00.000Z" }],
    sessions: [{ sessionId: "session-1", status: "active", epicId: "different" }],
  });

  assert.equal(diagnosis.ok, false);
  assert.ok(diagnosis.issues.some((item) => item.code === "duplicate-external-task"));
  assert.ok(diagnosis.issues.some((item) => item.code === "orphan-external-task"));
  assert.ok(diagnosis.issues.some((item) => item.code === "stale-claim"));
  assert.ok(diagnosis.issues.some((item) => item.code === "worktree-visibility-drift"));
  assert.match(formatTaskTrackerDoctorReport(diagnosis), /SUPERVIBE_TASK_TRACKER_DOCTOR/);
});

test("task tracker doctor fix repairs local mapping after writing backup", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-tracker-doctor-"));
  const workGraph = graph();
  const mappingPath = join(rootDir, "map.json");
  const mapping = createTrackerMapping({ graph: workGraph, adapterId: "memory" });
  mapping.items.orphan = { nativeId: "orphan", externalId: "EXT-orphan" };
  await writeTrackerMapping(mappingPath, mapping);

  const result = await repairTaskTracker({ graph: workGraph, mappingPath, fix: true });

  assert.equal(result.changed, true);
  assert.match(result.backupPath, /map\.json\.backup$/);
  assert.equal(result.mapping.items.orphan, undefined);
  assert.ok(Object.keys(result.mapping.items).length >= workGraph.items.length);
});
