#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INVOCATION_LOG = ".supervibe/memory/agent-invocations.jsonl";
const EFFECTIVENESS_LOG = ".supervibe/memory/effectiveness.jsonl";
const CONFIDENCE_LOG = ".supervibe/confidence-log.jsonl";

export async function rebuildAgentTrendLogs({
  rootDir = process.cwd(),
  dryRun = false,
  now = new Date().toISOString(),
} = {}) {
  const invocations = await readJsonl(join(rootDir, ...INVOCATION_LOG.split("/")));
  const effectiveness = invocations.map(toEffectivenessEntry);
  const confidence = invocations.map(toConfidenceEntry);
  const report = {
    schemaVersion: 1,
    generatedAt: now,
    pass: invocations.length > 0,
    dryRun,
    invocations: invocations.length,
    effectivenessEntries: effectiveness.length,
    confidenceEntries: confidence.length,
    outputs: {
      effectiveness: EFFECTIVENESS_LOG,
      confidence: CONFIDENCE_LOG,
    },
  };

  if (!dryRun) {
    await writeJsonl(join(rootDir, ...EFFECTIVENESS_LOG.split("/")), effectiveness);
    await writeJsonl(join(rootDir, ...CONFIDENCE_LOG.split("/")), confidence);
  }

  return report;
}

export function formatAgentTrendLogReport(report = {}) {
  return [
    "SUPERVIBE_AGENT_TREND_LOGS",
    `PASS: ${Boolean(report.pass)}`,
    `DRY_RUN: ${Boolean(report.dryRun)}`,
    `INVOCATIONS: ${report.invocations || 0}`,
    `EFFECTIVENESS_ENTRIES: ${report.effectivenessEntries || 0}`,
    `CONFIDENCE_ENTRIES: ${report.confidenceEntries || 0}`,
    `EFFECTIVENESS_LOG: ${report.outputs?.effectiveness || EFFECTIVENESS_LOG}`,
    `CONFIDENCE_LOG: ${report.outputs?.confidence || CONFIDENCE_LOG}`,
  ].join("\n");
}

async function readJsonl(path) {
  if (!existsSync(path)) return [];
  const raw = await readFile(path, "utf8");
  return raw.split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

async function writeJsonl(path, entries) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

function toEffectivenessEntry(record = {}) {
  const confidence = numericOrNull(record.confidence_score ?? record.confidenceScore);
  const status = String(record.status || "completed").toLowerCase();
  const outcome = status === "failed" || status === "error"
    ? "failed"
    : confidence !== null && confidence >= 9
      ? "success"
      : "partial";
  const blockers = [];
  if (record.evidence_gate?.pass === false) blockers.push("missing-context");
  if (!record.evidence?.verificationCommands?.length && !record.evidence?.verification_commands?.length) {
    blockers.push("missing-verification");
  }
  if (!record.retrieval_enforcement && !record.evidence_gate && !record.evidence_contract) {
    blockers.push("legacy-pre-enforcement");
  }
  return {
    schemaVersion: 1,
    ts: record.ts || record.timestamp || null,
    agent: record.agent_id || record.agentId || "unknown",
    task: record.task_summary || record.taskSummary || "",
    outcome,
    iterations: 1,
    blockers: blockers.length ? blockers : ["none"],
    confidence,
    userCorrections: record.user_corrections || record.userCorrections || 0,
    verification: record.evidence?.verificationCommands || record.evidence?.verification_commands || [],
    notes: "rebuilt from agent invocation telemetry",
    invocationId: record.invocation_id || record.invocationId || null,
  };
}

function toConfidenceEntry(record = {}) {
  const confidence = numericOrNull(record.confidence_score ?? record.confidenceScore);
  return {
    schemaVersion: 1,
    ts: record.ts || record.timestamp || null,
    source: "agent-trend-log-rebuild",
    artifact: "agent-output",
    agent: record.agent_id || record.agentId || "unknown",
    invocationId: record.invocation_id || record.invocationId || null,
    confidence,
    score: confidence,
    gate: confidence !== null && confidence >= 9 ? "pass" : "review",
    evidenceGatePass: record.evidence_gate?.pass ?? null,
    confidenceDetails: record.confidence_details
      || record.confidenceDetails
      || record.delivery_confidence
      || record.deliveryConfidence
      || null,
    output: record.structured_output?.json || null,
  };
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") options.help = true;
    else if (item === "--dry-run") options.dryRun = true;
    else if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) options[key] = true;
      else {
        options[key] = next;
        index += 1;
      }
    }
  }
  return options;
}

function usage() {
  return [
    "SUPERVIBE_AGENT_TREND_LOGS_HELP",
    "USAGE:",
    "  node scripts/rebuild-agent-trend-logs.mjs [--root .] [--dry-run] [--json]",
    "",
    "Rebuilds effectiveness and confidence trend logs from existing agent invocation telemetry.",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }
  const report = await rebuildAgentTrendLogs({
    rootDir: resolve(options.root || process.cwd()),
    dryRun: Boolean(options.dryRun),
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : formatAgentTrendLogReport(report));
  process.exit(report.pass ? 0 : 1);
}
