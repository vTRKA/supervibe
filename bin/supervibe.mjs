#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getCommandAgentProfile } from "../scripts/lib/command-agent-orchestration-contract.mjs";

const PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));

const RUNNABLE_COMMANDS = Object.freeze({
  "supervibe": "scripts/supervibe-commands.mjs",
  "supervibe-adapt": "scripts/supervibe-adapt.mjs",
  "supervibe-commands": "scripts/supervibe-commands.mjs",
  "supervibe-doctor": "scripts/supervibe-doctor.mjs",
  "supervibe-gc": "scripts/supervibe-gc.mjs",
  "supervibe-loop": "scripts/supervibe-loop.mjs",
  "supervibe-preview": "scripts/preview-server.mjs",
  "supervibe-status": "scripts/supervibe-status.mjs",
  "supervibe-ui": "scripts/supervibe-ui.mjs",
  "supervibe-update": "scripts/supervibe-upgrade.mjs",
  "supervibe-validate": "scripts/supervibe-workflow-validate.mjs",
});

const AI_CLI_ONLY_COMMANDS = Object.freeze(new Set([
  "supervibe-audit",
  "supervibe-brainstorm",
  "supervibe-design",
  "supervibe-execute-plan",
  "supervibe-genesis",
  "supervibe-plan",
  "supervibe-presentation",
  "supervibe-score",
  "supervibe-security-audit",
  "supervibe-strengthen",
]));

const SUBCOMMAND_ALIASES = Object.freeze({
  adapt: "supervibe-adapt",
  audit: "supervibe-audit",
  brainstorm: "supervibe-brainstorm",
  commands: "supervibe-commands",
  design: "supervibe-design",
  doctor: "supervibe-doctor",
  "execute-plan": "supervibe-execute-plan",
  execute: "supervibe-execute-plan",
  gc: "supervibe-gc",
  genesis: "supervibe-genesis",
  loop: "supervibe-loop",
  plan: "supervibe-plan",
  presentation: "supervibe-presentation",
  preview: "supervibe-preview",
  score: "supervibe-score",
  "security-audit": "supervibe-security-audit",
  security: "supervibe-security-audit",
  status: "supervibe-status",
  strengthen: "supervibe-strengthen",
  ui: "supervibe-ui",
  update: "supervibe-update",
  upgrade: "supervibe-update",
  validate: "supervibe-validate",
});

const HELP_FORWARD_COMMANDS = Object.freeze(new Set([
  "supervibe-adapt",
  "supervibe-commands",
  "supervibe-doctor",
  "supervibe-gc",
  "supervibe-loop",
  "supervibe-preview",
  "supervibe-ui",
]));

const args = process.argv.slice(2);
const resolved = resolveInvocation({ argv1: process.argv[1], args });

if (resolved.rootHelp) {
  console.log(formatHelp());
  process.exit(0);
}

if (resolved.commandName === "supervibe-design" && isDesignDiagnosticInvocation(resolved.args)) {
  const result = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts/design-agent-plan.mjs"), ...normalizeDesignDiagnosticArgs(resolved.args)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SUPERVIBE_PLUGIN_ROOT: process.env.SUPERVIBE_PLUGIN_ROOT || PLUGIN_ROOT,
    },
    stdio: "inherit",
  });
  process.exit(result.status ?? 0);
}

if (AI_CLI_ONLY_COMMANDS.has(resolved.commandName)) {
  console.log(formatAiOnlyCommand(resolved.commandName));
  process.exit(0);
}

const script = RUNNABLE_COMMANDS[resolved.commandName];
if (!script) {
  console.error(formatUnknownCommand(resolved.commandName));
  process.exit(2);
}

if (resolved.commandHelp && !HELP_FORWARD_COMMANDS.has(resolved.commandName)) {
  console.log(formatRunnableCommandHelp(resolved.commandName, script));
  process.exit(0);
}

