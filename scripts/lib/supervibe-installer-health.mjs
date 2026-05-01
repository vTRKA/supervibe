import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REQUIRED_COMMAND_FILES = Object.freeze([
  "supervibe-genesis.md",
  "supervibe-status.md",
  "supervibe-ui.md",
  "supervibe-preview.md",
  "supervibe-security-audit.md",
]);

const REQUIRED_SKILLS = Object.freeze([
  "genesis",
  "adapt",
  "audit",
  "strengthen",
  "project-memory",
  "code-search",
  "verification",
]);

const REQUIRED_RULES = Object.freeze([
  "operational-safety.md",
  "single-question-discipline.md",
  "privacy-pii.md",
]);

const REQUIRED_PACKAGE_SCRIPTS = Object.freeze([
  "check",
  "supervibe:upgrade",
  "supervibe:install-doctor",
  "supervibe:auto-update",
]);

export function runInstallerHealthGate({ rootDir = process.cwd() } = {}) {
  const issues = [];
  const warnings = [];
  const pluginJsonPath = join(rootDir, ".claude-plugin", "plugin.json");
  const packageJsonPath = join(rootDir, "package.json");
  const pluginJson = readJsonOptional(pluginJsonPath);
  const packageJson = readJsonOptional(packageJsonPath);

  if (!pluginJson) {
    issues.push(issue("missing-plugin-json", ".claude-plugin/plugin.json missing or invalid"));
  }
  if (!packageJson) {
    issues.push(issue("missing-package-json", "package.json missing or invalid"));
  }

  for (const file of REQUIRED_COMMAND_FILES) {
    if (!existsSync(join(rootDir, "commands", file))) issues.push(issue("missing-command", `missing command file: ${file}`));
  }
  for (const skill of REQUIRED_SKILLS) {
    if (!existsSync(join(rootDir, "skills", skill, "SKILL.md"))) issues.push(issue("missing-skill", `missing skill file: ${skill}`));
  }
  for (const rule of REQUIRED_RULES) {
    if (!existsSync(join(rootDir, "rules", rule))) issues.push(issue("missing-rule", `missing rule file: ${rule}`));
  }
  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    if (!packageJson?.scripts?.[script]) issues.push(issue("missing-package-script", `missing package script: ${script}`));
  }

  const manifestAgents = new Set((pluginJson?.agents || []).map(normalizeManifestPath));
  const agentFiles = listFiles(join(rootDir, "agents"), ".md").map((path) => normalizeManifestPath(`./${relative(rootDir, path)}`));
  for (const agentPath of agentFiles) {
    if (!manifestAgents.has(agentPath)) {
      issues.push(issue("agent-missing-from-plugin-json", `agent file not listed in plugin manifest: ${agentPath}`));
    }
  }
  for (const agentPath of manifestAgents) {
    if (!existsSync(join(rootDir, agentPath.replace(/^\.\//, "")))) {
      issues.push(issue("plugin-json-missing-agent-file", `plugin manifest references missing agent: ${agentPath}`));
    }
  }

  const docs = [
    "docs/references/upgrade-and-rollback.md",
    "docs/references/host-adapter-matrix.md",
  ];
  for (const doc of docs) {
    if (!existsSync(join(rootDir, doc))) warnings.push(issue("missing-reference-doc", `reference doc missing: ${doc}`));
  }

  const codeDbPath = join(rootDir, ".supervibe", "memory", "code.db");
  const codeDb = existsSync(codeDbPath)
    ? { present: true, path: codeDbPath, schemaVersion: "graph_version-column-required" }
    : { present: false, path: codeDbPath, schemaVersion: "not-initialized" };

  return {
    gate: "installer-health",
    pass: issues.length === 0,
    score: issues.length === 0 ? 10 : Math.max(0, Number((10 - issues.length * 0.5).toFixed(1))),
    rootDir,
    issues,
    warnings,
    codeDb,
    required: {
      commandFiles: [...REQUIRED_COMMAND_FILES],
      skills: [...REQUIRED_SKILLS],
      rules: [...REQUIRED_RULES],
      packageScripts: [...REQUIRED_PACKAGE_SCRIPTS],
    },
  };
}

export function createUpgradeDryRun({
  rootDir = process.cwd(),
  currentVersion = null,
  targetVersion = null,
  plannedFiles = [],
  health = runInstallerHealthGate({ rootDir }),
} = {}) {
  const backupPath = join(rootDir, ".supervibe", "backups", `upgrade-${Date.now()}.json`);
  return {
    dryRun: true,
    rootDir,
    currentVersion,
    targetVersion,
    healthPass: health.pass,
    plannedFileChanges: plannedFiles.map((path) => ({ path, action: "update-or-create" })),
    schemaMigrations: [
      { id: "code-db-graph-version", action: "verify-or-rebuild", backupRequired: true },
    ],
    backupPath,
    rollbackCommand: "node scripts/supervibe-upgrade.mjs --rollback <backup-manifest>",
    risks: [
      "tracked local edits block managed upgrade",
      "schema drift requires backup or full rebuild",
      "host registration may need CLI restart",
    ],
  };
}

export function formatInstallerHealthReport(health) {
  const lines = [
    "SUPERVIBE_INSTALLER_HEALTH",
    `PASS: ${health.pass}`,
    `SCORE: ${health.score}`,
    `ISSUES: ${health.issues.length}`,
    `WARNINGS: ${health.warnings.length}`,
    `CODE_DB: ${health.codeDb.present ? "present" : "not-initialized"}`,
  ];
  if (!health.pass) lines.push("install health did not block inconsistent plugin layout: blocked");
  for (const item of health.issues) lines.push(`- ${item.code}: ${item.message}`);
  for (const item of health.warnings) lines.push(`- warning ${item.code}: ${item.message}`);
  return lines.join("\n");
}

export function formatUpgradeDryRun(dryRun) {
  return [
    "SUPERVIBE_UPGRADE_DRY_RUN",
    `DRY_RUN: ${dryRun.dryRun}`,
    `CURRENT: ${dryRun.currentVersion || "unknown"}`,
    `TARGET: ${dryRun.targetVersion || "unknown"}`,
    `HEALTH_PASS: ${dryRun.healthPass}`,
    `PLANNED_FILES: ${dryRun.plannedFileChanges.length}`,
    `BACKUP: ${dryRun.backupPath}`,
    `ROLLBACK: ${dryRun.rollbackCommand}`,
    `RISKS: ${dryRun.risks.join("; ")}`,
  ].join("\n");
}

function readJsonOptional(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function listFiles(dir, extension) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...listFiles(path, extension));
    else if (path.endsWith(extension)) files.push(path);
  }
  return files;
}

function normalizeManifestPath(path) {
  return String(path).replace(/\\/g, "/").replace(/^\.\//, "./");
}

function issue(code, message) {
  return { code, message };
}
