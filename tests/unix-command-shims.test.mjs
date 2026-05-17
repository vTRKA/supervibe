import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  assert.match(stdout, /REQUIRED_AGENTS: supervibe-orchestrator/);
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


test("root sv prime and work facade expose compact workflow actions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-terminal-work-"));
  try {
    const graphDir = join(rootDir, ".supervibe", "memory", "work-items", "epic-work");
    const graphPath = join(graphDir, "graph.json");
    await mkdir(graphDir, { recursive: true });
    await writeFile(graphPath, JSON.stringify({
      kind: "supervibe-work-item-graph",
      graph_id: "epic-work",
      epicId: "epic-work",
      items: [
        { itemId: "epic-work", type: "epic", status: "open", title: "Work", parentId: null, blocks: [], blockedBy: [] },
        { itemId: "task-1", type: "task", status: "ready", title: "Ready task sk-abc123def456ghi789", parentId: "epic-work", blocks: [], blockedBy: [] },
      ],
      tasks: [
        { id: "task-1", status: "ready", title: "Ready task sk-abc123def456ghi789", parentId: "epic-work", dependencies: [] },
      ],
      claims: [],
    }, null, 2) + "\n", "utf8");

    const show = await execFileAsync(process.execPath, [
      join(ROOT, "bin", "supervibe.mjs"),
      "work",
      "show",
      "task-1",
      "--file",
      graphPath,
      "--json",
    ], { cwd: rootDir });
    const showEnvelope = JSON.parse(show.stdout);
    assert.equal(showEnvelope.command, "sv work");
    assert.equal(showEnvelope.action, "show");
    assert.equal(showEnvelope.status, "ok");
    assert.equal(showEnvelope.taskId, "task-1");

    const discover = await execFileAsync(process.execPath, [
      join(ROOT, "bin", "supervibe.mjs"),
      "work",
      "discover",
      "Capture release evidence",
      "--from",
      "task-1",
      "--file",
      graphPath,
      "--dry-run",
      "--json",
    ], { cwd: rootDir });
    const discoverEnvelope = JSON.parse(discover.stdout);
    assert.equal(discoverEnvelope.action, "discover");
    assert.equal(discoverEnvelope.status, "ok");
    assert.match(discoverEnvelope.taskId, /capture-release-evidence/);
    await assert.rejects(access(graphPath + ".bak"), /ENOENT/);

    const prime = await execFileAsync(process.execPath, [
      join(ROOT, "bin", "supervibe.mjs"),
      "prime",
      "--json",
    ], { cwd: rootDir });
    const primePayload = JSON.parse(prime.stdout);
    assert.equal(primePayload.kind, "supervibe-prime-context");
    assert.equal(primePayload.epicId, "epic-work");
    assert.equal(primePayload.nextReady, "task-1");
    assert.doesNotMatch(prime.stdout, /sk-abc123def456ghi789/);
    assert.match(prime.stdout, /\[REDACTED\]/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("sv prime falls back to legacy loop state for non work-item files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-terminal-prime-loop-"));
  try {
    const runDir = join(rootDir, ".supervibe", "memory", "loops", "run-1");
    const statePath = join(runDir, "state.json");
    await mkdir(runDir, { recursive: true });
    await writeFile(statePath, JSON.stringify({
      run_id: "run-1",
      status: "active",
      preflight: { objective: "Legacy loop state" },
      items: [{ id: "not-work-item", type: "note" }],
      tasks: [{ id: "legacy-task", status: "ready" }],
      claims: [],
      gates: [],
      next_action: "dispatch",
    }, null, 2) + "\n", "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "bin", "supervibe.mjs"),
      "prime",
      "--file",
      statePath,
    ], { cwd: rootDir });

    assert.match(stdout, /^SUPERVIBE_LOOP_PRIME$/m);
    assert.doesNotMatch(stdout, /^SUPERVIBE_PRIME$/m);
    assert.match(stdout, /RUN_ID: run-1/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("terminal dispatcher exposes details-only workflow doctor", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-workflow-doctor-"));
  try {
    const graphDir = join(rootDir, ".supervibe", "memory", "work-items", "epic-doctor");
    await mkdir(graphDir, { recursive: true });
    await writeFile(join(rootDir, ".supervibe", "memory", "code.db"), "code-index", "utf8");
    await writeFile(join(rootDir, ".supervibe", "memory", "work-items", "index.json"), JSON.stringify({
      activeGraphPath: ".supervibe/memory/work-items/epic-doctor/graph.json",
    }, null, 2) + "\n", "utf8");
    await writeFile(join(graphDir, "graph.json"), JSON.stringify({ epicId: "epic-doctor", items: [] }, null, 2) + "\n", "utf8");
    await writeFile(join(graphDir, "graph.json.bak"), "backup", "utf8");
    await writeFile(join(rootDir, ".supervibe", "agent.trace.log"), "trace", "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "bin", "supervibe.mjs"),
      "doctor",
      "workflow",
      "--root",
      rootDir,
      "--active-graph",
      join(graphDir, "graph.json"),
    ], { cwd: rootDir });

    assert.match(stdout, /SUPERVIBE_WORKFLOW_DOCTOR/);
    assert.match(stdout, /USER_BLOCKING: false/);
    assert.match(stdout, /DEFAULT_AGENT_CONTEXT: include=hot exclude=warm,cold,trash/);
    assert.ok(stdout.includes("HOT_EXAMPLE: .supervibe/memory/work-items/epic-doctor/graph.json reason=active-work-graph"));
    assert.ok(stdout.includes("TRASH_EXAMPLE: .supervibe/memory/work-items/epic-doctor/graph.json.bak reason=backup-or-lock"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("status default hides deep index receipt and GC diagnostics", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-status-light-"));
  try {
    await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
    await writeFile(join(rootDir, ".supervibe", "memory", "code.db"), "not-a-sqlite-db", "utf8");

    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", "supervibe-status.mjs"),
      "--no-color",
    ], { cwd: rootDir, maxBuffer: 2 * 1024 * 1024 });

    assert.match(stdout, /Supervibe Status/);
    assert.doesNotMatch(stdout, /Code RAG|Code Graph/);
    assert.doesNotMatch(stdout, /SUPERVIBE_WORKFLOW_RECEIPT_RECOVERY|REPAIR_COMMAND|PRUNE_COMMAND/);
    assert.doesNotMatch(stdout, /SUPERVIBE_INDEX_CONFIG|Manual rebuild|Backfill candidates|SUPERVIBE_ARTIFACT_SNAPSHOT_STATUS/);
    assert.doesNotMatch(stdout, /RESTORE_COMMAND|CREATE_COMMAND|SUPERVIBE_GC_HINTS|ARTIFACT_TOP/);
    assert.match(stdout, /Workflow receipts: details hidden/);
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

  assert.match(stdout, /SUPERVIBE_UPDATE_HELP/);
  assert.match(stdout, /supervibe-update --check/);
  assert.match(stdout, /supervibe-update --dry-run/);
  assert.doesNotMatch(stdout, /\[supervibe:upgrade\] git fetch|\[supervibe:upgrade\] npm ci|npm run supervibe:upgrade/);
});

test("every macOS/Linux terminal alias has a non-destructive help path", async () => {
  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const aliases = Object.keys(packageJson.bin).filter((alias) => alias !== "supervibe").sort();

  assert.ok(aliases.length >= 20);
  assert.ok(aliases.includes("supervibe-stage"));
  assert.ok(aliases.includes("supervibe-validate"));
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
