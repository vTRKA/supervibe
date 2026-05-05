#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  analyzeNpmAuditForceLockfilePlan,
  analyzeNpmAuditForcePlan,
  formatNpmAuditForceLockfilePolicy,
  formatNpmAuditForcePolicy,
} from "./lib/npm-audit-force-policy.mjs";

const args = parseArgs(process.argv.slice(2));

try {
  if (args.help || args.h) {
    console.log(formatHelp());
    process.exit(0);
  }

  if (args.before && args.after) {
    const result = analyzeNpmAuditForceLockfilePlan({
      beforeLock: readJson(args.before),
      afterLock: readJson(args.after),
      latestVersions: parseLatestVersions(args.latest),
    });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatNpmAuditForceLockfilePolicy(result));
    if (result.status === "blocked_downgrade") process.exitCode = 2;
  } else {
    const result = analyzeNpmAuditForcePlan({
      packageName: args.package,
      currentVersion: args.current,
      proposedVersion: args.proposed,
      latestVersion: args.latest,
    });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatNpmAuditForcePolicy(result));
    if (result.status === "blocked_downgrade") process.exitCode = 2;
  }
} catch (error) {
  console.error(`npm-audit-force-policy error: ${error.message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["json", "help", "h"]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h") {
      parsed.h = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) parsed[key] = true;
    else {
      parsed[key] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseLatestVersions(value = "") {
  const out = {};
  for (const item of String(value || "").split(",").map((part) => part.trim()).filter(Boolean)) {
    const [name, version] = item.split("=");
    if (name && version) out[name] = version;
  }
  return out;
}

function formatHelp() {
  return `
Supervibe npm audit force policy

Usage:
  node scripts/npm-audit-force-policy.mjs --package next --current 16.2.4 --proposed 9.3.3 --latest 16.2.4
  node scripts/npm-audit-force-policy.mjs --before package-lock.before.json --after package-lock.json --latest next=16.2.4

Exit code 2 means npm audit fix --force proposed an unsafe framework downgrade.
`.trim();
}
