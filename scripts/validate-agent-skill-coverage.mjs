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

const OWNERSHIP_CLASSES = Object.freeze(new Set([
  "foundational",
  "specialist",
  "command-only",
  "support",
  "experimental",
]));

const INVENTORY_PATH = Object.freeze([".supervibe", "artifacts", "evidence", "agent-skill-normalization-gap-inventory.json"]);

const INVENTORY_CLASS_TO_OWNERSHIP_CLASS = Object.freeze({
  "command-only": "command-only",
  "context-evidence": "foundational",
  "design-ui": "specialist",
  "foundational": "foundational",
  "lifecycle": "foundational",
  "quality-risk": "specialist",
  "specialist": "specialist",
  "support": "support",
});

const COMMAND_ONLY_SKILLS = Object.freeze(new Set([
  "supervibe:adapt",
  "supervibe:audit",
  "supervibe:genesis",
  "supervibe:preview-server",
  "supervibe:strengthen",
]));

const SUPPORT_SKILLS = Object.freeze(new Set([
  "supervibe:add-memory",
  "supervibe:browser-feedback",
  "supervibe:mcp-discovery",
  "supervibe:mock-data-contract",
  "supervibe:stack-discovery",
  "supervibe:using-git-worktrees",
  "supervibe:using-supervibe-skills",
]));

const EXPERIMENTAL_SKILLS = Object.freeze(new Set([
  "supervibe:experiment",
]));

const CRITICAL_SKILL_OWNER_POLICY = Object.freeze({
  "supervibe:autonomous-agent-loop": { minOwners: 2, ownershipClass: "support", role: "foundational workflow" },
  "supervibe:subagent-driven-development": { minOwners: 2, ownershipClass: "support", role: "foundational workflow" },
  "supervibe:dispatching-parallel-agents": { minOwners: 2, ownershipClass: "support", role: "foundational workflow" },
  "supervibe:executing-plans": { minOwners: 2, ownershipClass: "foundational", role: "plan execution" },
  "supervibe:verification": { minOwners: 2, ownershipClass: "foundational", role: "verification" },
  "supervibe:code-review": { minOwners: 2, ownershipClass: "foundational", role: "review" },
  "supervibe:source-driven-development": { minOwners: 2, ownershipClass: "foundational", role: "source evidence" },
  "supervibe:doubt-driven-development": { minOwners: 2, ownershipClass: "support", role: "review hardening" },
  "supervibe:browser-runtime-verification": { minOwners: 2, ownershipClass: "foundational", role: "runtime verification" },
  "supervibe:using-supervibe-skills": { minOwners: 2, ownershipClass: "support", role: "skill routing" },
  "supervibe:receiving-code-review": {
    minOwners: 2,
    ownershipClass: "specialist",
    role: "review intake",
    allowedOwnerPatterns: [
      /^agents\/_core\/(code-reviewer|quality-gate-reviewer|architect-reviewer|security-auditor|refactoring-specialist)\.md$/,
      /^agents\/_ops\/release-governance-reviewer\.md$/,
    ],
  },
  "supervibe:requesting-code-review": {
    minOwners: 2,
    ownershipClass: "specialist",
    role: "review request",
    allowedOwnerPatterns: [
      /^agents\/_core\/(code-reviewer|quality-gate-reviewer|architect-reviewer|security-auditor|refactoring-specialist)\.md$/,
      /^agents\/_ops\/release-governance-reviewer\.md$/,
    ],
  },
  "supervibe:rule-audit": {
    minOwners: 2,
    ownershipClass: "specialist",
    role: "rule audit",
    allowedOwnerPatterns: [
      /^agents\/_meta\/(rules-curator|supervibe-orchestrator)\.md$/,
      /^agents\/_core\/(repo-researcher|quality-gate-reviewer)\.md$/,
    ],
  },
  "supervibe:seo-audit": {
    minOwners: 2,
    ownershipClass: "specialist",
    role: "SEO audit",
    allowedOwnerPatterns: [
      /^agents\/_product\/(seo-specialist|product-manager|systems-analyst)\.md$/,
      /^agents\/_design\/(copywriter|ux-ui-designer)\.md$/,
      /^agents\/_ops\/(performance-reviewer|release-governance-reviewer)\.md$/,
    ],
  },
  "supervibe:trigger-diagnostics": {
    minOwners: 2,
    ownershipClass: "foundational",
    role: "trigger diagnostics",
    allowedOwnerPatterns: [
      /^agents\/_meta\/supervibe-orchestrator\.md$/,
      /^agents\/_core\/(repo-researcher|quality-gate-reviewer)\.md$/,
      /^agents\/_ops\/(ai-agent-orchestrator|llm-evals-engineer)\.md$/,
    ],
  },
  "supervibe:sync-rules": {
    minOwners: 2,
    ownershipClass: "specialist",
    role: "rule sync",
    allowedOwnerPatterns: [
      /^agents\/_meta\/(rules-curator|supervibe-orchestrator)\.md$/,
      /^agents\/_core\/(repo-researcher|quality-gate-reviewer)\.md$/,
    ],
  },
  "supervibe:evaluate": {
    minOwners: 2,
    ownershipClass: "experimental",
    role: "effectiveness evaluation",
    allowedOwnerPatterns: [
      /^agents\/_meta\/supervibe-orchestrator\.md$/,
      /^agents\/_ops\/(llm-evals-engineer|release-governance-reviewer)\.md$/,
      /^agents\/_core\/quality-gate-reviewer\.md$/,
      /^agents\/_product\/(product-manager|systems-analyst)\.md$/,
    ],
  },
});

