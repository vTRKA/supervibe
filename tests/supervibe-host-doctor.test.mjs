import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  diagnoseHosts,
  formatHostDoctorReport,
  normalizeRequestedHosts,
} from "../scripts/lib/supervibe-host-doctor.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

test("host doctor validates current multi-host package surfaces without local host installs", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-host-home-"));
  const result = await diagnoseHosts({
    rootDir: ROOT,
    homeDir,
    host: "codex,cursor,gemini,opencode,copilot",
    commandExists: async () => false,
  });

  assert.equal(result.pass, true);
  assert.equal(result.packageVersion, "2.0.9");
  assert.equal(result.hosts.length, 5);
  assert.ok(result.hosts.every((host) => host.pass), "default mode should warn, not fail, when local CLIs are absent");

  const codex = result.hosts.find((host) => host.host === "codex");
  assert.ok(codex.checks.some((check) => check.id === "manifest-version" && check.status === "pass"));
  assert.ok(codex.checks.some((check) => check.id === "local-registration" && check.status === "warn"));

  const opencode = result.hosts.find((host) => host.host === "opencode");
  assert.ok(opencode.checks.some((check) => check.id === "opencode-skills-hook" && check.status === "pass"));
  assert.ok(opencode.checks.some((check) => check.id === "auto-update" && check.status === "info"));

  const copilot = result.hosts.find((host) => host.host === "copilot");
  assert.ok(copilot.checks.some((check) => check.id === "fresh-context-adapter" && check.status === "info"));
});

test("strict host doctor fails when Codex CLI and registration are absent", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-host-home-"));
  const result = await diagnoseHosts({
    rootDir: ROOT,
    homeDir,
    host: "codex",
    strict: true,
    commandExists: async () => false,
  });

  assert.equal(result.pass, false);
  const checks = result.hosts[0].checks;
  assert.ok(checks.some((check) => check.id === "cli-command" && check.status === "fail"));
  assert.ok(checks.some((check) => check.id === "local-registration" && check.status === "fail"));
});

test("host doctor accepts Claude manifest agents as path arrays", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-host-home-"));
  const result = await diagnoseHosts({
    rootDir: ROOT,
    homeDir,
    host: "claude",
    commandExists: async () => false,
  });

  const checks = result.hosts[0].checks;
  assert.ok(checks.some((check) => check.id === "manifest-agents" && check.status === "pass" && /paths/.test(check.message)));
});


test("host doctor text report is stable and actionable", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-host-home-"));
  const result = await diagnoseHosts({
    rootDir: ROOT,
    homeDir,
    host: "gemini",
    commandExists: async () => false,
  });
  const report = formatHostDoctorReport(result, { color: false });

  assert.match(report, /SUPERVIBE_HOST_DOCTOR/);
  assert.match(report, /GEMINI - Gemini CLI: PASS/);
  assert.match(report, /GEMINI\.md exists/);
  assert.match(report, /next:/);
});

test("host doctor rejects unknown host ids", () => {
  assert.throws(() => normalizeRequestedHosts("codex,unknown"), /Unknown host/);
});

test("host doctor CLI prints JSON report", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "supervibe-host-home-"));
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-doctor.mjs"),
    "--host",
    "opencode",
    "--home",
    homeDir,
    "--json",
  ], { cwd: ROOT });

  const result = JSON.parse(stdout);
  assert.equal(result.pass, true);
  assert.equal(result.hosts[0].host, "opencode");
  assert.ok(result.hosts[0].checks.some((check) => check.id === "opencode-plugin"));
});
