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
  "supervibe-execute-plan.md",
  "supervibe-genesis.md",
  "supervibe-loop.md",
  "supervibe-plan.md",
  "supervibe-presentation.md",
  "supervibe-preview.md",
  "supervibe-score.md",
  "supervibe-status.md",
  "supervibe-strengthen.md",
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
    (await readdir(join(ROOT, "docs", "internal-commands"))).filter((file) =>
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

test("loop internal docs preserve parser and no-tty status contract", async () => {
  const content = await readFile(join(ROOT, "docs", "internal-commands", "supervibe-loop.md"), "utf8");
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
  assert.match(stdout, /--assigned-task T1 --assigned-write-set src\/file\.ts/);
  assert.match(stdout, /--plan-waves docs\/plans\/example\.md/);
  assert.match(stdout, /--assign-ready --explain/);
});
