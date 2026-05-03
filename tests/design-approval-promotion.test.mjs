import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  promoteDesignApprovalState,
} from "../scripts/lib/design-approval-promotion.mjs";

const REQUIRED_SECTIONS = [
  "palette",
  "typography",
  "spacing-density",
  "radius-elevation",
  "motion",
  "component-set",
  "copy-language",
  "accessibility-platform",
];

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function readJson(root, relPath) {
  return JSON.parse(await readFile(join(root, ...relPath.split("/")), "utf8"));
}

test("approval promotion moves design-system and prototype state from candidate to approved", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-approval-promotion-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json", `${JSON.stringify({
      status: "candidate",
      tokensState: "candidate",
      sections: Object.fromEntries(REQUIRED_SECTIONS.map((section) => [section, "candidate"])),
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      creative_direction: { status: "selected" },
      design_system: {
        status: "candidate",
        approved_sections: [],
        sections: Object.fromEntries(REQUIRED_SECTIONS.map((section) => [section, { status: "candidate" }])),
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/.approvals/palette.json", `${JSON.stringify({
      section: "palette",
      status: "candidate",
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/tokens.css", ":root { --color-primary: #123456; }\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/styleboard.html", "<!doctype html><title>Styleboard</title>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/components/button.md", "# Button\n\nStatus: candidate\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      approval: "candidate",
      status: "candidate",
      mode: "full-prototype-pipeline",
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/spec.md", "# Spec\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");

    const result = await promoteDesignApprovalState(root, {
      slug: "agent-chat",
      approvedBy: "test-user",
      approvedAt: "2026-05-03T12:00:00.000Z",
      feedbackHash: "sha256:test",
    });

    assert.equal(result.pass, true);
    assert.ok(result.updatedFiles.includes(".supervibe/artifacts/prototypes/_design-system/manifest.json"));
    assert.ok(result.updatedFiles.includes(".supervibe/artifacts/prototypes/_design-system/design-flow-state.json"));
    assert.ok(result.updatedFiles.includes(".supervibe/artifacts/prototypes/agent-chat/.approval.json"));
    assert.ok(result.updatedFiles.includes(".supervibe/artifacts/prototypes/agent-chat/designer-package.json"));

    const manifest = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json");
    assert.equal(manifest.status, "approved");
    assert.equal(manifest.tokensState, "final");
    assert.ok(REQUIRED_SECTIONS.every((section) => manifest.sections[section] === "approved"));

    const flow = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json");
    assert.equal(flow.design_system.status, "approved");
    assert.deepEqual(flow.design_system.approved_sections, REQUIRED_SECTIONS);
    assert.equal(flow.design_system.feedback_hash, "sha256:test");

    const section = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/.approvals/palette.json");
    assert.equal(section.status, "approved");
    assert.equal(section.approved_by, "test-user");

    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");
    assert.equal(config.approval, "approved");
    assert.equal(config.status, "approved");
    assert.equal(config.prototypeUnlocked, true);
    assert.equal(config.prototypeExists, true);
    assert.equal(config.handoffBlocked, false);

    const component = await readFile(join(root, ".supervibe", "artifacts", "prototypes", "_design-system", "components", "button.md"), "utf8");
    assert.match(component, /Status: approved/);

    const designerPackage = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/designer-package.json");
    assert.equal(designerPackage.status, "approved");
    assert.equal(designerPackage.artifacts.direction, ".supervibe/artifacts/brandbook/direction.md");
    assert.equal(designerPackage.artifacts.tokens, ".supervibe/artifacts/prototypes/_design-system/tokens.css");
    assert.equal(designerPackage.artifacts.styleboard, ".supervibe/artifacts/prototypes/_design-system/styleboard.html");
    assert.equal(designerPackage.artifacts.spec, ".supervibe/artifacts/prototypes/agent-chat/spec.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approval promotion keeps prototype handoff blocked when only DS is approved", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-approval-promotion-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json", `${JSON.stringify({
      status: "candidate",
      sections: Object.fromEntries(REQUIRED_SECTIONS.map((section) => [section, "candidate"])),
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json", `${JSON.stringify({
      creative_direction: { status: "selected" },
      design_system: {
        status: "candidate",
        approved_sections: [],
        sections: Object.fromEntries(REQUIRED_SECTIONS.map((section) => [section, { status: "candidate" }])),
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      approval: "candidate",
      status: "candidate",
      mode: "design-system-only",
      stageTriage: {
        "stage-3-screen-spec": { status: "skipped" },
        "stage-5-prototype-build": { status: "skipped" },
      },
    }, null, 2)}\n`);

    const result = await promoteDesignApprovalState(root, {
      slug: "agent-chat",
      approvedBy: "test-user",
      approvedAt: "2026-05-03T12:00:00.000Z",
      feedbackHash: "sha256:test",
      approvalScope: "design-system-only",
    });

    assert.equal(result.pass, true);
    assert.ok(!result.updatedFiles.includes(".supervibe/artifacts/prototypes/agent-chat/.approval.json"));

    const flow = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json");
    assert.equal(flow.design_system.status, "approved");
    assert.equal(flow.prototype.requested, "ALLOWED");
    assert.equal(flow.prototype.status, "prototype-ready");
    assert.match(flow.prototype.next_action, /Build prototype/);

    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");
    assert.equal(config.approval, "design-system-approved");
    assert.equal(config.status, "prototype-ready");
    assert.equal(config.prototypeUnlocked, true);
    assert.equal(config.prototypeExists, false);
    assert.equal(config.handoffBlocked, true);
    assert.equal(config.stageTriage["stage-3-screen-spec"].status, "available");
    assert.equal(config.stageTriage["stage-5-prototype-build"].status, "available");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
