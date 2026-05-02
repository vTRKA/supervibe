import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateUiUxProMaxCoverage,
} from "../scripts/validate-ui-ux-pro-max-coverage.mjs";

test("ui ux pro max coverage validator rejects partial design coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-ui-ux-pro-max-"));
  const files = {
    "docs/references/ui-ux-pro-max-coverage.md": "Accessibility only",
    "commands/supervibe-design.md": "UI/UX Pro Max Coverage Gate",
    "agents/_design/ux-ui-designer.md": "UI/UX Pro Max Coverage",
    "agents/_design/ui-polish-reviewer.md": "UI/UX Pro Max Coverage",
    "skills/design-intelligence/SKILL.md": "UI/UX Pro Max Coverage Matrix",
    "skills/ui-review-and-polish/SKILL.md": "UI/UX Pro Max Coverage",
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateUiUxProMaxCoverage(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.file === "commands/supervibe-design.md"));
  assert.ok(result.issues.some((issue) => issue.file === "skills/design-intelligence/SKILL.md"));
});

test("current design surfaces preserve ui ux pro max coverage", () => {
  const result = validateUiUxProMaxCoverage(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
