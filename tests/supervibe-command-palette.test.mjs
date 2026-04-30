import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommandPalette,
  COMMAND_PALETTE_ACTION_IDS,
  formatCommandPalette,
  selectPaletteAction,
} from "../scripts/lib/supervibe-command-palette.mjs";

const index = [
  { itemId: "ready-1", title: "Ready", effectiveStatus: "ready" },
  { itemId: "blocked-1", title: "Blocked", effectiveStatus: "blocked" },
];

test("command palette exposes required actions and exact non-interactive commands", () => {
  const palette = buildCommandPalette({
    index,
    state: { run_id: "run1" },
    planPath: "docs/plans/example.md",
    graphPath: ".claude/memory/work-items/epic/graph.json",
    selectedItemId: "ready-1",
  });

  for (const id of COMMAND_PALETTE_ACTION_IDS) assert.ok(palette.actions.some((action) => action.id === id), id);
  assert.match(formatCommandPalette(palette), /view-ready-work: ready -> \/supervibe-status --view ready-now/);
  assert.match(palette.actions.find((action) => action.id === "atomize-plan").command, /--preview/);
});

test("command palette explains blocked actions and requires confirmation for mutations", () => {
  const palette = buildCommandPalette({ index: [], state: {}, planPath: null });
  const blocked = selectPaletteAction(palette, "claim-next-task");
  const create = selectPaletteAction(buildCommandPalette({ index }), "create-work-item");
  const stop = selectPaletteAction(buildCommandPalette({ state: { run_id: "run1" } }), "stop-run", { yes: true });

  assert.equal(blocked.executable, false);
  assert.match(blocked.reason, /no ready task/);
  assert.equal(create.executable, false);
  assert.match(create.reason, /confirmation required/);
  assert.equal(stop.executable, false);
  assert.match(stop.reason, /--yes/);
});
