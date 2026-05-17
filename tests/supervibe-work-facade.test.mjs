import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkFacadeJsonResult,
  formatWorkFacadeHelp,
  routeWorkFacadeArgs,
} from "../scripts/lib/supervibe-work-facade.mjs";

test("prepare-loop defaults to safe dry-run and respects explicit apply", () => {
  const routed = routeWorkFacadeArgs(["prepare-loop", "--file", "graph.json", "--max-concurrency", "4"]);

  assert.equal(routed.action, "prepare-loop");
  assert.deepEqual(routed.commandArgs, ["--dispatch-wave", "--dry-run", "--file", "graph.json", "--max-concurrency", "4"]);

  const applied = routeWorkFacadeArgs(["prepare-loop", "--apply", "--file", "graph.json"]);
  assert.deepEqual(applied.commandArgs, ["--dispatch-wave", "--apply", "--file", "graph.json"]);
  assert.match(formatWorkFacadeHelp(), /prepare-loop/);
});

test("start and quickstart route to fast-session from-plan flow", () => {
  const routed = routeWorkFacadeArgs(["start", "plan.md", "--dispatch"]);

  assert.equal(routed.action, "start");
  assert.deepEqual(routed.commandArgs, ["--from-plan", "plan.md", "--start", "--fast-session", "--dispatch"]);

  const quickstart = routeWorkFacadeArgs(["quickstart", "plan.md"]);
  assert.deepEqual(quickstart.commandArgs, ["--from-plan", "plan.md", "--start", "--fast-session"]);

  const flagsFirst = routeWorkFacadeArgs(["start", "--dispatch", "plan.md"]);
  assert.deepEqual(flagsFirst.commandArgs, ["--from-plan", "plan.md", "--start", "--fast-session", "--dispatch"]);
  assert.match(formatWorkFacadeHelp(), /sv work start <plan.md>/);
});

test("work facade json envelope parses line-oriented loop output", () => {
  const result = createWorkFacadeJsonResult({
    action: "prepare-loop",
    commandArgs: ["--dispatch-wave", "--dry-run"],
    facadeArgs: ["prepare-loop", "--file", "D:/tmp/.supervibe/memory/work-items/epic-work/graph.json"],
    exitCode: 0,
    stdout: [
      "SUPERVIBE_DISPATCH_WAVE",
      "GRAPH: D:/tmp/.supervibe/memory/work-items/epic-work/graph.json",
      "APPLIED: false",
      "ASSIGNED: task-1, task-2",
      "NEXT_ACTION: run with --apply after review",
    ].join("\n"),
  });

  assert.equal(result.status, "ok");
  assert.equal(result.diagnostics.parsedOutput, true);
  assert.equal(result.graphId, "epic-work");
  assert.equal(result.nextAction, "run with --apply after review");
});
