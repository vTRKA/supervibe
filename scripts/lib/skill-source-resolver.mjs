import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";

import {
  repairMojibakeText,
} from "./text-encoding-quality.mjs";

const DEFAULT_PRIORITY = Object.freeze(["project", "codex-home", "marketplace"]);

function defaultSkillSourceRoots({
  projectRoot = process.cwd(),
  homeDir = homedir(),
} = {}) {
  return [
    { source: "project", root: join(projectRoot, "skills"), priority: 0 },
    { source: "codex-home", root: join(process.env.CODEX_HOME || join(homeDir, ".codex"), "skills"), priority: 1 },
    { source: "marketplace", root: join(homeDir, ".claude", "plugins", "marketplaces", "supervibe-marketplace", "skills"), priority: 2 },
  ];
}

export function buildSkillSourceReport({
  projectRoot = process.cwd(),
  roots = defaultSkillSourceRoots({ projectRoot }),
} = {}) {
  const discovered = roots
    .map((root) => ({
      ...root,
      exists: existsSync(root.root),
      skills: existsSync(root.root) ? listSkillDirs(root.root).map((skill) => ({
        id: skill.id,
        path: normalizePath(relative(projectRoot, skill.path).startsWith("..") ? skill.path : relative(projectRoot, skill.path)),
        source: root.source,
        priority: root.priority ?? DEFAULT_PRIORITY.indexOf(root.source),
        encodingIssues: inspectSkillEncoding(skill.path),
      })) : [],
    }));

  const byId = new Map();
  for (const source of discovered) {
    for (const skill of source.skills) {
      const list = byId.get(skill.id) || [];
      list.push(skill);
      byId.set(skill.id, list);
    }
  }

  const skills = [...byId.entries()]
    .map(([id, sources]) => {
      const sorted = sources.sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
      return {
        id,
        activeSource: sorted[0]?.source || null,
        activePath: sorted[0]?.path || null,
        sources: sorted,
        conflict: sorted.length > 1,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const conflicts = skills.filter((skill) => skill.conflict);
  const encodingIssues = skills.flatMap((skill) => skill.sources.flatMap((source) => {
    return source.encodingIssues.map((issue) => ({
      ...issue,
      skillId: skill.id,
      source: source.source,
      path: source.path,
    }));
  }));

  return {
    schemaVersion: 1,
    resolverPolicy: "lowest-priority-index-wins",
    roots: discovered.map((root) => ({
      source: root.source,
      root: normalizePath(root.root),
      exists: root.exists,
      skills: root.skills.length,
      priority: root.priority ?? DEFAULT_PRIORITY.indexOf(root.source),
    })),
    skills,
    conflicts,
    encodingIssues,
    pass: encodingIssues.length === 0,
  };
}

export function formatSkillSourceReport(report = {}) {
  const lines = [
    "SUPERVIBE_SKILL_SOURCE_REPORT",
    `PASS: ${report.pass === true}`,
    `RESOLVER_POLICY: ${report.resolverPolicy || "unknown"}`,
    `ROOTS: ${report.roots?.length || 0}`,
  ];
  for (const root of report.roots || []) {
    lines.push(`ROOT: ${root.source} priority=${root.priority} exists=${root.exists} skills=${root.skills} path=${root.root}`);
  }
  lines.push(`CONFLICTS: ${report.conflicts?.length || 0}`);
  for (const conflict of report.conflicts || []) {
    lines.push(`CONFLICT: ${conflict.id} active=${conflict.activeSource} ${conflict.activePath}`);
    for (const source of conflict.sources || []) {
      lines.push(`  - ${source.source} priority=${source.priority} path=${source.path}`);
    }
  }
  lines.push(`ENCODING_ISSUES: ${report.encodingIssues?.length || 0}`);
  for (const issue of report.encodingIssues || []) {
    lines.push(`ISSUE: ${issue.code} ${issue.skillId} ${issue.source} ${issue.path} - ${issue.message}`);
  }
  return lines.join("\n");
}

function listSkillDirs(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(root, entry.name);
      return {
        id: skillIdFromDir(path, entry.name),
        path,
      };
    });
}

function skillIdFromDir(path, fallback) {
  const skillPath = join(path, "SKILL.md");
  if (!existsSync(skillPath)) return fallback;
  const text = readFileSync(skillPath, "utf8");
  const name = text.match(/^name:\s*([^\n]+)/m)?.[1]?.trim();
  return name || fallback;
}

function inspectSkillEncoding(path) {
  const skillPath = join(path, "SKILL.md");
  if (!existsSync(skillPath)) return [];
  const text = readFileSync(skillPath, "utf8");
  const repairs = repairMojibakeText(text).repairs;
  return repairs.length
    ? [{
        code: "repairable-mojibake",
        message: `repairable mojibake "${repairs[0].before}" -> "${repairs[0].after}"`,
      }]
    : [];
}

function normalizePath(path) {
  return String(path || "").split(sep).join("/");
}
