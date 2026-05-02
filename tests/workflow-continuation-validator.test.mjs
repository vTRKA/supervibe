import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateWorkflowContinuation,
} from "../scripts/validate-workflow-continuation.mjs";

test("workflow continuation validator rejects hard-stop multi-stage language", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-continuation-"));
  const files = {
    "commands/supervibe-design.md": [
      "# /supervibe-design",
      "Each stage is gated on user explicit approval before the next starts.",
    ].join("\n"),
    "skills/brandbook/SKILL.md": [
      "# Brandbook",
      "Each section is its OWN dialogue. User approves before next starts.",
      "DO NOT proceed to next section without explicit approval.",
    ].join("\n"),
    "commands/supervibe-brainstorm.md": "# /supervibe-brainstorm",
    "skills/brainstorming/SKILL.md": "# Brainstorming\nGet approval per section.",
    "commands/supervibe-plan.md": "# /supervibe-plan",
    "skills/writing-plans/SKILL.md": "# Writing Plans",
    "commands/supervibe-loop.md": "# /supervibe-loop",
    "commands/supervibe-presentation.md": "# /supervibe-presentation",
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateWorkflowContinuation(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "hard-stop-language" && issue.file === "commands/supervibe-design.md"));
  assert.ok(result.issues.some((issue) => issue.code === "hard-stop-language" && issue.file === "skills/brandbook/SKILL.md"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-continuation-contract" && issue.file === "commands/supervibe-loop.md"));
});

test("current multi-stage workflow docs preserve continuation contracts", () => {
  const result = validateWorkflowContinuation(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
