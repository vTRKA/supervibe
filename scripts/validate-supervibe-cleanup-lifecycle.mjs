#!/usr/bin/env node

import { decideCleanupAction, resolveCleanupPolicy } from "./lib/supervibe-cleanup-policy.mjs";
import { buildCleanupReachability } from "./lib/supervibe-cleanup-reachability.mjs";
import { runCleanupOrchestrator } from "./lib/supervibe-cleanup-orchestrator.mjs";
import { scanSupervibeArtifactGc, validateSupervibeGcStrict } from "./lib/supervibe-artifact-gc.mjs";
import { filterCleanupContextItems } from "./lib/supervibe-context-pack.mjs";

export async function validateCleanupLifecycle({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  mode = "dry-run",
  retentionDays = 14,
  archiveRetentionDays = 90,
  maxArchiveBytes = 0,
  archiveKeepLast = 0,
  artifactScan = null,
} = {}) {
  const issues = [];
  const warnings = [];
  let policy;
  try {
    policy = resolveCleanupPolicy({ mode, now });
  } catch (error) {
    issues.push({ code: "cleanup-policy-invalid", message: error.message });
    policy = resolveCleanupPolicy({ mode: "dry-run", now });
  }

  const reachability = buildCleanupReachability({ rootDir, now });
  const artifacts = artifactScan || await scanSupervibeArtifactGc({
    rootDir,
    now,
    retentionDays,
    archiveRetentionDays,
    maxArchiveBytes,
    archiveKeepLast,
  });
  const strict = await validateSupervibeGcStrict({
    rootDir,
    now,
    scan: artifacts,
    retentionDays,
    archiveRetentionDays,
    maxArchiveBytes,
    archiveKeepLast,
  });
  const orchestrator = await runCleanupOrchestrator({ rootDir, now, mode, retentionDays });

  if (strict.pass !== true) {
    for (const failure of strict.failures || []) {
      issues.push({ code: "receipt-linked-delete-plan", message: failure });
    }
  }
  if (orchestrator.blocked === true) {
    issues.push({ code: "cleanup-orchestrator-blocked", message: (orchestrator.terminalSignals?.blocked || []).join(",") || "blocked" });
  }

  for (const item of reachability.inventory || []) {
    if (item.lifecycleClass === "unclassified" && isHotNamespacePath(item.relPath)) {
      issues.push({ code: "unclassified-hot-namespace", message: item.relPath });
    }
  }

  const defaultContext = filterCleanupContextItems(
    (reachability.inventory || []).map((item) => ({ path: item.relPath, lifecycleClass: item.lifecycleClass })),
    { reachability },
  );
  for (const item of defaultContext) {
    const lifecycleClass = reachability.byPath?.get(item.path)?.lifecycleClass || item.lifecycleClass;
    if (["cold", "trash"].includes(lifecycleClass)) {
      issues.push({ code: "cold-or-trash-in-default-context", message: item.path });
    }
  }

  for (const item of artifacts.archiveCleanup || []) {
    if (isCompactArchiveBlob(item.relPath, reachability)) {
      issues.push({ code: "compact-blob-scheduled-for-removal", message: item.relPath });
    } else {
      warnings.push({ code: "archive-budget-action", message: item.relPath });
    }
  }

  if (policy.mode === "auto-safe") {
    for (const item of reachability.inventory || []) {
      const decision = decideCleanupAction({ policy, ...item });
      if (decision.action === "delete" && decision.namespacePolicy?.autoSafe !== true) {
        issues.push({ code: "unsafe-auto-safe-action", message: item.relPath });
      }
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: now,
    pass: issues.length === 0,
    policyVersion: policy.policyVersion,
    mode: policy.mode,
    issues,
    warnings,
    summary: {
      reachability: reachability.summary,
      artifactCandidates: artifacts.summary?.candidates || 0,
      archiveCleanup: artifacts.summary?.archiveCleanup || 0,
      strictPass: strict.pass === true,
      orchestratorBlocked: orchestrator.blocked === true,
    },
  };
}

export function formatCleanupLifecycleValidation(result = {}) {
  return [
    "SUPERVIBE_CLEANUP_LIFECYCLE",
    "PASS: " + (result.pass === true),
    "MODE: " + (result.mode || "unknown"),
    "POLICY_VERSION: " + (result.policyVersion || "unknown"),
    "ARTIFACT_CANDIDATES: " + (result.summary?.artifactCandidates || 0),
    "ARCHIVE_CLEANUP: " + (result.summary?.archiveCleanup || 0),
    "STRICT_PASS: " + (result.summary?.strictPass === true),
    "ORCHESTRATOR_BLOCKED: " + (result.summary?.orchestratorBlocked === true),
    "ISSUES:",
    ...((result.issues || []).length ? result.issues.map((issue) => "  - " + issue.code + ": " + issue.message) : ["  - none"]),
    "WARNINGS:",
    ...((result.warnings || []).length ? result.warnings.slice(0, 10).map((warning) => "  - " + warning.code + ": " + warning.message) : ["  - none"]),
    "NEXT_ACTION: " + (result.pass ? "cleanup lifecycle gate passed" : "fix cleanup lifecycle issues before release"),
  ].join("\n");
}

function isHotNamespacePath(relPath = "") {
  const path = String(relPath || "").replace(/\\/g, "/");
  return path.startsWith(".supervibe/memory/active-") || path.startsWith(".supervibe/artifacts/active/");
}

function isCompactArchiveBlob(relPath, reachability) {
  const path = String(relPath || "").replace(/\\/g, "/");
  return (reachability.roots?.compactArchiveBlobs || []).some((item) => item.relPath === path || path.startsWith(item.relPath + "/"));
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (key.includes("=")) {
        const [name, value] = key.split(/=(.*)/s);
        parsed[name] = value;
      } else {
        parsed[key] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
      }
    }
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      "SUPERVIBE_CLEANUP_LIFECYCLE_HELP",
      "Usage:",
      "  node scripts/validate-supervibe-cleanup-lifecycle.mjs [--root <dir>] [--mode dry-run|review|auto-safe] [--json]",
      "Validates cleanup policy, reachability, context filtering, archive budgets, and receipt-safe artifact GC.",
    ].join("\n"));
    return;
  }
  const result = await validateCleanupLifecycle({
    rootDir: args.root || process.cwd(),
    mode: args.mode || "dry-run",
    retentionDays: args["retention-days"] || 14,
    archiveRetentionDays: args["archive-retention-days"] || 90,
    maxArchiveBytes: args["max-archive-bytes"] || 0,
    archiveKeepLast: args["archive-keep-last"] || 0,
  });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(formatCleanupLifecycleValidation(result));
  if (result.pass !== true) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("validate-supervibe-cleanup-lifecycle.mjs")) {
  main().catch((error) => {
    console.error("SUPERVIBE_CLEANUP_LIFECYCLE_ERROR: " + error.message);
    process.exit(2);
  });
}
