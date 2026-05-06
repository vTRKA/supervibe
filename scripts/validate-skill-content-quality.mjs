#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const REQUIRED_BODY_PATTERNS = Object.freeze([
  ["missing-expert-operating-standard", /##\s+Expert Operating Standard\b/i, "Skill needs the shared expert operating standard section."],
  ["missing-expert-standard-reference", /skill-expert-operating-standard\.md/i, "Skill must link to the shared skill expert operating standard."],
  ["missing-step-zero", /##\s+Step 0\b|Read source of truth/i, "Skill needs a mandatory Step 0/source-of-truth preflight."],
  ["missing-decision-tree", /##\s+Decision tree\b/i, "Skill needs explicit branching logic for non-trivial cases."],
  ["missing-procedure", /##\s+Procedure\b/i, "Skill needs a Procedure section."],
  ["missing-output-contract", /##\s+Output contract\b/i, "Skill needs an Output contract section."],
  ["missing-guard-rails", /##\s+Guard rails\b/i, "Skill needs Guard rails."],
  ["missing-verification", /##\s+Verification\b/i, "Skill needs a Verification section."],
  ["missing-related", /##\s+Related\b/i, "Skill needs related skills, agents, rules, or commands."],
]);

const REQUIRED_FRONTMATTER_FIELDS = Object.freeze([
  "allowed-tools",
  "phase",
  "emits-artifact",
  "confidence-rubric",
  "gate-on-exit",
]);

export function validateSkillContentQuality(rootDir = process.cwd()) {
  const issues = [];
  const files = walkSkillFiles(join(rootDir, "skills"));

  for (const file of files) {
    const rel = toPosix(relative(rootDir, file));
    const raw = readFileSync(file, "utf8");
    const parsed = matter(raw);
    const body = parsed.content;
    const bodyWithoutCode = stripFencedCode(body);

    if (hasUnresolvedFrontmatterPlaceholder(parsed.matter || "")) {
      issues.push(issue(rel, "template-placeholder", "Skill frontmatter contains unresolved template placeholders."));
    }

    if (/{{\s*[A-Z][A-Z0-9_-]*\s*}}/.test(bodyWithoutCode)) {
      issues.push(issue(rel, "template-placeholder", "Skill body contains unresolved template placeholders outside examples."));
    }

    for (const field of REQUIRED_FRONTMATTER_FIELDS) {
      if (!Object.hasOwn(parsed.data || {}, field)) {
        issues.push(issue(rel, `missing-frontmatter-${field}`, `Skill frontmatter must declare ${field}.`));
      }
    }

    const allowedTools = parsed.data?.["allowed-tools"];
    if (!Array.isArray(allowedTools) || allowedTools.length === 0) {
      issues.push(issue(rel, "weak-allowed-tools", "Skill allowed-tools must be a non-empty list."));
    }

    if (!parsed.data?.phase) {
      issues.push(issue(rel, "missing-phase", "Skill phase must be set."));
    }

    if (!parsed.data?.["emits-artifact"]) {
      issues.push(issue(rel, "missing-emits-artifact", "Skill emits-artifact must name the produced artifact type."));
    }

    for (const [code, pattern, message] of REQUIRED_BODY_PATTERNS) {
      if (pattern.test(body)) continue;
      issues.push(issue(rel, code, message));
    }

    const gateOnExit = parsed.data?.["gate-on-exit"];
    const hasEvidenceFallback = /confidence below gate|confidence-scoring|score/i.test(body)
      && /verify before completion|verification evidence|completion claims/i.test(body);
    if (gateOnExit !== true && !hasEvidenceFallback) {
      issues.push(issue(rel, "missing-confidence-gate", "Skill must either gate on exit or explain confidence/verification fallback for support skills."));
    }
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    issues,
  };
}

export function formatSkillContentQualityReport(report = {}) {
  const lines = [
    "SUPERVIBE_SKILL_CONTENT_QUALITY",
    `PASS: ${report.pass === true}`,
    `CHECKED: ${report.checked || 0}`,
    `ISSUES: ${report.issues?.length || 0}`,
  ];
  for (const item of report.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

function walkSkillFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSkillFiles(full));
    else if (entry.isFile() && entry.name === "SKILL.md") out.push(full);
  }
  return out.sort();
}

function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, "");
}

function hasUnresolvedFrontmatterPlaceholder(frontmatter) {
  return /{{\s*[A-Z][A-Z0-9_-]*\s*}}/.test(frontmatter);
}

function issue(file, code, message) {
  return { file, code, message };
}

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

if (process.argv[1] && basename(process.argv[1]) === "validate-skill-content-quality.mjs") {
  const result = validateSkillContentQuality(ROOT);
  console.log(formatSkillContentQualityReport(result));
  process.exit(result.pass ? 0 : 1);
}
