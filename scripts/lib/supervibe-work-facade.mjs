#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const LOOP_SCRIPT = resolve(PLUGIN_ROOT, "scripts/supervibe-loop.mjs");
const JSON_CONTRACT_SCHEMA_VERSION = 1;

const ACTION_ROUTES = Object.freeze({
  status: ["--status"],
  summary: ["--status"],
  list: ["--status"],
  graph: ["graph"],
  export: ["export"],
  archive: ["archive"],
  doctor: ["doctor"],
  prime: ["prime"],
  atomize: ["--atomize-plan"],
  prepare: ["--atomize-plan"],
  priority: ["--priority"],
  ready: ["--ready-list"],
  "ready-list": ["--ready-list"],
  show: ["--show"],
  next: ["--claim-ready", "--preview"],
  claim: ["--claim"],
  "claim-ready": ["--claim-ready"],
  "run-ready": ["--dispatch-wave", "--dry-run"],
  "run-ready-dry-run": ["--dispatch-wave", "--dry-run"],
  dispatch: ["--dispatch-wave"],
  complete: ["--complete"],
  close: ["--close"],
  block: ["--block"],
  unblock: ["--unblock"],
  skip: ["--skip"],
  defer: ["--defer"],
  create: ["--create-work-item"],
  discover: ["--create-work-item", "--discover", "--type", "followup", "--yes"],
  edit: ["--edit"],
  delete: ["--delete"],
  remove: ["--delete"],
  split: ["--split"],
  reparent: ["--reparent"],
  deps: ["--deps"],
  "dep-add": ["--dep-add"],
  "dep-remove": ["--dep-remove"],
  why: ["--why"],
  proof: ["--proof"],
  "completion-status": ["--completion-status"],
  "validate-completion": ["--validate-completion"],
  "close-eligible": ["--close-eligible"],
  "final-review": ["--final-review-sweep"],
  "final-review-status": ["--final-review-status"],
  adopt: ["--adopt-completed"],
  reconcile: ["--reconcile-receipts"],
});

export function routeWorkFacadeArgs(argv = []) {
  const { args, output } = parseWorkFacadeOutputMode(argv);
  const action = normalizeAction(args[0]);
  if (!action || action === "help" || action === "--help" || action === "-h") {
    return { help: true, commandArgs: [], output };
  }
  const route = ACTION_ROUTES[action];
  if (!route) {
    return {
      error: `unknown work action: ${args[0]}`,
      commandArgs: [],
      exitCode: 2,
      output,
    };
  }
  return {
    help: false,
    action,
    commandArgs: [...route, ...args.slice(1)],
    output,
    facadeArgs: args,
  };
}

export function formatWorkFacadeHelp() {
  return [
    "SUPERVIBE_WORK_HELP",
    "Usage:",
    "  sv work status [--file <graph.json>]",
    "  sv work graph --file <state.json> [--format text|json|mermaid|dot]",
    "  sv work prepare <plan.md> --user-approved-plan",
    "  sv work atomize <plan.md> --user-approved-plan",
    "  sv work ready --file <graph.json>",
    "  sv work show <task-id> --file <graph.json>",
    "  sv work next --file <graph.json>",
    "  sv work claim <task-id> --file <graph.json>",
    "  sv work discover \"Follow-up title\" --from <task-id> --file <graph.json>",
    "  sv work complete <task-id> --reason <reason> --file <graph.json>",
    "  sv work close <task-id> --reason <reason> --file <graph.json>",
    "  sv work deps <task-id> --file <graph.json>",
    "  sv work why <task-id> --file <graph.json>",
    "  sv work proof <task-id> --file <graph.json>",
    "  sv work run-ready --file <graph.json> --max-concurrency 4",
    "  sv work dispatch --apply --file <graph.json> --max-concurrency 4",
    "  sv work <action> --json",
    "",
    "Routes:",
    "  status|summary|list -> supervibe-loop --status",
    "  graph|export|archive|doctor|prime -> supervibe-loop graph/export/archive/doctor/prime",
    "  prepare|atomize|priority|ready|show|next|claim|claim-ready|run-ready|dispatch -> matching supervibe-loop work graph action",
    "  complete|close|block|unblock|skip|defer|create|discover|edit|delete|split|reparent|deps|dep-add|dep-remove|why|proof -> matching work-item action or view",
    "  completion-status|validate-completion|close-eligible|final-review|final-review-status|adopt|reconcile -> matching completion or receipt action",
    "",
    "Notes:",
    "  This facade is intentionally small; complex options are passed through to supervibe-loop.",
    "  Use --json or --format json for a stable facade envelope; omit it for legacy text output.",
  ].join("\n");
}

