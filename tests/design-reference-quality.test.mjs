import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignReferenceQuality,
} from "../scripts/validate-design-reference-quality.mjs";

async function writeFixture(root, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }
}

test("design reference quality rejects brand-name style authority prompts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-reference-quality-"));
  await writeFixture(root, {
    "docs/references/design-expert-knowledge.md": [
      "Reference Quality Ladder",
      "reference role",
      "quality tier",
      "freshness",
      "borrow",
      "avoid",
    ].join("\n"),
    "commands/supervibe-design.md": "/supervibe-design landing in the style of Linear, focused on dev-tool buyers",
    "skills/design-intelligence/SKILL.md": "Reference Quality Ladder\nreferenceRole\nqualityTier\ncapturedAt\nborrow\navoid",
    "agents/_design/creative-director.md": "Reference Quality Ladder\nbrand-name-as-style-authority\ncreative benchmark\nquality tier",
    "agents/_design/ux-ui-designer.md": "Reference Quality Ladder\ninteraction benchmark\ncategory convention\nquality tier",
    "agents/_design/design-system-architect.md": "Reference Quality Gate\nreference quality evidence\nplatform standards are not creative benchmarks",
    "agents/_ops/competitive-design-researcher.md": "Reference Quality Ladder\nPlatform/system references are not creative benchmarks\nquality tier\ncaptured date",
    "skills/brandbook/SKILL.md": "Reference Quality Gate\ncandidate sandbox\n.candidates/run-id\nactive candidate\narchive rejected candidate",
    "rules/design-system-governance.md": "candidate workspace\nactive candidate\narchive rejected candidate\nCandidate tokens do not unlock prototypes",
  });

  const result = validateDesignReferenceQuality(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "brand-name-style-authority"));
});

test("design reference quality rejects missing quality ladder coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-reference-quality-"));
  await writeFixture(root, {
    "docs/references/design-expert-knowledge.md": "External references are supplemental.",
    "commands/supervibe-design.md": "Reference source scope.",
  });

  const result = validateDesignReferenceQuality(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing-reference-quality-contract"));
});

test("current design surfaces preserve reference-quality contracts", () => {
  const result = validateDesignReferenceQuality(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
