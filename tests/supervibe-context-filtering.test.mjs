import assert from "node:assert/strict";
import test from "node:test";

import { filterCleanupContextItems } from "../scripts/lib/supervibe-context-pack.mjs";

test("default context excludes cold trash and unclassified cleanup lifecycle artifacts", () => {
  const reachability = {
    byPath: new Map([
      [".supervibe/artifacts/plans/current.md", { lifecycleClass: "hot" }],
      [".supervibe/.archive/gc/old.json", { lifecycleClass: "cold" }],
      [".supervibe/logs/runtime.log", { lifecycleClass: "trash" }],
      [".supervibe/unknown.bin", { lifecycleClass: "unclassified" }],
    ]),
  };
  const items = [
    { path: ".supervibe/artifacts/plans/current.md" },
    { path: ".supervibe/.archive/gc/old.json" },
    { path: ".supervibe/logs/runtime.log" },
    { path: ".supervibe/unknown.bin" },
  ];
  assert.deepEqual(filterCleanupContextItems(items, { reachability }).map((item) => item.path), [".supervibe/artifacts/plans/current.md"]);
  assert.equal(filterCleanupContextItems(items, { reachability, includeHistory: true }).length, 4);
});
