#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import {
  buildProjectCommandCatalog,
  findCommandShortcut,
  formatCommandCatalog,
  formatCommandMatch,
} from "./lib/supervibe-command-catalog.mjs";
import { resolveSupervibePluginRoot, resolveSupervibeProjectRoot } from "./lib/supervibe-plugin-root.mjs";

const args = parseArgs(process.argv.slice(2));
const SCRIPT_PLUGIN_ROOT = fileURLToPath(new URL("../", import.meta.url));
const projectRoot = args.project || resolveSupervibeProjectRoot({ env: process.env, cwd: process.cwd() });
const pluginRoot = args["plugin-root"] || resolveSupervibePluginRoot({ env: process.env, cwd: SCRIPT_PLUGIN_ROOT });

try {
  if (args.help) {
    console.log(formatHelp());
  } else if (args.match) {
    const match = findCommandShortcut(args.match);
    if (args.json) console.log(JSON.stringify({ match }, null, 2));
    else console.log(formatCommandMatch(match));
    if (!match) process.exitCode = 2;
  } else {
    const catalog = buildProjectCommandCatalog({ pluginRoot, projectRoot });
    if (args.json) console.log(JSON.stringify(catalog, null, 2));
    else console.log(formatCommandCatalog(catalog));
  }
} catch (error) {
  console.error(`supervibe-commands error: ${error.message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["json", "no-color", "help"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) parsed[key] = true;
    else {
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function formatHelp() {
  return [
    "SUPERVIBE_COMMANDS_HELP",
    "Usage:",
    "  node scripts/supervibe-commands.mjs",
    "  node scripts/supervibe-commands.mjs --match \"запусти индексирование rag/codegraph\"",
    "  node scripts/supervibe-commands.mjs --json",
    "",
    "Purpose:",
    "  Print deterministic Supervibe command shortcuts, slash commands, and npm scripts.",
    "  Use --match before broad project search when the user asks to run a known maintenance command.",
  ].join("\n");
}
