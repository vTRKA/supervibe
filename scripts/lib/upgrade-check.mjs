// Check if a newer plugin version is available upstream (git remote).
// Two-tier design to never block SessionStart:
//   1. read cached result (instant) — drives the banner shown on session start
//   2. if cache is stale (>RATE_LIMIT_MS old), spawn a detached background
//      process that runs git fetch and refreshes the cache for the NEXT session
//
// Cache file: $CLAUDE_PLUGIN_ROOT/.claude-plugin/.upgrade-check.json
//   { checkedAt, currentBranch, headSha, upstreamSha, behind, latestTag, error? }

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 8000;
const CACHE_FILE = ".upgrade-check.json";

function cachePath(pluginRoot) {
  return join(pluginRoot, ".claude-plugin", CACHE_FILE);
}

export async function readUpgradeCache(pluginRoot) {
  const path = cachePath(pluginRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export async function writeUpgradeCache(pluginRoot, data) {
  const path = cachePath(pluginRoot);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data, null, 2));
  } catch {}
}

export function isCacheStale(cache, now = Date.now()) {
  if (!cache || typeof cache.checkedAt !== "number") return true;
  return now - cache.checkedAt > RATE_LIMIT_MS;
}

function git(pluginRoot, args, timeoutMs = FETCH_TIMEOUT_MS) {
  const r = spawnSync("git", args, {
    cwd: pluginRoot,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
  });
  return {
    ok: r.status === 0,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

/**
 * Synchronously query upstream for newer commits. May take several seconds
 * (network). Caller should wrap in a detached process so it doesn't block.
 *
 * Returns the cache record (also persisted to disk).
 */
export async function performUpstreamCheck(pluginRoot) {
  const result = {
    checkedAt: Date.now(),
    currentBranch: null,
    headSha: null,
    upstreamSha: null,
    behind: 0,
    latestTag: null,
    error: null,
  };

  if (!existsSync(join(pluginRoot, ".git"))) {
    result.error = "not-a-git-checkout";
    await writeUpgradeCache(pluginRoot, result);
    return result;
  }

  const branch = git(pluginRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.ok) {
    result.error = "git-rev-parse-failed";
    await writeUpgradeCache(pluginRoot, result);
    return result;
  }
  result.currentBranch = branch.stdout || "HEAD";

  // Find tracking remote — falls back to 'origin'
  const upstreamConfig = git(pluginRoot, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);
  let trackingRef = upstreamConfig.ok
    ? upstreamConfig.stdout
    : `origin/${result.currentBranch}`;

  // Refresh remote refs
  const fetch = git(
    pluginRoot,
    ["fetch", "--tags", "--prune", "--quiet"],
    FETCH_TIMEOUT_MS,
  );
  if (!fetch.ok) {
    result.error = `git-fetch-failed: ${fetch.stderr.split("\n")[0].slice(0, 120)}`;
    await writeUpgradeCache(pluginRoot, result);
    return result;
  }

  const head = git(pluginRoot, ["rev-parse", "HEAD"]);
  const upstream = git(pluginRoot, ["rev-parse", trackingRef]);
  if (head.ok) result.headSha = head.stdout;
  if (upstream.ok) result.upstreamSha = upstream.stdout;

  if (head.ok && upstream.ok && head.stdout !== upstream.stdout) {
    const behindCount = git(pluginRoot, [
      "rev-list",
      "--count",
      `HEAD..${trackingRef}`,
    ]);
    if (behindCount.ok) result.behind = parseInt(behindCount.stdout, 10) || 0;
  }

  // Latest tag on tracked branch (purely informational)
  const tag = git(pluginRoot, [
    "describe",
    "--tags",
    "--abbrev=0",
    trackingRef,
  ]);
  if (tag.ok) result.latestTag = tag.stdout;

  await writeUpgradeCache(pluginRoot, result);
  return result;
}
