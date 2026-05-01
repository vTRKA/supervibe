#!/usr/bin/env node
// Session-start hook: emits system-reminders if artifacts are stale OR override-rate is high.
// Output to stdout becomes a system-reminder visible to the main agent.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { migratePrototypeConfigs } from "./migrate-prototype-configs.mjs";
import { getHostAdapterMatrix } from "./lib/supervibe-host-adapters.mjs";

const PROJECT_ROOT = process.cwd();
const STALE_DAYS = 30;
const OVERRIDE_RATE_THRESHOLD = 0.05;

async function checkStaleArtifacts() {
  const dirs = getHostAdapterMatrix().flatMap((adapter) => [
    join(PROJECT_ROOT, adapter.agentsFolder),
    join(PROJECT_ROOT, adapter.rulesFolder),
    join(PROJECT_ROOT, adapter.skillsFolder),
  ]);
  const stale = [];
  const cutoff = new Date(Date.now() - STALE_DAYS * 86400000);

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = await readdir(dir, { recursive: true, withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const filePath = join(entry.parentPath || dir, entry.name);
      const content = await readFile(filePath, "utf8");
      const match = content.match(/last-verified:\s*(\S+)/);
      if (!match) continue;
      const verifiedDate = new Date(match[1]);
      if (verifiedDate < cutoff)
        stale.push({ file: filePath, lastVerified: match[1] });
    }
  }
  return stale;
}

async function checkOverrideRate() {
  const logPath = join(PROJECT_ROOT, ".supervibe", "confidence-log.jsonl");
  if (!existsSync(logPath)) return { rate: 0, count: 0 };
  const content = await readFile(logPath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  if (lines.length === 0) return { rate: 0, count: 0 };
  const recent = lines.slice(-100);
  const overrides = recent.filter((l) => {
    try {
      return JSON.parse(l).override === true;
    } catch {
      return false;
    }
  });
  return { rate: overrides.length / recent.length, count: recent.length };
}

// === Phase D: code RAG + graph index health ===
async function ensureCodeIndexFresh(projectRoot) {
  const { CodeStore } = await import("./lib/code-store.mjs");

  const dbPath = join(projectRoot, ".supervibe", "memory", "code.db");
  const indexExists = existsSync(dbPath);

  let action = "skip";
  if (!indexExists) {
    action = "full";
  }
  // For incremental refresh we rely on the file watcher (memory:watch).
  // SessionStart hook should be fast — full reindex only if missing.

  if (action === "skip") {
    // DB exists — open, run mtime-scan to catch external edits since last session,
    // then report stats. mtime-scan is cheap (stat per existing row, no read unless changed).
    try {
      const store = new CodeStore(projectRoot, { useEmbeddings: false });
      await store.init();
      let scanCounts = null;
      try {
        const { scanCodeChanges } = await import("./lib/mtime-scan.mjs");
        scanCounts = await scanCodeChanges(store, projectRoot);
      } catch {}
      const stats = store.stats();
      store.close();
      return { action: "skip", stats, scanCounts };
    } catch (err) {
      return { action: "skip", error: `${err.message}. Repair with node scripts/build-code-index.mjs --root . --migrate --health` };
    }
  }

  const store = new CodeStore(projectRoot, { useEmbeddings: true });
  await store.init();
  const counts = await store.indexAll(projectRoot);
  const stats = store.stats();
  store.close();
  return { action, counts, stats };
}

async function reportCodeIndexHealth() {
  try {
    const result = await ensureCodeIndexFresh(PROJECT_ROOT);
    if (result.error) {
      console.log(`[supervibe] code RAG: WARN ${result.error}`);
      return;
    }
    const { stats } = result;
    if (!stats) return;
    const resolutionPct = (stats.edgeResolutionRate * 100).toFixed(0);
    if (result.action === "skip") {
      console.log(
        `[supervibe] code RAG ✓ ${stats.totalFiles} files / ${stats.totalChunks} chunks (fresh)`,
      );
      console.log(
        `[supervibe] code graph ✓ ${stats.totalSymbols} symbols / ${stats.totalEdges} edges (${resolutionPct}% resolved)`,
      );
      const sc = result.scanCounts;
      if (sc && (sc.reindexed > 0 || sc.removed > 0 || sc.discovered > 0 || sc.pruned > 0)) {
        console.log(
          `[supervibe] mtime-scan: ${sc.reindexed} file(s) reindexed, ${sc.discovered || 0} discovered, ${sc.removed} removed, ${sc.pruned || 0} pruned`,
        );
      }
    } else {
      console.log(
        `[supervibe] code RAG ✓ ${stats.totalFiles} files / ${stats.totalChunks} chunks (rebuilt)`,
      );
      console.log(
        `[supervibe] code graph ✓ ${stats.totalSymbols} symbols / ${stats.totalEdges} edges (${resolutionPct}% resolved)`,
      );
      console.log(
        "[supervibe] full index built — subsequent sessions will be near-instant",
      );
    }
  } catch (err) {
    console.log(`[supervibe] code index: WARN ${err.message}`);
  }
}

async function reportVersionBump() {
  try {
    const pluginRoot = process.env.SUPERVIBE_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) return;
    const { checkVersionBump, setLastSeenVersion } =
      await import("./lib/version-tracker.mjs");
    const r = await checkVersionBump(PROJECT_ROOT, pluginRoot);
    if (!r.bumped) return;
    if (r.firstTime) {
      console.log(
        `[supervibe] welcome — plugin v${r.current} initialized for this project`,
      );
    } else {
      console.log(
        `[supervibe] ⬆ plugin upgraded ${r.lastSeen} → ${r.current}. See CHANGELOG.md for what's new.`,
      );
    }
    await setLastSeenVersion(PROJECT_ROOT, r.current);
  } catch {
    // Non-fatal
  }
}

