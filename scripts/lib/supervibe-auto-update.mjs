import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { isCacheStale } from "./upgrade-check.mjs";
import {
  SQLITE_NODE_MIN_VERSION,
  getNodeRuntimeCapability,
} from "./node-runtime-requirements.mjs";
import { withSupervibePluginRootEnv } from "./supervibe-plugin-root.mjs";

const AUTO_UPDATE_STATE_FILE = ".auto-update.json";
const AUTO_UPDATE_LOCK_FILE = ".auto-update.lock";
const AUTO_UPDATE_LOCK_STALE_MS = 2 * 60 * 60 * 1000;

const APPLY_VALUES = new Set(["1", "true", "yes", "y", "on", "apply", "auto"]);
const CHECK_VALUES = new Set(["", "managed", "check", "notify", "probe"]);
const OFF_VALUES = new Set(["0", "false", "no", "n", "off", "disable", "disabled"]);

function autoUpdateStatePath(pluginRoot) {
  return join(pluginRoot, ".claude-plugin", AUTO_UPDATE_STATE_FILE);
}

function autoUpdateLockPath(pluginRoot) {
  return join(pluginRoot, ".claude-plugin", AUTO_UPDATE_LOCK_FILE);
}

export async function readAutoUpdateState(pluginRoot) {
  try {
    return JSON.parse(await readFile(autoUpdateStatePath(pluginRoot), "utf8"));
  } catch {
    return null;
  }
}

export async function writeAutoUpdateState(pluginRoot, state) {
  const path = autoUpdateStatePath(pluginRoot);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function resolveAutoUpdateMode(env = process.env) {
  const raw = String(env.SUPERVIBE_AUTO_UPDATE ?? "managed").trim().toLowerCase();
  if (APPLY_VALUES.has(raw)) return "apply";
  if (OFF_VALUES.has(raw)) return "off";
  if (CHECK_VALUES.has(raw)) return raw === "" ? "managed" : raw;
  return "managed";
}

export function isManagedInstallPath(pluginRoot, homeDir = homedir()) {
  if (!pluginRoot) return false;
  const root = normalize(resolve(pluginRoot)).toLowerCase();
  const home = normalize(resolve(homeDir)).toLowerCase();
  const managedRoot = normalize(
    join(home, ".claude", "plugins", "marketplaces", "supervibe-marketplace"),
  ).toLowerCase();
  return root === managedRoot || root.startsWith(`${managedRoot}${sep}`);
}

export function createAutoUpdatePlan({
  pluginRoot,
  cache,
  env = process.env,
  homeDir = homedir(),
  now = Date.now(),
  runtimeCapability = getNodeRuntimeCapability(),
  installHealth = null,
} = {}) {
  const mode = resolveAutoUpdateMode(env);
  const root = pluginRoot ? resolve(pluginRoot) : null;
  const gitCheckout = root ? existsSync(join(root, ".git")) : false;
  const managedInstall = root ? isManagedInstallPath(root, homeDir) : false;
  const cacheStale = isCacheStale(cache, now);
  const behind = Math.max(0, Number(cache?.behind || 0));
  const ci = isCi(env);
  const runtimeOk = Boolean(runtimeCapability?.installSupported);

  const canCheck = mode !== "off" && Boolean(root) && gitCheckout;
  const wantsApply = mode === "apply" || (mode === "managed" && managedInstall);
  const applyBlocked = [];

  if (!root) applyBlocked.push("plugin-root-missing");
  if (!gitCheckout) applyBlocked.push("not-a-git-checkout");
  if (!runtimeOk) applyBlocked.push(`node-${SQLITE_NODE_MIN_VERSION}-required`);
  if (installHealth && installHealth.pass === false) applyBlocked.push("install-health-failed");
  if (ci && mode !== "apply") applyBlocked.push("ci");
  if (behind <= 0) applyBlocked.push("up-to-date");
  if (!wantsApply) applyBlocked.push(mode === "off" ? "disabled" : "manual-host");

  const apply = wantsApply
    && mode !== "off"
    && Boolean(root)
    && gitCheckout
    && runtimeOk
    && installHealth?.pass !== false
    && behind > 0
    && (!ci || mode === "apply");

  return {
    mode,
    pluginRoot: root,
    managedInstall,
    gitCheckout,
    runtimeOk,
    runtimeVersion: runtimeCapability?.version || process.versions.node,
    installHealthPass: installHealth ? Boolean(installHealth.pass) : null,
    cacheStale,
    behind,
    check: canCheck && cacheStale,
    apply,
    applyBlocked,
  };
}

export async function acquireAutoUpdateLock(pluginRoot, {
  now = Date.now(),
  staleMs = AUTO_UPDATE_LOCK_STALE_MS,
} = {}) {
  const path = autoUpdateLockPath(pluginRoot);
  await mkdir(dirname(path), { recursive: true });

  async function tryOpen() {
    const handle = await open(path, "wx");
    await handle.writeFile(`${JSON.stringify({
      pid: process.pid,
      startedAt: new Date(now).toISOString(),
    }, null, 2)}\n`, "utf8");
    await handle.close();
    return {
      acquired: true,
      path,
      release: async () => {
        await unlink(path).catch(() => {});
      },
    };
  }

  try {
    return await tryOpen();
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }

  const existing = await stat(path).catch(() => null);
  if (existing && now - existing.mtimeMs > staleMs) {
    await unlink(path).catch(() => {});
    try {
      return await tryOpen();
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
    }
  }

  return { acquired: false, path, release: async () => {} };
}

export function spawnDetachedAutoUpdate(pluginRoot, {
  env = process.env,
  args = ["--background"],
} = {}) {
  const scriptPath = join(pluginRoot, "scripts", "supervibe-auto-update.mjs");
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: pluginRoot,
    detached: true,
    env: withSupervibePluginRootEnv(pluginRoot, env),
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return child.pid;
}

export function describeHostAutoUpdateStrategies() {
  return {
    claude: "Host marketplace autoUpdate plus SessionStart background check/apply for managed git installs.",
    opencode: "Git source install refreshes on OpenCode restart when configured as supervibe@git+https://github.com/vTRKA/supervibe.git#main.",
    codex: "No portable startup hook; symlink installs follow the managed checkout, copy fallback needs installer/update refresh.",
    gemini: "No portable startup hook; managed GEMINI.md include follows the checkout after update.",
    cursor: "IDE/marketplace/manual install; rely on host marketplace updates when available and Supervibe doctor for drift.",
    copilot: "Docs-driven surface; no packaged auto-update hook.",
  };
}

function isCi(env = process.env) {
  return Boolean(env.CI || env.GITHUB_ACTIONS || env.BUILDKITE || env.GITLAB_CI);
}
