import assert from "node:assert/strict";
import test from "node:test";
import {
  approveGate,
  closeGate,
  createGate,
  evaluateGate,
  expireGate,
  listGates,
  summarizeGates,
} from "../scripts/lib/autonomous-loop-async-gates.mjs";

test("human gates never auto-approve during evaluation", () => {
  const gate = createGate({ type: "human", taskId: "t1", awaitSpec: "approve deploy" });
  const evaluated = evaluateGate(gate);

  assert.equal(evaluated.status, "blocked");
  assert.equal(evaluated.result, "human_approval_required");
  assert.equal(evaluated.approvedBy, null);
});

test("timer gates expire deterministically", () => {
  const gate = createGate({
    type: "timer",
    taskId: "t1",
    timeoutAt: "2026-04-29T00:01:00.000Z",
    now: "2026-04-29T00:00:00.000Z",
  });
  const waiting = evaluateGate(gate, { now: "2026-04-29T00:00:30.000Z" });
  assert.equal(waiting.status, "waiting");

  const expired = evaluateGate(gate, { now: "2026-04-29T00:02:00.000Z" });
  assert.equal(expired.status, "expired");
  assert.equal(expired.result, "timeout");
});

test("ci and pr gates are adapter-backed and safe when adapter is unavailable", () => {
  const ciGate = createGate({ type: "ci", taskId: "t1" });
  assert.equal(evaluateGate(ciGate).status, "blocked");
  assert.equal(evaluateGate(ciGate).result, "ci_adapter_unavailable");

  const passed = evaluateGate(ciGate, {
    adapters: {
      ci: () => ({ pass: true, evidence: ["ci:green"] }),
    },
  });
  assert.equal(passed.status, "closed");
  assert.deepEqual(passed.evidence, ["ci:green"]);
});

test("approve, close, expire, list, and summarize gate lifecycle", () => {
  const gate = createGate({ type: "manual", taskId: "t1" });
  const approved = approveGate(gate, { approvedBy: "user", evidence: ["chat-confirmed"] });
  const closed = closeGate(approved, { result: "used", evidence: ["run-started"] });
  const expired = expireGate(createGate({ type: "custom", taskId: "t2" }));

  assert.equal(approved.status, "approved");
  assert.equal(closed.status, "closed");
  assert.equal(expired.status, "expired");
  assert.equal(listGates([closed, expired], { taskId: "t2" })[0].gateId, expired.gateId);
  assert.deepEqual(summarizeGates([closed, expired]), { open: 0, approved: 0, closed: 1, expired: 1 });
});
