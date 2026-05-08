import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildCandidateManagerStatus,
  formatCandidateManagerReport,
  planCandidateArchive,
} from "../scripts/design-system-candidate-manager.mjs";

const DESIGN_SYSTEM_ROOT = ".supervibe/artifacts/prototypes/_design-system";

test("design-system candidate manager classifies active, rejected, and stale candidates", async () => {
  const root = await createCandidateFixture();
  const status = buildCandidateManagerStatus(root, {
    now: "2026-05-09T00:00:00.000Z",
    staleDays: 14,
  });

  assert.equal(status.pass, true);
  assert.equal(status.activeCandidate, "active-one");
  assert.equal(status.candidates.length, 3);

  const active = status.candidates.find((candidate) => candidate.id === "active-one");
  const rejected = status.candidates.find((candidate) => candidate.id === "rejected-one");
  const stale = status.candidates.find((candidate) => candidate.id === "old-draft");

  assert.equal(active.isActive, true);
  assert.equal(active.archiveRecommended, false);
  assert.equal(rejected.archiveRecommended, true);
  assert.equal(rejected.archiveReason, "rejected");
  assert.equal(stale.archiveRecommended, true);
  assert.match(stale.archiveReason, /stale>14d/);
});

test("design-system candidate archive plan never archives the active candidate", async () => {
  const root = await createCandidateFixture();
  const status = planCandidateArchive(root, {
    now: "2026-05-09T00:00:00.000Z",
    staleDays: 14,
  });

  assert.deepEqual(
    status.archivePlan.map((item) => item.id).sort(),
    ["old-draft", "rejected-one"],
  );
  assert.equal(status.archivePlan.some((item) => item.id === "active-one"), false);
});

test("design-system candidate manager report is stable and operator-readable", async () => {
  const root = await createCandidateFixture();
  const status = planCandidateArchive(root, {
    now: "2026-05-09T00:00:00.000Z",
    staleDays: 14,
  });
  const report = formatCandidateManagerReport(status);

  assert.match(report, /SUPERVIBE_DESIGN_SYSTEM_CANDIDATES/);
  assert.match(report, /ACTIVE: active-one/);
  assert.match(report, /ARCHIVE_RECOMMENDED: 2/);
  assert.match(report, /ARCHIVE: old-draft/);
});

async function createCandidateFixture() {
  const root = await mkdtemp(join(tmpdir(), "supervibe-candidate-manager-"));
  const candidates = join(root, ...DESIGN_SYSTEM_ROOT.split("/"), ".candidates");
  await mkdir(join(candidates, "active-one"), { recursive: true });
  await mkdir(join(candidates, "rejected-one"), { recursive: true });
  await mkdir(join(candidates, "old-draft"), { recursive: true });

  await writeJson(join(candidates, "active.json"), {
    activeCandidate: "active-one",
  });
  await writeJson(join(candidates, "active-one", "candidate.json"), {
    status: "candidate",
    updatedAt: "2026-05-08T00:00:00.000Z",
  });
  await writeJson(join(candidates, "rejected-one", "candidate.json"), {
    status: "rejected",
    updatedAt: "2026-05-08T00:00:00.000Z",
  });
  await writeJson(join(candidates, "old-draft", "candidate.json"), {
    status: "candidate",
    updatedAt: "2026-04-01T00:00:00.000Z",
  });

  return root;
}

function writeJson(path, data) {
  return writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