export function createWorkFacadeJsonResult({
  action = null,
  commandArgs = [],
  facadeArgs = [],
  exitCode = 0,
  signal = null,
  error = null,
  stdout = "",
  stderr = "",
} = {}) {
  const parsedOutput = parseJsonPayload(stdout);
  const diagnostics = createDiagnostics({ exitCode, signal, error, stdout, stderr, parsedOutput });
  return {
    schemaVersion: JSON_CONTRACT_SCHEMA_VERSION,
    command: "sv work",
    action,
    status: statusFromExit({ exitCode, signal, error }),
    graphId: inferGraphId({ facadeArgs, commandArgs, parsedOutput, stdout }),
    taskId: inferTaskId({ action, facadeArgs, commandArgs, parsedOutput, stdout }),
    counts: inferCounts({ parsedOutput, stdout }),
    nextAction: inferNextAction({ parsedOutput, stdout, exitCode, error }),
    diagnostics,
  };
}

function parseWorkFacadeOutputMode(argv = []) {
  const args = [];
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--format" && normalizeAction(argv[index + 1]) === "json") {
      json = true;
      index += 1;
      continue;
    }
    if (String(arg || "").startsWith("--format=") && normalizeAction(String(arg).slice("--format=".length)) === "json") {
      json = true;
      continue;
    }
    args.push(arg);
  }
  return { args, output: { json } };
}

function normalizeAction(value) {
  return String(value || "").trim().toLowerCase();
}

