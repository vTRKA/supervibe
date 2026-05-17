#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/register-gemini-hooks.mjs")) {
  const result = registerGeminiSessionHooks({
    geminiHome: args["gemini-home"] || process.env.GEMINI_HOME || join(homedir(), ".gemini"),
    pluginRoot: args["plugin-root"] || process.env.SUPERVIBE_PLUGIN_ROOT || process.cwd(),
    ifRegistered: Boolean(args["if-registered"]),
  });
  if (result.skipped) {
    console.log(`[supervibe:gemini-hooks] skipped: ${result.reason}`);
  } else {
    console.log(`[supervibe:gemini-hooks] refreshed ${result.settingsPath}`);
  }
}

export function registerGeminiSessionHooks({
  geminiHome = join(homedir(), ".gemini"),
  pluginRoot = process.cwd(),
  ifRegistered = false,
} = {}) {
  const home = resolve(geminiHome);
  const root = resolve(pluginRoot);
  const geminiMdPath = join(home, "GEMINI.md");
  if (ifRegistered && !isGeminiRegistered(geminiMdPath, root)) {
    return { skipped: true, reason: "Gemini registration marker not found", settingsPath: join(home, "settings.json") };
  }

  mkdirSync(home, { recursive: true });
  const settingsPath = join(home, "settings.json");
  const settings = readSettingsJson(settingsPath);
  settings.hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks)
    ? settings.hooks
    : {};

  settings.hooksConfig = settings.hooksConfig && typeof settings.hooksConfig === "object" && !Array.isArray(settings.hooksConfig)
    ? settings.hooksConfig
    : {};
  settings.hooksConfig.enabled = true;

  const scriptPath = join(root, "scripts", "hooks", "gemini-session-start.mjs");
  for (const reason of ["startup", "resume", "clear"]) {
    upsertGeminiHook(settings.hooks, "SessionStart", {
      matcher: reason,
      sequential: true,
      hooks: [geminiCommandHook(scriptPath, ["--reason", reason])],
    });
  }
  upsertGeminiHook(settings.hooks, "PreCompress", {
    sequential: true,
    hooks: [geminiCommandHook(scriptPath, ["--reason", "compact"])],
  });

  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return { skipped: false, settingsPath, pluginRoot: root };
}

export function geminiCommandHook(scriptPath, extraArgs = []) {
  return {
    type: "command",
    name: extraArgs.includes("compact") ? "supervibe-pre-compress" : "supervibe-session-start",
    command: ["node", quoteForShell(scriptPath), ...extraArgs.map(quoteForShell)].join(" "),
    timeout: 120000,
    description: "Bootstrap Supervibe code and memory indexes",
  };
}

function upsertGeminiHook(hooks, eventName, group) {
  const existing = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
  const reason = eventName === "SessionStart" ? String(group?.matcher || "") : "compact";
  const filtered = existing.filter((entry) => !hookGroupUsesSupervibeGeminiBridge(entry, reason, eventName));
  hooks[eventName] = [...filtered, group];
}

function hookGroupUsesSupervibeGeminiBridge(group, reason = "", eventName = "") {
  return Array.isArray(group?.hooks) && group.hooks.some((hook) => {
    const command = String(hook?.command || "");
    if (!command.includes("gemini-session-start.mjs")) return false;
    if (!reason) return true;
    if (eventName === "SessionStart" && String(group?.matcher || "").includes("|")) return true;
    return String(group?.matcher || "") === reason || command.includes(reason);
  });
}

function readSettingsJson(settingsPath) {
  if (!existsSync(settingsPath)) return {};
  const text = readFileSync(settingsPath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${settingsPath} is not valid JSON. Repair it before registering Gemini hooks: ${error.message}`);
  }
}

function isGeminiRegistered(geminiMdPath, pluginRoot) {
  if (!existsSync(geminiMdPath)) return false;
  const text = readFileSync(geminiMdPath, "utf8");
  const includeLine = `@${pluginRoot.replace(/\\/g, "/")}/GEMINI.md`;
  return text.includes("supervibe-plugin-include: do-not-edit") && normalizePath(text).includes(normalizePath(includeLine));
}

function quoteForShell(value) {
  return `"${String(value).replaceAll("\"", "\\\"")}"`;
}

function normalizePath(value = "") {
  return String(value || "").replace(/\\/g, "/");
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...rest] = arg.slice(2).split("=");
      parsed[key] = rest.join("=");
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) parsed[key] = argv[++i];
      else parsed[key] = true;
    }
  }
  return parsed;
}
