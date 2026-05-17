import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSmallDeltaAutorepairPlan,
} from "../scripts/lib/supervibe-index-autorepair.mjs";

test("index autorepair plan emits embeddings-only step for semantic gaps", () => {
  const plan = buildSmallDeltaAutorepairPlan({
    report: {
      files: [{ relPath: "src/main.ts", reason: "embedding-missing", language: "typescript" }],
      indexedRows: 1,
      inventory: { files: [{ relPath: "src/main.ts" }] },
    },
    rootArg: ".",
    includeStructure: true,
    smallDeltaLimit: 5,
    jsonProgress: false,
  });

  assert.equal(plan.status, "planned");
  assert.deepEqual(plan.commands.map((item) => item.id), ["semantic-embeddings"]);
  assert.match(plan.commands[0].command, /--embeddings-only/);
  assert.doesNotMatch(plan.commands[0].command, /--source-only/);
});

test("index autorepair plan chains source graph and embeddings when mixed gaps exist", () => {
  const plan = buildSmallDeltaAutorepairPlan({
    report: {
      files: [
        { relPath: "src/a.ts", reason: "missing-row", language: "typescript" },
        { relPath: "src/b.ts", reason: "embedding-missing", language: "typescript" },
      ],
      indexedRows: 1,
      inventory: { files: [{ relPath: "src/a.ts" }, { relPath: "src/b.ts" }] },
    },
    rootArg: ".",
    includeStructure: true,
    smallDeltaLimit: 5,
    jsonProgress: false,
  });

  assert.deepEqual(plan.commands.map((item) => item.id), [
    "source-readiness",
    "structure-readiness",
    "semantic-embeddings",
  ]);
});
