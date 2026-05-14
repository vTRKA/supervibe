import { spawn } from "node:child_process";

const DEFAULT_MAX_OLD_SPACE_MB = 4096;
const DEFAULT_HEAPSNAPSHOT_NEAR_HEAP_LIMIT = 3;

function nodeOptionName(flag = "") {
  return String(flag || "").split("=")[0];
}

function isNodeEnvironmentFlagSupported(flag, allowedFlags = process.allowedNodeEnvironmentFlags) {
  if (!allowedFlags || typeof allowedFlags.has !== "function") return false;
  const value = String(flag || "").trim();
  if (!value) return false;
  return allowedFlags.has(value) || allowedFlags.has(nodeOptionName(value));
}

export function tokenizeNodeOptions(value = "") {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of String(value || "")) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function hasNodeOption(tokens = [], optionName = "") {
  const wanted = nodeOptionName(optionName);
  return tokens.some((token) => token === wanted || token.startsWith(`${wanted}=`));
}

function normalizePositiveInteger(value, fallback, label = "value") {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

export function buildRequestedMemorySafeNodeOptions({
  maxOldSpaceMb = DEFAULT_MAX_OLD_SPACE_MB,
  heapsnapshotNearHeapLimit = DEFAULT_HEAPSNAPSHOT_NEAR_HEAP_LIMIT,
  heapProf = false,
} = {}) {
  return [
    maxOldSpaceMb ? `--max-old-space-size=${maxOldSpaceMb}` : null,
    heapsnapshotNearHeapLimit ? `--heapsnapshot-near-heap-limit=${heapsnapshotNearHeapLimit}` : null,
    heapProf ? "--heap-prof" : null,
  ].filter(Boolean);
}

export function buildMemorySafeNodeOptions({
  existingNodeOptions = "",
  requested = buildRequestedMemorySafeNodeOptions(),
  allowedFlags = process.allowedNodeEnvironmentFlags,
} = {}) {
  const existingTokens = tokenizeNodeOptions(existingNodeOptions);
  const added = [];
  const skipped = [];

  for (const flag of requested) {
    const name = nodeOptionName(flag);
    if (hasNodeOption(existingTokens, name)) {
      skipped.push({ flag, reason: "already-present" });
      continue;
    }
    if (!isNodeEnvironmentFlagSupported(flag, allowedFlags)) {
      skipped.push({ flag, reason: "unsupported-by-current-node" });
      continue;
    }
    added.push(flag);
  }

  const nodeOptions = [
    String(existingNodeOptions || "").trim(),
    ...added,
  ].filter(Boolean).join(" ").trim();

  return {
    requested,
    added,
    skipped,
    existingNodeOptions: String(existingNodeOptions || ""),
    nodeOptions,
  };
}

function buildMemorySafeEnvironment(env = process.env, nodeOptionsReport = buildMemorySafeNodeOptions()) {
  return {
    ...env,
    NODE_OPTIONS: nodeOptionsReport.nodeOptions,
    SUPERVIBE_NODE_MEMORY_SAFE: "1",
  };
}

export function executableForPlatform(name, platform = process.platform) {
  if (!name) return "";
  if (platform === "win32" && /^(npm|npx|pnpm|yarn)$/.test(name)) return `${name}.cmd`;
  return name;
}

export function parseMemorySafeCliArgs(argv = [], env = process.env) {
  const separator = argv.indexOf("--");
  const optionArgs = separator === -1 ? argv : argv.slice(0, separator);
  const commandArgs = separator === -1 ? [] : argv.slice(separator + 1);
  const options = {
    maxOldSpaceMb: normalizePositiveInteger(env.SUPERVIBE_NODE_MAX_OLD_SPACE_MB, DEFAULT_MAX_OLD_SPACE_MB, "SUPERVIBE_NODE_MAX_OLD_SPACE_MB"),
    heapsnapshotNearHeapLimit: normalizePositiveInteger(env.SUPERVIBE_NODE_HEAPSNAPSHOT_NEAR_LIMIT, DEFAULT_HEAPSNAPSHOT_NEAR_HEAP_LIMIT, "SUPERVIBE_NODE_HEAPSNAPSHOT_NEAR_LIMIT"),
    heapProf: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--heap-prof") {
      options.heapProf = true;
    } else if (arg === "--no-heap-prof") {
      options.heapProf = false;
    } else if (arg === "--no-max-old-space-size") {
      options.maxOldSpaceMb = null;
    } else if (arg === "--no-heapsnapshot-near-heap-limit") {
      options.heapsnapshotNearHeapLimit = null;
    } else if (arg === "--max-old-space-size") {
      options.maxOldSpaceMb = normalizePositiveInteger(readRequiredOptionValue(optionArgs, index), DEFAULT_MAX_OLD_SPACE_MB, "--max-old-space-size");
      index += 1;
    } else if (arg.startsWith("--max-old-space-size=")) {
      options.maxOldSpaceMb = normalizePositiveInteger(arg.slice("--max-old-space-size=".length), DEFAULT_MAX_OLD_SPACE_MB, "--max-old-space-size");
    } else if (arg === "--heapsnapshot-near-heap-limit") {
      options.heapsnapshotNearHeapLimit = normalizePositiveInteger(readRequiredOptionValue(optionArgs, index), DEFAULT_HEAPSNAPSHOT_NEAR_HEAP_LIMIT, "--heapsnapshot-near-heap-limit");
      index += 1;
    } else if (arg.startsWith("--heapsnapshot-near-heap-limit=")) {
      options.heapsnapshotNearHeapLimit = normalizePositiveInteger(arg.slice("--heapsnapshot-near-heap-limit=".length), DEFAULT_HEAPSNAPSHOT_NEAR_HEAP_LIMIT, "--heapsnapshot-near-heap-limit");
    } else {
      throw new Error(`Unknown node-memory-safe-run option: ${arg}`);
    }
  }

  return { options, commandArgs };
}

