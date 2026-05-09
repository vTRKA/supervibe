#!/usr/bin/env node
import { createTaskTrackerPrimeSummary, formatTaskTrackerPrimeHookOutput, formatTaskTrackerPrimeReminder } from "../lib/supervibe-task-tracker-prime.mjs";
import { resolveSupervibeProjectRoot } from "../lib/supervibe-plugin-root.mjs";

async function main() {
  if (process.env.SUPERVIBE_TASK_TRACKER_PRIME_DISABLED === "1") {
    process.stdout.write(JSON.stringify({}));
    return;
  }
  const rootDir = resolveSupervibeProjectRoot();
  const summary = await createTaskTrackerPrimeSummary({ rootDir });
  if (process.env.SUPERVIBE_TASK_TRACKER_PRIME_TEXT === "1" || process.argv.includes("--text")) {
    const reminder = formatTaskTrackerPrimeReminder(summary);
    if (reminder) process.stdout.write(`${reminder}\n`);
    return;
  }
  process.stdout.write(JSON.stringify(formatTaskTrackerPrimeHookOutput(summary)));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}));
});
