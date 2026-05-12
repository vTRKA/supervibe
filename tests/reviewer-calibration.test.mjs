import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const REQUIRED_SCENARIOS = Object.freeze([
  "missing-active-workflow",
  "stale-tracker-map",
  "review-absent",
  "false-not-started",
  "direct-post-bypass",
  "excessive-task-set",
  "completed-epic-selected-active",
  "weak-design-evidence",
]);

test("core reviewer calibration lives in canonical _core agents only", () => {
  for (const duplicate of [
    "agents/_review/quality-gate-reviewer.md",
    "agents/_review/architect-reviewer.md",
  ]) {
    assert.equal(existsSync(join(ROOT, duplicate)), false, `${duplicate} must not exist`);
  }
});

test("quality gate reviewer hard-blocks hidden workflow failures even with green default validators", () => {
  const text = readAgent("quality-gate-reviewer");
  assert.match(text, /## Adversarial Scenario Calibration/);
  for (const scenario of REQUIRED_SCENARIOS) {
    assert.match(text, new RegExp(`\\b${escapeRegex(scenario)}\\b`));
  }
  assert.match(text, /HARD-BLOCK even when default validators are green/);
  assert.match(text, /evidence-backed no-issue proof/);
  assert.match(text, /concrete finding/);
});

test("architect reviewer requires source-traced no-issue proof for workflow and agent-system reviews", () => {
  const text = readAgent("architect-reviewer");
  assert.match(text, /## Agent-System Review Calibration/);
  for (const scenario of REQUIRED_SCENARIOS) {
    assert.match(text, new RegExp(`\\b${escapeRegex(scenario)}\\b`));
  }
  assert.match(text, /file:line/);
  assert.match(text, /source-traced no-issue proof/);
  assert.match(text, /BLOCKED until the missing source trace is produced/);
});

function readAgent(name) {
  return readFileSync(join(ROOT, "agents", "_core", `${name}.md`), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
