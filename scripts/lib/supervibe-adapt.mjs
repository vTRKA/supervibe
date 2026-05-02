import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { selectHostAdapter } from "./supervibe-host-detector.mjs";
import { getCurrentPluginVersion, getLastSeenVersion, setLastSeenVersion } from "./version-tracker.mjs";

const BASELINE_PATH = [".supervibe", "memory", "adapt", "baseline.json"];

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
  };
}

export function formatAdaptPlan(plan) {
  const lines = [
    "SUPERVIBE_ADAPT_DRY_RUN",
    `HOST: ${plan.host.adapterId}`,
    `VERSION: ${plan.lastSeenVersion || "none"} -> ${plan.currentVersion || "unknown"}`,
    `ARTIFACTS: ${plan.items.length}`,
    `UPDATES: ${plan.counts.update}`,
    `IDENTICAL: ${plan.counts.identical}`,
    `PROJECT_ONLY: ${plan.counts.projectOnly}`,
    `APPROVAL_REQUIRED: ${plan.approvalRequired}`,
  ];
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

export function formatAdaptApply(result) {
  const lines = [
    "SUPERVIBE_ADAPT_APPLY",
    `HOST: ${result.host.adapterId}`,
    `VERSION: ${result.lastSeenVersion || "none"} -> ${result.currentVersion || "unknown"}`,
    `APPLIED: ${result.applied.length}`,
    `SKIPPED: ${result.skipped.length}`,
    `BLOCKED: ${result.blocked.length}`,
  ];
  for (const item of result.applied) lines.push(`APPLIED_FILE: ${item.projectRel}`);
  for (const item of result.skipped) lines.push(`SKIPPED_FILE: ${item.projectRel}`);
  for (const item of result.blocked) lines.push(`BLOCKED_FILE: ${item.projectRel} - ${item.reason}`);
  if (result.applied.length > 0) {
    lines.push("VERSION_MARKER: updated");
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

  return {
    ...artifact,
    action: identical || classification === "project-local-edit" ? "identical" : "update",
    classification,
    upstreamAbs: upstream.upstreamAbs,
    upstreamRel: upstream.upstreamRel,
    projectHash,
    upstreamHash,
    baselineHash,
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
  for (const item of applied) {
    artifacts[item.projectRel] = {
      hash: item.upstreamHash,
      upstream: item.upstreamRel,
      updatedAt: "deterministic-local",
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

function hashContent(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/");
}
