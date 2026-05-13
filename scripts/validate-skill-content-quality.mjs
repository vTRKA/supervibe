#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const REQUIRED_BODY_PATTERN_BY_HEADING = Object.freeze({
  "Expert Operating Standard": ["missing-expert-operating-standard", /##\s+Expert Operating Standard\b/i, "Skill needs the shared expert operating standard section."],
  "Step 0": ["missing-step-zero", /##\s+Step 0\b|Read source of truth/i, "Skill needs a mandatory Step 0/source-of-truth preflight."],
  "When not to use": ["missing-when-not-to-use", /##\s+When not to use\b/i, "Skill needs explicit when-not-to-use boundaries."],
  "Decision tree": ["missing-decision-tree", /##\s+Decision tree\b/i, "Skill needs explicit branching logic for non-trivial cases."],
  "Procedure": ["missing-procedure", /##\s+Procedure\b/i, "Skill needs a Procedure section."],
  "Common rationalizations": ["missing-common-rationalizations", /##\s+Common rationalizations\b/i, "Skill needs concrete rationalizations that agents must reject."],
  "Red flags": ["missing-red-flags", /##\s+Red flags\b/i, "Skill needs concrete red flags for misuse or low-quality execution."],
  "Checklist": ["missing-checklist", /##\s+Checklist\b/i, "Skill needs an execution/review checklist."],
  "Failure modes": ["missing-failure-modes", /##\s+Failure modes\b/i, "Skill needs failure-mode coverage."],
  "Output contract": ["missing-output-contract", /##\s+Output contract\b/i, "Skill needs an Output contract section."],
  "Guard rails": ["missing-guard-rails", /##\s+Guard rails\b/i, "Skill needs Guard rails."],
  "Verification": ["missing-verification", /##\s+Verification\b/i, "Skill needs a Verification section."],
  "Related": ["missing-related", /##\s+Related\b/i, "Skill needs related skills, agents, rules, or commands."],
});

const FALLBACK_REQUIRED_BODY_PATTERNS = Object.freeze([
  ["missing-expert-operating-standard", /##\s+Expert Operating Standard\b/i, "Skill needs the shared expert operating standard section."],
  ["missing-step-zero", /##\s+Step 0\b|Read source of truth/i, "Skill needs a mandatory Step 0/source-of-truth preflight."],
  ["missing-when-not-to-use", /##\s+When not to use\b/i, "Skill needs explicit when-not-to-use boundaries."],
  ["missing-decision-tree", /##\s+Decision tree\b/i, "Skill needs explicit branching logic for non-trivial cases."],
  ["missing-procedure", /##\s+Procedure\b/i, "Skill needs a Procedure section."],
  ["missing-common-rationalizations", /##\s+Common rationalizations\b/i, "Skill needs concrete rationalizations that agents must reject."],
  ["missing-red-flags", /##\s+Red flags\b/i, "Skill needs concrete red flags for misuse or low-quality execution."],
  ["missing-checklist", /##\s+Checklist\b/i, "Skill needs an execution/review checklist."],
  ["missing-failure-modes", /##\s+Failure modes\b/i, "Skill needs failure-mode coverage."],
  ["missing-output-contract", /##\s+Output contract\b/i, "Skill needs an Output contract section."],
  ["missing-guard-rails", /##\s+Guard rails\b/i, "Skill needs Guard rails."],
  ["missing-verification", /##\s+Verification\b/i, "Skill needs a Verification section."],
  ["missing-related", /##\s+Related\b/i, "Skill needs related skills, agents, rules, or commands."],
]);

const REQUIRED_LOCAL_REFERENCES = Object.freeze([
  ["missing-expert-standard-reference", /skill-expert-operating-standard\.md/i, "Skill must link to the shared skill expert operating standard."],
]);

const SKILL_SPECIFIC_PATTERNS = Object.freeze({
  "code-review": [
    ["missing-protected-simplification-reference", /protected-block-simplification\.md|protected-block-simplification\.mjs/i, "Code review skill must enforce protected-block simplification guardrails."],
  ],
  "source-driven-development": [
    ["missing-official-doc-cache-runtime-reference", /source-driven-doc-cache\.mjs|source-driven-official-doc-cache\.md/i, "Source-driven development skill must reference the freshness-aware official-doc cache runtime or policy."],
  ],
});

const CRITICAL_SKILLS = Object.freeze(new Set([
  "autonomous-agent-loop",
  "subagent-driven-development",
  "dispatching-parallel-agents",
  "executing-plans",
  "verification",
  "code-review",
  "security-audit",
  "finishing-a-development-branch",
  "pre-pr-check",
  "source-driven-development",
  "doubt-driven-development",
  "browser-runtime-verification",
]));

const MAX_INLINE_SKILL_BYTES = 30_000;

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
  const requiredBodyPatterns = loadRequiredBodyPatterns(rootDir);

  for (const file of files) {
    const rel = toPosix(relative(rootDir, file));
    const raw = readFileSync(file, "utf8");
    const parsed = matter(raw);
    const body = parsed.content;
    const bodyWithoutCode = stripFencedCode(body);
    const fenceIssue = findUnbalancedFencedCode(raw);

    if (fenceIssue) {
      issues.push(issue(rel, "unbalanced-fenced-code", `Skill file has an unclosed fenced code block opened on line ${fenceIssue.line}.`));
    }

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

    for (const [code, pattern, message] of [...requiredBodyPatterns, ...REQUIRED_LOCAL_REFERENCES]) {
      if (pattern.test(body)) continue;
      issues.push(issue(rel, code, message));
    }

    const skillName = rel.split("/").at(-2) || "";
    for (const [code, pattern, message] of SKILL_SPECIFIC_PATTERNS[skillName] || []) {
      if (pattern.test(body)) continue;
      issues.push(issue(rel, code, message));
    }

    if (CRITICAL_SKILLS.has(skillName)) {
      const examples = /##\s+(Examples|Example|Worked example|Concrete examples)\b/i.test(body);
      if (!examples) {
        issues.push(issue(rel, "missing-critical-skill-examples", "Critical skill must include concrete examples or worked examples."));
      }
      const referenceSignals = [
        "Common rationalizations",
        "Red flags",
        "Failure modes",
        "Checklist",
      ].filter((heading) => new RegExp(`##\\s+${heading}\\b`, "i").test(body));
      if (referenceSignals.length < 4) {
        issues.push(issue(rel, "weak-critical-skill-depth", "Critical skill must include rationalizations, red flags, checklist, and failure modes."));
      }
    }

    if (Buffer.byteLength(raw, "utf8") > MAX_INLINE_SKILL_BYTES && !/##\s+Supporting references\b/i.test(body)) {
      issues.push(issue(rel, "monolithic-skill", `Skill is over ${MAX_INLINE_SKILL_BYTES} bytes and must use one-hop Supporting references or an explicit exemption.`));
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

export function loadRequiredBodyPatterns(rootDir = process.cwd()) {
  const fixturePath = join(rootDir, "tests", "fixtures", "agent-skills-external-baseline.json");
  if (!existsSync(fixturePath)) return FALLBACK_REQUIRED_BODY_PATTERNS;
  try {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const headings = Array.isArray(fixture.requiredSkillAnatomy) ? fixture.requiredSkillAnatomy : [];
    const patterns = headings.map((heading) => REQUIRED_BODY_PATTERN_BY_HEADING[heading]).filter(Boolean);
    return patterns.length > 0 ? patterns : FALLBACK_REQUIRED_BODY_PATTERNS;
  } catch {
    return FALLBACK_REQUIRED_BODY_PATTERNS;
  }
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

function findUnbalancedFencedCode(text) {
  const lines = text.split(/\r?\n/);
  let openFence = null;

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(?<marker>`{3,}|~{3,})/.exec(lines[index]);
    if (!match?.groups?.marker) continue;

    const marker = match.groups.marker;
    const fence = {
      char: marker[0],
      length: marker.length,
      line: index + 1,
    };

    if (!openFence) {
      openFence = fence;
      continue;
    }

    if (fence.char === openFence.char && fence.length >= openFence.length) {
      openFence = null;
    }
  }

  return openFence;
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
