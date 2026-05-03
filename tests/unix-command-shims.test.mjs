import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const ROOT = process.cwd();
const execFileAsync = promisify(execFile);

test("terminal dispatcher runs CLI-backed Supervibe commands from macOS/Linux bin aliases", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "bin", "supervibe.mjs"),
    "supervibe-adapt",
    "--help",
  ], { cwd: ROOT });

  assert.match(stdout, /Supervibe adapt/);
  assert.match(stdout, /--dry-run/);
});

test("terminal dispatcher gives AI-only slash commands a deterministic fallback", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "bin", "supervibe.mjs"),
    "supervibe-brainstorm",
    "--help",
  ], { cwd: ROOT });

  assert.match(stdout, /SUPERVIBE_TERMINAL_COMMAND/);
  assert.match(stdout, /COMMAND: supervibe-brainstorm/);
  assert.match(stdout, /SLASH_COMMAND: \/supervibe-brainstorm/);
  assert.match(stdout, /AI_CLI_ONLY: true/);
  assert.match(stdout, /AGENT_DEFAULT_MODE: real-agents/);
  assert.match(stdout, /AGENT_PLAN_COMMAND: node <resolved-supervibe-plugin-root>\/scripts\/command-agent-plan\.mjs --command \/supervibe-brainstorm/);
  assert.match(stdout, /REQUIRED_AGENTS: .*product-manager.*systems-analyst/);
  assert.match(stdout, /AGENT_EMULATION_ALLOWED: false/);
});

test("terminal dispatcher runs design diagnostic status without starting slash workflow", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-design-status-"));
  try {
    const dsRoot = join(rootDir, ".supervibe", "artifacts", "prototypes", "_design-system");
    const prototypeRoot = join(rootDir, ".supervibe", "artifacts", "prototypes", "agent-chat");
    await import("node:fs/promises").then(async ({ mkdir, writeFile }) => {
      await mkdir(dsRoot, { recursive: true });
      await mkdir(prototypeRoot, { recursive: true });
      await writeFile(join(dsRoot, "design-flow-state.json"), JSON.stringify({
        design_system: {
          status: "approved",
          approved_sections: [
            "palette",
            "typography",
            "spacing-density",
            "radius-elevation",
            "motion",
            "component-set",
            "copy-language",
            "accessibility-platform",
          ],
        },
      }, null, 2), "utf8");
      await writeFile(join(prototypeRoot, "config.json"), JSON.stringify({ mode: "design-system-only" }, null, 2), "utf8");
    });

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "bin", "supervibe.mjs"),
      "supervibe-design",
      "status",
      "--slug",
      "agent-chat",
      "--root",
      rootDir,
    ], { cwd: ROOT });

    assert.match(stdout, /SUPERVIBE_DESIGN_STATUS/);
    assert.match(stdout, /PROTOTYPE_EXISTS: false/);
    assert.match(stdout, /HANDOFF_BLOCKED: true/);
    assert.doesNotMatch(stdout, /AI_CLI_ONLY: true/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});


test("terminal dispatcher does not execute mutating commands for --help", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "bin", "supervibe.mjs"),
    "supervibe-update",
    "--help",
  ], { cwd: ROOT });

  assert.match(stdout, /SUPERVIBE_TERMINAL_COMMAND/);
  assert.match(stdout, /COMMAND: supervibe-update/);
  assert.match(stdout, /RUNNABLE: true/);
  assert.match(stdout, /HELP_FORWARDED: false/);
  assert.doesNotMatch(stdout, /git fetch|npm ci|supervibe:upgrade/);
});

test("every macOS/Linux terminal alias has a non-destructive help path", async () => {
  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const aliases = Object.keys(packageJson.bin).filter((alias) => alias !== "supervibe").sort();

  assert.equal(aliases.length, 19);
  for (const alias of aliases) {
    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "bin", "supervibe.mjs"),
      alias,
      "--help",
    ], { cwd: ROOT, maxBuffer: 2 * 1024 * 1024 });
    assert.match(stdout, /SUPERVIBE_|Supervibe|Usage:/, alias);
  }
});

test("unix bin link installer dry-run covers every package bin alias", async () => {
  const binDir = await mkdtemp(join(tmpdir(), "supervibe-bin-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "install-unix-bin-links.mjs"),
      "--plugin-root",
      ROOT,
      "--bin-dir",
      binDir,
      "--dry-run",
      "--json",
    ], { cwd: ROOT });
    const report = JSON.parse(stdout);
    const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

    assert.equal(report.pass, true);
    assert.equal(report.total, Object.keys(packageJson.bin).length);
    assert.ok(report.links.some((link) => link.name === "supervibe-adapt" && link.status === "create"));
  } finally {
    await rm(binDir, { recursive: true, force: true });
  }
});
