import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  MODULE_TYPES,
  generateContractForTask,
  generateContracts,
  scoreAutonomyReadiness,
  summarizeContracts,
} from "../scripts/lib/autonomous-loop-contracts.mjs";
import { buildPreflight } from "../scripts/lib/autonomous-loop-preflight-intake.mjs";

test("execution contract validates against schema", () => {
  const schema = JSON.parse(fs.readFileSync("schemas/autonomous-loop-contract.schema.json", "utf8"));
  const validate = new Ajv2020().compile(schema);
  const contract = generateContractForTask({
    id: "t1",
    goal: "Implement API integration",
    category: "integration",
    dependencies: ["t0"],
    acceptanceCriteria: ["Integration works"],
    verificationCommands: ["npm test"],
    policyRiskLevel: "low",
    source: { type: "plan", path: ".supervibe/artifacts/plans/x.md" },
  });

  assert.equal(validate(contract), true, JSON.stringify(validate.errors));
  assert.equal(contract.moduleType, "INTEGRATION");
  assert.ok(MODULE_TYPES.includes("INTEGRATION"));
  assert.deepEqual(contract.targetFiles, [".supervibe/artifacts/plans/x.md"]);
});

test("contract generation covers every task and summarizes verification", () => {
  const contracts = generateContracts([
    { id: "a", goal: "Write docs", category: "documentation", acceptanceCriteria: ["Docs updated"] },
    { id: "b", goal: "Build core", category: "implementation", acceptanceCriteria: ["Core works"], verificationCommands: ["npm test"] },
  ]);

  assert.equal(contracts.length, 2);
  assert.deepEqual(summarizeContracts(contracts), {
    count: 2,
    withVerification: 1,
    moduleTypes: ["DOCUMENTATION", "CORE_LOGIC"],
  });
});

test("autonomy readiness passes complete contracts", () => {
  const tasks = [{
    id: "t1",
    goal: "Build core",
    category: "implementation",
    acceptanceCriteria: ["Core works"],
    verificationCommands: ["npm test"],
    stopConditions: ["policy_stop"],
    policyRiskLevel: "low",
  }];
  const preflight = buildPreflight({ request: "build core", tasks });
  const contracts = generateContracts(tasks);
  const readiness = scoreAutonomyReadiness({ tasks, contracts, preflight });

  assert.equal(readiness.score, 10);
  assert.equal(readiness.pass, true);
  assert.deepEqual(readiness.missing, []);
});

test("autonomy readiness returns concrete remediation below 9", () => {
  const tasks = [{
    id: "t1",
    goal: "Build core",
    category: "implementation",
    acceptanceCriteria: [],
    verificationCommands: [],
    stopConditions: [],
    policyRiskLevel: "low",
  }];
  const preflight = buildPreflight({ request: "build core", tasks });
  const readiness = scoreAutonomyReadiness({
    tasks,
    contracts: generateContracts(tasks),
    preflight: { ...preflight, rollback_expectation: "", allowed_write_scope: [] },
    gates: [{ gateId: "g1", status: "blocked" }],
    reviewerAvailable: false,
  });

  assert.equal(readiness.pass, false);
  assert.ok(readiness.score < 9);
  assert.ok(readiness.missing.includes("verification-coverage"));
  assert.ok(readiness.remediation.some((item) => item.includes("verification")));
});

test("supervibe-loop readiness command supports JSON output", () => {
  const output = execFileSync("node", [
    "scripts/supervibe-loop.mjs",
    "--readiness",
    "--json",
    "--request",
    "validate integrations",
  ], { encoding: "utf8" });
  const parsed = JSON.parse(output);

  assert.equal(typeof parsed.readiness.score, "number");
  assert.ok(Array.isArray(parsed.contracts));
});
