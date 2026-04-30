import assert from "node:assert/strict";
import test from "node:test";
import {
  TOOL_ADAPTER_IDS,
  assertSafeAdapterCommand,
  createCliToolAdapter,
  createShellStubAdapter,
  createToolAdapter,
  detectToolAdapters,
  extractChangedFiles,
  extractCompletionSignal,
  normalizeExecutionMode,
  renderFreshContextPrompt,
  summarizeToolAdapterAvailability,
} from "../scripts/lib/autonomous-loop-tool-adapters.mjs";

test("tool adapter detection is safe and exposes stub without spawning CLIs", () => {
  const adapters = detectToolAdapters({
    env: { SUPERVIBE_ENABLED_ADAPTERS: "codex" },
    availableCommands: { codex: true },
  });
  const summary = summarizeToolAdapterAvailability(adapters);

  assert.ok(summary.available.includes("generic-shell-stub"));
  assert.ok(TOOL_ADAPTER_IDS.includes("codex"));
  assert.ok(summary.available.includes("codex"));
  assert.equal(adapters.find((adapter) => adapter.id === "claude").available, false);
});

test("adapter interface exposes required methods", () => {
  const adapter = createShellStubAdapter();
  for (const method of ["detect", "renderPrompt", "run", "collectOutput", "extractCompletionSignal", "extractChangedFiles", "stop"]) {
    assert.equal(typeof adapter[method], "function");
  }
});

test("fresh-context prompt scopes packet and excludes conversation history", () => {
  const prompt = renderFreshContextPrompt({
    packetType: "fresh-context-task",
    schemaVersion: 1,
    task: { id: "T1", goal: "Implement feature" },
    acceptanceCriteria: ["passes tests"],
    conversationHistory: ["do not include"],
    outputContract: { completionSignal: "SUPERVIBE_TASK_COMPLETE: true" },
  });

  assert.match(prompt, /SUPERVIBE_FRESH_CONTEXT_TASK/);
  assert.match(prompt, /SUPERVIBE_TASK_COMPLETE/);
  assert.doesNotMatch(prompt, /do not include/);
  assert.doesNotMatch(prompt, /conversationHistory/);
});

test("completion signal and changed files are extracted from adapter output", () => {
  const output = [
    "SUPERVIBE_TASK_COMPLETE: true",
    "SUPERVIBE_CHANGED_FILES: scripts/a.mjs, tests/a.test.mjs",
    "Changed files:",
    "- README.md",
  ].join("\n");

  assert.equal(extractCompletionSignal(output).completed, true);
  assert.deepEqual(extractChangedFiles(output), ["scripts/a.mjs", "tests/a.test.mjs", "README.md"]);
});

test("unsafe adapter flags are rejected", () => {
  assert.throws(() => createToolAdapter("codex", { args: ["--dangerously-skip-permissions"] }), /Unsafe adapter flag blocked/);
  assert.equal(createCliToolAdapter({ id: "codex", command: "codex" }).id, "codex");
  assert.equal(assertSafeAdapterCommand("codex", ["--model", "x"]), true);
  assert.equal(normalizeExecutionMode("fresh-context"), "fresh-context");
  assert.equal(normalizeExecutionMode("unknown"), "dry-run");
});
