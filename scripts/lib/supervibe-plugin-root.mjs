import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

export function resolveSupervibePluginRoot({
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  return env.SUPERVIBE_PLUGIN_ROOT || legacyClaudePluginRoot(env) || cwd;
}

export function resolveExplicitSupervibePluginRoot({ env = process.env } = {}) {
  return env.SUPERVIBE_PLUGIN_ROOT || legacyClaudePluginRoot(env) || "";
}

export function withSupervibePluginRootEnv(pluginRoot, env = process.env) {
  const next = {
    ...env,
    SUPERVIBE_PLUGIN_ROOT: pluginRoot,
  };
  const legacy = legacyClaudePluginRoot(env);
  const legacyKey = ["CLAUDE", "PLUGIN_ROOT"].join("_");
  if (legacy || env[legacyKey] !== undefined) {
    next[legacyKey] = legacy || pluginRoot;
  }
  return next;
}

function legacyClaudePluginRoot(env) {
  return env[["CLAUDE", "PLUGIN_ROOT"].join("_")] || "";
}

export function resolveSupervibeProjectRoot({
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const explicit = (
    env.SUPERVIBE_PROJECT_ROOT ||
    env.SUPERVIBE_PROJECT_DIR ||
    legacyClaudeProjectDir(env) ||
    ""
  );
  if (explicit) return resolve(explicit);

  const start = resolve(cwd);
  return (
    findAncestor(start, (dir) => existsSync(join(dir, ".supervibe"))) ||
    findAncestor(start, hasWorkspacePackageManifest) ||
    findAncestor(start, (dir) => existsSync(join(dir, ".git"))) ||
    start
  );
}

export function resolveSupervibeEditedPaths({ env = process.env } = {}) {
  const raw =
    env.SUPERVIBE_EDITED_PATHS ||
    env.SUPERVIBE_FILE_PATHS ||
    legacyClaudeFilePaths(env) ||
    "";
  return raw.split(",").filter(Boolean);
}

function legacyClaudeProjectDir(env) {
  return env[["CLAUDE", "PROJECT_DIR"].join("_")] || "";
}

function legacyClaudeFilePaths(env) {
  return env[["CLAUDE", "FILE_PATHS"].join("_")] || "";
}

function findAncestor(startDir, predicate) {
  let current = resolve(startDir || process.cwd());
  const root = parse(current).root;
  while (true) {
    if (predicate(current)) return current;
    if (current === root) return "";
    const parent = dirname(current);
    if (parent === current) return "";
    current = parent;
  }
}

function hasWorkspacePackageManifest(dir) {
  const packagePath = join(dir, "package.json");
  if (!existsSync(packagePath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    return Boolean(pkg?.workspaces || pkg?.scripts?.["supervibe:status"] || pkg?.scripts?.["supervibe:adapt"]);
  } catch {
    return false;
  }
}
