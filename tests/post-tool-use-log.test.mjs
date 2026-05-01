import { test, before, after } from "node:test";
import assert from "node:assert";
import { mkdir, rm, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { AgentTaskStore } from "../scripts/lib/agent-task-store.mjs";

const sandbox = join(tmpdir(), `supervibe-hook-${Date.now()}`);
const logPath = join(sandbox, ".supervibe", "memory", "agent-invocations.jsonl");
const taskDbPath = join(sandbox, "agent-tasks.db");

before(async () => {
  await mkdir(join(sandbox, ".supervibe", "memory"), { recursive: true });
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

function runHook(input) {
  const cmd = `node scripts/hooks/post-tool-use-log.mjs`;
  return execSync(cmd, {
    cwd: process.cwd(),
    input: JSON.stringify(input),
    encoding: "utf8",
    env: {
      ...process.env,
      SUPERVIBE_INVOCATION_LOG: logPath,
      SUPERVIBE_AGENT_TASK_DB: taskDbPath,
    },
  });
}

function readEntries() {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

test("hook: logs Task tool dispatch with agent_id from subagent_type", () => {
  runHook({
    tool_name: "Task",
    tool_input: {
      subagent_type: "laravel-developer",
      description: "Add login endpoint",
    },
    tool_response: { content: "Done. Confidence: 9.2/10. Pest tests green." },
    session_id: "s1",
  });
  const entries = readEntries();
  const last = entries[entries.length - 1];
  assert.strictEqual(last.agent_id, "laravel-developer");
  assert.strictEqual(last.task_summary, "Add login endpoint");
  assert.strictEqual(last.confidence_score, 9.2);
});

test("hook: ignores non-Task tools", () => {
  const before = readEntries().length;
  runHook({
    tool_name: "Read",
    tool_input: { file_path: "/foo" },
    tool_response: { content: "file content" },
  });
  const after = readEntries().length;
  assert.strictEqual(after, before, "should not log non-Task tools");
});

test("hook: handles missing fields gracefully (no throw)", () => {
  runHook({});
  runHook({ tool_name: "Task" });
  runHook({ tool_name: "Task", tool_input: {} });
  assert.ok(true);
});

test("hook: extracts confidence score from various patterns", () => {
  const before = readEntries().length;
  const cases = [
    { content: "Confidence: 9.2/10", expected: 9.2 },
    { content: "Final score: 8.5", expected: 8.5 },
    { content: "confidence-score=10", expected: 10 },
    { content: "no score here", expected: 0 },
  ];
  for (const c of cases) {
    runHook({
      tool_name: "Task",
      tool_input: { subagent_type: "test-agent", description: "test" },
      tool_response: { content: c.content },
    });
  }
  const entries = readEntries();
  const lastFour = entries.slice(-4);
  assert.strictEqual(lastFour[0].confidence_score, 9.2);
  assert.strictEqual(lastFour[1].confidence_score, 8.5);
  assert.strictEqual(lastFour[2].confidence_score, 10);
  assert.strictEqual(lastFour[3].confidence_score, 0);
});

test("hook: extracts override marker", () => {
  runHook({
    tool_name: "Task",
    tool_input: {
      subagent_type: "override-agent",
      description: "override test",
    },
    tool_response: { content: "Done. Confidence: 9/10. override: true" },
  });
  const entries = readEntries();
  const last = entries[entries.length - 1];
  assert.strictEqual(last.override, true);
});

test("hook: also writes Task to agent-tasks.db (SQLite mirror)", async () => {
  runHook({
    tool_name: "Task",
    tool_input: {
      subagent_type: "mirror-agent",
      description: "unique-marker-mirror task content",
    },
    tool_response: { content: "Done. Confidence: 9.0/10" },
  });
  const store = new AgentTaskStore(sandbox, { dbPath: taskDbPath });
  await store.init();
  const hits = store.findSimilar("unique-marker-mirror", {
    minConfidence: 8.0,
  });
  store.close();
  assert.ok(
    hits.some((h) => h.agent_id === "mirror-agent"),
    `expected SQLite mirror to contain mirror-agent; got: ${JSON.stringify(hits)}`,
  );
});

test("hook: emits dispatch-hint when confidence < 8.0 and history supports it", async () => {
  // Pre-seed the SQLite mirror with strong-agent's track record on similar tasks
  const seedStore = new AgentTaskStore(sandbox, { dbPath: taskDbPath });
  await seedStore.init();
  for (let i = 0; i < 4; i++) {
    seedStore.addTask({
      agent_id: "strong-agent",
      task_summary: `kafka rebalance unique-marker-redispatch fix ${i}`,
      confidence_score: 9.4,
    });
  }
  seedStore.close();

  // Now run a hook with low confidence on the SAME task topic
  const out = runHook({
    tool_name: "Task",
    tool_input: {
      subagent_type: "failing-agent",
      description: "kafka rebalance unique-marker-redispatch issue",
    },
    tool_response: { content: "Done. Confidence: 7.2/10" },
  });

  assert.match(out, /\[supervibe\] dispatch-hint:/);
  assert.match(out, /strong-agent/);
  assert.match(out, /consider re-running via Task subagent_type=strong-agent/);
});

test("hook: does NOT emit dispatch-hint on high confidence", () => {
  const out = runHook({
    tool_name: "Task",
    tool_input: {
      subagent_type: "happy-agent",
      description: "happy path no hint expected",
    },
    tool_response: { content: "Done. Confidence: 9.5/10" },
  });
  assert.doesNotMatch(out, /dispatch-hint/);
});

test("hook: does NOT emit dispatch-hint when override=true even on low score", () => {
  const out = runHook({
    tool_name: "Task",
    tool_input: {
      subagent_type: "override-low",
      description: "low score but override applied",
    },
    tool_response: { content: "Done. Confidence: 7.5/10. override: true" },
  });
  assert.doesNotMatch(out, /dispatch-hint/);
});

test("hook: silent on low score when there is no historical match", () => {
  const out = runHook({
    tool_name: "Task",
    tool_input: {
      subagent_type: "cold-start",
      description: "zxq-klmn-brute-wumpus-fzg",
      // note: tokens must NOT overlap with any other task in this file!
    },
    tool_response: { content: "Done. Confidence: 7.0/10" },
  });
  assert.doesNotMatch(out, /dispatch-hint/);
});
