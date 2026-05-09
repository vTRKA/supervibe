// Track which Supervibe plugin version was last adapted by each project.
// SessionStart also records the last notified version separately so an upgrade
// banner does not accidentally mark project artifacts as adapted.
//
// Storage: .supervibe/memory/.supervibe-version (single line, plain version string).
// Plugin version source: <resolved-supervibe-plugin-root>/.claude-plugin/plugin.json.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ADAPTED_VERSION_FILE = ['.supervibe', 'memory', '.supervibe-version'];
const NOTIFIED_VERSION_FILE = ['.supervibe', 'memory', '.supervibe-notified-version'];
const ADAPT_PENDING_FILE = ['.supervibe', 'memory', '.supervibe-adapt-pending.json'];

export async function getCurrentPluginVersion(pluginRoot) {
  try {
    const manifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json');
    const raw = await readFile(manifestPath, 'utf8');
    return JSON.parse(raw).version || null;
  } catch {
    return null;
  }
}

export async function getLastSeenVersion(projectRoot) {
  const path = join(projectRoot, ...ADAPTED_VERSION_FILE);
  if (!existsSync(path)) return null;
  try { return (await readFile(path, 'utf8')).trim() || null; }
  catch { return null; }
}

export async function setLastSeenVersion(projectRoot, version) {
  const path = join(projectRoot, ...ADAPTED_VERSION_FILE);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(version));
  } catch {}
}

export async function getLastNotifiedVersion(projectRoot) {
  const path = join(projectRoot, ...NOTIFIED_VERSION_FILE);
  if (!existsSync(path)) return null;
  try { return (await readFile(path, 'utf8')).trim() || null; }
  catch { return null; }
}

export async function setLastNotifiedVersion(projectRoot, version) {
  const path = join(projectRoot, ...NOTIFIED_VERSION_FILE);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(version));
  } catch {}
}

export async function markAdaptPending(projectRoot, {
  fromVersion = null,
  toVersion = null,
  reason = 'plugin-version-bump',
} = {}) {
  if (!toVersion) return null;
  const path = join(projectRoot, ...ADAPT_PENDING_FILE);
  const state = {
    schemaVersion: 1,
    status: 'pending',
    reason,
    fromVersion,
    toVersion,
    createdAt: new Date().toISOString(),
    nextAction: '/supervibe-adapt',
  };
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
    return state;
  } catch {
    return null;
  }
}

export async function getAdaptPending(projectRoot) {
  const path = join(projectRoot, ...ADAPT_PENDING_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export async function clearAdaptPending(projectRoot, version = null) {
  const path = join(projectRoot, ...ADAPT_PENDING_FILE);
  if (!existsSync(path)) return false;
  const pending = await getAdaptPending(projectRoot);
  if (version && pending?.toVersion && pending.toVersion !== version) return false;
  try {
    await rm(path, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns { current, lastSeen, bumped } where `bumped` is true if the
 * plugin version differs from the last-seen value (first-time install also counts).
 */
export async function checkVersionBump(projectRoot, pluginRoot) {
  const current = await getCurrentPluginVersion(pluginRoot);
  if (!current) return { current: null, lastSeen: null, bumped: false };
  const lastSeen = await getLastSeenVersion(projectRoot);
  const lastNotified = await getLastNotifiedVersion(projectRoot);
  const bumped = lastSeen !== current;
  return {
    current,
    lastSeen,
    lastNotified,
    bumped,
    firstTime: !lastSeen,
    notificationPending: lastNotified !== current,
  };
}
