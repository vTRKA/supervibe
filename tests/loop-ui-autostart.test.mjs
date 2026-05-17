import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { buildCommandPalette } from "../scripts/lib/supervibe-command-palette.mjs";
import { selectPaletteAction } from "../scripts/lib/supervibe-command-palette.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

const PLAN = `# Loop UI Implementation Plan

## Task 1: Show graph UI
**Files:**
- Modify: \`scripts/supervibe-loop.mjs\`
**Scope IDs:** A064
**Requirement IDs:** REQ-LOOP-UI-AUTO
**Contract rows touched:** C-UI, C-EPIC
**Estimated time:** 10min, confidence: high
**Rollback:** git revert <sha>
**Stop conditions:** stop if UI cannot be represented as a safe local sidecar.
**Acceptance Criteria:**
- Atomization prints a UI next action.
\`\`\`bash
node --test tests/loop-ui-autostart.test.mjs
\`\`\`
`;

test("fast-session atomization skips loop UI prompt unless auto-ui is requested", async () => {
  const temp = await mkdtemp(join(tmpdir(), "loop-ui-ask-"));
  try {
    const stdout = await runAtomize(temp, []);

    assert.match(stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(stdout, /EVIDENCE_MODE: fast-session/);
    assert.match(stdout, /AUTO_UI: skipped-fast-session/);
    assert.doesNotMatch(stdout, /SUPERVIBE_AUTO_UI/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("atomization can emit an auto UI dry-run launch plan", async () => {
  const temp = await mkdtemp(join(tmpdir(), "loop-ui-dry-run-"));
  try {
    const stdout = await runAtomize(temp, ["--auto-ui-dry-run", "--ui-port", "3997"]);

    assert.match(stdout, /SUPERVIBE_AUTO_UI/);
    assert.match(stdout, /STATUS: dry-run/);
    assert.match(stdout, /URL: http:\/\/127\.0\.0\.1:3997\//);
    assert.match(stdout, /GRAPH: .*graph\.json/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("atomization records explicit no-auto-ui opt-out", async () => {
  const temp = await mkdtemp(join(tmpdir(), "loop-ui-optout-"));
  try {
    const stdout = await runAtomize(temp, ["--no-auto-ui"]);

    assert.match(stdout, /SUPERVIBE_AUTO_UI/);
    assert.match(stdout, /STATUS: opted-out/);
    assert.match(stdout, /NEXT_ACTION: run \/supervibe-loop --status --file <graph\.json> --auto-ui-dry-run/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("command palette marks mutating actions as preview-first", () => {
  const palette = buildCommandPalette({
    index: [{ itemId: "ready-1", title: "Ready", effectiveStatus: "ready" }],
    selectedItemId: "ready-1",
    graphPath: ".supervibe/memory/work-items/epic/graph.json",
  });
  const close = palette.actions.find((action) => action.id === "close-selected-task");
  const claim = palette.actions.find((action) => action.id === "claim-next-task");

  assert.equal(close.previewFirst, true);
  assert.match(close.previewCommand, /--preview/);
  assert.equal(claim.previewFirst, true);
  assert.match(claim.previewCommand, /--preview/);
  const selected = selectPaletteAction(palette, "claim-next-task", { confirmed: true });
  assert.equal(selected.executable, false);
  assert.match(selected.reason, /preview acceptance required/);
  assert.match(selected.command, /--preview/);
});

async function runAtomize(temp, extraArgs) {
  const planPath = join(temp, "plan.md");
  await writeFile(planPath, PLAN, "utf8");
  const { stdout } = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-loop.mjs"),
    "--atomize-plan",
    planPath,
    "--plan-review-passed",
    "--allow-unverified-plan-review",
    "--out",
    join(temp, "out"),
    ...extraArgs,
  ], {
    cwd: temp,
    env: { ...process.env, SUPERVIBE_ALLOW_UNVERIFIED_PLAN_REVIEW: "1" },
  });
  return stdout;
}
