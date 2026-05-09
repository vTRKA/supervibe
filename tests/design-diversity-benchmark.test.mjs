import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  scoreVariantPair,
  validateDesignDiversityFixture,
} from "../scripts/lib/design-diversity-benchmark.mjs";
import {
  validateDesignDiversityBenchmark,
} from "../scripts/validate-design-diversity-benchmark.mjs";

async function writeFixture(root, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }
}

function variant(id, overrides = {}) {
  return {
    id,
    label: id,
    axes: {
      palette: `${id} palette`,
      typography: `${id} type`,
      motion: `${id} motion`,
      imagery: `${id} imagery`,
      hierarchy: `${id} hierarchy`,
      density: `${id} density`,
      composition: `${id} composition`,
      interaction: `${id} interaction`,
      ...(overrides.axes || {}),
    },
    differsBecause: `${id} differs on a concrete design axis`,
    givesUp: `${id} gives up a clear tradeoff`,
    gains: `${id} gains a clear benefit`,
    evidence: {
      referencePacket: `${id} reference packet`,
      screenshotPlan: `${id} screenshot plan`,
      tokenNotes: `${id} token notes`,
    },
  };
}

test("scoreVariantPair counts changed design axes", () => {
  const pair = scoreVariantPair(
    variant("quiet", { axes: { palette: "warm", typography: "serif", motion: "slow" } }),
    variant("signal", { axes: { palette: "dark", typography: "mono", motion: "fast" } }),
  );

  assert.ok(pair.changedAxisCount >= 3);
  assert.ok(pair.changedAxes.includes("palette"));
  assert.ok(pair.changedAxes.includes("typography"));
  assert.ok(pair.changedAxes.includes("motion"));
});

test("design diversity fixture rejects same-shell variants", () => {
  const base = variant("base");
  const repaint = variant("repaint", {
    axes: {
      ...base.axes,
      palette: "different color only",
    },
  });
  const fixture = {
    schemaVersion: 1,
    cases: [
      {
        id: "weak-case",
        target: "web",
        intent: "prove weak alternatives fail",
        brief: "Three variants that mostly reuse the same shell.",
        variants: [base, repaint, variant("third")],
      },
    ],
  };

  const result = validateDesignDiversityFixture(fixture, { minCases: 1 });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((item) => item.code === "same-shell-variant-pair"));
});

test("current repository passes design diversity benchmark", () => {
  const result = validateDesignDiversityBenchmark(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});

test("validator requires diversity contracts on design surfaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-diversity-"));
  await writeFixture(root, {
    "tests/fixtures/design-diversity-benchmark.json": JSON.stringify({
      schemaVersion: 1,
      cases: [
        {
          id: "case",
          target: "web",
          intent: "valid fixture but missing source contracts",
          brief: "A valid benchmark case.",
          variants: [variant("a"), variant("b"), variant("c")],
        },
      ],
    }),
    "docs/references/design-expert-knowledge.md": "Design Diversity Benchmark\nsame shell, new paint",
    "agents/_design/creative-director.md": "Design Diversity Benchmark\nsame shell, new paint",
    "agents/_design/ux-ui-designer.md": "diversity handoff axes",
    "agents/_design/prototype-builder.md": "Design Diversity Benchmark",
    "agents/_design/design-system-architect.md": "creative-diversity QA",
    "skills/prototype/SKILL.md": "Design Diversity Benchmark",
    "skills/brandbook/SKILL.md": "Design Diversity Benchmark",
  });

  const result = validateDesignDiversityBenchmark(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((item) => item.code === "missing-diversity-contract"));
});
