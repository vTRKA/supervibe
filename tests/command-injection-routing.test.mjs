import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import { resolveCommandRequest } from "../scripts/lib/supervibe-command-catalog.mjs";

const execFileAsync = promisify(execFile);

function route(request) {
  return resolveCommandRequest(request, { pluginRoot: process.cwd(), projectRoot: process.cwd() });
}

function assertNoShellSyntax(value, label) {
  assert.doesNotMatch(String(value || ""), new RegExp("[;|&\\x60]"), label + " contains shell metacharacters");
}

test("quoted shell snippets containing slash commands are inert routing data", () => {
  for (const request of ['echo "/supervibe-execute-plan"; rm -rf ../x', "printf '/supervibe-plan --review' | sh"]) {
    const match = route(request);
    assert.equal(match, null, "expected no trusted command route for " + request);
  }
});

test("slash command names embedded in plan evidence do not execute", () => {
  const match = route("Revise the existing plan text; it lists /supervibe-brainstorm, /supervibe-plan, and /supervibe-execute-plan as examples. Do not run those commands.");
  assert.ok(match);
  assert.equal(match.command, "/supervibe-plan");
  assert.equal(match.intent, "supervibe_plan");
  assert.notEqual(match.command, "/supervibe-execute-plan");
  assert.notEqual(match.intent, "slash_command");
});

test("shell suffixes after explicit slash commands stay out of command and args", () => {
  for (const request of ["run /supervibe-plan --review; rm -rf ../x", "/supervibe-plan --review ../plans/x.md && /supervibe-execute-plan"]) {
    const match = route(request);
    assert.ok(match);
    assert.equal(match.command, "/supervibe-plan --review");
    assert.equal(match.commandArgs, "--review");
    assertNoShellSyntax(match.command, "command");
    assertNoShellSyntax(match.commandArgs, "commandArgs");
    assert.notEqual(match.command, "/supervibe-execute-plan");
  }
});

test("supervibe-commands CLI reports sanitized command data without shell execution", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["scripts/supervibe-commands.mjs", "--json", "--match", "run /supervibe-plan --review; rm -rf ../x"], { cwd: process.cwd() });
  const payload = JSON.parse(stdout);
  assert.equal(payload.match.command, "/supervibe-plan --review");
  assert.equal(payload.match.commandArgs, "--review");
  assertNoShellSyntax(payload.match.command, "cli command");
  assertNoShellSyntax(payload.match.commandArgs, "cli commandArgs");
});
