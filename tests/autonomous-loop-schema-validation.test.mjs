import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import Ajv from "ajv";
import { createFailurePacket } from "../scripts/lib/autonomous-loop-failure-packet.mjs";
import { createTaskGraph } from "../scripts/lib/autonomous-loop-task-graph.mjs";
import { generateContracts } from "../scripts/lib/autonomous-loop-contracts.mjs";
import { createVerificationMatrix } from "../scripts/lib/autonomous-loop-verification-matrix.mjs";
import { createState } from "../scripts/lib/autonomous-loop-status.mjs";

async function loadJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

const task = {
  id: "schema-task",
  goal: "Validate schema task",
  category: "implementation",
  requiredAgentCapability: "stack-developer",
  dependencies: [],
  acceptanceCriteria: ["Task evidence is present"],
  verificationCommands: [],
  confidenceRubricId: "autonomous-loop",
  policyRiskLevel: "low",
  stopConditions: ["verification_failed"],
};

test("graph, contract, verification, and failure packet schemas accept generated fixtures", async () => {
  const ajv = new Ajv2020({ strict: false });
  const graphSchema = await loadJson("../schemas/autonomous-loop-graph.schema.json");
  const contractSchema = await loadJson("../schemas/autonomous-loop-contract.schema.json");
  const verificationSchema = await loadJson("../schemas/autonomous-loop-verification.schema.json");
  const failurePacketSchema = await loadJson("../schemas/autonomous-loop-failure-packet.schema.json");

  const graph = createTaskGraph({ graph_id: "schema-graph", tasks: [task] });
  const contract = generateContracts([task])[0];
  const verification = createVerificationMatrix([task], [contract])[0];
  const failurePacket = createFailurePacket({
    taskId: task.id,
    attemptId: "attempt-1",
    contractRef: contract.contractId,
    failedScenario: verification.scenarioId,
    expectedEvidence: "evidence",
    observedEvidence: "missing evidence",
  });

  for (const [schema, value] of [
    [graphSchema, graph],
    [contractSchema, contract],
    [verificationSchema, verification],
    [failurePacketSchema, failurePacket],
  ]) {
    const validate = ajv.compile(schema);
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }
});

test("migrated state schema accepts current loop state fields", async () => {
  const schema = await loadJson("../schemas/autonomous-loop-state.schema.json");
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(schema);
  const state = createState({
    runId: "schema-state",
    pluginVersion: "1.8.1",
    tasks: [task],
    scores: [{ taskId: task.id, finalScore: 10 }],
    attempts: [{
      attemptId: "attempt-1",
      taskId: task.id,
      executionMode: "dry-run",
      status: "completed",
      outputPath: null,
      changedFiles: [],
      verificationEvidence: ["ok"],
      score: { taskId: task.id, finalScore: 10 },
      failurePacket: null,
      sideEffectId: null,
    }],
    readySummary: { ready: 0, blocked: 0, claimed: 0, complete: 1, open: 0, failed: 0, cancelled: 0 },
  });

  assert.equal(validate(state), true, JSON.stringify(validate.errors));
});
