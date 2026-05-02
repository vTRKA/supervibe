import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const README = "README.md";

test("README documents autonomous loop end-to-end path and copy-paste commands", async () => {
  const readme = await readFile(README, "utf8");
  for (const snippet of [
    "/supervibe-brainstorm \"idea\"",
    "/supervibe-plan --from-brainstorm .supervibe/artifacts/specs/example.md",
    "/supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md",
    "/supervibe-loop --epic example-epic --worktree",
    "/supervibe-loop --status --epic example-epic",
    "/supervibe-loop --resume .supervibe/memory/loops/example-run/state.json",
    "/supervibe-loop --stop example-run",
  ]) {
    assert.match(readme, escapeRegExp(snippet), `${snippet} must be documented`);
  }
  assert.match(readme, /brainstorm -> reviewed plan -> atomized epic -> safe execution/i);
});

test("README documents provider-safe boundaries and blocked states", async () => {
  const readme = await readFile(README, "utf8");
  for (const phrase of [
    "provider prompts",
    "rate limits",
    "network/MCP approvals",
    "secrets",
    "billing",
    "production mutations",
    "credential changes",
    "ready",
    "blocked",
    "claimed",
    "stale",
    "orphan",
    "drift",
    "review",
    "done",
  ]) {
    assert.match(readme, new RegExp(escapeText(phrase), "i"), `${phrase} must be explained`);
  }
  assert.match(readme, /autonomous execution is opt-in/i);
  assert.match(readme, /not the default/i);
});

test("README and command docs share autonomous-loop flags and artifact paths", async () => {
  const [readme, loopCommand, planCommand] = await Promise.all([
    readFile(README, "utf8"),
    readFile("commands/supervibe-loop.md", "utf8"),
    readFile("commands/supervibe-plan.md", "utf8"),
  ]);
  for (const flag of ["--atomize-plan", "--worktree", "--status", "--resume", "--stop", "--tracker-sync-push"]) {
    assert.match(readme, new RegExp(escapeText(flag)));
    assert.match(loopCommand, new RegExp(escapeText(flag)));
  }
  for (const path of [".supervibe/memory/loops/", ".supervibe/memory/work-items/", "task-tracker-map.json", ".supervibe/memory/bundles/"]) {
    assert.match(readme, new RegExp(escapeText(path)));
  }
  assert.match(planCommand, /tracker-sync-push/);
});

test("public docs and changelog mention the verified autonomous-loop upgrade", async () => {
  const [readme, changelog, scenarios, readiness] = await Promise.all([
    readFile(README, "utf8"),
    readFile("CHANGELOG.md", "utf8"),
    readFile("docs/autonomous-loop-scenarios.md", "utf8"),
    readFile("docs/autonomous-loop-production-readiness.md", "utf8"),
  ]);
  assert.match(changelog, /Autonomous loop 10\/10 upgrade/i);
  assert.match(readme, /Unreleased capability label/i);
  assert.match(scenarios, /Resume And Stop Controls/);
  assert.match(readiness, /Provider Permission Audit/);
});

function escapeRegExp(value) {
  return new RegExp(escapeText(value));
}

function escapeText(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
