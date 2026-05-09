import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { installWindowsBinShims } from "../scripts/install-windows-bin-shims.mjs";

const ROOT = process.cwd();
const execFileAsync = promisify(execFile);

test("Windows bin shim installer dry-run covers every package bin alias", async () => {
  const binDir = await mkdtemp(join(tmpdir(), "supervibe-win-bin-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "install-windows-bin-shims.mjs"),
      "--plugin-root",
      ROOT,
      "--bin-dir",
      binDir,
      "--dry-run",
      "--json",
    ], { cwd: ROOT, env: { ...process.env, Path: "" } });
    const report = JSON.parse(stdout);
    const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

    assert.equal(report.pass, true);
    assert.equal(report.total, Object.keys(packageJson.bin).length);
    assert.equal(report.pathReady, false);
    assert.match(report.nextPathPowerShell, /SetEnvironmentVariable/);
    assert.ok(report.links.some((link) => link.name === "supervibe-adapt" && link.status === "create"));
    assert.ok(report.links.some((link) => link.name === "supervibe-update" && link.status === "create"));
  } finally {
    await rm(binDir, { recursive: true, force: true });
  }
});

test("Windows bin shim installer writes cmd and PowerShell wrappers for terminal aliases", async () => {
  const binDir = await mkdtemp(join(tmpdir(), "supervibe-win-bin-"));
  try {
    const report = await installWindowsBinShims({
      pluginRoot: ROOT,
      binDir,
      env: { Path: binDir },
    });

    assert.equal(report.pass, true);
    assert.equal(report.pathReady, true);

    const adaptCmd = await readFile(join(binDir, "supervibe-adapt.cmd"), "utf8");
    const updateCmd = await readFile(join(binDir, "supervibe-update.cmd"), "utf8");
    const rootCmd = await readFile(join(binDir, "supervibe.cmd"), "utf8");
    const adaptPs1 = await readFile(join(binDir, "supervibe-adapt.ps1"), "utf8");

    assert.match(adaptCmd, /Supervibe generated Windows command shim/);
    assert.match(adaptCmd, /supervibe-adapt %\*/);
    assert.match(updateCmd, /supervibe-update %\*/);
    assert.doesNotMatch(rootCmd, /supervibe %\*/);
    assert.match(adaptPs1, /'supervibe-adapt' @args/);

    const pathReport = await installWindowsBinShims({
      pluginRoot: ROOT,
      binDir,
      dryRun: true,
      env: { Path: [join(tmpdir(), "other"), binDir].join(delimiter) },
    });
    assert.equal(pathReport.pathReady, true);
  } finally {
    await rm(binDir, { recursive: true, force: true });
  }
});
