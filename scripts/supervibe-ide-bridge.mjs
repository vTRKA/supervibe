#!/usr/bin/env node

import { resolve } from "node:path";
import {
  createIdeBridgeDescriptor,
  formatIdeBridgeReport,
  writeIdeBridgeDescriptor,
} from "./lib/supervibe-ide-bridge.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_IDE_BRIDGE_HELP",
    "Usage:",
    "  npm run supervibe:ide-bridge -- --file .supervibe/memory/work-items/<epic>/graph.json",
    "  npm run supervibe:ide-bridge -- --state .supervibe/memory/loops/<run-id>/state.json --out .supervibe/ide-bridge.json",
    "",
    "Creates a JSON descriptor for wrapping /supervibe-ui as a localhost IDE webview/widget.",
  ].join("\n"));
  process.exit(0);
}

const descriptor = createIdeBridgeDescriptor({
  rootDir: args.root || process.cwd(),
  graphPath: args.file || args.graph || ".supervibe/memory/work-items/<epic-id>/graph.json",
  statePath: args.state || ".supervibe/memory/loops/<run-id>/state.json",
  port: args.port || 3057,
});
const out = args.out
  ? await writeIdeBridgeDescriptor(resolve(process.cwd(), args.out), descriptor)
  : null;

if (args.json) console.log(JSON.stringify(descriptor, null, 2));
else console.log(formatIdeBridgeReport(descriptor, out));

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
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
