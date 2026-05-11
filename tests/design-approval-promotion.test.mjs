import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  promoteDesignApprovalState,
} from "../scripts/lib/design-approval-promotion.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

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

async function writeAgentInvocation(root, {
  invocationId,
  agentId,
  taskSummary,
  ts = "2026-05-03T00:00:30.000Z",
  confidenceScore = 9.5,
}) {
  const absPath = join(root, ".supervibe", "memory", "agent-invocations.jsonl");
  await mkdir(dirname(absPath), { recursive: true });
  await appendFile(absPath, `${JSON.stringify({
    schemaVersion: 1,
    invocation_id: invocationId,
    ts,
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: confidenceScore,
  })}\n`, "utf8");
  return {
    source: "agent-invocations-jsonl",
    invocationId,
  };
}

async function issueDesignReceipt(root, {
  subjectType,
  subjectId,
  stage,
  outputArtifacts,
  invocationReason,
  handoffId = "agent-chat",
  startedAt = "2026-05-03T00:00:00.000Z",
  completedAt = "2026-05-03T00:01:00.000Z",
}) {
  const isHostAgent = ["agent", "worker", "reviewer"].includes(subjectType);
  const hostInvocation = isHostAgent
    ? await writeAgentInvocation(root, {
        invocationId: `${subjectId}-${stage}-invocation`,
        agentId: subjectId,
        taskSummary: invocationReason,
      })
    : null;
  await issueWorkflowInvocationReceipt({
    rootDir: root,
    command: "/supervibe-design",
    subjectType,
    subjectId,
    agentId: isHostAgent ? subjectId : null,
    skillId: subjectType === "skill" ? subjectId : null,
    stage,
    invocationReason,
    inputEvidence: [outputArtifacts[0]],
    outputArtifacts,
    startedAt,
    completedAt,
    handoffId,
    ...(hostInvocation ? { hostInvocation } : {}),
  });
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
      designWizard: {
        decisions: {
          palette_mood: { choiceId: "commerce-dossier-dark" },
        },
      },
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/spec.md", "# Spec\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/content/copy.md", "# Copy\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md", "# Polish\n\nVerdict: PASS\n\nBlockers: none\nHigh issues: none\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md", "# A11y\n\nVerdict: PASS\n\nBlockers: none\nHigh issues: none\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/quality-gate.json", `${JSON.stringify({
      pass: true,
      confidence: 10,
      generatedAt: "2026-05-03T12:00:00.000Z",
    }, null, 2)}\n`);

    await issueDesignReceipt(root, {
      subjectType: "agent",
      subjectId: "creative-director",
      stage: "stage-1-brand-direction",
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      invocationReason: "creative director produced brand direction",
    });
    await issueDesignReceipt(root, {
      subjectType: "skill",
      subjectId: "supervibe:brandbook",
      stage: "stage-2-design-system",
      outputArtifacts: [
        ".supervibe/artifacts/prototypes/_design-system/tokens.css",
        ".supervibe/artifacts/prototypes/_design-system/manifest.json",
        ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json",
        ".supervibe/artifacts/prototypes/_design-system/styleboard.html",
      ],
      invocationReason: "brandbook producer materialized candidate design system",
    });
    await issueDesignReceipt(root, {
      subjectType: "agent",
      subjectId: "ux-ui-designer",
      stage: "stage-3-screen-spec",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/spec.md"],
      invocationReason: "ux ui designer produced prototype screen spec",
    });
    await issueDesignReceipt(root, {
      subjectType: "agent",
      subjectId: "copywriter",
      stage: "stage-4-copy",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/content/copy.md"],
      invocationReason: "copywriter finalized prototype microcopy",
    });
    await issueDesignReceipt(root, {
      subjectType: "agent",
      subjectId: "prototype-builder",
      stage: "stage-5-prototype-build",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/index.html"],
      invocationReason: "prototype builder produced durable prototype",
    });
    await issueDesignReceipt(root, {
      subjectType: "reviewer",
      subjectId: "ui-polish-reviewer",
      stage: "stage-6-polish-review",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md"],
      invocationReason: "ui polish reviewer accepted the prototype",
    });
    await issueDesignReceipt(root, {
      subjectType: "reviewer",
      subjectId: "accessibility-reviewer",
      stage: "stage-6-a11y-review",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md"],
      invocationReason: "accessibility reviewer accepted the prototype",
    });
    await issueDesignReceipt(root, {
      subjectType: "reviewer",
      subjectId: "quality-gate-reviewer",
      stage: "stage-7-quality-gate",
      outputArtifacts: [".supervibe/artifacts/prototypes/agent-chat/_reviews/quality-gate.json"],
      invocationReason: "quality gate reviewer verified provenance and approval evidence",
    });

    const result = await promoteDesignApprovalState(root, {
      slug: "agent-chat",
      approvedBy: "test-user",
      approvedAt: "2026-05-03T12:00:00.000Z",
      feedbackHash: "sha256:test",
    });

    assert.equal(result.pass, true, JSON.stringify(result, null, 2));
    assert.ok(result.updatedFiles.includes(".supervibe/artifacts/prototypes/_design-system/manifest.json"));
    assert.ok(result.updatedFiles.includes(".supervibe/artifacts/prototypes/_design-system/design-flow-state.json"));
    assert.ok(result.updatedFiles.includes(".supervibe/artifacts/prototypes/agent-chat/.approval.json"));
    assert.ok(result.updatedFiles.includes(".supervibe/artifacts/prototypes/agent-chat/designer-package.json"));

    const manifest = await readJson(root, ".supervibe/artifacts/prototypes/_design-system/manifest.json");
    assert.equal(manifest.status, "approved");
    assert.equal(manifest.tokensState, "final");
    assert.ok(REQUIRED_SECTIONS.every((section) => manifest.sections[section] === "approved"));
    assert.equal(manifest.approvedVariant, "commerce-dossier-dark");
    assert.equal(manifest.variants["commerce-dossier-dark"].status, "approved");

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

test("approval promotion blocks prototype approval when review gate has blocker or high findings", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-approval-quality-gate-"));
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
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      approval: "candidate",
      status: "candidate",
      mode: "full-prototype-pipeline",
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md", "# Polish\n\n- Severity: high - trace rows overflow at 1280x800.\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md", "# A11y\n\nBlockers: none\n");

    const result = await promoteDesignApprovalState(root, {
      slug: "agent-chat",
      approvedBy: "test-user",
      approvedAt: "2026-05-03T12:00:00.000Z",
      feedbackHash: "sha256:test",
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => /quality gate blocked approval/.test(issue)));

    const config = await readJson(root, ".supervibe/artifacts/prototypes/agent-chat/config.json");
    assert.equal(config.approval, "candidate");
    assert.equal(config.status, "candidate");
    assert.equal(existsSync(join(root, ".supervibe/artifacts/prototypes/agent-chat/.approval.json")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("approval promotion blocks prototype approval when browser evidence has no reviewer artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-approval-browser-evidence-"));
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
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      approval: "candidate",
      status: "candidate",
      mode: "full-prototype-pipeline",
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html><title>Prototype</title>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_verification/browser.json", `${JSON.stringify({
      pass: true,
      score: 9.4,
      summary: "desktop and mobile visual verification passed",
    }, null, 2)}\n`);

    const result = await promoteDesignApprovalState(root, {
      slug: "agent-chat",
      approvedBy: "test-user",
      approvedAt: "2026-05-03T12:00:00.000Z",
      feedbackHash: "sha256:test",
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => /missing|required review/i.test(issue)));

    assert.equal(
      existsSync(join(root, ".supervibe", "artifacts", "prototypes", "agent-chat", "_reviews", "quality-gate.json")),
      false,
      "approval promotion must not synthesize final quality-gate reviewer evidence",
    );
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
