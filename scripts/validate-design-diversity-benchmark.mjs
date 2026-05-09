#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DESIGN_DIVERSITY_AXES,
  loadDesignDiversityFixture,
  validateDesignDiversityFixture,
} from "./lib/design-diversity-benchmark.mjs";

const REQUIRED_SURFACES = Object.freeze([
  {
    file: "docs/references/design-expert-knowledge.md",
    label: "design expert knowledge diversity contract",
    required: [
      /Design Diversity Benchmark/i,
      /same shell, new paint/i,
      /palette.*typography.*motion.*imagery.*hierarchy/i,
    ],
  },
  {
    file: "agents/_design/creative-director.md",
    label: "creative director diversity contract",
    required: [
      /Design Diversity Benchmark/i,
      /same shell, new paint/i,
      /three changed axes|3 changed axes|3\+ axes/i,
      /palette.*typography.*motion.*imagery.*hierarchy/i,
    ],
  },
  {
    file: "agents/_design/ux-ui-designer.md",
    label: "ux designer diversity handoff",
    required: [
      /diversity handoff axes/i,
      /palette.*typography.*motion.*imagery.*hierarchy/i,
      /same shell, new paint/i,
    ],
  },
  {
    file: "agents/_design/prototype-builder.md",
    label: "prototype builder novelty gate",
    required: [
      /same shell, new paint/i,
      /Design Diversity Benchmark/i,
      /first-screen novelty/i,
    ],
  },
  {
    file: "agents/_design/design-system-architect.md",
    label: "design-system architect creative QA",
    required: [
      /creative-diversity QA/i,
      /Design Diversity Benchmark/i,
      /token diversity/i,
    ],
  },
  {
    file: "skills/prototype/SKILL.md",
    label: "prototype alternatives diversity",
    required: [
      /Design Diversity Benchmark/i,
      /distinct alternative/i,
      /same shell, new paint/i,
    ],
  },
  {
    file: "skills/brandbook/SKILL.md",
    label: "brandbook palette and type diversity",
    required: [
      /Design Diversity Benchmark/i,
      /palette.*type.*rationale|type.*palette.*rationale/i,
      /same shell, new paint/i,
    ],
  },
]);

export function validateDesignDiversityBenchmark(rootDir = process.cwd()) {
  const issues = [];
  const loaded = loadDesignDiversityFixture(rootDir);
  if (loaded.error) {
    issues.push(issue("tests/fixtures/design-diversity-benchmark.json", loaded.error, "design diversity benchmark fixture is required"));
  } else {
    const fixtureResult = validateDesignDiversityFixture(loaded.fixture);
    issues.push(...fixtureResult.issues.map((item) => ({
      file: "tests/fixtures/design-diversity-benchmark.json",
      label: "design diversity fixture",
      code: item.code,
      message: `${item.subject}: ${item.message}`,
    })));
  }

  for (const surface of REQUIRED_SURFACES) {
    const text = readProjectFile(rootDir, surface.file);
    if (text === null) {
      issues.push(issue(surface.file, "missing-file", `${surface.file}: file not found`, surface.label));
      continue;
    }
    for (const pattern of surface.required) {
      if (!pattern.test(text)) {
        issues.push(issue(
          surface.file,
          "missing-diversity-contract",
          `${surface.file}: missing ${pattern}`,
          surface.label,
        ));
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: REQUIRED_SURFACES.length + 1,
    axes: DESIGN_DIVERSITY_AXES,
    issues,
  };
}

export function formatDesignDiversityBenchmarkReport(result = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_DIVERSITY_BENCHMARK",
    `PASS: ${result.pass === true}`,
    `CHECKED: ${result.checked || 0}`,
    `AXES: ${(result.axes || []).join(", ")}`,
    `ISSUES: ${(result.issues || []).length}`,
  ];
  for (const item of result.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

function readProjectFile(rootDir, relPath) {
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, "utf8");
}

function issue(file, code, message, label = "design diversity benchmark") {
  return { file, label, code, message };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignDiversityBenchmark(process.cwd());
  console.log(formatDesignDiversityBenchmarkReport(result));
  process.exit(result.pass ? 0 : 1);
}
