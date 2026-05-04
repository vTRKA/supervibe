import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildDesignWizardState,
} from "../scripts/lib/design-wizard-catalog.mjs";
import {
  validateDynamicQuestionSystems,
} from "../scripts/validate-dynamic-question-systems.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("slug-level dynamic validator fails when runtime has no trusted specialist question", async () => {
  const root = await mkdtemp(join(tmpdir(), "dynamic-question-runtime-"));
  try {
    const state = buildDesignWizardState({
      brief: "Agent chat workspace with approvals, traces, and compact desktop panels.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      initialDecisions: {
        viewport: { axis: "viewport", answer: "1440x900", source: "user" },
      },
    });
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals, traces, and compact desktop panels.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      designWizard: state,
    }, null, 2)}\n`);

    const result = validateDynamicQuestionSystems({
      rootDir: root,
      slug: "agent-chat",
      requireTrustedSpecialistProposal: true,
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-trusted-runtime-specialist-question"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("slug-level dynamic validator rejects fallback questions presented as visible specialist output", async () => {
  const root = await mkdtemp(join(tmpdir(), "dynamic-question-fallback-"));
  try {
    const state = buildDesignWizardState({
      brief: "Agent chat workspace with approvals, traces, and compact desktop panels.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      initialDecisions: {
        viewport: { axis: "viewport", answer: "1440x900", source: "user" },
      },
    });
    state.questionQueue[0] = {
      ...state.questionQueue[0],
      visibleOnlyWhenTrusted: false,
    };
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals, traces, and compact desktop panels.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      designWizard: state,
    }, null, 2)}\n`);

    const result = validateDynamicQuestionSystems({
      rootDir: root,
      slug: "agent-chat",
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "fallback-question-presented-as-specialist"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
