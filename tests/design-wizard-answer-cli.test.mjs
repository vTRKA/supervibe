import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function readJson(root, relPath) {
  return JSON.parse(await readFile(join(root, ...relPath.split("/")), "utf8"));
}

test("design-wizard-answer records a single user answer without manual config patching", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals and trace review.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      designWizard: {
        decisions: {
          viewport: { axis: "viewport", answer: "1440x900", choiceId: "custom", source: "user" },
        },
      },
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "information_density",
      "--choice",
      "compact",
      "--source",
      "user",
      "--timestamp",
      "2026-05-04T00:00:00.000Z",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");

    assert.match(output, /SUPERVIBE_DESIGN_WIZARD_ANSWER/);
    assert.match(output, /AXES_UPDATED: information_density/);
    assert.equal(config.designWizard.decisions.information_density.choiceId, "compact");
    assert.equal(config.designWizard.decisions.information_density.source, "user");
    assert.ok(!config.designWizard.questionQueue.some((question) => question.axis === "information_density"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-wizard-answer can delegate remaining recommendations while keeping review gate closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-delegate-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals, tool calls, subagents, and trace review.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      designWizard: {
        decisions: {
          viewport: { axis: "viewport", answer: "1440x900", choiceId: "custom", source: "user" },
        },
      },
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--accept-recommended-remaining",
      "--source",
      "delegated-to-agent",
      "--timestamp",
      "2026-05-04T00:00:00.000Z",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");

    assert.match(output, /SOURCE: delegated-to-agent/);
    assert.match(output, /DELEGATED_REVIEW_REQUIRED: true/);
    assert.equal(config.designWizard.gates.delegatedReviewRequired, true);
    assert.equal(config.designWizard.gates.tokensUnlocked, false);
    assert.ok(config.designWizard.coverage.delegatedAxes.length >= 3);
    assert.ok(Object.values(config.designWizard.decisions).some((decision) => decision.source === "delegated-to-agent"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-wizard-answer accepts --answer alias for viewport values and closes the viewport gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-viewport-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Tauri desktop app",
      target: "tauri",
      mode: "full-prototype-pipeline",
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "viewport",
      "--answer",
      "1920x1080",
      "--timestamp",
      "2026-05-04T00:00:00.000Z",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");

    assert.match(output, /CONFIG_REVISION: 1/);
    assert.match(output, /AXES_UPDATED: viewport/);
    assert.equal(config.configRevision, 1);
    assert.equal(config.designWizard.decisions.viewport.answer, "1920x1080");
    assert.equal(config.designWizard.decisions.viewport.choiceId, "wide-desktop");
    assert.equal(config.designWizard.gates.viewportPolicyRecorded, true);
    assert.ok(!config.designWizard.questionQueue.some((question) => question.axis === "viewport"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-wizard-answer fails fast on unknown args and stale config revisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "design-wizard-answer-revision-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Agent chat workspace with approvals and trace review.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      configRevision: 3,
      designWizard: {
        decisions: {
          viewport: { axis: "viewport", answer: "1440x900", choiceId: "custom", source: "user" },
        },
      },
    }, null, 2)}\n`);

    assert.throws(() => execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "information_density",
      "--unknown",
      "value",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    }), /Unknown argument: --unknown/);

    assert.throws(() => execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-wizard-answer.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--axis",
      "information_density",
      "--choice",
      "compact",
      "--expected-revision",
      "2",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "pipe",
    }), /config revision mismatch: expected 2, got 3/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
