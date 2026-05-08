#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const MIN_SKILLS_PER_AGENT = 4;

const FOUNDATIONAL_SKILLS = Object.freeze(new Set([
  "supervibe:project-memory",
  "supervibe:code-search",
  "supervibe:verification",
  "supervibe:code-review",
  "supervibe:confidence-scoring",
  "supervibe:tdd",
]));

export function validateAgentSkillCoverage(rootDir = process.cwd()) {
  const issues = [];
  const availableSkills = readAvailableSkillIds(rootDir);
  const agentSkillOwners = new Map([...availableSkills].map((skill) => [skill, []]));
  const files = walkMarkdown(join(rootDir, "agents"));

  for (const file of files) {
    const rel = toPosix(relative(rootDir, file));
    const raw = readFileSync(file, "utf8");
    const parsed = matter(raw);
    const skills = Array.isArray(parsed.data.skills)
      ? parsed.data.skills.map(String)
      : [];
    const uniqueSkills = new Set(skills);
    const specialistSkills = skills.filter((skill) => !FOUNDATIONAL_SKILLS.has(skill));
    const foundationalSkills = skills.filter((skill) => FOUNDATIONAL_SKILLS.has(skill));
    const skillsSection = extractSkillsSection(parsed.content);

    if (skills.length < MIN_SKILLS_PER_AGENT) {
      issues.push(issue(rel, "weak-skill-count", `Agent frontmatter skills must contain at least ${MIN_SKILLS_PER_AGENT} items.`));
    }

    if (uniqueSkills.size !== skills.length) {
      issues.push(issue(rel, "duplicate-skill", "Agent frontmatter skills must not contain duplicate skill ids."));
    }

    if (specialistSkills.length === 0) {
      issues.push(issue(rel, "missing-specialist-skill", "Agent skill set must include at least one non-foundational specialist skill."));
    }

    if (foundationalSkills.length < 2) {
      issues.push(issue(rel, "weak-foundational-skills", "Agent skill set must include at least two foundational skills for memory/search/verification/review/scoring discipline."));
    }

    if (!skillsSection) {
      issues.push(issue(rel, "missing-skills-section", "Agent body must include a ## Skills section explaining its skill routing."));
    }

    for (const skill of skills) {
      if (!availableSkills.has(skill)) {
        issues.push(issue(rel, "unknown-skill", `Unknown skill id in frontmatter: ${skill}`));
      } else {
        agentSkillOwners.get(skill).push(rel);
      }
      if (skillsSection && !skillsSection.includes(skill)) {
        issues.push(issue(rel, "skill-not-explained", `Skill ${skill} is in frontmatter but missing from ## Skills.`));
      }
    }
  }

  for (const [skill, owners] of agentSkillOwners) {
    if (owners.length === 0) {
      issues.push(issue(skill, "skill-unowned-by-agent", "Skill exists under skills/ but no agent declares it in frontmatter."));
    }
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    checkedSkills: availableSkills.size,
    issues,
  };
}

export function formatAgentSkillCoverageReport(report = {}) {
  const lines = [
    "SUPERVIBE_AGENT_SKILL_COVERAGE",
    `PASS: ${report.pass === true}`,
    `CHECKED: ${report.checked || 0}`,
    `CHECKED_SKILLS: ${report.checkedSkills || 0}`,
    `ISSUES: ${report.issues?.length || 0}`,
  ];
  for (const item of report.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

function readAvailableSkillIds(rootDir) {
  const skillsDir = join(rootDir, "skills");
  if (!existsSync(skillsDir)) return new Set();
  return new Set(
    readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `supervibe:${entry.name}`),
  );
}

function extractSkillsSection(body) {
  const start = body.search(/^## Skills\b/im);
  if (start < 0) return "";
  const rest = body.slice(start);
  const next = rest.slice(1).search(/^## /m);
  return next >= 0 ? rest.slice(0, next + 1) : rest;
}

function walkMarkdown(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

function issue(file, code, message) {
  return { file, code, message };
}

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

if (process.argv[1] && basename(process.argv[1]) === "validate-agent-skill-coverage.mjs") {
  const result = validateAgentSkillCoverage(ROOT);
  console.log(formatAgentSkillCoverageReport(result));
  process.exit(result.pass ? 0 : 1);
}
