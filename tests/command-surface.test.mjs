import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const PUBLIC_COMMANDS = new Set([
  "supervibe.md",
  "supervibe-adapt.md",
  "supervibe-audit.md",
  "supervibe-brainstorm.md",
  "supervibe-design.md",
  "supervibe-execute-plan.md",
  "supervibe-genesis.md",
  "supervibe-loop.md",
  "supervibe-plan.md",
  "supervibe-presentation.md",
  "supervibe-preview.md",
  "supervibe-score.md",
  "supervibe-strengthen.md",
  "supervibe-update.md",
]);

const INTERNAL_COMMANDS = new Set([
  "supervibe-changelog.md",
  "supervibe-debug.md",
  "supervibe-deploy.md",
  "supervibe-evaluate.md",
  "supervibe-memory-gc.md",
  "supervibe-override.md",
  "supervibe-test.md",
]);

test("published command surface contains only user-facing commands", async () => {
  const files = (await readdir(join(ROOT, "commands"))).filter((file) => file.endsWith(".md"));
  assert.deepStrictEqual(new Set(files), PUBLIC_COMMANDS);
});

test("internal command specs stay outside published commands directory", async () => {
  const publicFiles = new Set(
    (await readdir(join(ROOT, "commands"))).filter((file) => file.endsWith(".md")),
  );
  const internalFiles = new Set(
    (await readdir(join(ROOT, "docs", "internal-commands"))).filter((file) =>
      file.endsWith(".md") && file !== "README.md"
    ),
  );

  for (const file of INTERNAL_COMMANDS) {
    assert.equal(publicFiles.has(file), false, `${file} must not be published as a slash command`);
    assert.equal(internalFiles.has(file), true, `${file} internal spec must be preserved`);
  }
});
