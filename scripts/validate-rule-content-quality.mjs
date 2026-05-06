#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join, relative } from "node:path";
import matter from "gray-matter";
import {
  resolveCliRoots,
  resolvePluginContentRoot,
} from "./lib/supervibe-cli-roots.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const KNOWN_FILLER_SECTIONS = Object.freeze([
  {
    code: "generic-operational-depth-checklist",
    pattern: /^## Operational Depth Checklist\s*$/im,
  },
  {
    code: "generic-rule-drilldown-prompts",
    pattern: /^## Rule Drilldown Prompts\s*$/im,
  },
  {
    code: "empty-local-rule-summary",
    pattern: /^### Local Rule Summary\s*$/im,
  },
  {
    code: "empty-rule-intent-placeholder",
    pattern: /^-\s*Rule intent:\s*>-\s*$/im,
  },
]);

const LARGE_SECTION_MIN_CHARS = 500;
const MAX_SHARED_LARGE_SECTION_FILES = 2;

const MANDATORY_RULE_PATTERNS = Object.freeze([
  {
    code: "missing-rule-rationale",
    pattern: /##\s+(Why|Why this rule exists)\b/i,
    message: "Mandatory rule needs a rationale section that explains the risk it prevents.",
  },
  {
    code: "missing-rule-scope",
    pattern: /##\s+(When|When this rule applies|Scope)\b/i,
    message: "Mandatory rule needs a scope section so agents know when to apply or skip it.",
  },
  {
    code: "missing-rule-examples",
    pattern: /##\s+Examples\b[\s\S]*(###\s+Bad|Bad[\s\S]*```)[\s\S]*(###\s+Good|Good[\s\S]*```)/i,
    message: "Mandatory rule needs concrete bad and good examples.",
  },
  {
    code: "missing-rule-enforcement",
    pattern: /##\s+Enforcement\b/i,
    message: "Mandatory rule needs an enforcement section with validators, tests, or review gates.",
  },
  {
    code: "missing-rule-related-section",
    pattern: /##\s+Related(?:\s+rules)?\b/i,
    message: "Mandatory rule needs a related-rules section so agents can resolve conflicts and adjacent gates.",
  },
]);

export function validateRuleContentQuality(rootDir = process.cwd()) {
  const resolvedRoot = resolvePluginContentRoot({
    rootDir,
    pluginRoot: ROOT,
    requiredDir: "rules",
  });
  const rulesDir = join(resolvedRoot, "rules");
  const issues = [];
  const sectionOwners = new Map();
  const files = existsSync(rulesDir)
    ? readdirSync(rulesDir).filter((name) => name.endsWith(".md")).sort()
    : [];

  for (const fileName of files) {
    const absPath = join(rulesDir, fileName);
    const raw = readFileSync(absPath, "utf8");
    const parsed = matter(raw);
    const text = parsed.content;
    const relPath = toPosix(relative(resolvedRoot, absPath));

    for (const section of KNOWN_FILLER_SECTIONS) {
      if (section.pattern.test(text)) {
        issues.push({
          code: section.code,
          file: relPath,
          message: "Rule contains generic filler or an empty placeholder instead of rule-specific guidance.",
        });
      }
    }

    if (parsed.data?.mandatory === true) {
      for (const requirement of MANDATORY_RULE_PATTERNS) {
        if (requirement.pattern.test(text)) continue;
        issues.push({
          code: requirement.code,
          file: relPath,
          message: requirement.message,
        });
      }
    }

    for (const body of extractLargeSections(text)) {
      const normalized = normalizeSection(body);
      if (!normalized) continue;
      if (!sectionOwners.has(normalized)) sectionOwners.set(normalized, new Set());
      sectionOwners.get(normalized).add(relPath);
    }
  }

  for (const [section, owners] of sectionOwners) {
    if (owners.size <= MAX_SHARED_LARGE_SECTION_FILES) continue;
    issues.push({
      code: "duplicated-large-rule-section",
      file: [...owners].join(", "),
      message: `Large rule section is duplicated across ${owners.size} files; rules should share principles through links, not copied filler.`,
      sample: `${section.slice(0, 120)}...`,
    });
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    issues,
  };
}

function extractLargeSections(text) {
  const sections = [];
  const headingPattern = /^##\s+.+$/gm;
  const headings = [...text.matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index].index;
    const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
    const section = text.slice(start, end).trim();
    if (section.length >= LARGE_SECTION_MIN_CHARS) sections.push(section);
  }
  return sections;
}

function normalizeSection(section) {
  return section
    .replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (_match, lang, body) => {
      return `\n fenced-code:${String(lang || "").toLowerCase()}:sha256:${sha256(body).slice(0, 16)} \n`;
    })
    .replace(/`[^`]+`/g, "`x`")
    .replace(/[A-Za-z0-9_.\\/-]+\.md/g, "x.md")
    .replace(/[A-Za-z0-9_.\\/-]+\.mjs/g, "x.mjs")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sha256(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function formatIssue(issue) {
  const location = issue.file ? `${issue.file}: ` : "";
  const sample = issue.sample ? ` sample="${issue.sample}"` : "";
  return `FAIL ${issue.code} ${location}${issue.message}${sample}`;
}

async function main() {
  const roots = resolveCliRoots({
    argv: process.argv.slice(2),
    scriptPluginRoot: ROOT,
  });
  const report = validateRuleContentQuality(roots.root || roots.pluginRoot);
  for (const issue of report.issues) console.log(formatIssue(issue));
  if (!report.pass) {
    console.log(`RULE_CONTENT_QUALITY PASS:false checked=${report.checked} issues=${report.issues.length}`);
    process.exit(1);
  }
  console.log(`RULE_CONTENT_QUALITY PASS:true checked=${report.checked} issues=0`);
}

if (process.argv[1] && basename(process.argv[1]) === "validate-rule-content-quality.mjs") {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
