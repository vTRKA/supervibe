import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignArtifactWriteGates,
} from "../scripts/validate-design-artifact-write-gates.mjs";

const AXES = [
  "creative_alternatives",
  "anti_generic_guardrail",
  "visual_direction_tone",
  "audience_trust_posture",
  "information_density",
  "typography_personality",
  "palette_mood",
  "motion_intensity",
  "component_feel",
  "reference_borrow_avoid",
];

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

function preferences(source = "user") {
  return {
    first_user_design_gate_ack: true,
    matrix: Object.fromEntries(AXES.map((axis) => [axis, {
      prompt: `Question for ${axis}`,
      answer: "Recorded answer",
      source,
      timestamp: "2026-05-03T00:00:00.000Z",
      decision_unlocked: "design-system candidate write",
    }])),
  };
}

test("design artifact write gate rejects tokens without first user preference evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/tokens.css", ":root { --color-primary: #123456; }");

  const result = validateDesignArtifactWriteGates(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-first-user-design-gate"));
});

test("design artifact write gate rejects durable styleboard before preference evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/styleboard.html", "<!doctype html><title>Styleboard</title>");

  const result = validateDesignArtifactWriteGates(root);

  assert.equal(result.pass, false);
  assert.ok(result.protectedFiles.includes(".supervibe/artifacts/prototypes/_design-system/styleboard.html"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-first-user-design-gate"));
});

test("design artifact write gate allows diagnostic scratch styleboard before preference evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/.scratch/run-1/styleboard.html", "<!doctype html><title>Scratch</title>");

  const result = validateDesignArtifactWriteGates(root);

  assert.equal(result.pass, true);
  assert.deepEqual(result.protectedFiles, []);
});


test("design artifact write gate rejects inferred preference matrix sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json", JSON.stringify({ status: "candidate" }, null, 2));
  await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", JSON.stringify(preferences("inferred"), null, 2));

  const result = validateDesignArtifactWriteGates(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => /source=user or source=explicit-default/.test(issue.message)));
});

test("design artifact write gate accepts explicit defaults and approval evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", JSON.stringify(preferences("explicit-default"), null, 2));
  await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
  await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/tokens.css", ":root { --color-primary: #123456; }");
  await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/.approvals/palette.json", JSON.stringify({
    status: "approved",
    approved_by: "user",
    approved_at: "2026-05-03T00:00:00.000Z",
    feedback_hash: "abc123",
  }, null, 2));

  const result = validateDesignArtifactWriteGates(root);

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});

test("design artifact write gate accepts canonical wizard decisions as preferences source", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json", JSON.stringify({ status: "candidate" }, null, 2));
  await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", JSON.stringify({
    first_user_design_gate_ack: true,
    designWizard: {
      decisions: Object.fromEntries(AXES.map((axis) => [axis, {
        axis,
        prompt: `Question for ${axis}`,
        answer: "Recorded answer",
        source: "user",
        answeredAt: "2026-05-03T00:00:00.000Z",
        decisionUnlocked: "design-system candidate write",
      }])),
    },
  }, null, 2));

  const result = validateDesignArtifactWriteGates(root);

  assert.equal(result.pass, true);
});

test("design artifact write gate rejects candidate markers in approvals folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", JSON.stringify(preferences("user"), null, 2));
  await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/.approvals/palette.json", JSON.stringify({
    status: "candidate",
  }, null, 2));

  const result = validateDesignArtifactWriteGates(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "candidate-marker-in-approvals-folder"));
});
