import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateWorkflowReceipts,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";
import {
  WORKFLOW_STAGE_STATES,
  buildStageState,
  normalizeWorkflowStageState,
} from "../scripts/lib/supervibe-stage-state.mjs";

const ROOT = process.cwd();
const STAGE_SCRIPT = join(ROOT, "scripts", "supervibe-stage.mjs");

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("supervibe-stage runner logs host agent output and issues receipt in one command", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-stage-agent-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");

    const out = execFileSync(process.execPath, [
      STAGE_SCRIPT,
      "run",
      "--root",
      root,
      "--workflow",
      "design",
      "--stage",
      "creative-direction",
      "--host",
      "codex",
      "--host-invocation-id",
      "codex-stage-1",
      "--handoff",
      "agent-chat",
      "--confidence",
      "9.1",
      "--secret",
      "test-secret",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(out, /SUPERVIBE_STAGE_RUN/);
    assert.match(out, /PRODUCER: agent:creative-director/);
    assert.match(out, /AGENT_OUTPUT_JSON: \.supervibe\/artifacts\/_agent-outputs\/codex-stage-1\/agent-output\.json/);
    assert.match(out, /NEXT_USER_ACTIONS:/);
    const receipts = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(receipts.pass, true);
    assert.equal(receipts.receipts, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shared stage-state helper exposes normalized lifecycle states", () => {
  assert.ok(WORKFLOW_STAGE_STATES.includes("review_required"));
  assert.equal(normalizeWorkflowStageState("failed-recoverable"), "failed_recoverable");

  const state = buildStageState({
    workflow: "/supervibe-design",
    stage: "stage-2-design-system",
    status: "failed-recoverable",
    owner: "supervibe:brandbook",
    artifact: ".supervibe/artifacts/prototypes/_design-system/styleboard.html",
  });

  assert.equal(state.status, "failed_recoverable");
  assert.equal(state.recoverable, true);
  assert.equal(state.blocking, false);
});
