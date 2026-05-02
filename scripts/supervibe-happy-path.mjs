#!/usr/bin/env node

import { createHappyPathPlan, formatHappyPathPlan } from "./lib/supervibe-happy-path.mjs";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log([
    "SUPERVIBE_HAPPY_PATH_HELP",
    "Usage:",
    "  npm run supervibe:happy-path -- --plan .supervibe/artifacts/plans/example.md",
    "  npm run supervibe:happy-path -- --from-prd .supervibe/artifacts/specs/example.md",
    "  npm run supervibe:happy-path -- --request \"build checkout\"",
    "",
    "Prints the PRD/plan -> atomize -> execute -> verify -> close/archive path.",
  ].join("\n"));
  process.exit(0);
}

const plan = createHappyPathPlan({
  prdPath: args["from-prd"] || args.prd,
  planPath: args.plan,
  request: args.request || args._.join(" "),
  epicId: args.epic || "<epic-id>",
  graphPath: args.file,
  maxDuration: args["max-duration"] || "3h",
  tool: args.tool || "codex",
  dryRun: !args.apply,
});

if (args.json) console.log(JSON.stringify(plan, null, 2));
else console.log(formatHappyPathPlan(plan));

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--json") parsed.json = true;
    else if (arg === "--apply") parsed.apply = true;
    else if (!arg.startsWith("--")) parsed._.push(arg);
    else {
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
