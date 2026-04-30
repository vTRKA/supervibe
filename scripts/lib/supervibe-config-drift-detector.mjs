import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BUILT_IN_POLICY_PROFILE_NAMES } from "./supervibe-policy-profile-manager.mjs";

const POLICY_COMMANDS = Object.freeze([
  "--policy-profile",
  "--approval-receipts",
  "--policy-doctor",
  "--policy",
  "--role",
]);

export async function detectPolicyConfigDrift({
  rootDir = process.cwd(),
  managedPolicy = {},
  activeRuns = [],
  worktreeSessions = [],
} = {}) {
  const issues = [];
  const docs = await readProjectDocs(rootDir);
  const localConfig = await readJsonIfExists(join(rootDir, ".supervibe", "policy-profile.json"));
  const packageJson = await readJsonIfExists(join(rootDir, "package.json"));
  const derivedDefaultsPath = join(rootDir, ".supervibe", "policy-derived-defaults.json");
  const hasDerivedDefaults = await pathExists(derivedDefaultsPath);

  for (const command of ["--policy-profile", "--approval-receipts", "--policy-doctor"]) {
    if (!docs.loop.includes(command)) {
      issues.push(issue("stale-docs", "loop-doc-missing-policy-command", `commands/supervibe-loop.md does not document ${command}`));
    }
  }
  for (const command of ["--policy", "--role"]) {
    if (!docs.status.includes(command)) {
      issues.push(issue("stale-docs", "status-doc-missing-policy-command", `commands/supervibe-status.md does not document ${command}`));
    }
  }
  if (!docs.readme.includes("policy profile")) {
    issues.push(issue("stale-docs", "readme-policy-profile-missing", "README does not mention policy profiles"));
  }
  if (!packageJson?.scripts?.["supervibe:loop"]) {
    issues.push(issue("missing-defaults", "package-loop-script-missing", "package.json is missing supervibe:loop script"));
  }
  if (!hasDerivedDefaults) {
    issues.push(issue("missing-defaults", "policy-derived-defaults-missing", "derived policy defaults have not been materialized"));
  }

  if (localConfig) {
    const managedDeny = new Set(asArray(managedPolicy.deny));
    for (const tool of asArray(localConfig.allowedTools)) {
      if (managedDeny.has(tool) || asArray(localConfig.deniedTools).includes(tool)) {
        issues.push(issue("dangerous-drift", "local-profile-weakens-deny", `local profile allows denied tool ${tool}`, { tool }));
      }
    }
    if (localConfig.allowDangerousProviderFlags === true && localConfig.reviewedOverrideAllowed !== true) {
      issues.push(issue("dangerous-drift", "dangerous-provider-override-unreviewed", "dangerous provider override is not reviewed"));
    }
    if (localConfig.localOverrides && Object.keys(localConfig.localOverrides).length > 0) {
      issues.push(issue("harmless-local-override", "local-overrides-present", "local policy overrides are present", { keys: Object.keys(localConfig.localOverrides) }));
    }
  }

  const knownProfiles = new Set(BUILT_IN_POLICY_PROFILE_NAMES);
  for (const run of activeRuns) {
    const profile = run.policyProfile || run.policy_profile || run.preflight?.policy_profile?.name;
    if (profile && !knownProfiles.has(profile)) {
      issues.push(issue("dangerous-drift", "active-run-unknown-profile", `active run ${run.runId || run.run_id || "unknown"} references unknown profile ${profile}`));
    }
  }
  for (const session of worktreeSessions) {
    const profile = session.policyProfile || session.policy_profile;
    if (profile && !knownProfiles.has(profile)) {
      issues.push(issue("dangerous-drift", "worktree-session-unknown-profile", `worktree session ${session.sessionId || "unknown"} references unknown profile ${profile}`));
    }
  }

  return {
    ok: !issues.some((entry) => entry.category === "dangerous-drift" || entry.category === "missing-defaults"),
    generatedAt: new Date().toISOString(),
    issues,
    summary: summarizeIssues(issues),
    nextAction: issues.length ? "run /supervibe-loop --policy-doctor --fix-derived after reviewing dangerous drift" : "policy config is in sync",
  };
}

export async function fixDerivedPolicyDefaults({
  rootDir = process.cwd(),
  derivedDefaults = {},
} = {}) {
  const outPath = join(rootDir, ".supervibe", "policy-derived-defaults.json");
  const profilePath = join(rootDir, ".supervibe", "policy-profile.json");
  const existing = await readJsonIfExists(outPath) || await readJsonIfExists(profilePath) || {};
  const deniedTools = unique([...asArray(existing.deniedTools), ...asArray(derivedDefaults.deniedTools)]);
  const allowedTools = unique([...asArray(existing.allowedTools), ...asArray(derivedDefaults.allowedTools)]).filter((tool) => !deniedTools.includes(tool));
  const next = {
    schemaVersion: 1,
    profile: derivedDefaults.profile || existing.name || existing.profile || "guided",
    allowedTools,
    deniedTools,
    generatedAt: new Date().toISOString(),
    source: "derived-local-defaults",
  };
  await mkdir(dirname(outPath), { recursive: true });
  const backupPath = `${outPath}.bak`;
  if (await pathExists(outPath)) await copyFile(outPath, backupPath);
  else await writeFile(backupPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  await writeFile(outPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return {
    changed: true,
    outPath,
    backupPath,
    profile: next.profile,
    deniedTools,
    allowedTools,
  };
}

export function formatPolicyDriftReport(report = {}) {
  const summary = report.summary || summarizeIssues(report.issues || []);
  const lines = [
    "SUPERVIBE_POLICY_DRIFT",
    `OK: ${Boolean(report.ok)}`,
    `DANGEROUS: ${summary["dangerous-drift"] || 0}`,
    `STALE_DOCS: ${summary["stale-docs"] || 0}`,
    `MISSING_DEFAULTS: ${summary["missing-defaults"] || 0}`,
    `HARMLESS_OVERRIDES: ${summary["harmless-local-override"] || 0}`,
  ];
  for (const entry of report.issues || []) {
    lines.push(`- ${entry.category}:${entry.code} ${entry.message}`);
  }
  lines.push(`NEXT_ACTION: ${report.nextAction || "none"}`);
  return lines.join("\n");
}

async function readProjectDocs(rootDir) {
  return {
    readme: await readTextIfExists(join(rootDir, "README.md")),
    loop: await readTextIfExists(join(rootDir, "commands", "supervibe-loop.md")),
    status: await readTextIfExists(join(rootDir, "commands", "supervibe-status.md")),
  };
}

async function readTextIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function readJsonIfExists(path) {
  const text = await readTextIfExists(path);
  if (!text.trim()) return null;
  return JSON.parse(text);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function issue(category, code, message, extra = {}) {
  return { category, code, message, ...extra };
}

function summarizeIssues(issues = []) {
  return issues.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, {});
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "");
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}
