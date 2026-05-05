import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignWorkflowState,
} from "../scripts/validate-design-workflow-state.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
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
