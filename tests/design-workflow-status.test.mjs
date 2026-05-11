import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  formatDesignWorkflowStatus,
  readDesignWorkflowStatus,
} from "../scripts/lib/design-workflow-status.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("design workflow status shows approved DS with missing prototype and blocked handoff", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-status-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      design_system: {
        status: "approved",
        approved_sections: [
          "palette",
          "typography",
          "spacing-density",
          "radius-elevation",
          "motion",
          "component-set",
          "copy-language",
          "accessibility-platform",
        ],
      },
      prototype: { requested: "ALLOWED" },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      mode: "design-system-only",
      stageTriage: {
        "stage-3-screen-spec": { status: "skipped" },
        "stage-5-prototype-build": { status: "skipped" },
      },
    }, null, 2)}\n`);

    const status = readDesignWorkflowStatus(root, { slug: "agent-chat" });
    const report = formatDesignWorkflowStatus(status);

    assert.equal(status.designSystem.approved, true);
    assert.equal(status.prototype.unlocked, true);
    assert.equal(status.prototype.exists, false);
    assert.equal(status.handoff.blocked, true);
    assert.equal(status.nextAction, "Build prototype / revise DS / stop");
    assert.equal(status.prototype.nextQuestion.id, "prototype_interaction_depth");
    assert.equal(status.recommendedStageTriage["stage-3-screen-spec"].status, "available");
    assert.equal(status.recommendedStageTriage["stage-5-prototype-build"].status, "available");
    assert.match(report, /SUPERVIBE_DESIGN_STATUS/);
    assert.match(report, /PROTOTYPE_EXISTS: false/);
    assert.match(report, /HANDOFF_BLOCKED: true/);
    assert.match(report, /NEXT_QUESTION: prototype_interaction_depth/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design workflow status exposes continuation actions for candidate design system", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-status-candidate-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      design_system: {
        status: "candidate",
        approved_sections: [],
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/tokens.css", ":root { --color-primary-500: #123456; }\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json", `${JSON.stringify({ status: "candidate" }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/styleboard.html", "<!doctype html><html><body>Candidate</body></html>\n");

    const status = readDesignWorkflowStatus(root, { slug: "agent-chat" });
    const report = formatDesignWorkflowStatus(status);

    assert.equal(status.prototype.unlocked, false);
    assert.deepEqual(
      status.nextUserActions.map((action) => action.id),
      ["approve_design_system", "revise_styleboard", "compare_alternatives", "stop"],
    );
    assert.match(report, /NEXT_USER_ACTIONS:/);
    assert.match(report, /approve_design_system: Approve design system/);
    assert.match(report, /PROTOTYPE_UNLOCKED: false/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design workflow status points missing design system back to wizard instead of review", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-status-missing-ds-"));
  try {
    const status = readDesignWorkflowStatus(root, { slug: "agent-chat" });
    const report = formatDesignWorkflowStatus(status);

    assert.equal(status.designSystem.status, "missing");
    assert.equal(status.prototype.unlocked, false);
    assert.equal(status.nextAction, "Answer design wizard question / close creative direction axes");
    assert.deepEqual(
      status.nextUserActions.map((action) => action.id),
      ["answer_next_question", "continue_dispatch", "resume_last_trusted", "stop"],
    );
    assert.match(report, /NEXT_ACTION: Answer design wizard question \/ close creative direction axes/);
    assert.doesNotMatch(report, /approve_design_system: Approve design system/);
    assert.doesNotMatch(report, /NEXT_ACTION: Review design system/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design workflow status flags config drift when prototype exists but state says missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-status-drift-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      design_system: {
        status: "approved",
        approved_sections: [
          "palette",
          "typography",
          "spacing-density",
          "radius-elevation",
          "motion",
          "component-set",
          "copy-language",
          "accessibility-platform",
        ],
      },
      prototype: { requested: "ALLOWED" },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      mode: "design-system-only",
      prototypeExists: false,
      stageTriage: {
        "stage-5-prototype-build": { status: "skipped" },
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");

    const status = readDesignWorkflowStatus(root, { slug: "agent-chat" });
    const report = formatDesignWorkflowStatus(status);

    assert.equal(status.prototype.exists, true);
    assert.equal(status.stateConsistency.pass, false);
    assert.ok(status.stateConsistency.issues.some((issue) => issue.code === "config-prototype-exists-drift"));
    assert.match(report, /STALE_STATE: true/);
    assert.match(report, /STATE_ISSUE: blocker config-prototype-exists-drift/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design workflow status exposes scoped stage contract blockers", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-status-contracts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      design_system: {
        status: "approved",
        approved_sections: [
          "palette",
          "typography",
          "spacing-density",
          "radius-elevation",
          "motion",
          "component-set",
          "copy-language",
          "accessibility-platform",
        ],
      },
      prototype: { requested: "ALLOWED" },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", "{\"target\":\"tauri\"}\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");

    const status = readDesignWorkflowStatus(root, { slug: "agent-chat" });
    const report = formatDesignWorkflowStatus(status);

    assert.equal(status.designReceipts.pass, false);
    assert.equal(status.stageContracts.pass, false);
    assert.ok(status.stageContracts.blockingCount >= 7);
    assert.ok(status.stageContracts.contracts.some((contract) => contract.subjectId === "prototype-builder" && contract.blocking === true));
    assert.match(report, /SCOPED_DESIGN_RECEIPTS_PASS: false/);
    assert.match(report, /STAGE_CONTRACTS_PASS: false/);
    assert.match(report, /STAGE_CONTRACT: pending-receipt agent:prototype-builder@stage-5-prototype-build/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
