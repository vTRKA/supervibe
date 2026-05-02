import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { CodeStore } from "./code-store.mjs";
import { hasNodeSqliteSupport, SQLITE_NODE_MIN_VERSION } from "./node-sqlite-runtime.mjs";
import { selectHostAdapter } from "./supervibe-host-detector.mjs";
import { collectIndexHealthFromStore, evaluateIndexHealthGate } from "./supervibe-index-health.mjs";
import { curateProjectMemory } from "./supervibe-memory-curator.mjs";
import { SOURCE_RAG_INDEX_COMMAND } from "./supervibe-command-catalog.mjs";
import { getCurrentPluginVersion, getLastSeenVersion, setLastSeenVersion } from "./version-tracker.mjs";

const BASELINE_PATH = [".supervibe", "memory", "adapt", "baseline.json"];
const DEFAULT_INDEX_REPAIR_COMMAND = SOURCE_RAG_INDEX_COMMAND;

export async function createAdaptPlan({
  projectRoot = process.cwd(),
  pluginRoot = process.cwd(),
  env = process.env,
  adapterId = null,
} = {}) {
  const hostSelection = selectHostAdapter({
    rootDir: projectRoot,
    env: adapterId ? { ...env, SUPERVIBE_HOST: adapterId } : env,
  });
  const adapter = hostSelection.adapter;
  const baseline = readBaseline(projectRoot);
  const currentVersion = await getCurrentPluginVersion(pluginRoot);
  const lastSeenVersion = await getLastSeenVersion(projectRoot);
  const memoryIndex = await ensureMemoryIndex(projectRoot);
  const upstream = buildUpstreamIndex(pluginRoot);
  const projectArtifacts = listProjectArtifacts(projectRoot, adapter);
  const items = projectArtifacts.map((artifact) => classifyArtifact({
    artifact,
    upstream: upstream[artifact.type].get(artifact.id) || null,
    baselineHash: baseline.artifacts?.[artifact.projectRel]?.hash || null,
  }));
  const counts = countPlanItems(items);

  return {
    kind: "adapt-plan",
    projectRoot,
    pluginRoot,
    host: {
      adapterId: adapter.id,
      displayName: adapter.displayName,
      confidence: hostSelection.confidence,
    },
    currentVersion,
    lastSeenVersion,
    baselineVersion: baseline.pluginVersion || null,
    memoryIndex,
    approvalRequired: items.some((item) => item.action === "update"),
    counts,
    items,
  };
}

export async function applyAdaptPlan(plan, {
  include = [],
  applyAll = false,
} = {}) {
  const approved = new Set(include.map(normalizeRel));
  const applied = [];
  const skipped = [];
  const blocked = [];

  for (const item of plan.items) {
    if (item.action !== "update") continue;
    const approvedFile = applyAll || approved.has(item.projectRel);
    if (!approvedFile) {
      skipped.push(item);
      continue;
    }
    if (!item.upstreamAbs) {
      blocked.push({ ...item, reason: "missing upstream file" });
      continue;
    }
    const content = await readFile(item.upstreamAbs, "utf8");
    await mkdir(dirname(item.projectAbs), { recursive: true });
    await writeFile(item.projectAbs, content);
    applied.push(item);
  }

  if (applied.length > 0 && plan.currentVersion) {
    await writeBaseline(plan, applied);
    await setLastSeenVersion(plan.projectRoot, plan.currentVersion);
  }

  const postApplyPlan = await createAdaptPlan({
    projectRoot: plan.projectRoot,
    pluginRoot: plan.pluginRoot,
    adapterId: plan.host.adapterId,
  });
  const indexGate = await inspectIndexGate(plan.projectRoot);

  return {
    kind: "adapt-apply",
    projectRoot: plan.projectRoot,
    pluginRoot: plan.pluginRoot,
    host: plan.host,
    currentVersion: plan.currentVersion,
    lastSeenVersion: plan.lastSeenVersion,
    applied,
    skipped,
    blocked,
    postApply: {
      updates: postApplyPlan.counts.update,
      identical: postApplyPlan.counts.identical,
      projectOnly: postApplyPlan.counts.projectOnly,
      clean: postApplyPlan.counts.update === 0,
    },
    memoryIndex: postApplyPlan.memoryIndex,
    indexGate,
  };
}

