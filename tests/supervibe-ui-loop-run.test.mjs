import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createSupervibeUiServer,
  renderSupervibeUiHtml,
} from "../scripts/lib/supervibe-ui-server.mjs";

test("Loop run tab exposes autoload states while keeping manual path entry", () => {
  const html = renderSupervibeUiHtml();

  assert.match(html, /id="statePath"/);
  assert.match(html, /id="loadRunBtn"/);
  assert.match(html, /id="runState"/);
  assert.match(html, /data-run-state="loading"/);
  assert.match(html, /autoloadRun\(\)/);
  assert.match(html, /renderRunState\('loading'/);
  assert.match(html, /renderRunState\('success'/);
  assert.match(html, /renderRunState\('stale'/);
  assert.match(html, /renderRunState\('error'/);
  assert.match(html, /manual path/i);
});

test("Loop run API autoloads an existing loop state when no file is supplied", async () => {
  const root = await makeTempRoot("supervibe-ui-loop-run-");
  const stateRel = ".supervibe/memory/loops/run-ui/state.json";
  await writeState(join(root, stateRel), {
    schema_version: 1,
    run_id: "run-ui",
    status: "IN_PROGRESS",
    next_action: "dispatch",
    tasks: [{ id: "load-run-tab", status: "open", title: "Load run tab" }],
  });

  const { server } = createSupervibeUiServer({ rootDir: root });
  await listen(server);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/run`);
    const run = await response.json();

    assert.equal(response.status, 200);
    assert.equal(run.runId, "run-ui");
    assert.equal(run.status, "IN_PROGRESS");
    assert.equal(run.runPathRelative, stateRel);
    assert.equal(run.source.pathRelative, stateRel);
    assert.equal(run.source.discoveryMode, "auto-latest");
    assert.ok(run.source.modifiedAt);
    assert.ok(Number.isFinite(run.source.ageSeconds));
    assert.match(run.source.freshness, /fresh|warm|stale/);
    assert.equal(run.flow.activeId, "execute");
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("Loop run API returns a stale model when no loop state exists", async () => {
  const root = await makeTempRoot("supervibe-ui-loop-stale-");
  const { server } = createSupervibeUiServer({ rootDir: root });
  await listen(server);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/run`);
    const run = await response.json();

    assert.equal(response.status, 200);
    assert.equal(run.status, "no-loop");
    assert.equal(run.runPath, null);
    assert.equal(run.runPathRelative, null);
    assert.match(run.nextAction, /supervibe-loop --status/i);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("Loop run API returns readable parse errors with an inspection command", async () => {
  const root = await makeTempRoot("supervibe-ui-loop-parse-");
  const stateRel = ".supervibe/memory/loops/bad/state.json";
  await mkdir(join(root, ".supervibe/memory/loops/bad"), { recursive: true });
  await writeFile(join(root, stateRel), "{ invalid json\n", "utf8");

  const { server } = createSupervibeUiServer({ rootDir: root });
  await listen(server);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/run?file=${encodeURIComponent(stateRel)}`);
    const run = await response.json();

    assert.equal(response.status, 200);
    assert.equal(run.status, "parse-error");
    assert.equal(run.runPathRelative, stateRel);
    assert.equal(run.uiApi.endpoint, "run");
    assert.match(run.nextAction, /supervibe-loop --doctor --file/i);
  } finally {
    await close(server);
    await rm(root, { recursive: true, force: true });
  }
});

async function writeState(statePath, state) {
  await mkdir(join(statePath, ".."), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

async function makeTempRoot(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
