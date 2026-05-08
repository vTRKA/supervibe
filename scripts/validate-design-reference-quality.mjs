#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SURFACES = Object.freeze([
  {
    file: "docs/references/design-expert-knowledge.md",
    label: "reference quality source of truth",
    required: [
      /Reference Quality Ladder/i,
      /reference role/i,
      /quality tier/i,
      /creative benchmark/i,
      /platform standard/i,
      /category convention/i,
      /direct competitor/i,
      /anti-pattern/i,
      /do-not-use-as-style/i,
      /freshness|recapture|capture date/i,
      /borrow/i,
      /avoid/i,
    ],
  },
  {
    file: "commands/supervibe-design.md",
    label: "design command reference quality gate",
    required: [
      /Reference Quality Gate/i,
      /Reference Quality Ladder/i,
      /reference role/i,
      /quality tier/i,
      /borrow\/avoid/i,
      /platform standard/i,
      /creative benchmark/i,
      /brand-name-as-style-authority/i,
    ],
  },
  {
    file: "skills/design-intelligence/SKILL.md",
    label: "design intelligence evidence metadata",
    required: [
      /Reference Quality Ladder/i,
      /referenceRole/i,
      /qualityTier/i,
      /capturedAt/i,
      /borrow/i,
      /avoid/i,
      /notAuthority/i,
    ],
  },
  {
    file: "agents/_design/creative-director.md",
    label: "creative director reference quality",
    required: [
      /Reference Quality Ladder/i,
      /creative benchmark/i,
      /quality tier/i,
      /brand-name-as-style-authority/i,
      /out-of-category/i,
      /borrow/i,
      /avoid/i,
    ],
  },
  {
    file: "agents/_design/ux-ui-designer.md",
    label: "ux designer reference quality",
    required: [
      /Reference Quality Ladder/i,
      /interaction benchmark/i,
      /category convention/i,
      /quality tier/i,
      /borrow/i,
      /avoid/i,
    ],
  },
  {
    file: "agents/_design/design-system-architect.md",
    label: "design-system architect reference approval gate",
    required: [
      /Reference Quality Gate/i,
      /reference quality evidence/i,
      /platform standards are not creative benchmarks/i,
      /quality tier/i,
      /borrow/i,
      /avoid/i,
    ],
  },
  {
    file: "agents/_ops/competitive-design-researcher.md",
    label: "competitive researcher benchmark role discipline",
    required: [
      /Reference Quality Ladder/i,
      /Platform\/system references are not creative benchmarks/i,
      /quality tier/i,
      /captured date/i,
      /reference role/i,
      /category convention/i,
      /direct competitor/i,
    ],
  },
  {
    file: "skills/brandbook/SKILL.md",
    label: "brandbook candidate sandbox and reference quality",
    required: [
      /Reference Quality Gate/i,
      /candidate sandbox/i,
      /\.candidates\/run-id/i,
      /active candidate/i,
      /archive rejected candidate/i,
      /quality tier/i,
      /borrow/i,
      /avoid/i,
    ],
  },
  {
    file: "rules/design-system-governance.md",
    label: "design-system candidate workspace governance",
    required: [
      /candidate workspace/i,
      /active candidate/i,
      /archive rejected candidate/i,
      /Candidate tokens do not unlock prototypes/i,
      /draft sprawl/i,
    ],
  },
]);

const BRAND_NAME_STYLE_AUTHORITY_PATTERNS = Object.freeze([
  /\bin the style of\s+(Linear|Stripe|Apple|Notion|Slack|Airbnb|Uber|Shopify)\b/i,
  /\bmake it like\s+(Linear|Stripe|Apple|Notion|Slack|Airbnb|Uber|Shopify)\b/i,
]);

function readProjectFile(rootDir, relPath) {
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, "utf8");
}

function issue(file, label, code, message) {
  return { file, label, code, message };
}

export function validateDesignReferenceQuality(rootDir = process.cwd()) {
  const issues = [];

  for (const surface of REQUIRED_SURFACES) {
    const text = readProjectFile(rootDir, surface.file);
    if (text === null) {
      issues.push(issue(
        surface.file,
        surface.label,
        "missing-file",
        `${surface.file}: file not found`,
      ));
      continue;
    }

    for (const pattern of surface.required) {
      if (!pattern.test(text)) {
        issues.push(issue(
          surface.file,
          surface.label,
          "missing-reference-quality-contract",
          `${surface.file}: missing ${pattern}`,
        ));
      }
    }
  }

  const commandText = readProjectFile(rootDir, "commands/supervibe-design.md") ?? "";
  for (const pattern of BRAND_NAME_STYLE_AUTHORITY_PATTERNS) {
    if (pattern.test(commandText)) {
      issues.push(issue(
        "commands/supervibe-design.md",
        "design command reference quality gate",
        "brand-name-style-authority",
        `commands/supervibe-design.md: contains weak style-authority prompt ${pattern}`,
      ));
    }
  }

  const competitiveText = readProjectFile(rootDir, "agents/_ops/competitive-design-researcher.md") ?? "";
  if (/Public design systems referenced:/i.test(competitiveText)) {
    issues.push(issue(
      "agents/_ops/competitive-design-researcher.md",
      "competitive researcher benchmark role discipline",
      "platform-system-creative-authority",
      "agents/_ops/competitive-design-researcher.md: public design systems must be classified as platform/system references, not creative benchmarks",
    ));
  }

  return {
    pass: issues.length === 0,
    checked: REQUIRED_SURFACES.length,
    issues,
  };
}

export function formatDesignReferenceQualityReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_REFERENCE_QUALITY",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const item of result.issues) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignReferenceQuality(process.cwd());
  console.log(formatDesignReferenceQualityReport(result));
  process.exit(result.pass ? 0 : 1);
}
