import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignPreviewDaemon,
} from "../scripts/validate-design-preview-daemon.mjs";

const ROOT = process.cwd();

test("design preview daemon validator rejects foreground-prone design commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-preview-"));
  const files = {
    "commands/supervibe-design.md": "supervibe:preview-server --root .supervibe/artifacts/prototypes/<slug>/",
    "skills/prototype/SKILL.md": "preview-server --root .supervibe/artifacts/prototypes/<slug>/ --daemon",
    "skills/landing-page/SKILL.md": "preview-server --root .supervibe/artifacts/prototypes/landing --daemon",
    "skills/preview-server/SKILL.md": "preview-server.mjs --root <mockup-root> --daemon",
    "skills/browser-feedback/SKILL.md": "preview-server --root .supervibe/artifacts/prototypes/<slug>/ --daemon",
    "skills/interaction-design-patterns/SKILL.md": "preview-server --root <output-dir> --daemon",
    "agents/_design/prototype-builder.md": "preview-server --root .supervibe/artifacts/prototypes/<feature>/ --daemon",
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

test("design preview daemon CLI validates plugin contracts from a consumer project cwd", async () => {
  const consumerRoot = await mkdtemp(join(tmpdir(), "supervibe-design-preview-consumer-"));

  const out = execFileSync(process.execPath, [
    join(ROOT, "scripts", "validate-design-preview-daemon.mjs"),
  ], {
    cwd: consumerRoot,
    encoding: "utf8",
  });

  assert.match(out, /SUPERVIBE_DESIGN_PREVIEW_DAEMON/);
  assert.match(out, /PASS: true/);
  assert.doesNotMatch(out, /missing-file/);
});
