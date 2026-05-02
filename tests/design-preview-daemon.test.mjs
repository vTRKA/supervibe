import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignPreviewDaemon,
} from "../scripts/validate-design-preview-daemon.mjs";

test("design preview daemon validator rejects foreground-prone design commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-preview-"));
  const files = {
    "commands/supervibe-design.md": "supervibe:preview-server --root .supervibe/artifacts/prototypes/<slug>/",
    "commands/supervibe-presentation.md": "node scripts/preview-server.mjs --root .supervibe/artifacts/presentations/<slug>/preview --daemon",
    "skills/prototype/SKILL.md": "preview-server --root .supervibe/artifacts/prototypes/<slug>/ --daemon",
    "skills/landing-page/SKILL.md": "preview-server --root .supervibe/artifacts/prototypes/landing --daemon",
    "skills/presentation-deck/SKILL.md": "preview-server.mjs --root .supervibe/artifacts/presentations/<slug>/preview --daemon",
    "skills/preview-server/SKILL.md": "preview-server.mjs --root <mockup-root> --daemon",
    "skills/browser-feedback/SKILL.md": "preview-server --root .supervibe/artifacts/prototypes/<slug>/ --daemon",
    "skills/interaction-design-patterns/SKILL.md": "preview-server --root <output-dir> --daemon",
    "agents/_design/prototype-builder.md": "preview-server --root .supervibe/artifacts/prototypes/<feature>/ --daemon",
    "agents/_design/presentation-deck-builder.md": "preview-server.mjs --root .supervibe/artifacts/presentations/<slug>/preview --daemon",
    "scripts/preview-server.mjs": "const designRoot = false;",
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateDesignPreviewDaemon(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "foreground-design-preview-risk"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-daemon-default"));
});

test("current design preview contracts require daemon mode", () => {
  const result = validateDesignPreviewDaemon(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
