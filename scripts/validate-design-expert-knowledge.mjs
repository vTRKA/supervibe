#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DESIGN_DOMAINS = Object.freeze([
  /Accessibility/i,
  /Touch & Interaction/i,
  /Performance/i,
  /Style Selection/i,
  /Layout & Responsive/i,
  /Typography & Color/i,
  /Animation/i,
  /Forms & Feedback/i,
  /Navigation Patterns/i,
  /Charts & Data/i,
]);

const LOCAL_KNOWLEDGE_DOMAINS = Object.freeze([
  /`product`/i,
  /`style`/i,
  /`color`/i,
  /`typography`/i,
  /`ux`/i,
  /`landing`/i,
  /`app-interface`/i,
  /`charts`/i,
  /`icons`/i,
  /`google-fonts`/i,
  /`react-performance`/i,
  /`ui-reasoning`/i,
  /`stack`/i,
  /`slides`/i,
  /`collateral`/i,
]);

const SHARED_REQUIRED = Object.freeze([
  /docs\/references\/design-expert-knowledge\.md/i,
  /Eight-Pass Expert Routine/i,
  /Design Pass Triage/i,
  /required\s*\|\s*reuse\s*\|\s*delegated\s*\|\s*skipped\s*\|\s*N\/A/i,
  /designContextPreflight\(\)|searchDesignIntelligence\(\)|supervibe:design-intelligence/i,
  /External references are supplemental/i,
]);

const ADAPTIVE_DESIGN_REQUIRED = Object.freeze([
  /Do not force all eight passes/i,
  /approved design system/i,
  /candidate or needs_revision|candidate\s+.*needs_revision/i,
  /missing token|narrow design-system extension|narrow extension/i,
]);

const RULES = Object.freeze([
  {
    file: "docs/references/design-expert-knowledge.md",
    label: "local design expert reference",
    required: [
      /# Design Expert Knowledge/i,
      /Local Design Knowledge Pack/i,
      /Local Knowledge Folders/i,
      /Eight-Pass Expert Routine/i,
      /Design Pass Triage/i,
      /required\s*\|\s*reuse\s*\|\s*delegated\s*\|\s*skipped\s*\|\s*N\/A/i,
      /Do not force all eight passes/i,
      /approved\s+design system/i,
      /candidate\s+or\s+needs_revision/i,
      /Use the internet only for current\s+references/i,
      /skills\/design-intelligence\/data\/manifest\.json/i,
      /skills\/design-intelligence\/data\/stacks\//i,
      /skills\/design-intelligence\/data\/slides\//i,
      /skills\/design-intelligence\/data\/collateral\//i,
      /skills\/design-intelligence\/references\//i,
      ...DESIGN_DOMAINS,
      ...LOCAL_KNOWLEDGE_DOMAINS,
      /product-fit style matrix/i,
      /stack-aware UI guidance/i,
    ],
  },
  {
    file: "commands/supervibe-design.md",
    label: "design command expert gate",
    required: [
      /Design Expert Knowledge Gate/i,
      ...SHARED_REQUIRED,
      ...ADAPTIVE_DESIGN_REQUIRED,
      ...DESIGN_DOMAINS,
      ...LOCAL_KNOWLEDGE_DOMAINS,
      /product-fit style matrix/i,
      /--daemon/i,
    ],
  },
  {
    file: "commands/supervibe-presentation.md",
    label: "presentation command expert gate",
    required: [
      /docs\/references\/design-expert-knowledge\.md/i,
      /local\s+design\s+intelligence\s+lookup/i,
      /External references are supplemental/i,
      /--daemon/i,
    ],
  },
  {
    file: "skills/design-intelligence/SKILL.md",
    label: "design intelligence expert matrix",
    required: [
      /Design Expert Knowledge Matrix/i,
      ...SHARED_REQUIRED,
      ...ADAPTIVE_DESIGN_REQUIRED,
      ...DESIGN_DOMAINS,
      ...LOCAL_KNOWLEDGE_DOMAINS,
      /Use the local knowledge pack first/i,
      /Do not instruct design agents to fetch a\s+remote repository/i,
    ],
  },
  {
    file: "skills/brandbook/SKILL.md",
    label: "brandbook expert reference",
    required: SHARED_REQUIRED,
  },
  {
    file: "skills/prototype/SKILL.md",
    label: "prototype expert reference",
    required: [...SHARED_REQUIRED, ...ADAPTIVE_DESIGN_REQUIRED, /--daemon/i],
  },
  {
    file: "skills/landing-page/SKILL.md",
    label: "landing expert reference",
    required: [...SHARED_REQUIRED, ...ADAPTIVE_DESIGN_REQUIRED, /--daemon/i],
  },
  {
    file: "skills/presentation-deck/SKILL.md",
    label: "deck expert reference",
    required: [...SHARED_REQUIRED, /approved design system/i, /candidate or needs_revision/i, /required\s*\|\s*reuse\s*\|\s*delegated\s*\|\s*skipped\s*\|\s*N\/A/i, /--daemon/i],
  },
  {
    file: "skills/ui-review-and-polish/SKILL.md",
    label: "ui review expert reference",
    required: [
      /Design Expert Knowledge/i,
      /docs\/references\/design-expert-knowledge\.md/i,
      /Eight-Pass Expert Routine/i,
      /Design Pass Triage/i,
      /required\s*\|\s*reuse\s*\|\s*delegated\s*\|\s*skipped\s*\|\s*N\/A/i,
      ...DESIGN_DOMAINS,
    ],
  },
]);

