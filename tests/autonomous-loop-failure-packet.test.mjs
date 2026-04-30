import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  classifyRequeueReason,
  createFailurePacket,
  shouldOpenFailureCircuit,
} from "../scripts/lib/autonomous-loop-failure-packet.mjs";

test("failure packet validates against schema and caps confidence", () => {
  const schema = JSON.parse(fs.readFileSync("schemas/autonomous-loop-failure-packet.schema.json", "utf8"));
  const validate = new Ajv2020().compile(schema);
  const packet = createFailurePacket({
    taskId: "t1",
    attemptId: "a1",
    contractRef: "contract-t1",
    failedScenario: "verify-t1",
    expectedEvidence: ["[CORE_LOGIC][t1][PASS]"],
    observedEvidence: "missing evidence marker",
    firstDivergentModule: "CORE_LOGIC",
    firstDivergentMarker: "[CORE_LOGIC][t1][PASS]",
  });

  assert.equal(validate(packet), true, JSON.stringify(validate.errors));
  assert.equal(packet.requeueReason, "missing_evidence");
  assert.equal(packet.confidenceCap, 6);
});

test("requeue reason distinguishes policy, access, flake, drift, and implementation failures", () => {
  assert.equal(classifyRequeueReason({ observedEvidence: "permission denied" }), "missing_access");
  assert.equal(classifyRequeueReason({ observedEvidence: "policy approval required" }), "policy_block");
  assert.equal(classifyRequeueReason({ observedEvidence: "flaky timeout" }), "flaky_check");
  assert.equal(classifyRequeueReason({ observedEvidence: "contract drift" }), "contract_drift");
  assert.equal(classifyRequeueReason({ observedEvidence: "assertion failed" }), "implementation_bug");
});

test("repeated same failure packet opens no-progress circuit", () => {
  const packets = [1, 2, 3].map((index) => createFailurePacket({
    taskId: "t1",
    attemptId: `a${index}`,
    contractRef: "contract-t1",
    failedScenario: "verify-t1",
    expectedEvidence: "pass marker",
    observedEvidence: "missing evidence marker",
    firstDivergentModule: "CORE_LOGIC",
    firstDivergentMarker: "[CORE_LOGIC][t1][PASS]",
  }));

  assert.equal(shouldOpenFailureCircuit(packets).open, true);
  assert.equal(shouldOpenFailureCircuit(packets).reason, "same_failure_packet_repeated");
});
