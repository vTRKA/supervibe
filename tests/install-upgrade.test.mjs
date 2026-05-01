import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createUpgradeDryRun,
  formatInstallerHealthReport,
  runInstallerHealthGate,
} from "../scripts/lib/supervibe-installer-health.mjs";

test("installer health blocks inconsistent plugin layout", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-install-broken-"));
  try {
    await mkdir(join(rootDir, ".claude-plugin"), { recursive: true });
    await writeFile(join(rootDir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "supervibe", version: "0.0.0", commands: "./commands", skills: "./skills" }));
    await writeFile(join(rootDir, "package.json"), JSON.stringify({ scripts: { check: "node missing.js" } }));

    const health = runInstallerHealthGate({ rootDir });

    assert.equal(health.pass, false, "install health did not block inconsistent plugin layout");
    assert.match(formatInstallerHealthReport(health), /install health did not block inconsistent plugin layout|missing/);
    assert.ok(health.issues.some((issue) => issue.code === "missing-command"));
    assert.ok(health.issues.some((issue) => issue.code === "missing-skill"));
    assert.ok(health.issues.some((issue) => issue.code === "missing-package-script"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("current checkout passes installer health", () => {
  const health = runInstallerHealthGate({ rootDir: process.cwd() });

  assert.equal(health.pass, true, formatInstallerHealthReport(health));
  assert.equal(health.required.commandFiles.length > 0, true);
});

test("upgrade dry-run includes backup, rollback and user-facing risks", () => {
  const dryRun = createUpgradeDryRun({
    rootDir: process.cwd(),
    currentVersion: "2.0.16",
    targetVersion: "2.0.16",
    plannedFiles: ["scripts/lib/supervibe-installer-health.mjs"],
  });

  assert.equal(dryRun.dryRun, true);
  assert.ok(dryRun.backupPath.includes(".supervibe"));
  assert.match(dryRun.rollbackCommand, /supervibe-upgrade(?:\.mjs)? --rollback/);
  assert.ok(dryRun.risks.length > 0);
});
