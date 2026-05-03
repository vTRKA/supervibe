import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignWizard,
} from "../scripts/validate-design-wizard.mjs";

test("design wizard validator rejects docs without executable wizard contract", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-wizard-"));
  const files = {
    "commands/supervibe-design.md": "Use safe defaults and continue.",
    "skills/brandbook/SKILL.md": "Ask one question if blocked.",
  };
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateDesignWizard(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-design-wizard-contract"));
});

test("current design wizard catalog and docs pass wizard validation", () => {
  const result = validateDesignWizard(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});

test("design wizard validator CLI defaults to plugin root when launched from a project root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "supervibe-design-wizard-project-"));
  try {
    const output = execFileSync(process.execPath, [
      join(process.cwd(), "scripts", "validate-design-wizard.mjs"),
    ], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    assert.match(output, /SUPERVIBE_DESIGN_WIZARD/);
    assert.match(output, /PASS: true/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