export function validateAgentSkillCoverage(rootDir = process.cwd(), options = {}) {
  const issues = [];
  const availableSkills = readAvailableSkillIds(rootDir);
  const skillInventory = loadSkillInventory(rootDir);
  const criticalSkillOwnerPolicy = options.criticalSkillOwnerPolicy || CRITICAL_SKILL_OWNER_POLICY;
  const agentSkillOwners = new Map([...availableSkills].map((skill) => [skill, new Map()]));
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
        agentSkillOwners.get(skill).set(rel, { file: rel, agentName: String(parsed.data.name || "") });
      }
      if (skillsSection && !skillsSection.includes(skill)) {
        issues.push(issue(rel, "skill-not-explained", `Skill ${skill} is in frontmatter but missing from ## Skills.`));
      }
    }
  }

  const checkedSkillClasses = emptySkillClassCounts();
  const skillOwnership = [];

  for (const [skill, ownerMap] of agentSkillOwners) {
    const owners = [...ownerMap.values()];
    const ownershipClass = classifySkillOwnership(skill, skillInventory.byName.get(skillIdName(skill)));
    checkedSkillClasses[ownershipClass] += 1;
    const policy = criticalSkillOwnerPolicy[skill];
    const supportedOwners = policy
      ? owners.filter((owner) => isSupportedCriticalOwner(owner.file, policy))
      : owners;

    skillOwnership.push({
      skill,
      class: policy?.ownershipClass || ownershipClass,
      owners: owners.map((owner) => owner.file),
      supportedOwners: supportedOwners.map((owner) => owner.file),
      minOwners: policy?.minOwners || 1,
      exception: normalizeSingleOwnerException(policy, owners),
    });

    if (owners.length === 0) {
      issues.push(issue(skill, "skill-unowned-by-agent", "Skill exists under skills/ but no agent declares it in frontmatter."));
    }

    if (policy) {
      for (const owner of owners) {
        if (!isSupportedCriticalOwner(owner.file, policy)) {
          issues.push(issue(
            owner.file,
            "unrelated-critical-skill-owner",
            `Agent declares critical skill ${skill}, but that agent is outside the supported ${policy.role || "critical"} ownership boundary.`,
          ));
        }
      }

      if (supportedOwners.length < policy.minOwners && !hasDocumentedSingleOwnerException(policy, supportedOwners)) {
        issues.push(issue(
          skill,
          "fragile-critical-skill-ownership",
          `Critical ${policy.role || policy.ownershipClass || "skill"} skill has ${supportedOwners.length}/${policy.minOwners} supported independent owning agents; add a related owner or a documented single-owner exception.`,
        ));
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: files.length,
    checkedSkills: availableSkills.size,
    checkedSkillClasses,
    skillOwnership,
    issues,
  };
}

export function formatAgentSkillCoverageReport(report = {}) {
  const lines = [
    "SUPERVIBE_AGENT_SKILL_COVERAGE",
    `PASS: ${report.pass === true}`,
    `CHECKED: ${report.checked || 0}`,
    `CHECKED_SKILLS: ${report.checkedSkills || 0}`,
    `SKILL_CLASSES: ${formatSkillClassCounts(report.checkedSkillClasses)}`,
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

function loadSkillInventory(rootDir) {
  const inventoryPath = join(rootDir, ...INVENTORY_PATH);
  const byName = new Map();
  if (!existsSync(inventoryPath)) return { exists: false, byName };
  try {
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    for (const entry of inventory.skills || []) {
      if (entry?.name) byName.set(String(entry.name), entry);
    }
    return { exists: true, byName };
  } catch {
    return { exists: true, byName };
  }
}

function classifySkillOwnership(skill, inventoryEntry) {
  if (FOUNDATIONAL_SKILLS.has(skill)) return "foundational";
  if (EXPERIMENTAL_SKILLS.has(skill)) return "experimental";
  if (COMMAND_ONLY_SKILLS.has(skill)) return "command-only";
  if (SUPPORT_SKILLS.has(skill)) return "support";
  const inventoryClass = inventoryEntry?.class ? INVENTORY_CLASS_TO_OWNERSHIP_CLASS[inventoryEntry.class] : null;
  if (inventoryClass && OWNERSHIP_CLASSES.has(inventoryClass)) return inventoryClass;
  return "specialist";
}

function isSupportedCriticalOwner(owner, policy = {}) {
  const patterns = policy.allowedOwnerPatterns || [];
  if (patterns.length === 0) return true;
  return patterns.some((pattern) => pattern.test(owner));
}

function hasDocumentedSingleOwnerException(policy = {}, owners = []) {
  const exception = normalizeSingleOwnerException(policy, owners);
  return exception?.valid === true;
}

function normalizeSingleOwnerException(policy = {}, owners = []) {
  const exception = policy.singleOwnerException;
  if (!exception || owners.length !== 1) return null;
  const owner = owners[0]?.file;
  const rationale = String(exception.rationale || "").trim();
  return {
    owner,
    rationale,
    valid: exception.owner === owner && rationale.split(/\s+/).filter(Boolean).length >= 6,
  };
}

function emptySkillClassCounts() {
  return {
    foundational: 0,
    specialist: 0,
    "command-only": 0,
    support: 0,
    experimental: 0,
  };
}

function formatSkillClassCounts(counts = {}) {
  return [...OWNERSHIP_CLASSES]
    .map((classification) => `${classification}=${counts[classification] || 0}`)
    .join(" ");
}

function skillIdName(skill) {
  return String(skill).replace(/^supervibe:/, "");
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
