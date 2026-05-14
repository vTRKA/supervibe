import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadRequiredBodyPatterns, validateSkillContentQuality } from "../scripts/validate-skill-content-quality.mjs";

const ROOT = process.cwd();
const BASELINE_FIXTURE = join(ROOT, "tests", "fixtures", "skill-anatomy-baseline.json");

const REQUIRED_SECTIONS = Object.freeze([
  "Overview",
  "When to Use",
  "When not to use",
  "Step 0",
  "Decision tree",
  "Procedure",
  "Common rationalizations",
  "Red flags",
  "Checklist",
  "Failure modes",
  "Output contract",
  "Guard rails",
  "Verification",
  "Related",
]);

const EXPECTED_BASELINE_SKILLS = Object.freeze([
  "api-and-interface-design",
  "browser-testing-with-devtools",
  "ci-cd-and-automation",
  "code-review-and-quality",
  "code-simplification",
  "context-engineering",
  "debugging-and-error-recovery",
  "deprecation-and-migration",
  "documentation-and-adrs",
  "doubt-driven-development",
  "frontend-ui-engineering",
  "git-workflow-and-versioning",
  "idea-refine",
  "incremental-implementation",
  "performance-optimization",
  "planning-and-task-breakdown",
  "security-and-hardening",
  "shipping-and-launch",
  "source-driven-development",
  "spec-driven-development",
  "test-driven-development",
  "using-agent-skills",
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assertNoLegacyRoutingModel(fixture) {
  const serialized = JSON.stringify(fixture);
  const removedFields = [
    ["canonical", "Lifecycle", "Domains"].join(""),
    ["lifecycle", "Command", "Model"].join(""),
    ["lifecycle", "Domain", "Mappings"].join(""),
    ["canonical", "Commands"].join(""),
    ["lifecycle", "Flows"].join(""),
    ["canonical", "Flow", "Ids"].join(""),
  ];
  const legacyShortcuts = [
    ["s", "pec"],
    ["p", "lan"],
    ["bui", "ld"],
    ["te", "st"],
    ["rev", "iew"],
    ["sh", "ip"],
    ["code", "-simplify"],
  ].map((parts) => `/${parts.join("")}`);

  for (const field of removedFields) {
    assert.equal(serialized.includes(field), false, `legacy routing field returned: ${field}`);
  }
  for (const command of legacyShortcuts) {
    assert.equal(new RegExp(`${escapeRegExp(command)}\\b`).test(serialized), false, `legacy shortcut returned: ${command}`);
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("local baseline fixture captures reusable skill anatomy", async () => {
  const fixture = await readJson(BASELINE_FIXTURE);

  assert.equal(fixture.schemaVersion, 3);
  assert.equal(fixture.sourceKind, "internalized-local-baseline");
  assert.match(fixture.capturedRevision, /^\d{4}-\d{2}-\d{2}-localized$/);
  assert.match(fixture.refreshedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(fixture.license, "MIT");
  assert.equal(fixture.policy, "local-baseline-with-validator-enforcement");
  assert.equal(fixture.baselineSkillCount, 22);
  assert.equal(fixture.baselineAgentPatternCount, 3);
  assert.deepEqual(fixture.refreshMetadata, {
    capturedRevision: fixture.capturedRevision,
    refreshedAt: fixture.refreshedAt,
    refreshCommand: "Update from approved local research notes and Supervibe artifacts only.",
    stalenessPolicy: "Mark the fixture stale when local validators, skill anatomy, or approved baseline research no longer derive every required anatomy heading.",
  });

  assert.deepEqual(fixture.requiredSkillAnatomy, REQUIRED_SECTIONS);

  assert.deepEqual(fixture.referencePackModel.categories.map((category) => category.id), [
    "accessibility",
    "orchestration",
    "performance",
    "security",
    "testing",
  ]);
  const categoryReferences = fixture.referencePackModel.categories.flatMap((category) => category.references);
  assert.deepEqual([...categoryReferences].sort(), [...fixture.referencePackModel.baselineReferences].sort());
  for (const category of fixture.referencePackModel.categories) {
    assert.ok(category.localTreatment);
    assert.ok(category.references.length > 0);
  }
  for (const entry of fixture.referencePackModel.baselineReferences) {
    assert.equal(entry, entry.replaceAll("\\", "/"));
    assert.ok(entry.startsWith("references/"));
    assert.doesNotMatch(entry, /^[A-Za-z]:[\\/]/);
    assert.doesNotMatch(entry, /^([\\/]{1,2}|~)/);
    assert.doesNotMatch(entry, /%TEMP%|AppData/i);
    assert.doesNotMatch(entry, /(^|[\\/])Temp([\\/]|$)/i);
  }
  assert.ok(fixture.hookPortabilityNotes.some((entry) => /shell hooks/i.test(entry.sourceSurface)));
  assert.ok(fixture.hookPortabilityNotes.some((entry) => /not directly portable/i.test(entry.portability)));
  assert.ok(fixture.hookPortabilityNotes.every((entry) => entry.localTreatment));
  assert.ok(fixture.hookPortabilityConstraints.some((entry) => /do not copy shell hooks/i.test(entry)));
  assert.ok(fixture.hookPortabilityConstraints.some((entry) => /host-neutral|host-specific/i.test(entry)));

  assert.equal(fixture.equivalenceRows.length, 22);
  const baselineSkills = fixture.equivalenceRows.map((row) => row.baselineSkill).sort();
  assert.deepEqual(baselineSkills, [...EXPECTED_BASELINE_SKILLS].sort());
  assert.equal(new Set(baselineSkills).size, fixture.baselineSkillCount);
  for (const row of fixture.equivalenceRows) {
    assert.ok(row.baselineSkill);
    assert.ok(row.localEquivalent);
    assert.ok(row.gap);
    assert.ok(row.action);
    assert.match(row.owner, /^T\d{3}$/);
    assert.ok(row.verification);
  }
  assertNoLegacyRoutingModel(fixture);
});

test("skill validator derives required anatomy from the local baseline fixture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-skill-baseline-"));
  await mkdir(join(dir, "tests", "fixtures"), { recursive: true });
  await mkdir(join(dir, "skills", "fixture-skill"), { recursive: true });
  await writeFile(join(dir, "tests", "fixtures", "skill-anatomy-baseline.json"), JSON.stringify({
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

  assert.deepEqual(loadRequiredBodyPatterns(dir).map(([code]) => code), [
    "missing-procedure",
    "missing-red-flags",
  ]);

  const report = validateSkillContentQuality(dir);
  assert.ok(report.issues.some((issue) => issue.code === "missing-red-flags"));
  assert.ok(!report.issues.some((issue) => issue.code === "missing-checklist"));
});

test("skill validator reports unsupported local anatomy headings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-skill-baseline-"));
  await mkdir(join(dir, "tests", "fixtures"), { recursive: true });
  await mkdir(join(dir, "skills", "fixture-skill"), { recursive: true });
  await writeFile(join(dir, "tests", "fixtures", "skill-anatomy-baseline.json"), JSON.stringify({
    requiredSkillAnatomy: ["Procedure", "Fixture-only heading"],
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
    "1. Read the fixture.",
    "2. Verify the validator report.",
  ].join("\n"), "utf8");

  const report = validateSkillContentQuality(dir);
  const unsupported = report.issues.find((issue) => issue.code === "unsupported-baseline-anatomy");
  assert.ok(unsupported);
  assert.match(unsupported.message, /Fixture-only heading/);
});
