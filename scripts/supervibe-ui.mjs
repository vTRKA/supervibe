#!/usr/bin/env node

import { createSupervibeUiServer } from "./lib/supervibe-ui-server.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_UI_HELP",
    "Usage:",
    "  npm run supervibe:ui -- --file .claude/memory/work-items/<epic>/graph.json",
    "  npm run supervibe:ui -- --port 3057",
    "",
    "The server binds to 127.0.0.1 and uses a per-run token for mutating POST actions.",
  ].join("\n"));
  process.exit(0);
}

const port = Number(args.port || 3057);
const { server, token } = createSupervibeUiServer({
  rootDir: args.root || process.cwd(),
  graphPath: args.file || "",
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/?token=${token}`;
  console.log("SUPERVIBE_UI");
  console.log(`URL: ${url}`);
  console.log(`TOKEN: ${token}`);
  console.log("BIND: 127.0.0.1");
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
      } else {
        parsed[key] = argv[i + 1]?.startsWith("--") ? true : argv[++i];
      }
    }
  }
  return parsed;
}
