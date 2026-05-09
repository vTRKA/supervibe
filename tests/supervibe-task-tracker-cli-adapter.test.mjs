import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createCliTaskTrackerAdapter,
  redactTrackerPayload,
} from "../scripts/lib/supervibe-task-tracker-cli-adapter.mjs";
import { assertTaskTrackerAdapter } from "../scripts/lib/supervibe-durable-task-tracker-adapter.mjs";

async function createFakeTracker(rootDir) {
  const callsPath = join(rootDir, "calls.jsonl");
  const scriptPath = join(rootDir, "fake-tracker.mjs");
  await writeFile(scriptPath, `
import { appendFile, readFile, writeFile } from "node:fs/promises";
const callsPath = process.env.FAKE_TRACKER_CALLS;
const statePath = process.env.FAKE_TRACKER_STATE;
const args = process.argv.slice(2);
await appendFile(callsPath, JSON.stringify({ args }) + "\\n", "utf8");
let state = { tasks: {}, claims: {}, dependencies: [] };
try { state = JSON.parse(await readFile(statePath, "utf8")); } catch {}
const command = args[0];
const id = args[1] && !args[1].startsWith("--") ? args[1] : null;
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
function out(value) {
  process.stdout.write(JSON.stringify(value));
}
if (args.includes("--version")) out({ ok: true, version: "1.2.3", initialized: true });
else if (command === "init") out({ ok: true, initialized: true });
else if (command === "create") {
  const title = valueAfter("--title") || id || "task";
  const externalId = valueAfter("--id") || "ext-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  state.tasks[externalId] = { externalId, title, status: "open" };
  await writeFile(statePath, JSON.stringify(state), "utf8");
  out({ ok: true, externalId, record: state.tasks[externalId] });
} else if (command === "dep") {
  state.dependencies.push({ fromExternalId: args[1], toExternalId: args[2], type: valueAfter("--type") || "blocks" });
  await writeFile(statePath, JSON.stringify(state), "utf8");
  out({ ok: true, record: state.dependencies.at(-1) });
} else if (command === "ready") {
  out({ ok: true, tasks: Object.values(state.tasks).filter((task) => task.status !== "complete") });
} else if (command === "update" && args.includes("--claim")) {
  state.claims[id] = { externalId: id, owner: valueAfter("--claim"), status: "active" };
  await writeFile(statePath, JSON.stringify(state), "utf8");
  out({ ok: true, claim: state.claims[id] });
} else if (command === "close") {
  state.tasks[id] = { ...(state.tasks[id] || { externalId: id }), status: "complete", evidence: JSON.parse(valueAfter("--evidence") || "[]") };
  delete state.claims[id];
  await writeFile(statePath, JSON.stringify(state), "utf8");
  out({ ok: true, record: state.tasks[id] });
} else if (command === "show") out({ ok: true, record: state.tasks[id] || null });
else if (command === "export") out({ ok: true, tasks: Object.values(state.tasks), dependencies: state.dependencies, claims: Object.values(state.claims) });
else if (command === "sync") out({ ok: true, synced: true });
else out({ ok: true, command, args });
`, "utf8");
  return { callsPath, scriptPath, statePath: join(rootDir, "state.json") };
}

test("CLI task tracker adapter implements required methods and parses JSON", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-cli-tracker-"));
  const fake = await createFakeTracker(rootDir);
  const adapter = createCliTaskTrackerAdapter({
    command: process.execPath,
    baseArgs: [fake.scriptPath],
    cwd: rootDir,
    env: {
      FAKE_TRACKER_CALLS: fake.callsPath,
      FAKE_TRACKER_STATE: fake.statePath,
    },
  });

  assert.equal(assertTaskTrackerAdapter(adapter), true);
  assert.equal((await adapter.detect()).status, "available-ready");
  assert.equal(adapter.version().ok, true);

  const epic = await adapter.createEpic({ itemId: "epic-1", title: "Epic 1" });
  const task = await adapter.createTask({ itemId: "task-1", title: "Task 1", parentExternalId: epic.externalId });
  const dep = await adapter.addDependency({ fromExternalId: task.externalId, toExternalId: "task-2", type: "blocks" });
  const ready = await adapter.ready();
  const claim = await adapter.claim({ externalId: task.externalId, owner: "agent-a" });
  const close = await adapter.close({ externalId: task.externalId, evidence: ["node --test"], reason: "verified" });
  const exported = await adapter.export();

  assert.equal(epic.ok, true);
  assert.equal(task.ok, true);
  assert.equal(dep.ok, true);
  assert.equal(ready.tasks.length >= 1, true);
  assert.equal(claim.claim.owner, "agent-a");
  assert.equal(close.record.status, "complete");
  assert.equal(exported.ok, true);

  const calls = (await readFile(fake.callsPath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(calls.some((call) => call.args[0] === "ready" && call.args.includes("--json")));
  assert.ok(calls.some((call) => call.args[0] === "update" && call.args.includes("--claim")));
});

test("CLI task tracker adapter reports unavailable command and redacts payloads", async () => {
  const adapter = createCliTaskTrackerAdapter({ command: "definitely-missing-supervibe-tracker" });
  const detection = await adapter.detect();
  assert.equal(detection.available, false);
  assert.equal(detection.status, "unavailable");

  assert.deepEqual(redactTrackerPayload({ apiToken: "secret", nested: { password: "pw", safe: "ok" } }), {
    apiToken: "[REDACTED_SECRET]",
    nested: { password: "[REDACTED_SECRET]", safe: "ok" },
  });
});
