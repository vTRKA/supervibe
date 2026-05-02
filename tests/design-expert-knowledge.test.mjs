import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignExpertKnowledge,
} from "../scripts/validate-design-expert-knowledge.mjs";

test("design expert knowledge validator rejects partial design coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-expert-"));
  const files = {
    "docs/references/design-expert-knowledge.md": "Accessibility only",
    "commands/supervibe-design.md": "Design Expert Knowledge Gate",
    "commands/supervibe-presentation.md": "local design intelligence lookup",
    "agents/_design/ux-ui-designer.md": "Design Expert Knowledge",
    "skills/design-intelligence/SKILL.md": "Design Expert Knowledge Matrix",
    "skills/brandbook/SKILL.md": "Eight-Pass Expert Routine",
    "skills/prototype/SKILL.md": "Eight-Pass Expert Routine --daemon",
    "skills/landing-page/SKILL.md": "Eight-Pass Expert Routine --daemon",
    "skills/presentation-deck/SKILL.md": "Eight-Pass Expert Routine --daemon",
    "skills/ui-review-and-polish/SKILL.md": "Design Expert Knowledge",
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateDesignExpertKnowledge(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.file === "commands/supervibe-design.md"));
  assert.ok(result.issues.some((issue) => issue.file === "skills/design-intelligence/SKILL.md"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-design-agent-expert-reference"));
});

test("current design surfaces preserve local design expert knowledge", () => {
  const result = validateDesignExpertKnowledge(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
