import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import test from "node:test";

import {
  createHappyPathPlan,
  formatHappyPathPlan,
} from "../scripts/lib/supervibe-happy-path.mjs";

const execFileAsync = promisify(execFile);

test("happy path exposes guided phases with Supervibe guardrails", () => {
  const plan = createHappyPathPlan({
    planPath: ".supervibe/artifacts/plans/example.md",
    epicId: "epic-example",
    tool: "codex",
  });
  assert.deepEqual(plan.phases.map((phase) => phase.id), [
    "prd-plan",
    "atomize",
    "inspect",
    "context",
    "execute",
    "verify",
    "archive",
  ]);
  assert.match(formatHappyPathPlan(plan), /supervibe:ui/);
  assert.match(formatHappyPathPlan(plan), /supervibe:gc/);
});

test("happy path CLI and loop alias print the same product path", async () => {
  const cli = await execFileAsync(process.execPath, [
    join(process.cwd(), "scripts", "supervibe-happy-path.mjs"),
    "--plan",
    ".supervibe/artifacts/plans/example.md",
    "--epic",
    "epic-example",
  ], { cwd: process.cwd() });
  assert.match(cli.stdout, /SUPERVIBE_HAPPY_PATH/);
  assert.match(cli.stdout, /Atomize/);

  const loop = await execFileAsync(process.execPath, [
    join(process.cwd(), "scripts", "supervibe-loop.mjs"),
    "--happy-path",
    "--plan",
    ".supervibe/artifacts/plans/example.md",
  ], { cwd: process.cwd() });
  assert.match(loop.stdout, /SUPERVIBE_HAPPY_PATH/);
  assert.match(loop.stdout, /Close\/Archive/);
});
