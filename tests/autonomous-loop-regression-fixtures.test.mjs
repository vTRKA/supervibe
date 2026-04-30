import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("canonical autonomous-loop regression fixtures cover required scenarios", async () => {
  const fixtures = JSON.parse(await readFile(new URL("../tests/fixtures/regression-suite/canonical-tasks.json", import.meta.url), "utf8"));
  const ids = new Set(fixtures["autonomous-loop"].map((item) => item.id));
  for (const id of [
    "linear-graph",
    "parallel-ready-front",
    "cycle-failure",
    "human-gate",
    "timer-gate",
    "ui-story-browser-evidence",
    "missing-credential-block",
    "repeated-failure-circuit",
    "production-prep-stop",
    "fresh-context-stub-success",
  ]) {
    assert.equal(ids.has(id), true, `${id} fixture is required`);
  }
});
