import assert from "node:assert/strict";
import test from "node:test";

import { filterCleanupContextItems } from "../scripts/lib/supervibe-context-pack.mjs";

test("default context excludes archivable cold trash and unclassified cleanup lifecycle artifacts", () => {
  const reachability = {
    byPath: new Map([
      [".supervibe/artifacts/plans/current.md", { lifecycleClass: "hot" }],
      [".supervibe/memory/work-items/closed/graph.json", { lifecycleClass: "archivable" }],
      [".supervibe/.archive/gc/old.json", { lifecycleClass: "cold" }],
      [".supervibe/logs/runtime.log", { lifecycleClass: "trash" }],
      [".supervibe/unknown.bin", { lifecycleClass: "unclassified" }],
    ]),
  };
  const items = [
    { path: ".supervibe/artifacts/plans/current.md" },
    { path: ".supervibe/memory/work-items/closed/graph.json" },
    { path: ".supervibe/.archive/gc/old.json" },
    { path: ".supervibe/logs/runtime.log" },
    { path: ".supervibe/unknown.bin" },
  ];
  assert.deepEqual(filterCleanupContextItems(items, { reachability }).map((item) => item.path), [".supervibe/artifacts/plans/current.md"]);
  assert.equal(filterCleanupContextItems(items, { reachability, includeHistory: true }).length, 5);
});


test("default context filter treats unclassified supervibe paths as noise without reachability", () => {
  const items = [
    { path: ".supervibe/memory/work-items/epic/graph.json" },
    { path: ".supervibe/artifacts/tmp-plan-review.md" },
    { path: ".supervibe/memory/artifact-snapshots/snapshot.json" },
    { path: ".supervibe/random-output.json" },
    { path: "src/app.ts" },
  ];

  assert.deepEqual(filterCleanupContextItems(items).map((item) => item.path), [
    ".supervibe/memory/work-items/epic/graph.json",
    "src/app.ts",
  ]);
});
