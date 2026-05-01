#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { createSupervibeUiServer } from "./lib/supervibe-ui-server.mjs";
import { activateDaemonLoggingFromEnv, startBackgroundNodeScript } from "./lib/supervibe-process-manager.mjs";

const args = parseArgs(process.argv.slice(2));
activateDaemonLoggingFromEnv();

if (args.help) {
  console.log([
    "SUPERVIBE_UI_HELP",
    "Usage:",
    "  npm run supervibe:ui -- --file .claude/memory/work-items/<epic>/graph.json",
    "  npm run supervibe:ui -- --port 3057",
    "  npm run supervibe:ui -- --daemon",
    "  npm run supervibe:ui -- --foreground",
    "",
    "The server binds to 127.0.0.1. Local mutating actions require preview plus explicit apply.",
  ].join("\n"));
  process.exit(0);
}

const port = Number(args.port || 3057);
if (args.daemon && !args.foreground) {
  const childArgs = ["--port", String(port), "--root", args.root || process.cwd(), "--foreground"];
  if (args.file) childArgs.push("--file", args.file);
  const child = startBackgroundNodeScript({
    scriptPath: fileURLToPath(import.meta.url),
    args: childArgs,
    cwd: process.cwd(),
    name: "supervibe-ui",
    port,
  });
  console.log("SUPERVIBE_UI_DAEMON");
  console.log(`URL: http://127.0.0.1:${port}/`);
  console.log(`PID: ${child.pid}`);
  console.log(`LOG_STDOUT: ${child.logs.stdout}`);
  console.log(`LOG_STDERR: ${child.logs.stderr}`);
  process.exit(0);
}

const { server } = createSupervibeUiServer({
  rootDir: args.root || process.cwd(),
  graphPath: args.file || "",
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log("SUPERVIBE_UI");
  console.log(`URL: ${url}`);
  console.log("BIND: 127.0.0.1");
  console.log("AUTH: localhost-only");
  console.log(`IDE_WIDGET: npm run supervibe:ide-bridge -- --port ${port}${args.file ? ` --file ${args.file}` : ""} --out .supervibe/ide-bridge.json`);
});

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg.startsWith("--")) {
      const key = arg.replace(/^--/, "");
      if (key.includes("=")) {
        const [name, value] = key.split(/=(.*)/s);
        parsed[name] = value;
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        parsed[key] = argv[++i];
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}
