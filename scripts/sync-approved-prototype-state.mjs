#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  syncApprovedPrototypeState,
} from "./lib/design-workflow-state-sync.mjs";
import {
  artifactRoot,
} from "./lib/supervibe-artifact-roots.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = arg("--root", process.cwd());
  const target = arg("--target", "");
  const slugs = arg("--slug", "")
    ? [arg("--slug", "")]
    : listApprovedPrototypeSlugs(rootDir);
  const results = [];
  for (const slug of slugs) {
    results.push({ slug, ...(await syncApprovedPrototypeState(rootDir, { slug, target })) });
  }
  const pass = results.every((result) => result.pass === true || result.issues?.length === 0);
  console.log(formatSyncApprovedPrototypeStateReport({ pass, results }));
  process.exit(pass ? 0 : 2);
}

export function formatSyncApprovedPrototypeStateReport({ pass = false, results = [] } = {}) {
  const lines = [
    "SUPERVIBE_SYNC_APPROVED_PROTOTYPE_STATE",
    `PASS: ${pass === true}`,
    `CHECKED: ${results.length}`,
  ];
  for (const result of results) {
    lines.push(`SLUG: ${result.slug}`);
    lines.push(`  PASS: ${result.pass === true}`);
    lines.push(`  UPDATED: ${(result.updatedFiles || []).join(",") || "none"}`);
    lines.push(`  ISSUES: ${(result.issues || []).join("; ") || "none"}`);
  }
  return lines.join("\n");
}

function listApprovedPrototypeSlugs(rootDir) {
  const root = artifactRoot(rootDir, "prototypes");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((slug) => {
      const approvalPath = join(root, slug, ".approval.json");
      if (!existsSync(approvalPath)) return false;
      try {
        return JSON.parse(readFileSync(approvalPath, "utf8")).status === "approved";
      } catch {
        return false;
      }
    })
    .sort();
}
