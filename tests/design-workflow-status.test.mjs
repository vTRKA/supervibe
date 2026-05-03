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