const FORBIDDEN_PUBLIC_TERMS = Object.freeze([
  new RegExp(`${["UI", "UX"].join("\\/")}\\s+${["Pro", "Max"].join("\\s+")}`, "i"),
  new RegExp(["ui", "ux", "pro", "max"].join("-"), "i"),
]);

function readProjectFile(rootDir, relPath) {
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, "utf8");
}

function listDesignAgents(rootDir) {
  const dir = join(rootDir, "agents", "_design");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => `agents/_design/${entry}`)
    .sort();
}

export function validateDesignExpertKnowledge(rootDir = process.cwd()) {
  const issues = [];

  for (const rule of RULES) {
    const text = readProjectFile(rootDir, rule.file);
    if (text === null) {
      issues.push({
        file: rule.file,
        label: rule.label,
        code: "missing-file",
        message: `${rule.file}: file not found`,
      });
      continue;
    }
    for (const pattern of rule.required) {
      if (!pattern.test(text)) {
        issues.push({
          file: rule.file,
          label: rule.label,
          code: "missing-design-expert-knowledge",
          message: `${rule.file}: missing ${pattern}`,
        });
      }
    }
  }

  for (const file of listDesignAgents(rootDir)) {
    const text = readProjectFile(rootDir, file) ?? "";
    for (const pattern of [
      /## Local Design Expert Reference/i,
      ...SHARED_REQUIRED,
      ...LOCAL_KNOWLEDGE_DOMAINS,
      /Local folder map:/i,
      /skills\/design-intelligence\/data\/manifest\.json/i,
      /skills\/design-intelligence\/data\/stacks\//i,
      /skills\/design-intelligence\/data\/slides\//i,
      /skills\/design-intelligence\/data\/collateral\//i,
      /skills\/design-intelligence\/references\//i,
      /Design Pass Triage/i,
      /required\s*\|\s*reuse\s*\|\s*delegated\s*\|\s*skipped\s*\|\s*N\/A/i,
      /Do not force all eight passes/i,
    ]) {
      if (!pattern.test(text)) {
        issues.push({
          file,
          label: "design agent expert reference",
          code: "missing-design-agent-expert-reference",
          message: `${file}: missing ${pattern}`,
        });
      }
    }
  }

  const publicFiles = [
    ...RULES.map((rule) => rule.file),
    ...listDesignAgents(rootDir),
  ];
  for (const file of publicFiles) {
    const text = readProjectFile(rootDir, file);
    if (text === null) continue;
    for (const pattern of FORBIDDEN_PUBLIC_TERMS) {
      if (pattern.test(text)) {
        issues.push({
          file,
          label: "neutral terminology",
          code: "forbidden-public-design-source-term",
          message: `${file}: contains ${pattern}`,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: RULES.length + listDesignAgents(rootDir).length,
    issues,
  };
}

export function formatDesignExpertKnowledgeReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_EXPERT_KNOWLEDGE",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignExpertKnowledge(process.cwd());
  console.log(formatDesignExpertKnowledgeReport(result));
  process.exit(result.pass ? 0 : 1);
}
