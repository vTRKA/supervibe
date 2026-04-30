import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  formatEvalHarnessReport,
  runAutonomousLoopEvals,
  validateLiveEvalOptions,
  writeEvalReport,
} from "../scripts/lib/autonomous-loop-eval-harness.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("eval harness replays selected corpus cases and writes redacted reports", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-eval-"));
  const outPath = join(dir, "eval-report.json");
  const report = await runAutonomousLoopEvals({ rootDir: ROOT, caseId: "plan-review-loop", writeReportPath: outPath });
  const written = await writeEvalReport(join(dir, "manual-report.json"), report);

  assert.equal(report.pass, true);
  assert.equal(report.summary.total, 1);
  assert.match(formatEvalHarnessReport(report), /SUPERVIBE_LOOP_EVAL/);
  assert.match(await readFile(outPath, "utf8"), /plan-review-loop/);
  assert.ok(written.bytes > 0);
});

test("live eval mode is explicitly budget gated and never updates golden outcomes", async () => {
  const blocked = await runAutonomousLoopEvals({ rootDir: ROOT, live: true, caseId: "worktree-run" });
  const allowed = validateLiveEvalOptions({ maxRuntimeMinutes: 30, maxIterations: 3, providerBudget: 1 });

  assert.equal(blocked.blocked, true);
  assert.ok(blocked.issues.some((issue) => /max-runtime-minutes/.test(issue)));
  assert.equal(allowed.pass, true);
});

test("loop eval CLI and status eval-report command expose local reports", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-eval-cli-"));
  const outPath = join(dir, "latest-report.json");
  const cli = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--eval",
    "--case",
    "docs-only-change",
    "--out",
    outPath,
  ], { cwd: ROOT });
  const status = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-status.mjs"),
    "--eval-report",
    "--file",
    outPath,
    "--no-color",
  ], { cwd: ROOT });

  assert.match(cli.stdout, /PASS: true/);
  assert.match(status.stdout, /docs-only-change/);
});
