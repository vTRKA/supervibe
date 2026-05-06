import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignWorkflowState,
} from "../scripts/validate-design-workflow-state.mjs";
import {
  syncApprovedPrototypeState,
} from "../scripts/lib/design-workflow-state-sync.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function readJson(root, relPath) {
  return JSON.parse(await readFile(join(root, ...relPath.split("/")), "utf8"));
}

test("design workflow state validator fails when config says no prototype but index exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-state-validator-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      design_system: { status: "approved", approved_sections: [] },
      prototype: { requested: "ALLOWED" },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      mode: "design-system-only",
      prototypeExists: false,
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");

    const result = validateDesignWorkflowState(root);

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "config-prototype-exists-drift"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design workflow state validator fails on wizard next-question drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-next-validator-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      mode: "full-prototype-pipeline",
      designWizardRuntimeStatePath: ".supervibe/memory/design-wizard/agent-chat.runtime.json",
      designWizard: {
        nextQuestionAxis: "creative_alternatives",
        runtimeStatePath: ".supervibe/memory/design-wizard/agent-chat.runtime.json",
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/memory/design-wizard/agent-chat.runtime.json", `${JSON.stringify({
      schemaVersion: 1,
      runtimeStatus: { nextQuestionAxis: "viewport" },
      questionQueue: [{ axis: "viewport" }],
    }, null, 2)}\n`);

    const result = validateDesignWorkflowState(root);

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "design-wizard-next-question-drift"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approved prototype state sync repairs config, flow state, and manifest drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-approved-sync-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json", `${JSON.stringify({
      status: "approved",
      tokensState: "final",
      target: "unknown",
      workflowState: { prototypeApproved: false, handoffBlocked: true },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      designSystemApproved: false,
      prototypeUnlocked: false,
      prototypeApproved: false,
      design_system: { status: "candidate" },
      prototype: {
        requested: "BLOCKED",
        exists: false,
        status: "prototype-draft",
        handoff_blocked_reason: "handoff requires approved prototype",
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      target: "unknown",
      themeVariant: "commerce-dossier-dark",
      designSystemStatus: "missing",
      status: "prototype-draft",
      handoffBlocked: true,
      prototypeExists: false,
      prototypeUnlocked: false,
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/.approval.json", `${JSON.stringify({
      status: "approved",
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md", "# Polish\n\nVerdict: PASS\n\nBlockers: none\nHigh issues: none\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md", "# A11y\n\nVerdict: PASS\n\nBlockers: none\nHigh issues: none\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/designer-package.json", "{}\n");

    const sync = await syncApprovedPrototypeState(root, {
      slug: "agent-chat",
      target: "web",
      updatedAt: "2026-05-06T00:00:00.000Z",
    });

    assert.equal(sync.pass, true);
    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");
    assert.equal(config.target, "web");
    assert.equal(config.designSystemStatus, "approved");
    assert.equal(config.status, "approved");
    assert.equal(config.prototypeApproved, true);
    assert.equal(config.handoffBlocked, false);

    const flow = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json");
    assert.equal(flow.designSystemApproved, true);
    assert.equal(flow.prototypeUnlocked, true);
    assert.equal(flow.prototypeApproved, true);
    assert.equal(flow.prototype.status, "approved");
    assert.equal(flow.prototype.handoff_blocked_reason, null);

    const manifest = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json");
    assert.equal(manifest.target, "web");
    assert.equal(manifest.approvedVariant, "commerce-dossier-dark");
    assert.equal(manifest.workflowState.prototypeApproved, true);
    assert.equal(manifest.workflowState.handoffBlocked, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
