import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  validateAgentSkillCoverage,
} from "../scripts/validate-agent-skill-coverage.mjs";

test("current agent roster has foundational and specialist skill coverage", () => {
  const result = validateAgentSkillCoverage(process.cwd());
  assert.equal(result.checked, 96);
  assert.equal(result.checkedSkills, 64);
  assert.ok(result.checkedSkillClasses.foundational > 0);
  assert.ok(result.checkedSkillClasses.specialist > 0);
  assert.ok(result.checkedSkillClasses["command-only"] > 0);
  assert.ok(result.checkedSkillClasses.support > 0);
  assert.ok(result.checkedSkillClasses.experimental > 0);
  assert.deepEqual(result.issues, []);
});

test("agent skill coverage validator rejects generic-only skill sets", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-skill-coverage-"));
  await mkdir(join(root, "agents"), { recursive: true });
  for (const skill of ["project-memory", "code-search", "verification", "confidence-scoring"]) {
    await mkdir(join(root, "skills", skill), { recursive: true });
  }
  await writeFile(join(root, "agents", "weak-agent.md"), [
    "---",
    "name: weak-agent",
    "skills:",
    "  - supervibe:project-memory",
    "  - supervibe:code-search",
    "  - supervibe:verification",
    "  - supervibe:confidence-scoring",
    "---",
    "# weak-agent",
    "",
    "## Skills",
    "",
    "- `supervibe:project-memory` - memory.",
    "- `supervibe:code-search` - search.",
    "- `supervibe:verification` - verify.",
    "- `supervibe:confidence-scoring` - score.",
    "",
  ].join("\n"));

  const result = validateAgentSkillCoverage(root);
  assert.equal(result.pass, false);
  assert.ok(result.issues.some((item) => item.code === "missing-specialist-skill"));
});

test("agent skill coverage validator rejects skills without an agent owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-skill-owner-"));
  await mkdir(join(root, "agents"), { recursive: true });
  for (const skill of ["project-memory", "code-search", "verification", "strengthen", "orphan-skill"]) {
    await mkdir(join(root, "skills", skill), { recursive: true });
  }
  await writeFile(join(root, "agents", "owned-agent.md"), [
    "---",
    "name: owned-agent",
    "skills:",
    "  - supervibe:project-memory",
    "  - supervibe:code-search",
    "  - supervibe:verification",
    "  - supervibe:strengthen",
    "---",
    "# owned-agent",
    "",
    "## Skills",
    "",
    "- `supervibe:project-memory` - memory.",
    "- `supervibe:code-search` - search.",
    "- `supervibe:verification` - verify.",
    "- `supervibe:strengthen` - improve weak artifacts.",
    "",
  ].join("\n"));

  const result = validateAgentSkillCoverage(root);
  assert.equal(result.pass, false);
  assert.ok(result.issues.some((item) => item.code === "skill-unowned-by-agent" && item.file === "supervibe:orphan-skill"));
});

test("critical skills require two supported independent owners", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-critical-skill-owner-"));
  await mkdir(join(root, "agents", "_core"), { recursive: true });
  await mkdir(join(root, "skills", "receiving-code-review"), { recursive: true });
  for (const skill of ["project-memory", "code-search", "verification"]) {
    await mkdir(join(root, "skills", skill), { recursive: true });
  }
  await writeAgent(join(root, "agents", "_core", "code-reviewer.md"), [
    "supervibe:project-memory",
    "supervibe:code-search",
    "supervibe:verification",
    "supervibe:receiving-code-review",
  ]);

  const fragile = validateAgentSkillCoverage(root);
  assert.equal(fragile.pass, false);
  assert.ok(fragile.issues.some((item) => (
    item.code === "fragile-critical-skill-ownership"
    && item.file === "supervibe:receiving-code-review"
  )));

  await writeAgent(join(root, "agents", "_core", "quality-gate-reviewer.md"), [
    "supervibe:project-memory",
    "supervibe:code-search",
    "supervibe:verification",
    "supervibe:receiving-code-review",
  ]);

  const redundant = validateAgentSkillCoverage(root);
  assert.equal(redundant.pass, true);
});

