#!/usr/bin/env node
import { join, resolve } from "node:path";
import { runAutonomousLoop, resumeAutonomousLoop, stopAutonomousLoop } from "./lib/autonomous-loop-runner.mjs";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["dry-run", "status"].includes(key)) {
      args[key] = true;
    } else {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();

  if (args.status) {
    const stateFile = args.file || join(rootDir, ".claude", "memory", "loops", args.loop || "", "state.json");
    const result = await runAutonomousLoop({ rootDir, statusFile: stateFile });
    console.log(result.statusText);
    return;
  }

  if (args.resume) {
    const result = await resumeAutonomousLoop(resolve(rootDir, args.resume));
    console.log(`Resume status: ${result.status}`);
    return;
  }

  if (args.stop) {
    const stateFile = args.file || join(rootDir, ".claude", "memory", "loops", args.stop, "state.json");
    const state = await stopAutonomousLoop(stateFile);
    console.log(`Stopped ${state.run_id}: ${state.stop_reason}`);
    return;
  }

  const positionalRequest = args.request || args._.join(" ");
  const result = await runAutonomousLoop({
    rootDir,
    plan: args.plan,
    request: args.plan ? positionalRequest || undefined : positionalRequest || "validate integrations",
    dryRun: Boolean(args["dry-run"]),
    fixture: args.fixture,
    maxLoops: args["max-loops"],
    maxRuntimeMinutes: args["max-runtime-minutes"],
    environmentTarget: args.environment,
  });

  console.log("SUPERVIBE_LOOP_STATUS");
  console.log(`STATUS: ${result.status}`);
  console.log(`RUN_ID: ${result.runId}`);
  console.log(`CONFIDENCE: ${result.finalScore}`);
  console.log(`STOP_REASON: ${result.stopReason || "none"}`);
  console.log(`REPORT: ${result.reportPath}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
