import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { generateContracts } from "../scripts/lib/autonomous-loop-contracts.mjs";
import {
  createVerificationMatrix,
  evidenceMatchesScenario,
  validateEvidenceCoverage,
  validateVerificationMatrixEntries,
} from "../scripts/lib/autonomous-loop-verification-matrix.mjs";

test("verification matrix entries validate against schema", () => {
  const schema = JSON.parse(fs.readFileSync("schemas/autonomous-loop-verification.schema.json", "utf8"));
  const validate = new Ajv2020().compile(schema);
  const tasks = [{ id: "t1", goal: "Run integration check", category: "integration", verificationCommands: ["npm test"] }];
  const matrix = createVerificationMatrix(tasks, generateContracts(tasks));

  assert.equal(validate(matrix[0]), true, JSON.stringify(validate.errors));
  assert.equal(validateVerificationMatrixEntries(matrix).pass, true);
  assert.equal(matrix[0].evidenceType, "integration check");
});

test("evidence coverage requires specialized evidence by task type", () => {
  const tasks = [
    { id: "ui", goal: "Polish UI", category: "ui" },
    { id: "refactor", goal: "Refactor callers", category: "refactor" },
  ];
  const bad = validateEvidenceCoverage({
    tasks,
    matrix: [
      { taskId: "ui", evidenceType: "deterministic assertion" },
      { taskId: "refactor", evidenceType: "deterministic assertion" },
    ],
  });
  assert.equal(bad.pass, false);
  assert.equal(bad.issues.some((issue) => issue.code === "missing-browser-evidence"), true);
  assert.equal(bad.issues.some((issue) => issue.code === "missing-trace-evidence"), true);

  const good = validateEvidenceCoverage({
    tasks,
    matrix: [
      { taskId: "ui", evidenceType: "browser check" },
      { taskId: "refactor", evidenceType: "trace assertion" },
    ],
  });
  assert.equal(good.pass, true);
});

test("blocked gate can satisfy integration environment/access requirement", () => {
  const result = validateEvidenceCoverage({
    tasks: [{ id: "api", goal: "Validate external API", category: "integration" }],
    matrix: [{ taskId: "api", evidenceType: "deterministic assertion" }],
    gates: [{ taskId: "api", status: "blocked" }],
  });

  assert.equal(result.pass, true);
});

test("stable trace markers match required and forbidden markers", () => {
  const scenario = {
    requiredMarkers: ["[CORE_LOGIC][t1][PASS]"],
    forbiddenMarkers: ["raw secret"],
  };

  assert.equal(evidenceMatchesScenario(scenario, "[CORE_LOGIC][t1][PASS]").pass, true);
  assert.equal(evidenceMatchesScenario(scenario, "raw secret [CORE_LOGIC][t1][PASS]").pass, false);
});