async function reportUpstreamUpdates() {
  try {
    const pluginRoot = process.env.SUPERVIBE_PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) return;
    const { readUpgradeCache } = await import("./lib/upgrade-check.mjs");
    const {
      createAutoUpdatePlan,
      readAutoUpdateState,
      spawnDetachedAutoUpdate,
    } = await import("./lib/supervibe-auto-update.mjs");

    // Show cached result if available — never performs git fetch during session.
    const cache = await readUpgradeCache(pluginRoot);
    const plan = createAutoUpdatePlan({
      pluginRoot,
      cache,
      env: process.env,
    });
    const priorState = await readAutoUpdateState(pluginRoot);

    if (plan.check || plan.apply) {
      spawnDetachedAutoUpdate(pluginRoot);
    }

    if (priorState?.status === "updated") {
      console.log(
        "[supervibe] plugin auto-update completed in the background. Restart your AI CLI to load the new code.",
      );
    } else if (priorState?.status === "failed") {
      console.log(
        "[supervibe] plugin auto-update failed in the background. Run `npm run supervibe:auto-update -- --status` from the plugin checkout for details.",
      );
    }
    if (cache && !cache.error && cache.behind > 0 && plan.apply) {
      const tag = cache.latestTag ? ` (latest tag: ${cache.latestTag})` : "";
      console.log(
        `[supervibe] upstream has ${cache.behind} new commit(s)${tag}; auto-update queued in background. Restart after it completes.`,
      );
    }
    if (cache && !cache.error && cache.behind > 0 && !plan.apply) {
      const tag = cache.latestTag ? ` (latest tag: ${cache.latestTag})` : "";
      console.log(
        `[supervibe] ⬆ upstream has ${cache.behind} new commit(s)${tag} — run \`npm run supervibe:upgrade\``,
      );
    }
  } catch {
    // Non-fatal
  }
}

async function autoMigratePrototypeConfigs() {
  const protoRoot = join(PROJECT_ROOT, "prototypes");
  if (!existsSync(protoRoot)) return null;
  try {
    const result = await migratePrototypeConfigs({ projectRoot: PROJECT_ROOT });
    if (result.created.length > 0) {
      return `Discovered: ${result.created.length} prototype(s) without config.json — backfilled with default web target [375, 1440]. Review prototypes/${result.created.join(", prototypes/")}/config.json to confirm target + viewports match design intent.`;
    }
  } catch {
    // never block session start on migration failure
  }
  return null;
}

