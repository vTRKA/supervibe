import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignFlowGates,
} from "../scripts/validate-design-flow-gates.mjs";

test("design flow gates validator rejects single-question and bulk-approval shortcuts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-flow-gates-"));
  const files = {
    "commands/supervibe-design.md": "Preference Intake Gate. Create tokens immediately after one direction choice.",
    "skills/brandbook/SKILL.md": "Ask one preference question. Accept approve all sections.",
    "skills/prototype/SKILL.md": "preview-server --root .supervibe/artifacts/prototypes/<slug>/ --daemon",
    "skills/preview-server/SKILL.md": "feedback overlay is supplemental.",
    "scripts/lib/preview-static-server.mjs": "export function startStaticServer() {}",
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateDesignFlowGates(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.file === "commands/supervibe-design.md"));
  assert.ok(result.issues.some((issue) => issue.file === "skills/brandbook/SKILL.md"));
  assert.ok(result.issues.some((issue) => issue.file === "scripts/lib/preview-static-server.mjs"));
});

test("current design flow docs preserve preference, approval and preview gates", () => {
  const result = validateDesignFlowGates(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
