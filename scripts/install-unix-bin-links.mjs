#!/usr/bin/env node

import { chmod, lstat, mkdir, readFile, readlink, symlink, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_ROOT = fileURLToPath(new URL("../", import.meta.url));

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const report = await installUnixBinLinks({
    pluginRoot: args["plugin-root"] || process.env.SUPERVIBE_PLUGIN_ROOT || SCRIPT_ROOT,
    binDir: args["bin-dir"] || process.env.SUPERVIBE_BIN_DIR || join(homedir(), ".local", "bin"),
    dryRun: Boolean(args["dry-run"]),
    env: process.env,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatUnixBinLinksReport(report));
  }
  if (!report.pass) process.exitCode = 1;
}

export async function installUnixBinLinks({
  pluginRoot,
  binDir,
  dryRun = false,
  env = process.env,
} = {}) {
  const root = resolve(pluginRoot || SCRIPT_ROOT);
  const targetDir = resolve(binDir || join(homedir(), ".local", "bin"));
  const packageJson = await readPackageJson(root);
  const bin = packageJson.bin || {};
  const links = [];

  if (!dryRun) await mkdir(targetDir, { recursive: true });

  for (const [name, relativeTarget] of Object.entries(bin).sort(([a], [b]) => a.localeCompare(b))) {
    const target = resolve(root, relativeTarget);
    const link = join(targetDir, name);
    const exists = existsSync(target);
    let status = exists ? "create" : "missing-target";
    let existingTarget = null;
    let ok = exists;

    if (exists) {
      try {
        await chmod(target, 0o755);
      } catch {
        // chmod is best-effort on non-POSIX filesystems.
      }

      const existing = await readExistingLink(link);
      if (existing.exists) {
        if (existing.isSymlink) {
          status = "replace-symlink";
          existingTarget = existing.target;
        } else {
          status = "skip-existing-file";
          ok = false;
        }
      }

      if (!dryRun && ok) {
        await mkdir(dirname(link), { recursive: true });
        if (status === "replace-symlink") await unlink(link);
        await symlink(target, link, "file");
      }
    }

    links.push({
      name,
      link,
      target,
      status,
      ok,
      existingTarget,
    });
  }

  const failures = links.filter((link) => !link.ok);
  const pathReady = pathContains(targetDir, env.PATH || env.Path || "");
  return {
    pass: failures.length === 0,
    dryRun,
    pluginRoot: root,
    binDir: targetDir,
    pathReady,
    nextPathExport: pathReady ? null : `export PATH="${targetDir}:$PATH"`,
    total: links.length,
    linked: links.filter((link) => link.ok).length,
    skipped: failures.length,
    links,
  };
}

export function formatUnixBinLinksReport(report) {
  const lines = [
    "SUPERVIBE_UNIX_BIN_LINKS",
    `PASS: ${report.pass}`,
    `DRY_RUN: ${report.dryRun}`,
    `BIN_DIR: ${report.binDir}`,
    `TOTAL: ${report.total}`,
    `LINKED: ${report.linked}`,
    `SKIPPED: ${report.skipped}`,
    `PATH_READY: ${report.pathReady}`,
  ];
  if (report.nextPathExport) lines.push(`NEXT_PATH_EXPORT: ${report.nextPathExport}`);
  for (const link of report.links || []) {
    lines.push(`- ${link.name}: ${link.status} -> ${link.target}`);
  }
  return lines.join("\n");
}

async function readPackageJson(root) {
  return JSON.parse(await readFile(join(root, "package.json"), "utf8"));
}

async function readExistingLink(path) {
  try {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) return { exists: true, isSymlink: false, target: null };
    return { exists: true, isSymlink: true, target: await readlink(path) };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, isSymlink: false, target: null };
    throw error;
  }
}

function pathContains(dir, pathValue) {
  const normalized = normalizePath(dir);
  return String(pathValue || "")
    .split(delimiter)
    .filter(Boolean)
    .some((entry) => normalizePath(resolve(entry)) === normalized);
}

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function isMain() {
  return process.argv[1] ? resolve(process.argv[1]) === SCRIPT_PATH : false;
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(["dry-run", "json", "no-color"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) {
      parsed[key] = true;
    } else {
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}
