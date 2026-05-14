#!/usr/bin/env node
import {
  buildMemorySafeNodeOptions,
  buildRequestedMemorySafeNodeOptions,
  formatMemorySafeReport,
  memorySafeUsage,
  parseMemorySafeCliArgs,
  runMemorySafeCommand,
} from "./lib/node-memory-safe-runner.mjs";

async function main() {
  const { options, commandArgs } = parseMemorySafeCliArgs(process.argv.slice(2), process.env);
  if (options.help) {
    console.log(memorySafeUsage());
    return;
  }
  if (!commandArgs.length) {
    console.error(memorySafeUsage());
    process.exitCode = 2;
    return;
  }

  const nodeOptionsReport = buildMemorySafeNodeOptions({
    existingNodeOptions: process.env.NODE_OPTIONS || "",
    requested: buildRequestedMemorySafeNodeOptions(options),
  });
  const report = formatMemorySafeReport({
    commandArgs,
    nodeOptionsReport,
    dryRun: options.dryRun,
  });

  if (options.dryRun) {
    console.log(report);
    return;
  }

  console.error(report);
  const child = runMemorySafeCommand({
    commandArgs,
    nodeOptionsReport,
  });

  child.on("error", (error) => {
    console.error(`node-memory-safe-run failed to start command: ${error.message}`);
    process.exit(1);
  });
  child.on("close", (code, signal) => {
    if (signal) {
      console.error(`node-memory-safe-run command exited from signal: ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(`node-memory-safe-run error: ${error.message}`);
  process.exit(1);
});
