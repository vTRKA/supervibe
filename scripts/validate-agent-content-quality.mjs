#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, join, relative } from "node:path";
import matter from "gray-matter";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const REQUIRED_BODY_PATTERNS = Object.freeze([
  ["missing-persona-section", /##\s+Persona\b/i, "Agent needs a Persona section."],
  ["missing-project-context-section", /##\s+Project Context\b/i, "Agent needs a Project Context section with repo-specific evidence guidance."],
  ["missing-modern-expert-standard", /agent-modern-expert-standard|##\s+2026 Expert Standard\b/i, "Agent needs the modern expert standard reference."],
  ["missing-scope-safety", /##\s+Scope Safety\b|scope-safety-standard/i, "Agent needs scope-safety guidance."],
  ["missing-rag-memory-preflight", /RAG \+ Memory pre-flight|supervibe:project-memory/i, "Agent needs memory/RAG pre-flight guidance."],
  ["missing-codegraph-guidance", /Code Graph|--callers|--callees|--neighbors/i, "Agent needs Code Graph guidance for structural work."],
  ["missing-user-dialogue-discipline", /##\s+User dialogue discipline\b|Step N\/M/i, "Agent needs one-question-at-a-time dialogue discipline."],
  ["missing-procedure-section", /##\s+Procedure\b/i, "Agent needs a Procedure section."],
  ["missing-anti-patterns-section", /##\s+Anti-patterns\b/i, "Agent needs an Anti-patterns section."],
  ["missing-verification-section", /##\s+Verification\b/i, "Agent needs a Verification section."],
  ["missing-output-contract-section", /##\s+Output Contract\b|##\s+Output contract\b/i, "Agent needs an Output Contract section."],
]);

const FRONTMATTER_LIST_REQUIREMENTS = Object.freeze([
  ["skills", 2],
  ["tools", 1],
  ["verification", 2],
  ["anti-patterns", 4],
]);

export function validateAgentContentQuality(rootDir = process.cwd()) {
  const issues = [];
  const files = walkMarkdown(join(rootDir, "agents"));

  for (const file of files) {
    const rel = toPosix(relative(rootDir, file));
    const raw = readFileSync(file, "utf8");
    const parsed = matter(raw);
    const body = parsed.content;

    if (/{{\s*[A-Z][A-Z0-9_-]*\s*}}/.test(raw)) {
      issues.push(issue(rel, "template-placeholder", "Agent file contains unresolved template placeholders."));
    }

    const personaYears = Number(parsed.data?.["persona-years"] || 0);
    if (!Number.isFinite(personaYears) || personaYears < 15) {
      issues.push(issue(rel, "weak-persona-years", "Agent persona-years must be 15 or higher."));
    }

    for (const [field, min] of FRONTMATTER_LIST_REQUIREMENTS) {
      const value = parsed.data?.[field];
      if (!Array.isArray(value) || value.length < min) {
        issues.push(issue(rel, `weak-${field}`, `Agent frontmatter ${field} must contain at least ${min} item(s).`));
      }
    }

    for (const [code, pattern, message] of REQUIRED_BODY_PATTERNS) {
      if (pattern.test(body)) continue;
      issues.push(issue(rel, code, message));
    }
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    issues,
  };
}

export function formatAgentContentQualityReport(report = {}) {
  const lines = [
    "SUPERVIBE_AGENT_CONTENT_QUALITY",
    `PASS: ${report.pass === true}`,
    `CHECKED: ${report.checked || 0}`,
    `ISSUES: ${report.issues?.length || 0}`,
  ];
  for (const item of report.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
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

if (process.argv[1] && basename(process.argv[1]) === "validate-agent-content-quality.mjs") {
  const result = validateAgentContentQuality(ROOT);
  console.log(formatAgentContentQualityReport(result));
  process.exit(result.pass ? 0 : 1);
}
