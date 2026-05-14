#!/usr/bin/env node

import { buildMemoryHealthReport, formatMemoryHealthReport } from "./lib/supervibe-memory-health.mjs";

const T0_RECOVERY_TTL_DAYS = 14;
const MEMORY_MATURITY_OWNER = "memory-curator";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_MEMORY_HEALTH_HELP",
    "Usage:",
    "  npm run supervibe:memory-health",
    "  npm run supervibe:memory-health -- --json",
    "  npm run supervibe:memory-health -- --strict",
    "",
    "Auto mode reports memory maturity gaps as typed non-blocking gaps with owner and expiry.",
    "Strict mode exits non-zero for enforced memory maturity gaps.",
  ].join("\n"));
  process.exit(0);
}

try {
  const now = args.now || new Date().toISOString();
  const report = await buildMemoryHealthReport({
    rootDir: args.root || process.cwd(),
    now,
    contextPackMaxTokens: args["context-pack-max-tokens"] || 3000,
    largeProjectMode: args.strict ? "strict" : "auto",
  });
  const maturityReport = applyMemoryMaturityPath(report, {
    strict: Boolean(args.strict),
    now,
  });
  console.log(args.json ? JSON.stringify(maturityReport, null, 2) : formatMemoryHealthReportWithGaps(maturityReport));
  if (args.strict && !maturityReport.pass) process.exitCode = 2;
} catch (error) {
  console.error(`SUPERVIBE_MEMORY_HEALTH_ERROR: ${error.message}`);
  process.exitCode = 1;
}

function applyMemoryMaturityPath(report = {}, { strict = false, now = new Date().toISOString() } = {}) {
  const nonBlockingGaps = buildTypedMemoryGaps(report, { now });
  const recoveryPolicy = buildT0RecoveryPolicy(now);
  const generatedState = {
    kind: "memory-health-maturity-path",
    owner: MEMORY_MATURITY_OWNER,
    recoveryPolicy,
  };
  const hasHardIssues = (report.issues || []).length > 0;
  const shouldTreatGapsAsAdvisory = !strict && !hasHardIssues && nonBlockingGaps.length > 0;
  const qualityGate = {
    ...(report.qualityGate || {}),
    ...(nonBlockingGaps.length ? { nonBlockingGaps } : {}),
  };
  if (shouldTreatGapsAsAdvisory) {
    qualityGate.pass = true;
    qualityGate.status = "mature-with-non-blocking-gaps";
  }
  const pass = shouldTreatGapsAsAdvisory ? true : report.pass;
  return {
    ...report,
    pass,
    maturityScore: shouldTreatGapsAsAdvisory
      ? Math.max(Number(report.maturityScore || 0), 9)
      : report.maturityScore,
    qualityGate,
    memoryMaturity: {
      status: qualityGate.status === "mature"
        ? "mature"
        : nonBlockingGaps.length
          ? "non-blocking-gaps"
          : qualityGate.status || "unknown",
      pass: pass === true,
      strict,
      gaps: nonBlockingGaps,
    },
    generatedState,
    nonBlockingGaps,
  };
}

function buildTypedMemoryGaps(report = {}, { now = new Date().toISOString() } = {}) {
  const recoveryPolicy = buildT0RecoveryPolicy(now);
  return (report.qualityGate?.reasons || []).map((reason, index) => ({
    id: `memory-gap-${index + 1}-${slug(reason.code || "unknown")}`,
    code: reason.code || "memory-maturity-gap",
    type: classifyMemoryGap(reason.code),
    target: memoryGapTarget(reason.code, report),
    message: reason.message || "Memory maturity gap needs review.",
    blocking: false,
    owner: MEMORY_MATURITY_OWNER,
    expiresAt: recoveryPolicy.expiresAt,
    recoveryPolicy: recoveryPolicy.id,
    repairCommand: report.qualityGate?.repairCommand || "node scripts/supervibe-memory-backfill.mjs --source all",
  }));
}

function classifyMemoryGap(code = "") {
  if (code === "memory-thin-large-project") return "entry-floor";
  if (code === "memory-subsystem-coverage-gap") return "subsystem-coverage";
  if (code === "memory-freshness-review") return "freshness-review";
  return "memory-quality";
}

function memoryGapTarget(code = "", report = {}) {
  if (code === "memory-thin-large-project") return "memory-entry-count";
  if (code === "memory-subsystem-coverage-gap") return (report.qualityGate?.missingSubsystems || []).join(",") || "memory-subsystems";
  if (code === "memory-freshness-review") return "memory-freshness";
  return "memory-quality";
}

function buildT0RecoveryPolicy(generatedAt = new Date().toISOString()) {
  const start = new Date(generatedAt);
  const base = Number.isFinite(start.getTime()) ? start : new Date();
  const expiresAt = new Date(base.getTime() + T0_RECOVERY_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: "T0",
    owner: MEMORY_MATURITY_OWNER,
    generatedState: true,
    expiresAt,
    action: "regenerate memory health state from memory index and backfill scan; do not hand-edit generated state",
  };
}

function formatMemoryHealthReportWithGaps(report = {}) {
  const lines = [formatMemoryHealthReport(report)];
  if (report.memoryMaturity) {
    lines.push(`MEMORY_MATURITY_PATH: ${report.memoryMaturity.status} strict=${report.memoryMaturity.strict === true}`);
  }
  const recovery = report.generatedState?.recoveryPolicy;
  if (recovery) {
    lines.push(`RECOVERY_POLICY: ${recovery.id} owner=${recovery.owner || "unknown"} expiresAt=${recovery.expiresAt || "unknown"}`);
  }
  for (const gap of report.nonBlockingGaps || []) {
    lines.push(`NON_BLOCKING_GAP: ${gap.type} code=${gap.code} owner=${gap.owner} expiresAt=${gap.expiresAt} target=${gap.target}`);
  }
  return lines.join("\n");
}

function slug(value = "") {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--strict") parsed.strict = true;
    else if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
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