export function formatAdaptPlan(plan, { diffSummary = false } = {}) {
  const lines = [
    "SUPERVIBE_ADAPT_DRY_RUN",
    `HOST: ${plan.host.adapterId}`,
    `VERSION: ${plan.lastSeenVersion || "none"} -> ${plan.currentVersion || "unknown"}`,
    `ARTIFACTS: ${plan.items.length}`,
    `UPDATES: ${plan.counts.update}`,
    `IDENTICAL: ${plan.counts.identical}`,
    `PROJECT_ONLY: ${plan.counts.projectOnly}`,
    `MEMORY_INDEX: ${plan.memoryIndex?.status || "unknown"}`,
    `APPROVAL_REQUIRED: ${plan.approvalRequired}`,
  ];
  if (diffSummary) lines.push("", formatAdaptDiffSummary(plan));
  for (const item of plan.items) {
    if (item.action === "update") {
      lines.push(`UPDATE: ${item.projectRel} <= ${item.upstreamRel} (${item.classification})`);
    } else if (item.action === "project-only") {
      lines.push(`PROJECT_ONLY: ${item.projectRel} (no upstream match; keep unless explicitly archived)`);
    }
  }
  if (plan.approvalRequired) {
    const candidates = plan.items.filter((item) => item.action === "update").map((item) => item.projectRel).join(",");
    lines.push(`NEXT_APPLY: node <resolved-supervibe-plugin-root>/scripts/supervibe-adapt.mjs --apply --include "${candidates}"`);
  }
  return lines.join("\n");
}

export function formatAdaptApply(result, { diffSummary = false } = {}) {
  const lines = [
    "SUPERVIBE_ADAPT_APPLY",
    `HOST: ${result.host.adapterId}`,
    `VERSION: ${result.lastSeenVersion || "none"} -> ${result.currentVersion || "unknown"}`,
    `APPLIED: ${result.applied.length}`,
    `SKIPPED: ${result.skipped.length}`,
    `BLOCKED: ${result.blocked.length}`,
  ];
  if (diffSummary) lines.push("", formatAdaptDiffSummary({ items: result.applied }));
  for (const item of result.applied) lines.push(`APPLIED_FILE: ${item.projectRel}`);
  for (const item of result.skipped) lines.push(`SKIPPED_FILE: ${item.projectRel}`);
  for (const item of result.blocked) lines.push(`BLOCKED_FILE: ${item.projectRel} - ${item.reason}`);
  if (result.applied.length > 0) {
    lines.push("VERSION_MARKER: updated");
  }
  lines.push(`MEMORY_INDEX: ${result.memoryIndex?.status || "unknown"}`);
  lines.push(`ADAPT_CLEAN: ${result.postApply?.clean ? "true" : "false"}`);
  lines.push(`POST_APPLY_UPDATES: ${result.postApply?.updates ?? "unknown"}`);
  lines.push(`INDEX_REPAIR_NEEDED: ${result.indexGate?.ready === false ? "true" : "false"}`);
  if (result.indexGate?.ready === false) {
    lines.push(`INDEX_REASON: ${result.indexGate.reason || result.indexGate.failed || "unknown"}`);
    lines.push(`NEXT_INDEX_REPAIR: ${result.indexGate.repairCommand || DEFAULT_INDEX_REPAIR_COMMAND}`);
  }
  return lines.join("\n");
}

function formatAdaptDiffSummary(plan) {
  const updates = (plan.items || []).filter((item) => item.action === "update" || item.diff);
  const lines = [
    "SUPERVIBE_ADAPT_DIFF_SUMMARY",
    `FILES: ${updates.length}`,
  ];
  for (const item of updates) {
    const diff = item.diff || {};
    lines.push(`DIFF: ${item.projectRel} +${diff.additions || 0} -${diff.deletions || 0} (${item.classification})`);
  }
  return lines.join("\n");
}

