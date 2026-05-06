import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  resolveSupervibePluginRoot,
  resolveSupervibeProjectRoot,
} from "./supervibe-plugin-root.mjs";

function parseCliRootArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!String(item).startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || String(value).startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = value;
    index += 1;
  }
  return out;
}

export function resolveCliRoots({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  scriptPluginRoot = "",
} = {}) {
  const args = parseCliRootArgs(argv);
  const projectRoot = resolve(args["project-root"] || args.project || args.root || resolveSupervibeProjectRoot({ env, cwd }));
  const pluginRoot = resolve(args["plugin-root"] || resolveSupervibePluginRoot({ env, cwd: scriptPluginRoot || cwd }));
  const root = resolve(args.root || args["project-root"] || args.project || projectRoot);
  return {
    args,
    root,
    projectRoot,
    pluginRoot,
  };
}

export function resolvePluginContentRoot({
  rootDir = process.cwd(),
  pluginRoot = "",
  requiredDir = "commands",
} = {}) {
  const root = resolve(rootDir || process.cwd());
  if (existsSync(join(root, requiredDir))) return root;
  const plugin = pluginRoot ? resolve(pluginRoot) : "";
  if (plugin && existsSync(join(plugin, requiredDir))) return plugin;
  return root;
}
