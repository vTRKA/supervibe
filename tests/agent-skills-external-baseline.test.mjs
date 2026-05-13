import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateSkillContentQuality } from "../scripts/validate-skill-content-quality.mjs";

const ROOT = process.cwd();

test("external baseline fixture captures reusable skill anatomy and lifecycle domains", async () => {
  const fixture = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "agent-skills-external-baseline.json"), "utf8"));

  assert.equal(fixture.policy, "advisory-with-local-validator-enforcement");
  for (const section of ["When not to use", "Common rationalizations", "Red flags", "Checklist", "Failure modes"]) {
    assert.ok(fixture.requiredSkillAnatomy.includes(section));
  }
  assert.deepEqual(fixture.canonicalLifecycleDomains, ["spec", "plan", "build", "test", "review", "ship"]);
});

test("skill validator derives required anatomy from the external baseline fixture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-skill-baseline-"));
  await mkdir(join(dir, "tests", "fixtures"), { recursive: true });
  await mkdir(join(dir, "skills", "fixture-skill"), { recursive: true });
  await writeFile(join(dir, "tests", "fixtures", "agent-skills-external-baseline.json"), JSON.stringify({
    requiredSkillAnatomy: ["Procedure", "Red flags"],
  }), "utf8");
  await writeFile(join(dir, "skills", "fixture-skill", "SKILL.md"), [
    "---",
    "allowed-tools:",
    "  - Bash",
    "phase: test",
    "emits-artifact: fixture",
    "confidence-rubric: fixture",
    "gate-on-exit: true",
    "---",
    "# Fixture skill",
    "",
    "See `skill-expert-operating-standard.md`.",
    "",
    "## Procedure",
    "",
    "Run the fixture.",
  ].join("\n"), "utf8");

  const report = validateSkillContentQuality(dir);
  assert.ok(report.issues.some((issue) => issue.code === "missing-red-flags"));
  assert.ok(!report.issues.some((issue) => issue.code === "missing-checklist"));
});
