import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);

const PUBLIC_COMMANDS = new Set([
  "supervibe.md",
  "supervibe-adapt.md",
  "supervibe-audit.md",
  "supervibe-brainstorm.md",
  "supervibe-design.md",
  "supervibe-doctor.md",
  "supervibe-execute-plan.md",
  "supervibe-gc.md",
  "supervibe-genesis.md",
  "supervibe-loop.md",
  "supervibe-plan.md",
  "supervibe-presentation.md",
  "supervibe-preview.md",
  "supervibe-score.md",
  "supervibe-security-audit.md",
  "supervibe-status.md",
  "supervibe-strengthen.md",
  "supervibe-ui.md",
  "supervibe-update.md",
]);

const INTERNAL_COMMANDS = new Set([
  "supervibe-changelog.md",
  "supervibe-debug.md",
  "supervibe-deploy.md",
  "supervibe-evaluate.md",
  "supervibe-memory-gc.md",
  "supervibe-override.md",
  "supervibe-test.md",
]);

test("published command surface contains only user-facing commands", async () => {
  const files = (await readdir(join(ROOT, "commands"))).filter((file) => file.endsWith(".md"));
  assert.deepStrictEqual(new Set(files), PUBLIC_COMMANDS);
});

test("internal command specs stay outside published commands directory", async () => {
  const publicFiles = new Set(
    (await readdir(join(ROOT, "commands"))).filter((file) => file.endsWith(".md")),
  );
  const internalFiles = new Set(
    (await readdir(join(ROOT, "references", "internal-commands"))).filter((file) =>
      file.endsWith(".md") && file !== "README.md"
    ),
  );

  for (const file of INTERNAL_COMMANDS) {
    assert.equal(publicFiles.has(file), false, `${file} must not be published as a slash command`);
    assert.equal(internalFiles.has(file), true, `${file} internal spec must be preserved`);
  }
});

test("loop command documents graph inspection surface", async () => {
  const content = await readFile(join(ROOT, "commands", "supervibe-loop.md"), "utf8");
  assert.match(content, /Primary path:/);
  assert.match(content, /--request "validate code/);
  assert.match(content, /--plan docs\/plans/);
  assert.match(content, /--from-prd docs\/specs/);
  assert.match(content, /--status --file/);
  assert.match(content, /--graph --file/);
  assert.match(content, /--format text/);
  assert.match(content, /doctor --file/);
  assert.match(content, /prime --file/);
  assert.match(content, /export --file/);
  assert.match(content, /import --file/);
  assert.match(content, /--fresh-context --tool codex/);
  assert.match(content, /--commit-per-task/);
  assert.match(content, /--assigned-task T1/);
  assert.match(content, /--assigned-write-set src\/auth\.ts/);
  assert.match(content, /--plan-waves docs\/plans\/example\.md/);
  assert.match(content, /--assign-ready --explain/);
  assert.match(content, /--setup-worker-presets/);
  assert.match(content, /npm run supervibe:loop -- graph/);
});

test("status command documents orchestration inspection surface", async () => {
  const content = await readFile(join(ROOT, "commands", "supervibe-status.md"), "utf8");
  assert.match(content, /--waves --file/);
  assert.match(content, /--assignment task-123/);
  assert.match(content, /assignment explanation/);
});

test("doctor command documents multi-host diagnostics", async () => {
  const content = await readFile(join(ROOT, "commands", "supervibe-doctor.md"), "utf8");
  assert.match(content, /--host codex/);
  assert.match(content, /Codex/);
  assert.match(content, /Cursor/);
  assert.match(content, /Gemini/);
  assert.match(content, /OpenCode/);
  assert.match(content, /supervibe:doctor/);
});

test("ui and gc commands document local work control plane", async () => {
  const ui = await readFile(join(ROOT, "commands", "supervibe-ui.md"), "utf8");
  assert.match(ui, /127\.0\.0\.1/);
  assert.match(ui, /Kanban/);
  assert.match(ui, /Context Pack/);
  assert.match(ui, /claim/);
  assert.match(ui, /preview/i);

  const gc = await readFile(join(ROOT, "commands", "supervibe-gc.md"), "utf8");
  assert.match(gc, /--work-items/);
  assert.match(gc, /--memory/);
  assert.match(gc, /--apply/);
  assert.match(gc, /--restore/);
  assert.match(gc, /dry-run/);
});

test("loop internal docs preserve parser and no-tty status contract", async () => {
  const content = await readFile(join(ROOT, "references", "internal-commands", "supervibe-loop.md"), "utf8");
  assert.match(content, /Parser Contract/);
  assert.match(content, /Default remains `dry-run`/);
  assert.match(content, /no-tty sessions/);
});

test("loop CLI help is plain text and lists primary plus advanced modes", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--help",
  ], { cwd: ROOT });
  assert.match(stdout, /SUPERVIBE_LOOP_HELP/);
  assert.match(stdout, /--from-prd docs\/specs\/example.md/);
  assert.match(stdout, /graph --file/);
  assert.match(stdout, /--fresh-context --tool codex\|claude\|gemini\|opencode/);
  assert.match(stdout, /--happy-path --plan docs\/plans\/example\.md/);
  assert.match(stdout, /--assigned-task T1 --assigned-write-set src\/file\.ts/);
  assert.match(stdout, /--plan-waves docs\/plans\/example\.md/);
  assert.match(stdout, /--assign-ready --explain/);
});

test("doctor CLI help is plain text and lists supported hosts", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-doctor.mjs"),
    "--help",
  ], { cwd: ROOT });
  assert.match(stdout, /SUPERVIBE_HOST_DOCTOR_HELP/);
  assert.match(stdout, /codex/);
  assert.match(stdout, /cursor/);
  assert.match(stdout, /opencode/);
  assert.match(stdout, /--strict/);
});

test("local ui, gc, and context-pack CLIs expose no-tty help", async () => {
  const cases = [
    ["supervibe-ui.mjs", /SUPERVIBE_UI_HELP/, /127\.0\.0\.1/],
    ["supervibe-ide-bridge.mjs", /SUPERVIBE_IDE_BRIDGE_HELP/, /webview/],
    ["supervibe-gc.mjs", /SUPERVIBE_GC_HELP/, /--work-items/],
    ["supervibe-work-items-gc.mjs", /SUPERVIBE_WORK_ITEM_GC_HELP/, /--include-stale-open/],
    ["supervibe-memory-gc.mjs", /SUPERVIBE_MEMORY_GC_HELP/, /--restore/],
    ["supervibe-context-pack.mjs", /SUPERVIBE_CONTEXT_PACK_HELP/, /--max-chars/],
    ["supervibe-context-eval.mjs", /SUPERVIBE_CONTEXT_EVAL_HELP/, /token budgets/],
    ["supervibe-happy-path.mjs", /SUPERVIBE_HAPPY_PATH_HELP/, /close\/archive/],
    ["supervibe-docs-audit.mjs", /SUPERVIBE_DOCS_AUDIT_HELP/, /deletion candidates/],
  ];
  for (const [script, marker, detail] of cases) {
    const { stdout } = await execFileAsync(process.execPath, [
      join(ROOT, "scripts", script),
      "--help",
    ], { cwd: ROOT });
    assert.match(stdout, marker);
    assert.match(stdout, detail);
  }
});
