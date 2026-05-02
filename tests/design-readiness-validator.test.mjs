import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignReadiness,
} from "../scripts/validate-design-readiness.mjs";

test("design readiness validator rejects draft-to-dev and final-token shortcuts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-readiness-"));
  const files = {
    "commands/supervibe-design.md": [
      "# /supervibe-design",
      "candidate tokens keep draft prototypes disciplined",
    ].join("\n"),
    "skills/brandbook/SKILL.md": [
      "# Brandbook",
      "candidate tokens are the source for draft prototypes",
    ].join("\n"),
    "agents/_design/prototype-builder.md": "# prototype-builder",
    "skills/prototype-handoff/SKILL.md": "# Prototype Handoff",
    "rules/prototype-to-production.md": "Front-end developer reads `prototypes/<feature>/`",
    "rules/design-system-governance.md": "# Design System Governance",
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateDesignReadiness(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "unsafe-design-readiness-language" && issue.file === "commands/supervibe-design.md"));
  assert.ok(result.issues.some((issue) => issue.code === "unsafe-design-readiness-language" && issue.file === "skills/brandbook/SKILL.md"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-design-readiness-contract" && issue.file === "skills/prototype-handoff/SKILL.md"));
});

test("current design workflow docs preserve readiness gates", () => {
  const result = validateDesignReadiness(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