function readRequiredOptionValue(args = [], index = 0) {
  const value = args[index + 1];
  if (!value || String(value).startsWith("--")) throw new Error(`${args[index]} requires a value`);
  return value;
}

export function formatMemorySafeReport({
  commandArgs = [],
  nodeOptionsReport = buildMemorySafeNodeOptions(),
  dryRun = false,
  nodeVersion = process.version,
} = {}) {
  return [
    "SUPERVIBE_NODE_MEMORY_SAFE_RUN",
    `NODE_VERSION: ${nodeVersion}`,
    `DRY_RUN: ${dryRun === true}`,
    `COMMAND: ${commandArgs.length ? commandArgs.join(" ") : "none"}`,
    `NODE_OPTIONS_ADDED: ${nodeOptionsReport.added.length ? nodeOptionsReport.added.join(" ") : "none"}`,
    `NODE_OPTIONS_SKIPPED: ${nodeOptionsReport.skipped.length ? nodeOptionsReport.skipped.map((entry) => `${entry.flag}:${entry.reason}`).join(" ") : "none"}`,
    `NODE_OPTIONS_EFFECTIVE: ${nodeOptionsReport.nodeOptions || "none"}`,
  ].join("\n");
}

export function memorySafeUsage() {
  return [
    "Usage:",
    "  node scripts/node-memory-safe-run.mjs [options] -- <command> [args...]",
    "",
    "Options:",
    "  --max-old-space-size <mb>              Default: 4096",
    "  --heapsnapshot-near-heap-limit <n>     Default: 3",
    "  --heap-prof                            Add --heap-prof when supported by NODE_OPTIONS",
    "  --dry-run                              Print the supported option report without running command",
    "  --no-max-old-space-size                Do not add a V8 old-space cap",
    "  --no-heapsnapshot-near-heap-limit      Do not add near-limit heap snapshots",
  ].join("\n");
}

export function runMemorySafeCommand({
  commandArgs = [],
  env = process.env,
  cwd = process.cwd(),
  stdio = "inherit",
  platform = process.platform,
  nodeOptionsReport = buildMemorySafeNodeOptions({ existingNodeOptions: env.NODE_OPTIONS || "" }),
} = {}) {
  if (!commandArgs.length) throw new Error("A command after -- is required");
  const [command, ...args] = commandArgs;
  const child = spawn(executableForPlatform(command, platform), args, {
    cwd,
    env: buildMemorySafeEnvironment(env, nodeOptionsReport),
    stdio,
    shell: false,
    windowsHide: false,
  });
  return child;
}
