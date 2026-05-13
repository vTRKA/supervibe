import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createSupervibeUiServer } from "../scripts/lib/supervibe-ui-server.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);
const LOOP = join(ROOT, "scripts", "supervibe-loop.mjs");
const STATUS = join(ROOT, "scripts", "supervibe-status.mjs");
const FIXTURE_PLAN = join(ROOT, "tests", "fixtures", "task-graph", "full-flow-plan.md");

test("task graph full flow: invalid plan is rejected before durable graph write", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-full-flow-invalid-"));
  try {
    const planPath = join(root, ".supervibe", "artifacts", "plans", "invalid.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, "# Invalid\n\nThis reviewed plan has no tasks.\n", "utf8");

    await assert.rejects(
      execFileAsync(process.execPath, [
        LOOP,
        "--atomize-plan",
        planPath,
        "--plan-review-passed",
        "--allow-unverified-plan-review",
        "--epic",
        "epic-invalid",
      ], { cwd: root, env: { ...process.env, SUPERVIBE_ALLOW_UNVERIFIED_PLAN_REVIEW: "1" } }),
      /invalid work-item graph|work-item graph invalid|no task headings found/i,
    );

    await assert.rejects(readFile(join(root, ".supervibe", "memory", "work-items", "epic-invalid", "graph.json"), "utf8"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("task graph full flow: reviewed plan atomizes, loop syncs graph, UI applies action, and production close is gated", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-full-flow-"));
  try {
    const planPath = join(root, ".supervibe", "artifacts", "plans", "full-flow.md");
    await mkdir(dirname(planPath), { recursive: true });
    await writeFile(planPath, await readFile(FIXTURE_PLAN, "utf8"), "utf8");

    const atomized = await execFileAsync(process.execPath, [
      LOOP,
      "--atomize-plan",
      planPath,
      "--plan-review-passed",
      "--allow-unverified-plan-review",
      "--epic",
      "epic-full-flow",
    ], { cwd: root, env: { ...process.env, SUPERVIBE_ALLOW_UNVERIFIED_PLAN_REVIEW: "1" } });
    assert.match(atomized.stdout, /SUPERVIBE_WORK_ITEMS/);
    assert.match(atomized.stdout, /VALID: true/);
    const graphPath = atomized.stdout.match(/^GRAPH: (.+)$/m)?.[1]?.trim();
    assert.ok(graphPath, "atomizer should print graph path");

    const resumed = await execFileAsync(process.execPath, [
      LOOP,
      "--status",
    ], { cwd: root });
    assert.match(resumed.stdout, /SUPERVIBE_EPIC_STATUS/);
    assert.match(resumed.stdout, /NEXT_ACTION:/);

    const status = await execFileAsync(process.execPath, [
      STATUS,
      "--no-color",
      "--no-gc-hints",
      "--ready",
    ], { cwd: root, env: { ...process.env, SUPERVIBE_PLUGIN_ROOT: ROOT } });
    assert.match(status.stdout, /SUPERVIBE_ACTIVE_WORK_GRAPH/);
    assert.match(status.stdout, /READY_ITEM: epic-full-flow-t1/);

    const looped = await execFileAsync(process.execPath, [
      LOOP,
      "--file",
      graphPath,
      "--dry-run",
      "--run-id",
      "full-flow-run",
    ], { cwd: root });
    assert.match(looped.stdout, /NATIVE_WORK_GRAPH_SYNC: synced/);
    assert.match(looped.stdout, /PRODUCTION_READY: false/);

    let graph = JSON.parse(await readFile(graphPath, "utf8"));
    assert.equal(graph.nativeLoopSync.status, "synced");
    assert.equal(graph.items.find((item) => item.itemId === "epic-full-flow-t1").status, "complete");

    let dryRunCompletion = null;
    try {
      await execFileAsync(process.execPath, [
        LOOP,
        "--validate-completion",
        "--file",
        graphPath,
      ], { cwd: root });
    } catch (error) {
      dryRunCompletion = `${error.stdout || ""}\n${error.stderr || ""}`;
    }
    assert.match(dryRunCompletion || "", /dry-run evidence/i);

    const { server } = createSupervibeUiServer({ rootDir: root, graphPath });
    await listen(server);
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const preview = await (await fetch(`${baseUrl}/api/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          file: graphPath,
          itemId: "epic-full-flow-t2",
          type: "edit",
          title: "Validate production completion through UI",
          apply: false,
        }),
      })).json();
      assert.equal(preview.dryRun, true);

      const applied = await (await fetch(`${baseUrl}/api/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          file: graphPath,
          itemId: "epic-full-flow-t2",
          type: "edit",
          title: "Validate production completion through UI",
          apply: true,
          confirm: "apply-local",
          previewToken: preview.previewToken,
        }),
      })).json();
      assert.equal(applied.changed, true);
    } finally {
      await close(server);
    }

    graph = JSON.parse(await readFile(graphPath, "utf8"));
    const productionEvidence = {
      kind: "test",
      command: "node --test tests/task-graph-full-flow.test.mjs",
      status: "pass",
      outputSummary: "full flow production completion verified",
      receiptId: "task-graph-full-flow-production-evidence",
      mode: "production",
    };
    graph.evidence = [];
    graph.items = graph.items.map((item) => {
      if (item.type !== "epic") {
        return {
          ...item,
          status: "complete",
          evidence: [{ ...productionEvidence, taskId: item.itemId }],
        };
      }
      return item;
    });
    graph.tasks = graph.tasks.map((task) => ({
      ...task,
      status: "complete",
      evidence: [{ ...productionEvidence, taskId: task.id }],
    }));
    await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");

    const eligible = await execFileAsync(process.execPath, [
      LOOP,
      "--close-eligible",
      "--file",
      graphPath,
    ], { cwd: root });
    assert.match(eligible.stdout, /PASS: true/);

    let closeWithoutReleaseEvidence = null;
    try {
      await execFileAsync(process.execPath, [
        LOOP,
        "--close",
        "epic-full-flow",
        "--file",
        graphPath,
        "--reason",
        "production evidence verified",
      ], { cwd: root });
    } catch (error) {
      closeWithoutReleaseEvidence = `${error.stdout || ""}\n${error.stderr || ""}\n${error.message || ""}`;
    }
    assert.match(closeWithoutReleaseEvidence || "", /RELEASE_FULL_CHECK_GATE|final release gate/i);

    const closed = await execFileAsync(process.execPath, [
      LOOP,
      "--close",
      "epic-full-flow",
      "--file",
      graphPath,
      "--reason",
      "production evidence verified",
      "--verification-command",
      "npm run check:release",
      "--verification-status",
      "pass",
      "--evidence",
      "release full check passed",
    ], { cwd: root });
    assert.match(closed.stdout, /ACTION: closed/);

    const finalCompletion = await execFileAsync(process.execPath, [
      LOOP,
      "--validate-completion",
      "--file",
      graphPath,
    ], { cwd: root });
    assert.match(finalCompletion.stdout, /PASS: true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
