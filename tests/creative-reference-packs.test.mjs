import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateCreativeReferencePacks,
} from "../scripts/validate-creative-reference-packs.mjs";

const PACKS = Object.freeze([
  "creative-editorial.md",
  "creative-luxury.md",
  "creative-experimental-web.md",
  "creative-mobile-native.md",
  "creative-data-products.md",
  "creative-ai-products.md",
  "creative-devtools.md",
  "creative-regulated-trust.md",
]);

async function writeFixture(root, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }
}

function compliantPack(title) {
  return [
    `# Creative Reference Pack: ${title}`,
    "",
    "Reference role: creative benchmark",
    "Quality tier: tier-2 local curated pack",
    "Best for: full creative path, medium creative path",
    "Creative moves:",
    "- distinct rhythm",
    "- sensory contrast",
    "Borrow:",
    "- one specific pattern ingredient",
    "Avoid:",
    "- copying a brand or style authority",
    "Differentiation pressure:",
    "- escape category sameness",
    "Do not use as style authority:",
    "- this pack provides pattern ingredients, not a product to copy",
  ].join("\n");
}

test("creative reference pack validator rejects brand-name style authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-creative-packs-"));
  const files = {
    "docs/references/creative-reference-taxonomy.md": [
      "# Creative Reference Taxonomy",
      "Fast path",
      "Medium path",
      "Full creative path",
      "Reference role",
      "Quality tier",
      "Golden briefs",
    ].join("\n"),
  };
  for (const pack of PACKS) {
    files[`skills/design-intelligence/references/creative/${pack}`] = compliantPack(pack);
  }
  files["skills/design-intelligence/references/creative/creative-devtools.md"] = [
    compliantPack("weak devtools"),
    "Use this in the style of Linear.",
  ].join("\n");
  await writeFixture(root, files);

  const result = validateCreativeReferencePacks(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "brand-name-style-authority"));
});

test("creative reference pack validator rejects missing pack coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-creative-packs-"));
  await writeFixture(root, {
    "docs/references/creative-reference-taxonomy.md": "# Creative Reference Taxonomy\nFast path\nMedium path\nFull creative path\nReference role\nQuality tier\nGolden briefs",
  });

  const result = validateCreativeReferencePacks(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-pack"));
});

test("current repository creative reference packs pass", () => {
  const result = validateCreativeReferencePacks(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
