// Track which Evolve plugin version was last seen by each project.
// On SessionStart, compare current plugin.json version to stored value;
// when bumped, surface a one-line banner with link to CHANGELOG section.
//
// Storage: .claude/memory/.supervibe-version (single line, plain version string).
// Plugin version source: $CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

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
  const path = join(projectRoot, '.claude', 'memory', '.supervibe-version');
  if (!existsSync(path)) return null;
  try { return (await readFile(path, 'utf8')).trim() || null; }
  catch { return null; }
}

export async function setLastSeenVersion(projectRoot, version) {
  const path = join(projectRoot, '.claude', 'memory', '.supervibe-version');
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(version));
  } catch {}
}

/**
 * Returns { current, lastSeen, bumped } where `bumped` is true if the
 * plugin version differs from the last-seen value (first-time install also counts).
 */
export async function checkVersionBump(projectRoot, pluginRoot) {
  const current = await getCurrentPluginVersion(pluginRoot);
  if (!current) return { current: null, lastSeen: null, bumped: false };
  const lastSeen = await getLastSeenVersion(projectRoot);
  const bumped = lastSeen !== current;
  return { current, lastSeen, bumped, firstTime: !lastSeen };
}