function classifyArtifact({ artifact, upstream, baselineHash }) {
  if (!upstream) {
    return {
      ...artifact,
      action: "project-only",
      classification: "project-only",
      upstreamAbs: null,
      upstreamRel: null,
    };
  }
  const projectContent = readFileSync(artifact.projectAbs, "utf8");
  const upstreamContent = readFileSync(upstream.upstreamAbs, "utf8");
  const projectHash = hashContent(projectContent);
  const upstreamHash = hashContent(upstreamContent);
  const identical = projectHash === upstreamHash;
  const classification = classifyHashes({ projectHash, upstreamHash, baselineHash });
  const diff = identical ? { additions: 0, deletions: 0 } : summarizeLineDiff(projectContent, upstreamContent);

  return {
    ...artifact,
    action: identical || classification === "project-local-edit" ? "identical" : "update",
    classification,
    upstreamAbs: upstream.upstreamAbs,
    upstreamRel: upstream.upstreamRel,
    projectHash,
    upstreamHash,
    baselineHash,
    diff,
  };
}

function classifyHashes({ projectHash, upstreamHash, baselineHash }) {
  if (projectHash === upstreamHash) return "identical";
  if (!baselineHash) return "review-update";
  if (projectHash === baselineHash && upstreamHash !== baselineHash) return "upstream-only-change";
  if (projectHash !== baselineHash && upstreamHash !== baselineHash) return "both-changed";
  if (projectHash !== baselineHash && upstreamHash === baselineHash) return "project-local-edit";
  return "review-update";
}

function buildUpstreamIndex(pluginRoot) {
  return {
    agent: new Map(listFiles(join(pluginRoot, "agents"), { recursive: true, suffix: ".md" })
      .map((path) => [basename(path, ".md"), {
        id: basename(path, ".md"),
        upstreamAbs: path,
        upstreamRel: normalizeRel(relative(pluginRoot, path)),
      }])),
    rule: new Map(listFiles(join(pluginRoot, "rules"), { recursive: false, suffix: ".md" })
      .map((path) => [basename(path, ".md"), {
        id: basename(path, ".md"),
        upstreamAbs: path,
        upstreamRel: normalizeRel(relative(pluginRoot, path)),
      }])),
    skill: new Map(listFiles(join(pluginRoot, "skills"), { recursive: true, fileName: "SKILL.md" })
      .map((path) => {
        const id = basename(dirname(path));
        return [id, {
          id,
          upstreamAbs: path,
          upstreamRel: normalizeRel(relative(pluginRoot, path)),
        }];
      })),
  };
}

function listProjectArtifacts(projectRoot, adapter) {
  return [
    ...listFiles(join(projectRoot, adapter.agentsFolder), { recursive: true, suffix: ".md" })
      .map((path) => projectArtifact(projectRoot, path, "agent", basename(path, ".md"))),
    ...listFiles(join(projectRoot, adapter.rulesFolder), { recursive: false, suffix: ".md" })
      .map((path) => projectArtifact(projectRoot, path, "rule", basename(path, ".md"))),
    ...listFiles(join(projectRoot, adapter.skillsFolder), { recursive: true, fileName: "SKILL.md" })
      .map((path) => projectArtifact(projectRoot, path, "skill", basename(dirname(path)))),
  ].sort((a, b) => a.projectRel.localeCompare(b.projectRel));
}

function projectArtifact(projectRoot, path, type, id) {
  return {
    type,
    id,
    projectAbs: path,
    projectRel: normalizeRel(relative(projectRoot, path)),
  };
}

function listFiles(dir, { recursive, suffix = null, fileName = null }) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (recursive) out.push(...listFiles(path, { recursive, suffix, fileName }));
      continue;
    }
    if (fileName && name !== fileName) continue;
    if (suffix && !name.endsWith(suffix)) continue;
    out.push(path);
  }
  return out;
}

