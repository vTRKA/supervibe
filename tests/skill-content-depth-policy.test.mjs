import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateSkillContentQuality } from "../scripts/validate-skill-content-quality.mjs";

const REQUIRED_ANATOMY = [
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
];

test("depth policy stages baseline anatomy gaps in report-only mode", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeBaselineFixture(root);
    await writeSkill(root, "fixture-skill", legacyCompleteSkill());

    const report = validateSkillContentQuality(root, { rolloutMode: "report-only" });

    assert.equal(report.pass, true);
    assert.ok(report.stagedIssues.some((issue) => issue.code === "missing-overview"));
    assert.ok(report.stagedIssues.some((issue) => issue.code === "missing-when-to-use"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture-only mode hard-fails exact local baseline anatomy gaps", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeBaselineFixture(root);
    await writeSkill(root, "fixture-skill", legacyCompleteSkill());

    const report = validateSkillContentQuality(root, { rolloutMode: "fixture-only" });

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "missing-overview"));
    assert.ok(report.issues.some((issue) => issue.code === "missing-when-to-use"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report-only mode stages critical depth diagnostics without failing the gate", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeBaselineFixture(root);
    await writeInventory(root, [{ name: "critical-flow", class: "critical", action: "deepen" }]);
    await writeSkill(root, "critical-flow", genericCriticalSkill());

    const report = validateSkillContentQuality(root, { rolloutMode: "report-only" });
    const codes = new Set(report.stagedIssues.map((issue) => issue.code));

    assert.equal(report.pass, true);
    assert.equal(report.classificationCounts.critical, 1);
    for (const code of [
      "missing-concrete-examples",
      "generic-rationalizations",
      "missing-red-flags",
      "missing-output-fields",
      "missing-verification-commands",
      "weak-operational-specificity",
    ]) {
      assert.ok(codes.has(code), `missing staged diagnostic ${code}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hard-gate mode blocks generic critical skill anatomy", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeBaselineFixture(root);
    await writeInventory(root, [{ name: "critical-flow", class: "critical", action: "deepen" }]);
    await writeSkill(root, "critical-flow", genericCriticalSkill());

    const report = validateSkillContentQuality(root, { rolloutMode: "hard-gate" });
    const codes = new Set(report.issues.map((issue) => issue.code));

    assert.equal(report.pass, false);
    for (const code of [
      "missing-concrete-examples",
      "generic-rationalizations",
      "missing-red-flags",
      "missing-output-fields",
      "missing-verification-commands",
    ]) {
      assert.ok(codes.has(code), `missing hard diagnostic ${code}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hard-gate mode accepts concrete critical skill depth", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeBaselineFixture(root);
    await writeInventory(root, [{ name: "critical-flow", class: "critical", action: "fixed" }]);
    await writeSkill(root, "critical-flow", concreteCriticalSkill());

    const report = validateSkillContentQuality(root, { rolloutMode: "hard-gate" });

    assert.equal(report.pass, true);
    assert.deepEqual(report.issues, []);
    assert.equal(report.classificationCounts.critical, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("command-only skills are classified without critical example requirements", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeBaselineFixture(root);
    await writeInventory(root, [{ name: "command-router", class: "command-only", action: "map" }]);
    await writeSkill(root, "command-router", commandOnlySkill());

    const report = validateSkillContentQuality(root, { rolloutMode: "hard-gate" });

    assert.equal(report.pass, true);
    assert.equal(report.skills[0].classification, "command-only");
    assert.ok(!report.issues.some((issue) => issue.code === "missing-concrete-examples"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createTempSkillRoot() {
  const root = await mkdtemp(join(tmpdir(), "supervibe-skill-depth-"));
  await mkdir(join(root, "skills"), { recursive: true });
  return root;
}

async function writeBaselineFixture(root, requiredSkillAnatomy = REQUIRED_ANATOMY) {
  await mkdir(join(root, "tests", "fixtures"), { recursive: true });
  await writeFile(join(root, "tests", "fixtures", "skill-anatomy-baseline.json"), JSON.stringify({
    requiredSkillAnatomy,
  }, null, 2), "utf8");
}

async function writeInventory(root, skills) {
  await mkdir(join(root, ".supervibe", "artifacts", "evidence"), { recursive: true });
  await writeFile(join(root, ".supervibe", "artifacts", "evidence", "agent-skill-normalization-gap-inventory.json"), JSON.stringify({
    skills,
  }, null, 2), "utf8");
}

async function writeSkill(root, skillName, body) {
  const dir = join(root, "skills", skillName);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `${body}\n`, "utf8");
}

function skillFrontmatter(name) {
  return `---
name: ${name}
namespace: process
description: "Use WHEN validating skill depth TO enforce concrete anatomy."
allowed-tools: [Read, Bash]
phase: review
prerequisites: []
emits-artifact: depth-report
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-05-13
---`;
}

function genericCriticalSkill() {
  return `${skillFrontmatter("critical-flow")}

# Critical Flow

## Overview

Validates critical flow behavior.

## When to Use

Use for depth policy tests.

## Expert Operating Standard

Follow docs/references/skill-expert-operating-standard.md and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read the active task contract.

## When not to use

- Do not use for unrelated checks.

## Decision tree

Need a check -> run this skill.

## Procedure

1. Do work.

## Common rationalizations

- "This is small, so no source check is needed" is acceptable.
- "The user asked for speed, so skip receipts" is acceptable.
- "Existing prose is enough evidence" is acceptable.

## Red flags

- Missing verification command.
- Bad quality.
- Too vague.

## Checklist

- Evidence exists.

## Failure modes

- Generic content passes as complete.

## Examples

- Use the skill when needed.

## Output contract

Returns a structured report.

## Guard rails

- DO NOT: skip evidence.

## Verification

- Run the validator.

## Related

- verification
`;
}

function concreteCriticalSkill() {
  return `${skillFrontmatter("critical-flow")}

# Critical Flow

## Overview

Validates critical depth reports, emits a structured depth-report artifact, and gates completion on concrete verification evidence.

## When to Use

- Use when a validator policy changes critical skill behavior.
- Use when remediation needs to prove examples, output fields, and command evidence are specific.

## Expert Operating Standard

Follow docs/references/skill-expert-operating-standard.md and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read AGENTS.md, the active graph task, the local baseline fixture, and the validator source before editing policy.

## When not to use

- Do not use for command-only wrappers that intentionally delegate to another hard gate.
- Do not use when the caller only needs a read-only inventory count.

## Decision tree

Validator policy changed -> run critical depth checks -> run targeted test command -> record staged or hard result.

## Procedure

1. Read the baseline fixture and current validator source before choosing thresholds.
2. Run the targeted node test command that exercises the changed validator branch.
3. Record the output fields and verification command in the returned depth report.

## Common rationalizations

- "The critical validator already has headings" fails because headings alone do not prove concrete examples or output fields.
- "A generic release warning is enough" fails because critical skills need domain-specific red flags tied to validator behavior.
- "Report-only means no evidence is needed" fails because staged diagnostics still need exact file and issue codes.

## Red flags

- A critical skill has only one example and no anti-example for a blocked release path.
- The output contract says "structured report" without naming status, evidence, and verification fields.
- The verification section names "the validator" without the exact node or npm command.

## Checklist

- Baseline anatomy checked.
- Critical examples counted.
- Output fields counted.
- Verification command recorded.

## Failure modes

- The policy passes boilerplate copied across unrelated critical skills.
- The hard gate blocks support skills that are intentionally command-only.

## Examples

- Use after a plan graph changes shared validators: read \`AGENTS.md\`, run \`node --test tests/skill-content-depth-policy.test.mjs\`, and record the verification artifact.
- Do not accept a release handoff when no \`npm run validate:skill-content-quality\` command output is attached to the artifact.

## Output contract

- \`status\`: pass, report-only, or blocked.
- \`artifactPath\`: path to the depth report or null.
- \`verificationCommands\`: exact commands that were run.
- \`confidence\`: numeric gate score.

## Guard rails

- DO NOT: claim a critical skill is deep because the heading exists.
- ALWAYS: preserve staged diagnostics until remediation is complete.

## Verification

- \`node --test tests/skill-content-depth-policy.test.mjs\`
- \`npm run validate:skill-content-quality\`

## Related

- verification
- code-review
`;
}

function commandOnlySkill() {
  return `${skillFrontmatter("command-router")}

# Command Router

## Overview

Routes command intent to the owning workflow and emits a command-routing-report.

## When to Use

- Use when a command alias needs validation against the canonical workflow.

## Expert Operating Standard

Follow docs/references/skill-expert-operating-standard.md and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read the command contract and active host instructions.

## When not to use

- Do not use when the command owner is unknown.

## Decision tree

Command alias present -> route to owner -> stop if owner is missing.

## Procedure

1. Read the command manifest.
2. Verify the canonical owner.

## Common rationalizations

- "Alias routing is obvious" fails when durable workflow state is involved.

## Red flags

- The command owner is not named.

## Checklist

- Owner recorded.

## Failure modes

- Alias bypasses the canonical workflow.

## Output contract

Returns command-routing-report.

## Guard rails

- DO NOT: emulate the command owner.

## Verification

- Run the command validator.

## Related

- using-supervibe-skills
`;
}

function legacyCompleteSkill() {
  return `${skillFrontmatter("fixture-skill")}

# Fixture Skill

## Usage triggers

Use when validating legacy skill anatomy.

## Expert Operating Standard

Follow docs/references/skill-expert-operating-standard.md and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth

Read the active fixture.

## When not to use

- Do not use outside the fixture.

## Decision tree

Evidence exists -> proceed.

## Procedure

1. Read the fixture.
2. Verify the report.

## Common rationalizations

- "Fixture coverage is enough" fails when the local baseline changed.

## Red flags

- Exact baseline headings are absent.

## Checklist

- Fixture read.

## Failure modes

- Legacy aliases hide missing anatomy.

## Output contract

- \`status\`: pass or fail.
- \`issues\`: validator issues.
- \`stagedIssues\`: staged validator issues.

## Guard rails

- DO NOT: treat aliases as exact baseline headings.

## Verification

- \`node --test tests/skill-content-depth-policy.test.mjs\`

## Related

- verification
`;
}