async function main() {
  const stale = await checkStaleArtifacts();
  const overrideStats = await checkOverrideRate();
  const migrationReminder = await autoMigratePrototypeConfigs();

  const reminders = [];
  if (stale.length > 0) {
    reminders.push(
      `Discovered: ${stale.length} artifact(s) with last-verified > ${STALE_DAYS} days. Recommend running /supervibe-audit + /supervibe-strengthen.`,
    );
  }
  if (
    overrideStats.rate > OVERRIDE_RATE_THRESHOLD &&
    overrideStats.count > 10
  ) {
    reminders.push(
      `Discovered: override rate ${(overrideStats.rate * 100).toFixed(1)}% over last ${overrideStats.count} entries (threshold ${OVERRIDE_RATE_THRESHOLD * 100}%). Recommend /supervibe-audit to investigate.`,
    );
  }
  if (migrationReminder) {
    reminders.push(migrationReminder);
  }

  if (reminders.length > 0) {
    console.log(reminders.join("\n"));
  }

  // Plugin version-bump notice (run before index health so user sees the upgrade FIRST)
  await reportVersionBump();
  await reportUpstreamUpdates();

  async function reportInstallerHealth() {
    try {
      if (!existsSync(join(PROJECT_ROOT, ".claude-plugin", "plugin.json"))) return;
      const { runInstallerHealthGate } = await import("./lib/supervibe-installer-health.mjs");
      const health = runInstallerHealthGate({ rootDir: PROJECT_ROOT });
      if (!health.pass) {
        console.log(`[supervibe] install health blocked: ${health.issues.length} issue(s). Run node scripts/supervibe-auto-update.mjs --dry-run --health`);
      }
    } catch {
      // Non-fatal session-start diagnostic.
    }
  }
  await reportInstallerHealth();

  // Phase D: code index health (last so user sees stale-artifact warnings first)
  await reportCodeIndexHealth();

  async function reportWatcherDiagnostics() {
    try {
      const { readWatcherDiagnostics } = await import("./lib/supervibe-index-watcher.mjs");
      const diagnostics = readWatcherDiagnostics({ rootDir: PROJECT_ROOT });
      if (diagnostics.heartbeat.status === "stale") {
        console.log(`[supervibe] watcher heartbeat stale; repair: ${diagnostics.repairActions[0]}`);
      }
    } catch {
      // Non-fatal watcher diagnostic.
    }
  }
  await reportWatcherDiagnostics();

  // Memory mtime-scan: catch external edits to .supervibe/memory/ between sessions.
  async function reportMemoryScan() {
    try {
      const memDbPath = join(PROJECT_ROOT, ".supervibe", "memory", "memory.db");
      if (!existsSync(memDbPath)) return;
      const { MemoryStore } = await import("./lib/memory-store.mjs");
      const { scanMemoryChanges } = await import("./lib/mtime-scan.mjs");
      const store = new MemoryStore(PROJECT_ROOT, { useEmbeddings: false });
      await store.init();
      const counts = await scanMemoryChanges(store, PROJECT_ROOT);
      store.close();
      if (counts.reindexed > 0 || counts.removed > 0) {
        console.log(
          `[supervibe] memory mtime-scan: ${counts.reindexed} entr(ies) reindexed, ${counts.removed} removed`,
        );
      }
    } catch {
      // Non-fatal
    }
  }
  await reportMemoryScan();

  // Phase E: prune stale preview-server registry entries
  async function pruneStalePreviewServers() {
    try {
      const { listServers } = await import("./lib/preview-server-manager.mjs");
      await listServers();
    } catch {
      // Non-fatal
    }
  }
  await pruneStalePreviewServers();

  // Phase F: discover MCPs and populate registry
  async function refreshMcpRegistry() {
    try {
      const { discoverMcps } = await import("./lib/mcp-registry.mjs");
      const found = await discoverMcps({});
      if (found.length > 0) {
        console.log(
          `[supervibe] MCPs available ✓ ${found.length} (${found.map((m) => m.name).join(", ")})`,
        );
      }
    } catch {
      // Non-fatal — agents fall back to WebFetch/Grep
    }
  }
  await refreshMcpRegistry();

  // Phase G: surface underperforming agents
  async function reportUnderperformers() {
    try {
      const { readInvocations } =
        await import("./lib/agent-invocation-logger.mjs");
      const { detectUnderperformers } =
        await import("./lib/underperformer-detector.mjs");
      const all = await readInvocations({ limit: 10000 });
      if (all.length < 10) return;
      const flagged = detectUnderperformers(all);
      if (flagged.length === 0) return;
      console.log(
        `[supervibe] ⚠ ${flagged.length} agent(s) underperforming — recommend /supervibe-strengthen:`,
      );
      for (const f of flagged) {
        console.log(`  - ${f.agent_id}: ${f.reason} (${f.value})`);
      }
    } catch {}
  }
  await reportUnderperformers();
}

main().catch((err) => {
  console.error("session-start-check error:", err.message);
  process.exit(0);
});