function countPlanItems(items) {
  return {
    update: items.filter((item) => item.action === "update").length,
    identical: items.filter((item) => item.action === "identical").length,
    projectOnly: items.filter((item) => item.action === "project-only").length,
  };
}

function readBaseline(projectRoot) {
  const path = join(projectRoot, ...BASELINE_PATH);
  if (!existsSync(path)) return { artifacts: {} };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { artifacts: {} };
  }
}

async function writeBaseline(plan, applied) {
  const path = join(plan.projectRoot, ...BASELINE_PATH);
  const current = readBaseline(plan.projectRoot);
  const artifacts = { ...(current.artifacts || {}) };
  const updatedAt = new Date().toISOString();
  for (const item of applied) {
    artifacts[item.projectRel] = {
      hash: item.upstreamHash,
      upstream: item.upstreamRel,
      updatedAt,
    };
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    schemaVersion: 1,
    pluginVersion: plan.currentVersion || null,
    hostAdapter: plan.host.adapterId,
    artifacts,
  }, null, 2) + "\n");
}

async function ensureMemoryIndex(projectRoot) {
  const result = await curateProjectMemory({
    rootDir: projectRoot,
    rebuildSqlite: false,
    now: new Date().toISOString(),
  });
  return {
    status: result.pass ? "ready" : "needs-review",
    path: normalizeRel(relative(projectRoot, result.indexPath)),
    markdownEntries: result.markdownEntries,
    warnings: result.validation?.warnings || [],
    errors: result.validation?.errors || [],
  };
}

async function inspectIndexGate(projectRoot) {
  const codeDbPath = join(projectRoot, ".supervibe", "memory", "code.db");
  if (!existsSync(codeDbPath)) {
    return {
      ready: false,
      reason: "missing-code-index",
      repairCommand: DEFAULT_INDEX_REPAIR_COMMAND,
    };
  }
  if (!hasNodeSqliteSupport()) {
    return {
      ready: false,
      reason: `node-sqlite-unavailable-${SQLITE_NODE_MIN_VERSION}`,
      repairCommand: DEFAULT_INDEX_REPAIR_COMMAND,
    };
  }
  const store = new CodeStore(projectRoot, { useEmbeddings: false });
  await store.init();
  try {
    const health = await collectIndexHealthFromStore(store, { rootDir: projectRoot });
    const gate = evaluateIndexHealthGate(health);
    return {
      ready: gate.ready,
      reason: gate.ready ? "ready" : "index-health-gate",
      failed: (gate.failedGates || []).map((item) => item.code).join(",") || "none",
      indexedSourceFiles: gate.indexedSourceFiles,
      eligibleSourceFiles: gate.eligibleSourceFiles,
      sourceCoverage: gate.sourceCoverage,
      repairCommand: gate.repairCommand || DEFAULT_INDEX_REPAIR_COMMAND,
    };
  } finally {
    store.close();
  }
}

function summarizeLineDiff(before, after) {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);
  if (beforeLines.length * afterLines.length > 1_000_000) {
    return summarizeLineDiffFast(beforeLines, afterLines);
  }
  const lcs = lcsLength(beforeLines, afterLines);
  return {
    additions: afterLines.length - lcs,
    deletions: beforeLines.length - lcs,
  };
}

function summarizeLineDiffFast(beforeLines, afterLines) {
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix + prefix < beforeLines.length &&
    suffix + prefix < afterLines.length &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  return {
    additions: Math.max(0, afterLines.length - prefix - suffix),
    deletions: Math.max(0, beforeLines.length - prefix - suffix),
  };
}

function lcsLength(a, b) {
  let previous = new Array(b.length + 1).fill(0);
  let current = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous.fill(0)];
  }
  return previous[b.length];
}

function splitLines(value) {
  const normalized = String(value || "").replace(/\r\n/g, "\n");
  if (!normalized) return [];
  return normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
}

function hashContent(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/");
}