function runCli() {
  const routed = routeWorkFacadeArgs(process.argv.slice(2));
  if (routed.help) {
    if (routed.output?.json) {
      console.log(JSON.stringify({
        schemaVersion: JSON_CONTRACT_SCHEMA_VERSION,
        command: "sv work",
        action: "help",
        status: "ok",
        graphId: null,
        taskId: null,
        counts: {},
        nextAction: "choose a work action",
        diagnostics: {
          exitCode: 0,
          signal: null,
          error: null,
          stdoutLines: formatWorkFacadeHelp().split(/\r?\n/).length,
          stderrLines: 0,
          parsedOutput: false,
          stderr: [],
        },
      }, null, 2));
    } else {
      console.log(formatWorkFacadeHelp());
    }
    return 0;
  }
  if (routed.error) {
    if (routed.output?.json) {
      console.log(JSON.stringify(createWorkFacadeJsonResult({
        action: null,
        commandArgs: [],
        facadeArgs: process.argv.slice(2),
        exitCode: routed.exitCode || 2,
        error: routed.error,
        stderr: routed.error,
      }), null, 2));
    } else {
      console.error(["SUPERVIBE_WORK_COMMAND", "STATUS: unknown", `ERROR: ${routed.error}`, "NEXT: run `sv work --help`"].join("\n"));
    }
    return routed.exitCode || 2;
  }
  const result = spawnSync(process.execPath, [LOOP_SCRIPT, ...routed.commandArgs], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SUPERVIBE_PLUGIN_ROOT: process.env.SUPERVIBE_PLUGIN_ROOT || PLUGIN_ROOT,
    },
    encoding: routed.output?.json ? "utf8" : undefined,
    stdio: routed.output?.json ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (routed.output?.json) {
    const exitCode = result.status ?? (result.error || result.signal ? 1 : 0);
    console.log(JSON.stringify(createWorkFacadeJsonResult({
      action: routed.action,
      commandArgs: routed.commandArgs,
      facadeArgs: routed.facadeArgs,
      exitCode,
      signal: result.signal,
      error: result.error?.message || null,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    }), null, 2));
    return exitCode;
  }
  if (result.error) {
    console.error(`supervibe work facade failed: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`supervibe work facade stopped by signal ${result.signal}`);
    return 1;
  }
  return result.status ?? 0;
}

function statusFromExit({ exitCode, signal, error }) {
  if (error || signal) return "error";
  return Number(exitCode) === 0 ? "ok" : "failed";
}

function createDiagnostics({ exitCode, signal, error, stdout, stderr, parsedOutput }) {
  return {
    exitCode,
    signal,
    error,
    stdoutLines: countLines(stdout),
    stderrLines: countLines(stderr),
    parsedOutput: parsedOutput !== null,
    stderr: stderr ? String(stderr).trim().split(/\r?\n/).slice(0, 20) : [],
  };
}

function parseJsonPayload(stdout = "") {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function countLines(value = "") {
  const text = String(value || "").trim();
  return text ? text.split(/\r?\n/).length : 0;
}

function inferGraphId({ facadeArgs = [], commandArgs = [], parsedOutput = null, stdout = "" }) {
  return firstString(
    findValue(parsedOutput, ["graphId", "graph_id", "epicId", "epic"]),
    idFromFileArg(facadeArgs),
    idFromFileArg(commandArgs),
    matchLine(stdout, /^\s*(?:EPIC|GRAPH_ID|GRAPH):\s*(.+?)\s*$/im),
  );
}

function inferTaskId({ action = null, facadeArgs = [], commandArgs = [], parsedOutput = null, stdout = "" }) {
  return firstString(
    findValue(parsedOutput, ["taskId", "task_id", "itemId", "item_id", "workItemId"]),
    taskIdFromArgs({ action, args: facadeArgs }),
    taskIdFromArgs({ action, args: commandArgs }),
    matchLine(stdout, /^\s*(?:TASK|TASK_ID|ITEM|ITEM_ID|NEXT_READY):\s*(.+?)\s*$/im),
  );
}

function inferCounts({ parsedOutput = null, stdout = "" }) {
  const counts = {};
  const sourceCounts = findValue(parsedOutput, ["counts", "totals", "summary"]);
  if (sourceCounts && typeof sourceCounts === "object" && !Array.isArray(sourceCounts)) {
    for (const [key, value] of Object.entries(sourceCounts)) {
      if (Number.isFinite(Number(value))) counts[key] = Number(value);
    }
  }
  for (const key of ["TOTAL", "READY", "IN_PROGRESS", "BLOCKED", "TERMINAL", "STALE_CLAIMS", "STALLED", "ORPHANS"]) {
    const value = matchLine(stdout, new RegExp(`^\\s*${key}:\\s*(\\d+)\\s*$`, "im"));
    if (value !== null) counts[toCamelCase(key)] = Number(value);
  }
  return counts;
}

function inferNextAction({ parsedOutput = null, stdout = "", exitCode = 0, error = null }) {
  return firstString(
    findValue(parsedOutput, ["nextAction", "next_action", "next"]),
    matchLine(stdout, /^\s*NEXT(?:_ACTION)?:\s*(.+?)\s*$/im),
    error ? "inspect diagnostics and rerun the command" : null,
    Number(exitCode) === 0 ? null : "inspect diagnostics and rerun the command",
  );
}

function findValue(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = findValue(nested, keys);
    if (found !== null && found !== undefined) return found;
  }
  return null;
}

function idFromFileArg(args = []) {
  const file = valueAfter(args, "--file");
  if (!file) return null;
  const normalized = String(file).replace(/\\/g, "/");
  const match = normalized.match(/\/work-items\/([^/]+)\/[^/]+$/i);
  return match?.[1] || null;
}

function taskIdFromArgs({ action = null, args = [] }) {
  const explicit = valueAfter(args, "--task-id") || valueAfter(args, "--item-id");
  if (explicit) return explicit;
  if (!action || !requiresPositionalTaskId(action)) return null;
  const index = args.findIndex((arg) => normalizeAction(arg) === action);
  const candidate = index >= 0 ? args[index + 1] : args[0];
  return candidate && !String(candidate).startsWith("-") ? candidate : null;
}

function requiresPositionalTaskId(action) {
  return new Set([
    "claim",
    "complete",
    "close",
    "block",
    "unblock",
    "skip",
    "defer",
    "edit",
    "delete",
    "remove",
    "split",
    "reparent",
    "deps",
    "dep-add",
    "dep-remove",
    "why",
    "proof",
    "show",
  ]).has(action);
}

function valueAfter(args = [], name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  return value && !String(value).startsWith("-") ? value : null;
}

function matchLine(text = "", pattern) {
  const match = String(text || "").match(pattern);
  return match?.[1]?.trim() || null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Number.isFinite(value)) return String(value);
  }
  return null;
}

function toCamelCase(value) {
  return String(value || "").toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runCli());
}