test("unrelated critical skill owners do not satisfy redundancy policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-unrelated-critical-owner-"));
  await mkdir(join(root, "agents", "_core"), { recursive: true });
  await mkdir(join(root, "agents", "_design"), { recursive: true });
  await mkdir(join(root, "skills", "receiving-code-review"), { recursive: true });
  for (const skill of ["project-memory", "code-search", "verification"]) {
    await mkdir(join(root, "skills", skill), { recursive: true });
  }
  await writeAgent(join(root, "agents", "_core", "code-reviewer.md"), [
    "supervibe:project-memory",
    "supervibe:code-search",
    "supervibe:verification",
    "supervibe:receiving-code-review",
  ]);
  await writeAgent(join(root, "agents", "_design", "creative-director.md"), [
    "supervibe:project-memory",
    "supervibe:code-search",
    "supervibe:verification",
    "supervibe:receiving-code-review",
  ]);

  const result = validateAgentSkillCoverage(root);
  assert.equal(result.pass, false);
  assert.ok(result.issues.some((item) => item.code === "unrelated-critical-skill-owner"));
  assert.ok(result.issues.some((item) => item.code === "fragile-critical-skill-ownership"));
  const ownership = result.skillOwnership.find((item) => item.skill === "supervibe:receiving-code-review");
  assert.deepEqual(ownership.supportedOwners, ["agents/_core/code-reviewer.md"]);
});

test("documented single-owner exceptions can satisfy critical ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-single-owner-exception-"));
  await mkdir(join(root, "agents"), { recursive: true });
  for (const skill of ["project-memory", "code-search", "verification", "custom-critical"]) {
    await mkdir(join(root, "skills", skill), { recursive: true });
  }
  await writeAgent(join(root, "agents", "owner.md"), [
    "supervibe:project-memory",
    "supervibe:code-search",
    "supervibe:verification",
    "supervibe:custom-critical",
  ]);

  const result = validateAgentSkillCoverage(root, {
    criticalSkillOwnerPolicy: {
      "supervibe:custom-critical": {
        minOwners: 2,
        ownershipClass: "specialist",
        role: "custom critical fixture",
        singleOwnerException: {
          owner: "agents/owner.md",
          rationale: "Fixture records a temporary single-owner exception with explicit owner accountability.",
        },
      },
    },
  });

  assert.equal(result.pass, true);
  const ownership = result.skillOwnership.find((item) => item.skill === "supervibe:custom-critical");
  assert.equal(ownership.exception.valid, true);
});

test("skill ownership classifications distinguish policy categories", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-skill-classification-"));
  await mkdir(join(root, "agents"), { recursive: true });
  for (const skill of [
    "project-memory",
    "code-search",
    "verification",
    "adapt",
    "experiment",
    "using-supervibe-skills",
    "custom-specialist",
  ]) {
    await mkdir(join(root, "skills", skill), { recursive: true });
  }
  await writeAgent(join(root, "agents", "classified-agent.md"), [
    "supervibe:project-memory",
    "supervibe:code-search",
    "supervibe:adapt",
    "supervibe:custom-specialist",
  ]);
  await writeAgent(join(root, "agents", "support-agent.md"), [
    "supervibe:project-memory",
    "supervibe:code-search",
    "supervibe:using-supervibe-skills",
    "supervibe:experiment",
  ]);

  const result = validateAgentSkillCoverage(root, { criticalSkillOwnerPolicy: {} });
  const classes = new Map(result.skillOwnership.map((item) => [item.skill, item.class]));
  assert.equal(classes.get("supervibe:project-memory"), "foundational");
  assert.equal(classes.get("supervibe:adapt"), "command-only");
  assert.equal(classes.get("supervibe:experiment"), "experimental");
  assert.equal(classes.get("supervibe:using-supervibe-skills"), "support");
  assert.equal(classes.get("supervibe:custom-specialist"), "specialist");
});

async function writeAgent(path, skills) {
  await writeFile(path, [
    "---",
    `name: ${path.split(/[\\/]/).at(-1).replace(/\.md$/, "")}`,
    "skills:",
    ...skills.map((skill) => `  - ${skill}`),
    "---",
    "# Fixture agent",
    "",
    "## Skills",
    "",
    ...skills.map((skill) => `- \`${skill}\` - fixture coverage.`),
    "",
  ].join("\n"));
}
