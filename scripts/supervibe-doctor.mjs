#!/usr/bin/env node

import { diagnoseHosts, formatHostDoctorReport, HOST_IDS } from "./lib/supervibe-host-doctor.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  const result = await diagnoseHosts({
    rootDir: args.root || process.cwd(),
    homeDir: args.home || undefined,
    host: args.host || "all",
    strict: Boolean(args.strict),
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const noColor = args["no-color"] || !process.stdout.isTTY;
    console.log(formatHostDoctorReport(result, { color: !noColor }));
  }

  if (!result.pass) process.exitCode = 1;
} catch (err) {
  console.error(`SUPERVIBE_HOST_DOCTOR_ERROR: ${err.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--strict") parsed.strict = true;
    else if (arg === "--no-color") parsed["no-color"] = true;
    else if (arg.startsWith("--host=")) parsed.host = arg.slice("--host=".length);
    else if (arg === "--host") parsed.host = argv[++i];
    else if (arg.startsWith("--root=")) parsed.root = arg.slice("--root=".length);
    else if (arg === "--root") parsed.root = argv[++i];
    else if (arg.startsWith("--home=")) parsed.home = arg.slice("--home=".length);
    else if (arg === "--home") parsed.home = argv[++i];
  }
  return parsed;
}

function printHelp() {
  console.log([
    "SUPERVIBE_HOST_DOCTOR_HELP",
    "",
    "Usage:",
    "  npm run supervibe:doctor -- --host all",
    "  npm run supervibe:doctor -- --host codex --strict",
    "  npm run supervibe:doctor -- --host codex,cursor,opencode --json",
    "",
    "Hosts:",
    `  ${HOST_IDS.join(", ")}, all`,
    "",
    "Flags:",
    "  --host <id|all|a,b>   Host or host list to inspect. Default: all.",
    "  --strict              Treat missing local CLI/registration as failures.",
    "  --json                Print machine-readable JSON.",
    "  --root <path>         Plugin root. Default: current directory.",
    "  --home <path>         Home directory for local registration checks.",
    "  --no-color            Disable ANSI color.",
  ].join("\n"));
}
