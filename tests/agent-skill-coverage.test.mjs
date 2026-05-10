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
  assert.deepEqual(result.issues, []);
  assert.equal(result.checked, 97);
  assert.equal(result.checkedSkills, 56);
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
