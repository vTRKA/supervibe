#!/usr/bin/env node
import { createTaskTrackerPrimeSummary, formatTaskTrackerPrimeHookOutput, formatTaskTrackerPrimeReminder } from "../lib/supervibe-task-tracker-prime.mjs";
import { resolveSupervibeProjectRoot } from "../lib/supervibe-plugin-root.mjs";

export const TASK_TRACKER_PRIME_DEFAULT_LIMIT = 5;
export const TASK_TRACKER_PRIME_COMPACT_LIMIT = 3;
export const TASK_TRACKER_PRIME_COMPACT_MAX_CHARS = 6000;

export function resolveTaskTrackerPrimeHookOptions({
  argv = process.argv.slice(2),
  env = process.env,
} = {}) {
  const compactContext = argv.includes("--compact-context") ||
    env.SUPERVIBE_CONTEXT_BOOTSTRAP === "1" ||
    env.SUPERVIBE_SESSION_START_REASON === "compact";
  return {
    text: env.SUPERVIBE_TASK_TRACKER_PRIME_TEXT === "1" || argv.includes("--text"),
    compactContext,
    limit: compactContext ? TASK_TRACKER_PRIME_COMPACT_LIMIT : TASK_TRACKER_PRIME_DEFAULT_LIMIT,
    maxChars: compactContext ? TASK_TRACKER_PRIME_COMPACT_MAX_CHARS : Infinity,
  };
}

export function compactTaskTrackerPrimeOutput(text, {
  maxChars = TASK_TRACKER_PRIME_COMPACT_MAX_CHARS,
} = {}) {
  if (!text || text.length <= maxChars) return text;
  const closing = "\n</system-reminder>";
  const notice = `\n[supervibe] context bootstrap trimmed to ${maxChars} chars.`;
  const withoutClosing = text.replace(/\n<\/system-reminder>\s*$/i, "");
  const sliceLength = Math.max(0, maxChars - closing.length - notice.length);
  return `${withoutClosing.slice(0, sliceLength).trimEnd()}${notice}${closing}`;
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
} = {}) {
  if (env.SUPERVIBE_TASK_TRACKER_PRIME_DISABLED === "1") {
    process.stdout.write(JSON.stringify({}));
    return;
  }
  const rootDir = resolveSupervibeProjectRoot();
  const options = resolveTaskTrackerPrimeHookOptions({ argv, env });
  const summary = await createTaskTrackerPrimeSummary({ rootDir, limit: options.limit });
  if (options.text) {
    const reminder = compactTaskTrackerPrimeOutput(formatTaskTrackerPrimeReminder(summary), {
      maxChars: options.maxChars,
    });
    if (reminder) process.stdout.write(`${reminder}\n`);
    return;
  }
  process.stdout.write(JSON.stringify(formatTaskTrackerPrimeHookOutput(summary)));
}

export function isTaskTrackerPrimeEntrypoint(argv = process.argv) {
  return String(argv[1] || "").replaceAll("\\", "/").endsWith("scripts/hooks/task-tracker-prime.mjs");
}

if (isTaskTrackerPrimeEntrypoint()) main().catch(() => {
  process.stdout.write(JSON.stringify({}));
});
