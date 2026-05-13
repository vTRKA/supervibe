import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  validateSkillContentQuality,
} from "../scripts/validate-skill-content-quality.mjs";

test("skill content quality accepts a complete expert skill contract", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeSkill(root, "complete", completeSkillBody());

    const report = validateSkillContentQuality(root);

    assert.equal(report.pass, true);
    assert.equal(report.issues.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skill content quality blocks missing decision trees", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeSkill(root, "thin", completeSkillBody().replace(/## Decision tree[\s\S]*?(?=\n## Procedure)/, ""));

    const report = validateSkillContentQuality(root);

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "missing-decision-tree"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skill content quality blocks unresolved frontmatter placeholders", async () => {
  const root = await createTempSkillRoot();
  try {
    await writeSkill(root, "placeholder", completeSkillBody().replace("complete-skill", "{{NAME}}"));

    const report = validateSkillContentQuality(root);

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "template-placeholder"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createTempSkillRoot() {
  const root = await mkdtemp(join(tmpdir(), "supervibe-skill-quality-"));
  await mkdir(join(root, "skills"), { recursive: true });
  return root;
}

async function writeSkill(root, skillName, body) {
  const dir = join(root, "skills", skillName);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `${body}\n`, "utf8");
}

function completeSkillBody() {
  return `---
name: complete-skill
namespace: process
description: "Use WHEN testing skill quality TO validate content gates."
allowed-tools: [Read, Bash]
phase: review
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: true
version: 1.0
last-verified: 2026-05-06
---

# Complete Skill

## When to invoke

Use when validating the skill content-quality gate.

## Expert Operating Standard

Follow docs/references/skill-expert-operating-standard.md and keep confidence below gate when evidence is partial.

## Step 0 - Read source of truth (required)

Read host instructions and relevant project artifacts.

## When not to use

- Do not use when the caller needs only a one-line status check.
- Do not use when required source artifacts are unavailable.

## Decision tree

\`\`\`
Evidence is missing
  -> stop and repair before claiming completion.
\`\`\`

## Procedure

1. Gather evidence.
2. Score with confidence-scoring.

## Common rationalizations

- "The fixture is small, so evidence does not matter" is not acceptable.
- "The validator probably caught enough" is not acceptable.

## Red flags

- Missing host instructions.
- Missing verification command.

## Checklist

- Evidence was read.
- Required sections are present.
- Verification output was inspected.

## Failure modes

- False confidence from incomplete fixtures.
- Drift between validation rules and complete examples.

## Output contract

Returns a structured report.

## Guard rails

- DO NOT: claim completion without verification evidence.
- ALWAYS: cite the checked artifact.

## Verification

- Run the validator and inspect the report.

## Related

- supervibe:verification
`;
}
