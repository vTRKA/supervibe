#!/usr/bin/env node
// Session-start hook: emits system-reminders if artifacts are stale OR override-rate is high.
// Output to stdout becomes a system-reminder visible to the main agent.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { migratePrototypeConfigs } from "./migrate-prototype-configs.mjs";

const PROJECT_ROOT = process.cwd();
const STALE_DAYS = 30;
const OVERRIDE_RATE_THRESHOLD = 0.05;

async function checkStaleArtifacts() {
  const dirs = ["agents", "rules", "skills"].map((d) =>
    join(PROJECT_ROOT, ".claude", d),
  );
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
  const logPath = join(PROJECT_ROOT, ".claude", "confidence-log.jsonl");
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
  const { statSync } = await import("node:fs");

  const dbPath = join(projectRoot, ".claude", "memory", "code.db");
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
      return { action: "skip", error: err.message };
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
      if (sc && (sc.reindexed > 0 || sc.removed > 0)) {
        console.log(
          `[supervibe] mtime-scan: ${sc.reindexed} file(s) reindexed, ${sc.removed} removed (external edits caught)`,
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
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
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
        `[supervibe] ⬆ plugin upgraded ${r.lastSeen} → ${r.current}. See CHANGELOG.md or run /supervibe-changelog for what's new.`,
      );
    }
    await setLastSeenVersion(PROJECT_ROOT, r.current);
  } catch {
    // Non-fatal
  }
}

async function reportUpstreamUpdates() {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) return;
    const { readUpgradeCache } = await import("./lib/upgrade-check.mjs");

    // Show cached result if available — never performs git fetch during session.
    const cache = await readUpgradeCache(pluginRoot);
    if (cache && !cache.error && cache.behind > 0) {
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

  // Phase D: code index health (last so user sees stale-artifact warnings first)
  await reportCodeIndexHealth();

  // Memory mtime-scan: catch external edits to .claude/memory/ between sessions.
  async function reportMemoryScan() {
    try {
      const memDbPath = join(PROJECT_ROOT, ".claude", "memory", "memory.db");
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
