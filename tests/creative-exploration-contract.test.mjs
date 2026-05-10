import assert from "node:assert/strict";
import test from "node:test";

import {
  validateCreativeExplorationContract,
} from "../scripts/lib/creative-exploration-contract.mjs";

function direction(id) {
  const value = `direction-${id}`;
  return {
    id: value,
    label: `Direction ${id}`,
    ownableMoment: `signature moment ${id}`,
    nonStandardUx: `non standard model ${id}`,
    hardConstraints: ["no ordinary topbar", "no bottom composer", "different navigation model"],
    forbiddenShells: ["topbar", "bottom composer"],
    navigationModel: `navigation ${id}`,
    composerModel: `composer ${id}`,
    agentStateModel: `agent states ${id}`,
  };
}

test("creative exploration contract blocks prototype artifacts before approval", () => {
  const result = validateCreativeExplorationContract({
    semanticMap: {
      missingSignals: [],
    },
    directionSpecs: [1, 2, 3, 4, 5].map((id) => direction(id)),
    prototypeArtifacts: [".supervibe/artifacts/prototypes/demo/index.html"],
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "prototype-before-design-gate"));
  assert.ok(result.issues.some((issue) => issue.code === "missing-design-gate"));
});

test("creative exploration contract passes only after semantic map, five specs, and approval", () => {
  const result = validateCreativeExplorationContract({
    semanticMap: {
      missingSignals: [],
    },
    directionSpecs: [1, 2, 3, 4, 5].map((id) => direction(id)),
    userGate: {
      status: "approved",
    },
  });

  assert.equal(result.pass, true);
});
