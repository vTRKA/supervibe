import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  createOnboardingReport,
  createQuickstartPlan,
  formatOnboarding,
  formatQuickstart,
  generateShellCompletions,
} from "../scripts/lib/supervibe-shell-completions.mjs";

const execFileAsync = promisify(execFile);

test("shell completions include commands, modes, run IDs, epics, worktrees, and statuses", () => {
  const bash = generateShellCompletions({ shell: "bash", runIds: ["loop-1"], epics: ["epic-1"], worktrees: [".worktrees/e"], statuses: ["blocked"] });
  assert.match(bash, /--quickstart/);
  assert.match(bash, /loop-1/);
  assert.match(generateShellCompletions({ shell: "powershell" }), /Register-ArgumentCompleter/);
});

test("quickstart and onboard helpers are readable and CLI-accessible", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-quickstart-"));
  const plan = createQuickstartPlan({ rootDir: root });
  assert.match(formatQuickstart(plan), /SUPERVIBE_LOOP_QUICKSTART/);
  const report = createOnboardingReport({ rootDir: root, hasWorkItems: false, hasLoopState: false });
  assert.match(formatOnboarding(report), /SAFEST_FIRST_RUN/);

  const script = join(process.cwd(), "scripts", "supervibe-loop.mjs");
  const quickstart = await execFileAsync(process.execPath, [script, "--quickstart"], { cwd: root });
  assert.match(quickstart.stdout, /SUPERVIBE_LOOP_QUICKSTART/);
  const completion = await execFileAsync(process.execPath, [script, "--completion", "bash"], { cwd: root });
  assert.match(completion.stdout, /complete -W/);
});
