#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const REQUIRED_BODY_PATTERN_BY_HEADING = Object.freeze({
  "Overview": ["missing-overview", /##\s+Overview\b/i, "Skill needs an Overview section aligned with the local anatomy baseline."],
  "When to Use": ["missing-when-to-use", /##\s+When to Use\b/i, "Skill needs an exact When to Use section aligned with the local anatomy baseline."],
  "Expert Operating Standard": ["missing-expert-operating-standard", /##\s+Expert Operating Standard\b/i, "Skill needs the shared expert operating standard section."],
  "Step 0": ["missing-step-zero", /##\s+Step 0\b|Read source of truth/i, "Skill needs a mandatory Step 0/source-of-truth preflight."],
  "When not to use": ["missing-when-not-to-use", /##\s+When not to use\b/i, "Skill needs explicit when-not-to-use boundaries."],
  "Decision tree": ["missing-decision-tree", /##\s+Decision tree\b/i, "Skill needs explicit branching logic for non-trivial cases."],
  "Procedure": ["missing-procedure", /##\s+Procedure\b/i, "Skill needs a Procedure section."],
  "Common rationalizations": ["missing-common-rationalizations", /##\s+Common rationalizations\b/i, "Skill needs concrete rationalizations that agents must reject."],
  "Red flags": ["missing-red-flags", /##\s+Red flags\b/i, "Skill needs concrete red flags for misuse or low-quality execution."],
  "Checklist": ["missing-checklist", /##\s+Checklist\b/i, "Skill needs an execution and review checklist."],
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
  ["missing-checklist", /##\s+Checklist\b/i, "Skill needs an execution and review checklist."],
  ["missing-failure-modes", /##\s+Failure modes\b/i, "Skill needs failure-mode coverage."],
  ["missing-output-contract", /##\s+Output contract\b/i, "Skill needs an Output contract section."],
  ["missing-guard-rails", /##\s+Guard rails\b/i, "Skill needs Guard rails."],
  ["missing-verification", /##\s+Verification\b/i, "Skill needs a Verification section."],
  ["missing-related", /##\s+Related\b/i, "Skill needs related skills, agents, rules, or commands."],
]);

const STAGED_BASELINE_ANATOMY_CODES = Object.freeze(new Set([
  "missing-overview",
  "missing-when-to-use",
]));

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

const DEFAULT_ROLLOUT_MODE = "report-only";
const ROLLOUT_MODES = Object.freeze(new Set([
  "fixture-only",
  "report-only",
  "hard-gate",
]));

const INVENTORY_PATH = Object.freeze([".supervibe", "artifacts", "evidence", "agent-skill-normalization-gap-inventory.json"]);

const INVENTORY_CLASS_TO_VALIDATOR_CLASS = Object.freeze({
  "command-only": "command-only",
  "context-evidence": "foundational",
  "design-ui": "specialist",
  "foundational": "foundational",
  "lifecycle": "foundational",
  "quality-risk": "specialist",
  "specialist": "specialist",
  "support": "support",
});

const GENERIC_RATIONALIZATION_PATTERNS = Object.freeze([
  /this is small,\s*so no source check is needed/i,
  /the user asked for speed,\s*so skip receipts/i,
  /existing prose is enough evidence/i,
  /the validator probably caught enough/i,
  /just use common sense/i,
]);

const GENERIC_RED_FLAG_PATTERNS = Object.freeze([
  /a durable artifact changes without a command,\s*receipt,\s*or verification path/i,
  /the skill is used outside its phase without an explicit handoff/i,
  /claims of completion appear before evidence and confidence scoring/i,
  /missing verification command/i,
]);

const VERIFICATION_COMMAND_PATTERN = /\b(npm|node|pnpm|yarn|npx|deno|python|pytest|cargo|go test|make|git)\b|\/validate:|\/supervibe|node --test|npm run/i;
const OPERATIONAL_SIGNAL_PATTERN = /\b(read|run|invoke|write|emit|validate|verify|score|record|ask|stop|inspect|compare|route|load|query|capture)\b/i;

const REQUIRED_FRONTMATTER_FIELDS = Object.freeze([
  "allowed-tools",
  "phase",
  "emits-artifact",
  "confidence-rubric",
  "gate-on-exit",
]);

export function validateSkillContentQuality(rootDir = process.cwd(), options = {}) {
  const issues = [];
  const stagedIssues = [];
  const rolloutMode = normalizeRolloutMode(options);
  const files = walkSkillFiles(join(rootDir, "skills"));
  const requiredBodyPatternSpec = loadRequiredBodyPatternSpec(rootDir);
  const requiredBodyPatterns = requiredBodyPatternSpec.patterns;
  const inventory = loadSkillInventory(rootDir);
  const skills = [];
  const classificationCounts = {};

  if (requiredBodyPatternSpec.unsupportedHeadings.length > 0) {
    issues.push(issue(
      toPosix(relative(rootDir, requiredBodyPatternSpec.fixturePath)),
      "unsupported-baseline-anatomy",
      `Local baseline fixture contains unsupported anatomy headings: ${requiredBodyPatternSpec.unsupportedHeadings.join(", ")}.`,
    ));
  }

  for (const file of files) {
    const rel = toPosix(relative(rootDir, file));
    const raw = readFileSync(file, "utf8");
    const parsed = matter(raw);
    const body = parsed.content;
    const bodyWithoutCode = stripFencedCode(body);
    const fenceIssue = findUnbalancedFencedCode(raw);
    const skillName = rel.split("/").at(-2) || "";
    const inventoryEntry = inventory.byName.get(skillName);
    const classification = classifySkill(skillName, parsed, inventoryEntry);
    classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;
    skills.push({
      file: rel,
      name: skillName,
      classification,
      inventoryClass: inventoryEntry?.class || null,
      action: inventoryEntry?.action || inventoryEntry?.exception || null,
    });

    if (inventory.exists && !inventoryEntry) {
      issues.push(issue(rel, "missing-skill-classification", "Skill must have a class entry in the normalization gap inventory."));
    } else if (inventoryEntry && !inventoryEntry.action && !inventoryEntry.exception) {
      issues.push(issue(rel, "missing-skill-action-or-exception", "Skill inventory entry must include an action or exception."));
    }

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
      const item = issue(rel, code, message);
      if (STAGED_BASELINE_ANATOMY_CODES.has(code)) {
        pushRolloutIssue({ issues, stagedIssues, rolloutMode, issueType: "fixture" }, item);
      } else {
        issues.push(item);
      }
    }

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

    if (rolloutMode !== "fixture-only") {
      for (const item of findDepthPolicyIssues({
        rel,
        skillName,
        body,
        bodyWithoutCode,
        classification,
      })) {
        pushRolloutIssue({ issues, stagedIssues, rolloutMode, issueType: "depth" }, item);
      }
    }

    if (Buffer.byteLength(raw, "utf8") > MAX_INLINE_SKILL_BYTES && !/##\s+Supporting references\b/i.test(body)) {
      issues.push(issue(rel, "oversized-without-exemption", `Skill is over ${MAX_INLINE_SKILL_BYTES} bytes and must use one-hop Supporting references or an explicit exemption.`));
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
    rolloutMode,
    skills,
    classificationCounts,
    issues,
    stagedIssues,
  };
}

export function loadRequiredBodyPatterns(rootDir = process.cwd()) {
  return loadRequiredBodyPatternSpec(rootDir).patterns;
}

function loadRequiredBodyPatternSpec(rootDir = process.cwd()) {
  const fixturePath = join(rootDir, "tests", "fixtures", "skill-anatomy-baseline.json");
  if (!existsSync(fixturePath)) {
    return {
      fixturePath,
      source: "fallback",
      patterns: FALLBACK_REQUIRED_BODY_PATTERNS,
      unsupportedHeadings: [],
    };
  }
  try {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const headings = Array.isArray(fixture.requiredSkillAnatomy) ? fixture.requiredSkillAnatomy : [];
    const patterns = [];
    const unsupportedHeadings = [];
    for (const heading of headings) {
      const pattern = REQUIRED_BODY_PATTERN_BY_HEADING[heading];
      if (pattern) {
        patterns.push(pattern);
      } else {
        unsupportedHeadings.push(String(heading));
      }
    }
    return {
      fixturePath,
      source: "fixture",
      patterns: patterns.length > 0 ? patterns : FALLBACK_REQUIRED_BODY_PATTERNS,
      unsupportedHeadings,
    };
  } catch {
    return {
      fixturePath,
      source: "fallback",
      patterns: FALLBACK_REQUIRED_BODY_PATTERNS,
      unsupportedHeadings: [],
    };
  }
}

export function formatSkillContentQualityReport(report = {}) {
  const lines = [
    "SUPERVIBE_SKILL_CONTENT_QUALITY",
    `PASS: ${report.pass === true}`,
    `CHECKED: ${report.checked || 0}`,
    `ROLLOUT_MODE: ${report.rolloutMode || DEFAULT_ROLLOUT_MODE}`,
    `ISSUES: ${report.issues?.length || 0}`,
    `STAGED_ISSUES: ${report.stagedIssues?.length || 0}`,
  ];
  const classificationCounts = report.classificationCounts || {};
  if (Object.keys(classificationCounts).length > 0) {
    lines.push(`CLASSIFICATIONS: ${Object.entries(classificationCounts).map(([key, value]) => `${key}=${value}`).join(" ")}`);
  }
  for (const item of report.issues || []) {
    lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  }
  for (const item of report.stagedIssues || []) {
    lines.push(`STAGED: ${item.code} ${item.file} - ${item.message}`);
  }
  return lines.join("\n");
}

function normalizeRolloutMode(options = {}) {
  const rawMode = options.rolloutMode
    || options.mode
    || process.env.SUPERVIBE_SKILL_CONTENT_ROLLOUT
    || process.env.SUPERVIBE_SKILL_DEPTH_ROLLOUT
    || DEFAULT_ROLLOUT_MODE;
  const mode = String(rawMode).trim().toLowerCase();
  if (mode === "hard" || mode === "gate") return "hard-gate";
  if (mode === "report") return "report-only";
  if (mode === "fixture") return "fixture-only";
  return ROLLOUT_MODES.has(mode) ? mode : DEFAULT_ROLLOUT_MODE;
}

function pushRolloutIssue({ issues, stagedIssues, rolloutMode, issueType }, item) {
  if (rolloutMode === "hard-gate" || (rolloutMode === "fixture-only" && issueType === "fixture")) {
    issues.push(item);
    return;
  }
  stagedIssues.push(item);
}

function loadSkillInventory(rootDir) {
  const inventoryPath = join(rootDir, ...INVENTORY_PATH);
  const byName = new Map();
  if (!existsSync(inventoryPath)) return { exists: false, byName };
  try {
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    for (const entry of inventory.skills || []) {
      if (entry?.name) byName.set(entry.name, entry);
    }
    return { exists: true, byName };
  } catch {
    return { exists: true, byName };
  }
}

function classifySkill(skillName, parsed, inventoryEntry) {
  if (inventoryEntry?.class === "critical" || CRITICAL_SKILLS.has(skillName)) return "critical";
  if (inventoryEntry?.class && INVENTORY_CLASS_TO_VALIDATOR_CLASS[inventoryEntry.class]) {
    return INVENTORY_CLASS_TO_VALIDATOR_CLASS[inventoryEntry.class];
  }
  if (parsed.data?.["gate-on-exit"] === false) return "support";
  return "specialist";
}

function findDepthPolicyIssues({ rel, body, bodyWithoutCode, classification }) {
  if (classification === "support" || classification === "command-only") return [];
  const issues = [];
  const examples = extractHeadingSection(body, "Examples");
  const rationalizations = extractHeadingSection(body, "Common rationalizations");
  const redFlags = extractHeadingSection(body, "Red flags");
  const outputContract = extractHeadingSection(body, "Output contract");
  const procedure = extractHeadingSection(body, "Procedure");
  const verification = extractHeadingSection(body, "Verification");

  if (classification === "critical") {
    const concreteExamples = listItems(examples).filter(isConcreteExample);
    const antiExamples = concreteExamples.filter(isAntiExample);
    const positiveExamples = concreteExamples.length - antiExamples.length;
    if (concreteExamples.length < 2 || (positiveExamples < 2 && antiExamples.length < 1)) {
      issues.push(issue(rel, "missing-concrete-examples", "Critical skill must include at least two concrete examples or one concrete domain example plus one anti-example."));
    }

    const nonGenericRationalizations = listItems(rationalizations).filter((item) => !isGenericRationalization(item));
    if (nonGenericRationalizations.length < 3) {
      issues.push(issue(rel, "generic-rationalizations", "Critical skill must include at least three non-generic rationalizations tied to its domain."));
    }

    const concreteRedFlags = listItems(redFlags).filter((item) => !isGenericRedFlag(item));
    if (concreteRedFlags.length < 3) {
      issues.push(issue(rel, "missing-red-flags", "Critical skill must include at least three concrete, domain-specific red flags."));
    }

    if (countOutputFields(outputContract) < 3) {
      issues.push(issue(rel, "missing-output-fields", "Critical skill Output contract must name explicit output fields."));
    }

    if (!VERIFICATION_COMMAND_PATTERN.test(verification)) {
      issues.push(issue(rel, "missing-verification-commands", "Critical skill Verification must name concrete commands or workflow validators."));
    }
  }

  if (!hasOperationalProcedure(procedure, bodyWithoutCode)) {
    issues.push(issue(rel, "weak-operational-specificity", "Skill Procedure must use executable steps with concrete read/run/write/verify actions."));
  }

  return issues;
}

function extractHeadingSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const headingPattern = new RegExp(`^(#{2,6})\\s+${escapeRegExp(heading)}\\b`, "i");
  let start = -1;
  let level = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = headingPattern.exec(lines[index]);
    if (!match) continue;
    start = index + 1;
    level = match[1].length;
    break;
  }

  if (start === -1) return "";

  const out = [];
  for (let index = start; index < lines.length; index += 1) {
    const nextHeading = /^(#{1,6})\s+\S/.exec(lines[index]);
    if (nextHeading && nextHeading[1].length <= level) break;
    out.push(lines[index]);
  }
  return out.join("\n");
}

function listItems(section) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^([-*]|\d+\.)\s+/.test(line))
    .map((line) => line.replace(/^([-*]|\d+\.)\s+/, "").trim())
    .filter(Boolean);
}

function isConcreteExample(item) {
  const words = item.split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;
  return /`|\/supervibe|npm run|node --test|receipt|artifact|graph|provider|browser|PR|review|command|validation|diff|route|screenshot|host|task|plan|implementation|release|file|branch|workflow|validator/i.test(item);
}

function isAntiExample(item) {
  return /\b(do not|don't|avoid|never|false|counterexample|anti-example|invalid|reject)\b/i.test(item);
}

function isGenericRationalization(item) {
  if (wordCount(item) < 8) return true;
  return GENERIC_RATIONALIZATION_PATTERNS.some((pattern) => pattern.test(item));
}

function isGenericRedFlag(item) {
  if (wordCount(item) < 6) return true;
  return GENERIC_RED_FLAG_PATTERNS.some((pattern) => pattern.test(item));
}

function countOutputFields(section) {
  const fieldLines = section
    .split(/\r?\n/)
    .filter((line) => /^\s*([-*]\s+)?`?[A-Za-z][A-Za-z0-9_-]{2,}`?\s*:/.test(line.trim()));
  const inlineFields = new Set([...section.matchAll(/`([a-z][A-Za-z0-9_-]{2,})`/g)].map((match) => match[1]));
  return fieldLines.length + inlineFields.size;
}

function hasOperationalProcedure(procedure, bodyWithoutCode) {
  const numberedSteps = procedure.split(/\r?\n/).filter((line) => /^\s*\d+\.\s+/.test(line)).length;
  if (numberedSteps >= 2 && OPERATIONAL_SIGNAL_PATTERN.test(procedure)) return true;
  const procedureSignals = (procedure.match(OPERATIONAL_SIGNAL_PATTERN) || []).length;
  if (procedureSignals >= 2) return true;
  return /##\s+Procedure\b/i.test(bodyWithoutCode) && OPERATIONAL_SIGNAL_PATTERN.test(procedure);
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
