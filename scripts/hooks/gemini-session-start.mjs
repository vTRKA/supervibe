#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(SCRIPT_DIR, "..", "..");
const args = parseArgs(process.argv.slice(2));

const input = await readStdinJson();
const projectRoot = resolve(input.cwd || process.env.SUPERVIBE_PROJECT_ROOT || process.cwd());
const reason = normalizeReason(args.reason || input.source || (input.trigger ? "compact" : "startup"));

const result = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "session-start-check.mjs")], {
  cwd: projectRoot,
  env: {
    ...process.env,
    SUPERVIBE_PLUGIN_ROOT: PLUGIN_ROOT,
    SUPERVIBE_PROJECT_ROOT: projectRoot,
    SUPERVIBE_HOST: "gemini",
    SUPERVIBE_SESSION_START_REASON: reason,
  },
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 8,
});

const message = [result.stdout, result.stderr]
  .map((part) => String(part || "").trim())
  .filter(Boolean)
  .join("\n")
  .trim();

const payload = message
  ? {
      systemMessage: truncate(message, 4000),
      hookSpecificOutput: {
        additionalContext: truncate(message, 6000),
      },
    }
  : { suppressOutput: true };

process.stdout.write(`${JSON.stringify(payload)}\n`);
process.exit(0);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--reason") parsed.reason = argv[++i];
    else if (arg.startsWith("--reason=")) parsed.reason = arg.slice("--reason=".length);
  }
  return parsed;
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function normalizeReason(value = "startup") {
  const normalized = String(value || "startup").trim().toLowerCase();
  return ["startup", "resume", "clear", "compact"].includes(normalized) ? normalized : "startup";
}

function truncate(value, max) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 32))}\n[supervibe] output truncated`;
}
