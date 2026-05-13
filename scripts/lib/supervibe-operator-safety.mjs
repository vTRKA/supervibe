import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, parse, relative, resolve } from "node:path";

export function inspectOperatorSafety({
  cleanupPath = null,
  safeCleanupRoots = [tmpdir()],
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    searchTool: detectFastSearchTool({ cwd, env }),
    cleanup: cleanupPath
      ? assertSafeRecursiveCleanupPath(cleanupPath, { safeRoots: safeCleanupRoots, cwd })
      : { pass: true, checked: false, reason: "cleanup path not provided" },
  };
}

export function detectFastSearchTool({ cwd = process.cwd(), env = process.env } = {}) {
  const ripgrep = runTool("rg", ["--version"], { cwd, env });
  if (ripgrep.ok) {
    return {
      pass: true,
      primary: "rg",
      available: true,
      version: firstLine(ripgrep.stdout),
      fallback: null,
      warning: null,
    };
  }

  const git = runTool("git", ["--version"], { cwd, env });
  if (git.ok) {
    return {
      pass: true,
      primary: "git grep",
      available: false,
      version: firstLine(git.stdout),
      fallback: "git grep -n <pattern> -- <paths>",
      warning: "ripgrep is unavailable; using git grep fallback to avoid blocking development",
    };
  }

  return {
    pass: true,
    primary: "node filesystem scan",
    available: false,
    version: null,
    fallback: "node-based recursive file scan",
    warning: "ripgrep and git are unavailable; use bounded Node filesystem scan instead of failing the workflow",
  };
}

export function assertSafeRecursiveCleanupPath(targetPath, {
  safeRoots = [tmpdir()],
  cwd = process.cwd(),
} = {}) {
  const rawTarget = String(targetPath || "").trim();
  if (!rawTarget) {
    return failedCleanup("cleanup path is required", rawTarget, { safeRoots, cwd });
  }

  const resolvedTarget = resolve(cwd, rawTarget);
  const resolvedSafeRoots = normalizeSafeRoots(safeRoots, cwd);
  const containingRoot = resolvedSafeRoots.find((root) => isPathInside(root, resolvedTarget));
  if (!containingRoot) {
    return failedCleanup("cleanup path is outside allowed temp/work roots", rawTarget, {
      resolvedTarget,
      safeRoots: resolvedSafeRoots,
      cwd,
    });
  }

  if (!isMeaningfulChildPath(containingRoot, resolvedTarget)) {
    return failedCleanup("cleanup path must be a child directory, not the safe root itself", rawTarget, {
      resolvedTarget,
      safeRoots: resolvedSafeRoots,
      cwd,
    });
  }

  const forbiddenExactRoots = [homedir(), cwd, parse(resolvedTarget).root]
    .map((entry) => resolve(entry))
    .filter(Boolean);
  const forbidden = forbiddenExactRoots.find((root) => samePath(root, resolvedTarget));
  if (forbidden) {
    return failedCleanup("cleanup path resolves to a protected root", rawTarget, {
      resolvedTarget,
      safeRoots: resolvedSafeRoots,
      forbidden,
      cwd,
    });
  }

  return {
    pass: true,
    checked: true,
    path: rawTarget,
    resolvedPath: resolvedTarget,
    safeRoot: containingRoot,
    exists: existsSync(resolvedTarget),
    issues: [],
  };
}

export function formatOperatorSafetyReport(report = {}) {
  const cleanup = report.cleanup || {};
  const lines = [
    "SUPERVIBE_OPERATOR_SAFETY",
    `SEARCH_PRIMARY: ${report.searchTool?.primary || "unknown"}`,
    `RIPGREP_READY: ${Boolean(report.searchTool?.available)}`,
  ];
  if (report.searchTool?.fallback) lines.push(`SEARCH_FALLBACK: ${report.searchTool.fallback}`);
  if (report.searchTool?.warning) lines.push(`SEARCH_WARNING: ${report.searchTool.warning}`);
  lines.push(`TEMP_CLEANUP_GUARD: ${cleanup.pass ? "pass" : "fail"}`);
  if (cleanup.checked) {
    lines.push(`CLEANUP_PATH: ${cleanup.resolvedPath}`);
    lines.push(`CLEANUP_SAFE_ROOT: ${cleanup.safeRoot || "none"}`);
  }
  for (const issue of cleanup.issues || []) lines.push(`CLEANUP_ISSUE: ${issue}`);
  return lines.join("\n");
}

function runTool(command, args, { cwd, env }) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
  };
}

function normalizeSafeRoots(safeRoots, cwd) {
  return [...new Set((safeRoots || [])
    .map((root) => String(root || "").trim())
    .filter(Boolean)
    .map((root) => resolve(cwd, root)))];
}

function isMeaningfulChildPath(parent, child) {
  const rel = relative(parent, child);
  return Boolean(rel) && rel !== "." && !rel.startsWith("..") && !isAbsolute(rel);
}

function isPathInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (Boolean(rel) && !rel.startsWith("..") && !isAbsolute(rel));
}

function samePath(left, right) {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function failedCleanup(issue, path, details = {}) {
  return {
    pass: false,
    checked: true,
    path,
    resolvedPath: details.resolvedTarget || null,
    safeRoot: null,
    safeRoots: details.safeRoots || [],
    forbidden: details.forbidden || null,
    exists: false,
    issues: [issue],
  };
}

function firstLine(value = "") {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}
