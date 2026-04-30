import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const FILE_REQUIREMENTS = [
  {
    file: "commands/supervibe.md",
    required: ["brainstorm", "plan", "review", "epic", "worktree", "autonomous", "diagnose", "брейншторм", "план", "ревью", "эпик"],
  },
  {
    file: "commands/supervibe-brainstorm.md",
    required: ["brainstorm", "брейншторм", "plan", "план", "next"],
  },
  {
    file: "commands/supervibe-plan.md",
    required: ["plan", "план", "review", "ревью", "atomic", "эпик"],
  },
  {
    file: "commands/supervibe-loop.md",
    required: ["autonomous", "epic", "worktree", "3h", "stop", "resume", "policy"],
  },
  {
    file: "commands/supervibe-execute-plan.md",
    required: ["execute", "plan", "readiness", "review", "atomic", "epic"],
  },
  {
    file: "skills/brainstorming/SKILL.md",
    required: ["brainstorm", "брейншторм", "plan", "план", "next"],
  },
  {
    file: "skills/writing-plans/SKILL.md",
    required: ["plan", "план", "review", "ревью", "atomic", "epic"],
  },
  {
    file: "skills/requesting-code-review/SKILL.md",
    required: ["review", "ревью", "plan", "loop", "evidence"],
  },
  {
    file: "skills/autonomous-agent-loop/SKILL.md",
    required: ["autonomous", "epic", "worktree", "3h", "stop", "resume"],
  },
  {
    file: "skills/subagent-driven-development/SKILL.md",
    required: ["subagent", "epic", "worktree", "atomic", "review"],
  },
  {
    file: "skills/using-git-worktrees/SKILL.md",
    required: ["worktree", "session", "autonomous", "cleanup"],
  },
];

const README_REQUIRED = [
  "Brainstorm -> Plan -> Review -> Atomize -> Epic -> Worktree Run",
  "why-trigger",
  "diagnose-trigger",
  "provider-safe",
  "stop/resume/status",
];

const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json"];

export function lintTriggerMetadata(options = {}) {
  const root = options.root ?? process.cwd();
  const files = options.files ?? {};
  const issues = [];

  for (const requirement of FILE_REQUIREMENTS) {
    const content = readMaybe(root, requirement.file, files);
    if (content == null) {
      issues.push(issue(requirement.file, "missing-file", "Trigger metadata file is missing."));
      continue;
    }
    const parsed = parseDescription(content);
    if (!parsed.description) {
      issues.push(issue(requirement.file, "missing-description", "Frontmatter description is missing."));
      continue;
    }
    const description = normalize(parsed.description);
    const missing = requirement.required.filter((term) => !description.includes(normalize(term)));
    if (missing.length > 0) {
      issues.push(issue(requirement.file, "weak-trigger-description", `Description misses trigger terms: ${missing.join(", ")}`, missing));
    }
  }

  const readme = readMaybe(root, "README.md", files);
  if (readme != null) {
    const missing = README_REQUIRED.filter((term) => !normalize(readme).includes(normalize(term)));
    if (missing.length > 0) {
      issues.push(issue("README.md", "readme-missing-trigger-workflow", `README misses workflow coverage: ${missing.join(", ")}`, missing));
    }
  }

  for (const manifestPath of MANIFESTS) {
    const content = readMaybe(root, manifestPath, files);
    if (content == null) continue;
    const normalized = normalize(content);
    const missing = ["trigger", "workflow", "worktree"].filter((term) => !normalized.includes(term));
    if (missing.length > 0) {
      issues.push(issue(manifestPath, "manifest-missing-trigger-copy", `Manifest misses trigger/workflow copy: ${missing.join(", ")}`, missing));
    }
  }

  return { pass: issues.length === 0, issues };
}

export function formatTriggerMetadataLint(result) {
  if (result.pass) return "Trigger metadata lint passed.";
  return result.issues
    .map((item) => `${item.file}: ${item.code}: ${item.message}`)
    .join("\n");
}

function parseDescription(content) {
  try {
    const parsed = matter(content);
    return { description: parsed.data?.description ?? "" };
  } catch {
    return { description: "" };
  }
}

function readMaybe(root, file, virtualFiles) {
  if (Object.prototype.hasOwnProperty.call(virtualFiles, file)) return virtualFiles[file];
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
}

function issue(file, code, message, missing = []) {
  return { file, code, message, missing };
}

function normalize(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}