const result = spawnSync(process.execPath, [join(PLUGIN_ROOT, script), ...resolved.args], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    SUPERVIBE_PLUGIN_ROOT: process.env.SUPERVIBE_PLUGIN_ROOT || PLUGIN_ROOT,
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(`supervibe terminal dispatcher failed: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`supervibe terminal dispatcher stopped by signal ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 0);

function resolveInvocation({ argv1, args }) {
  const binaryName = normalizeCommandName(basename(String(argv1 || "supervibe"), ".mjs"));
  const firstArg = args[0] ? normalizeCommandName(args[0]) : "";
  const requestedHelp = args.includes("--help") || args.includes("-h");
  const rootHelp = args.length === 0 && binaryName === "supervibe" || requestedHelp && binaryName === "supervibe" && !firstArg;

  if (binaryName !== "supervibe") {
    return { commandName: binaryName, args, rootHelp: false, commandHelp: requestedHelp };
  }

  if (firstArg && isKnownCommand(firstArg)) {
    return { commandName: firstArg, args: args.slice(1), rootHelp: false, commandHelp: requestedHelp };
  }
  if (firstArg && SUBCOMMAND_ALIASES[firstArg]) {
    return { commandName: SUBCOMMAND_ALIASES[firstArg], args: args.slice(1), rootHelp: false, commandHelp: requestedHelp };
  }
  if (firstArg?.startsWith("supervibe-")) {
    return { commandName: firstArg, args: args.slice(1), rootHelp: false, commandHelp: requestedHelp };
  }
  return { commandName: "supervibe", args, rootHelp, commandHelp: requestedHelp };
}

function normalizeCommandName(value) {
  return String(value || "")
    .replace(/\.(cmd|ps1|mjs|js)$/i, "")
    .replace(/^\//, "")
    .toLowerCase();
}

function isKnownCommand(value) {
  return Boolean(RUNNABLE_COMMANDS[value] || AI_CLI_ONLY_COMMANDS.has(value));
}

function formatHelp() {
  const runnable = Object.keys(RUNNABLE_COMMANDS)
    .filter((name) => name !== "supervibe")
    .sort();
  const aiOnly = [...AI_CLI_ONLY_COMMANDS].sort();
  return [
    "SUPERVIBE_TERMINAL_HELP",
    "Usage:",
    "  supervibe <command> [args]",
    "  supervibe-adapt --dry-run --project <path>",
    "  supervibe-status --index-health",
    "  supervibe-doctor --host all",
    "",
    "Runnable terminal commands:",
    ...runnable.map((name) => `  ${name}`),
    "",
    "AI CLI slash commands with terminal guidance:",
    ...aiOnly.map((name) => `  ${name} -> /${name}`),
    "",
    "Notes:",
    "  Slash workflow commands still run inside Claude Code, Codex, Gemini, Cursor, or OpenCode.",
    "  Terminal aliases exist so macOS/Linux users do not hit command-not-found.",
  ].join("\n");
}

function formatAiOnlyCommand(commandName) {
  const slashCommand = `/${commandName}`;
  const profile = getCommandAgentProfile(slashCommand);
  return [
    "SUPERVIBE_TERMINAL_COMMAND",
    `COMMAND: ${commandName}`,
    `SLASH_COMMAND: ${slashCommand}`,
    "AI_CLI_ONLY: true",
    "STATUS: terminal shim available",
    "AGENT_DEFAULT_MODE: real-agents",
    `AGENT_PLAN_COMMAND: node <resolved-supervibe-plugin-root>/scripts/command-agent-plan.mjs --command ${slashCommand}`,
    `REQUIRED_AGENTS: ${profile?.requiredAgentIds?.join(", ") || "none"}`,
    "AGENT_GATE: run AGENT_PLAN_COMMAND in the active AI CLI, invoke the listed host agents, and record host invocation ids before durable work.",
    "AGENT_EMULATION_ALLOWED: false",
    "NEXT: open the target project in your AI CLI session and send the slash command above.",
    "HELP: run `supervibe commands` or `supervibe-doctor --host all` for local command diagnostics.",
  ].join("\n");
}

function formatRunnableCommandHelp(commandName, script) {
  return [
    "SUPERVIBE_TERMINAL_COMMAND",
    `COMMAND: ${commandName}`,
    `BACKEND: ${script}`,
    "RUNNABLE: true",
    "HELP_FORWARDED: false",
    "STATUS: terminal shim available",
    "NEXT: run the command without --help to execute it, or run `supervibe --help` to list all aliases.",
  ].join("\n");
}

function formatUnknownCommand(commandName) {
  return [
    "SUPERVIBE_TERMINAL_COMMAND",
    `COMMAND: ${commandName || "unknown"}`,
    "STATUS: unknown",
    "NEXT: run `supervibe --help` or `supervibe commands` to inspect available commands.",
  ].join("\n");
}

function isDesignDiagnosticInvocation(args = []) {
  return args[0] === "status" || args.includes("--status") || args.includes("--plan-writes");
}

function normalizeDesignDiagnosticArgs(args = []) {
  const rest = args[0] === "status" ? args.slice(1) : args;
  return rest.includes("--status") ? rest : ["--status", ...rest];
}
