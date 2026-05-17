import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function read(relPath) {
  return readFile(join(ROOT, ...relPath.split("/")), "utf8");
}

test("command docs cover plan-to-work-graph-to-production-close happy path", async () => {
  const readme = await read("README.md");
  const loop = await read("commands/supervibe-loop.md");
  const plan = await read("commands/supervibe-plan.md");

  for (const text of [readme, loop, plan]) {
    assert.match(text, /loop-ready plan/i);
    assert.match(text, /atomize/i);
    assert.match(text, /work[- ]item graph|work graph|native graph/i);
    assert.match(text, /--user-approved-plan/);
  }

  assert.match(readme, /--validate-completion/);
  assert.match(readme, /--close-eligible/);
  assert.match(loop, /--claim-ready/);
  assert.match(loop, /--close-eligible/);
  assert.match(loop, /PRODUCTION_READY/);
  assert.match(plan, /fail-closed/i);
});

test("command docs cover invalid plan, graph drift, and completion blocker repair paths", async () => {
  const loop = await read("commands/supervibe-loop.md");
  const status = await read("commands/supervibe-status.md");

  assert.match(loop, /invalid plan repair/i);
  assert.match(loop, /graph drift repair/i);
  assert.match(loop, /completion blocker repair/i);
  assert.match(loop, /--allow-dry-run-evidence/);
  assert.match(loop, /--no-evidence-required/);
  assert.match(status, /--ready/);
  assert.match(status, /--blocked/);
  assert.match(status, /--stale/);
  assert.match(status, /--orphan/);
  assert.match(status, /SUPERVIBE_ACTIVE_WORK_GRAPH/);
  assert.match(status, /NEXT_ACTION/);
});
