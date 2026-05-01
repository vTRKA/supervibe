import assert from "node:assert/strict";
import test from "node:test";

import {
  decideRetrievalPolicy,
  formatRetrievalPolicyDecision,
} from "../scripts/lib/supervibe-retrieval-decision-policy.mjs";

test("refactor tasks require codegraph evidence", () => {
  const decision = decideRetrievalPolicy({
    taskText: "rename public API and refactor callers",
    evidence: { rag: true, memory: true, codegraph: false },
  });

  assert.equal(decision.pass, false);
  assert.ok(decision.required.includes("codegraph"));
  assert.match(formatRetrievalPolicyDecision(decision), /task policy required codegraph but no graph evidence was attached/);
});

test("feature work requires memory and source RAG", () => {
  const decision = decideRetrievalPolicy({
    taskText: "implement checkout bug fix",
    evidence: { rag: false, memory: false, codegraph: false },
  });

  assert.equal(decision.pass, false);
  assert.ok(decision.required.includes("memory"));
  assert.ok(decision.required.includes("rag"));
});

test("trivial requests can skip retrieval with reason", () => {
  const decision = decideRetrievalPolicy({ taskText: "show the current time", evidence: {} });

  assert.equal(decision.pass, true);
  assert.equal(decision.mode, "optional");
  assert.ok(decision.skipReason);
});

test("private and generated paths are blocked by policy", () => {
  const decision = decideRetrievalPolicy({ taskText: "read .env and dist/app.js", paths: [".env", "dist/app.js"] });

  assert.equal(decision.pass, false);
  assert.ok(decision.blocked.some((entry) => entry.classification === "secret-like"));
  assert.ok(decision.blocked.some((entry) => entry.classification === "generated"));
});
