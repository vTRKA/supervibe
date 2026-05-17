#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));

if (isEntrypoint()) {
  const result = registerOpenCodePlugin({
    configPath: args.config || process.env.OPENCODE_CONFIG,
    pluginRef: args.plugin || process.env.SUPERVIBE_OPENCODE_PLUGIN || "supervibe@git+https://github.com/vTRKA/supervibe.git#main",
  });
  console.log(`[supervibe:opencode] refreshed ${result.configPath}`);
}

export function registerOpenCodePlugin({ configPath, pluginRef } = {}) {
  if (!configPath) throw new Error("Missing --config path for OpenCode registration");
  const targetPath = resolve(configPath);
  mkdirSync(dirname(targetPath), { recursive: true });
  const config = readJsoncObject(targetPath);
  const existing = Array.isArray(config.plugin) ? config.plugin.map(String) : [];
  config.plugin = [pluginRef, ...existing.filter((entry) => !entry.startsWith("supervibe@"))];
  writeFileSync(targetPath, `${JSON.stringify(config, null, 2)}
`, "utf8");
  return { configPath: targetPath, pluginRef };
}

function readJsoncObject(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(stripJsonCommentsAndTrailingCommas(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("config root must be an object");
    return parsed;
  } catch (error) {
    throw new Error(`${path} is not valid JSON/JSONC that Supervibe can update: ${error.message}`);
  }
}

function stripJsonCommentsAndTrailingCommas(source) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (inString) {
      out += ch;
      escaped = !escaped && ch === "\\";
      if (ch === "\"" && !escaped) inString = false;
      if (ch !== "\\") escaped = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && !/\r|\n/.test(source[i])) i += 1;
      out += source[i] || "";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, ...rest] = arg.slice(2).split("=");
      parsed[key] = rest.join("=");
    } else if (arg.startsWith("--")) {
      parsed[arg.slice(2)] = argv[++i];
    }
  }
  return parsed;
}

function isEntrypoint() {
  return process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/register-opencode-plugin.mjs");
}
