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
  return (
    env.SUPERVIBE_PROJECT_ROOT ||
    env.SUPERVIBE_PROJECT_DIR ||
    legacyClaudeProjectDir(env) ||
    cwd
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
