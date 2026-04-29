import assert from "node:assert/strict";
import test from "node:test";
import { evaluateSdlcGates } from "../scripts/lib/autonomous-loop-sdlc-gates.mjs";

test("production intent requires CI or local equivalent", () => {
  const result = evaluateSdlcGates({ requirementsLinked: true, tests: true, productionIntent: true });
  assert.equal(result.pass, false);
  assert.ok(result.gaps.includes("ci evidence"));
});
