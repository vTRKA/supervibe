import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  applySavedView,
  BUILT_IN_WORK_ITEM_VIEWS,
  createSavedViewStore,
  defaultSavedViewsPath,
  exportSavedViewsForSyncBundle,
  formatSavedViewResult,
  listSavedViews,
  readSavedViewStore,
  resolveSavedView,
  saveCustomView,
  savedViewsToPaletteActions,
  suggestSavedViews,
  writeSavedViewStore,
} from "../scripts/lib/supervibe-work-item-saved-views.mjs";
import { createWorkItemIndex } from "../scripts/lib/supervibe-work-item-query.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function graph() {
  return {
    epicId: "views",
    items: [
      { itemId: "t1", title: "Risky release", status: "open", risk: "high", labels: ["release"] },
      { itemId: "t2", title: "Done", status: "complete", labels: ["done"] },
    ],
    tasks: [
      { id: "t1", status: "open", dependencies: [] },
      { id: "t2", status: "complete", dependencies: [] },
    ],
  };
}

test("saved views include built-ins, custom persistence, resolution, and portable export", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-views-"));
  const viewsPath = join(dir, "views.json");
  const store = saveCustomView(createSavedViewStore(), {
    name: "release-risk",
    query: "risk:high status:not-done sort:priority",
    displayColumns: ["itemId", "risk"],
  });
  await writeSavedViewStore(viewsPath, store);
  const loaded = await readSavedViewStore(viewsPath);
  const index = createWorkItemIndex({ graph: graph() });
  const result = applySavedView(index, "release-risk", loaded);

  assert.ok(BUILT_IN_WORK_ITEM_VIEWS.some((view) => view.name === "ready-now"));
  assert.match(defaultSavedViewsPath(dir), /work-item-views\.json$/);
  assert.ok(listSavedViews(loaded).some((view) => view.name === "release-risk"));
  assert.equal(resolveSavedView("release-risk", loaded).parsed.safe, true);
  assert.equal(result.items[0].itemId, "t1");
  assert.match(formatSavedViewResult(result), /release-risk/);
  assert.ok(suggestSavedViews("broad status").includes("ready-now"));
  assert.equal(exportSavedViewsForSyncBundle(loaded).portable, true);
  assert.ok(savedViewsToPaletteActions(loaded).some((action) => action.id === "view:release-risk"));
});

test("status CLI saves and applies custom views against a local graph", async () => {
  const dir = await mkdtemp(join(tmpdir(), "supervibe-views-cli-"));
  const graphPath = join(dir, "graph.json");
  const viewsPath = join(dir, "views.json");
  await writeFile(graphPath, JSON.stringify(graph()), "utf8");

  const save = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-status.mjs"),
    "--save-view",
    "release-risk",
    "--query",
    "risk:high status:not-done sort:priority",
    "--views-file",
    viewsPath,
    "--no-color",
  ], { cwd: ROOT });
  assert.match(save.stdout, /SUPERVIBE_SAVED_VIEW/);

  const view = await execFileAsync(process.execPath, [
    join(ROOT, "scripts", "supervibe-status.mjs"),
    "--view",
    "release-risk",
    "--file",
    graphPath,
    "--views-file",
    viewsPath,
    "--no-color",
  ], { cwd: ROOT });
  assert.match(view.stdout, /t1/);
  assert.match(await readFile(viewsPath, "utf8"), /release-risk/);
});
