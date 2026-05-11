import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  formatDesignActiveCompletionReport,
  validateBrowserEvidence,
  validateCapabilityPlan,
  validateDesignActiveCompletion,
  validateVariantLauncher,
} from "../scripts/lib/design-active-completion.mjs";

const ROOT = process.cwd();
const READY_COMMAND_PLAN = {
  pass: true,
  plan: {
    durableWritesAllowed: true,
    receiptGate: "trusted-scoped-runtime-agent-receipts",
    scopedReceiptTrust: { missingSubjects: [] },
  },
};
const READY_RECEIPTS = {
  pass: true,
  checked: 9,
  issues: [],
  missingAgents: [],
};

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

function completionOptions(overrides = {}) {
  return {
    active: true,
    command: "/supervibe-design",
    host: "codex",
    slug: "agent-chat",
    handoffId: "handoff-123",
    requestedVariantCount: 2,
    commandPlanResult: READY_COMMAND_PLAN,
    commandPlanStrictReady: true,
    designReceiptResult: READY_RECEIPTS,
    ...overrides,
  };
}

function validManifest() {
  const variants = [];
  for (let index = 0; index < 2; index += 1) {
    const id = `variant-${index + 1}`;
    variants.push({
      id,
      label: `Variant ${index + 1}`,
      artifactPath: `.supervibe/artifacts/prototypes/agent-chat/variants/${id}/index.html`,
      feedbackTargetId: `agent-chat:${id}`,
      fullscreen: true,
      primaryArtifact: true,
      differsBecause: `different composition ${index + 1}`,
      givesUp: `tradeoff ${index + 1}`,
      gains: `benefit ${index + 1}`,
      axes: {
        palette: `palette-${index + 1}`,
        typography: `type-${index + 1}`,
        motion: `motion-${index + 1}`,
        imagery: `imagery-${index + 1}`,
        hierarchy: `hierarchy-${index + 1}`,
        density: `density-${index + 1}`,
        composition: `composition-${index + 1}`,
        interaction: `interaction-${index + 1}`,
      },
      evidence: {
        referencePacket: "reference inventory",
        screenshotPlan: "desktop and mobile",
        tokenNotes: "candidate tokens",
        domLayoutSignature: `dom-${index + 1}`,
        cssTokenSignature: `css-${index + 1}`,
        screenshotViewportPlan: "1440x900, 390x844",
        interactionMotionSignature: `motion-${index + 1}`,
      },
    });
  }
  return {
    schemaVersion: 1,
    slug: "agent-chat",
    requestedVariantCount: 2,
    separateArtifactsRequired: true,
    primarySwitcherForbidden: true,
    variants,
  };
}

function htmlForVariant(index) {
  const target = `agent-chat:variant-${index + 1}`;
  const shells = [
    `<main class="flow-a" data-supervibe-feedback-target="${target}"><header></header><section class="canvas"></section><aside></aside></main>`,
    `<main class="flow-b" data-supervibe-feedback-target="${target}"><nav></nav><article class="ledger"></article><footer></footer></main>`,
  ];
  return `${shells[index]}\n`;
}

async function writeValidPrototype(root, { launcher = true, screenshot = true, capability = false, browser = false } = {}) {
  const manifest = validManifest();
  await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variant-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [index, variant] of manifest.variants.entries()) {
    await writeUtf8(root, variant.artifactPath, htmlForVariant(index));
  }
  if (launcher) {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variants/index.html", [
      "<main>",
      "<a href=\"variant-1/\">Variant 1</a>",
      "<a href=\"variant-2/\">Variant 2</a>",
      "</main>",
    ].join("\n"));
  }
  if (screenshot) {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/screenshot-similarity.json", `${JSON.stringify({
      pairs: [{ left: "variant-1", right: "variant-2", similarity: 0.42 }],
    }, null, 2)}\n`);
  }
  if (capability) {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/prototype-capability-plan.md", [
      "# Prototype Capability Plan",
      "slug: agent-chat",
      "handoff: handoff-123",
      "mode: enhanced-native Canvas",
    ].join("\n"));
  }
  if (browser) {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_evidence/browser-verification.json", `${JSON.stringify({
      desktopViewport: true,
      mobileViewport: true,
      nonblankRender: true,
      noHorizontalOverflow: true,
      feedbackButtonVisible: true,
      drawerOpenClose: true,
      focusTrap: true,
      keyboardNavigation: true,
      textOverlapScan: true,
      contrastAudit: true,
      focusVisible: true,
    }, null, 2)}\n`);
  }
  await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md", "No blockers. No high issues.\n");
  await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md", "No blockers. No high issues.\n");
}

test("global-safe mode passes as not-started when no active workflow exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-none-"));
  try {
    const result = validateDesignActiveCompletion(root, {});
    assert.equal(result.pass, true);
    assert.equal(result.status, "not-started");
    assert.equal(result.designCompletion, "not-started");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("global-safe mode blocks when durable prototype artifacts exist without active receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-artifacts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<main>prototype</main>\n");
    const result = validateDesignActiveCompletion(root, {});

    assert.equal(result.pass, false);
    assert.equal(result.status, "blocked");
    assert.equal(result.designCompletion, "blocked");
    assert.ok(result.issues.some((issue) => issue.code === "durable-design-artifacts-without-active-receipts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("global-safe mode treats explicit draft prototypes as not-started diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-draft-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<main>prototype</main>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/.draft-exploration", "draft\n");
    const result = validateDesignActiveCompletion(root, {});

    assert.equal(result.pass, true);
    assert.equal(result.status, "not-started");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit active completion requires command, slug, handoff, and requested variants", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-args-"));
  try {
    const result = validateDesignActiveCompletion(root, {
      active: true,
      commandPlanResult: READY_COMMAND_PLAN,
      commandPlanStrictReady: true,
      designReceiptResult: READY_RECEIPTS,
      qualityGateResult: { pass: true, issues: [] },
    });
    const codes = result.issues.map((issue) => issue.code);
    assert.equal(result.pass, false);
    assert.ok(codes.includes("missing-active-command"));
    assert.ok(codes.includes("missing-active-slug"));
    assert.ok(codes.includes("missing-active-handoff"));
    assert.ok(codes.includes("missing-requested-variant-count"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active command plan not strict-ready blocks global-only proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-command-"));
  try {
    const result = validateDesignActiveCompletion(root, completionOptions({
      commandPlanStrictReady: false,
      commandPlanResult: {
        pass: true,
        plan: {
          durableWritesAllowed: false,
          receiptGate: "pending-scoped-runtime-agent-receipts",
          scopedReceiptTrust: { missingSubjects: ["creative-director"] },
        },
      },
      qualityGateResult: { pass: true, issues: [] },
      variantSetResult: { pass: true, status: "passed", requestedVariantCount: 2, checkedVariants: 2, issues: [], warnings: [] },
      launcherResult: { pass: true, issues: [] },
      screenshotSimilarityResult: { pass: true, status: "passed", checkedPairs: 1, issues: [], warnings: [] },
    }));
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "active-command-agent-plan-blocked"));
    assert.equal(result.activeWorkflowMaturity, "active-workflow-blocked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active design receipts checked zero blocks completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-receipts-"));
  try {
    const result = validateDesignActiveCompletion(root, completionOptions({
      designReceiptResult: {
        pass: false,
        checked: 0,
        issues: [{ code: "active-design-receipt-scope-empty", file: "scope", message: "empty" }],
      },
      qualityGateResult: { pass: true, issues: [] },
      variantSetResult: { pass: true, status: "passed", requestedVariantCount: 2, checkedVariants: 2, issues: [], warnings: [] },
      launcherResult: { pass: true, issues: [] },
      screenshotSimilarityResult: { pass: true, status: "passed", checkedPairs: 1, issues: [], warnings: [] },
    }));
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "active-design-receipts-checked-zero"));
    assert.ok(result.issues.some((issue) => issue.code === "design-receipt-active-design-receipt-scope-empty"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requested multi-variant active run fails when manifest is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-manifest-"));
  try {
    const result = validateDesignActiveCompletion(root, completionOptions({
      qualityGateResult: { pass: true, issues: [] },
      launcherResult: { pass: true, issues: [] },
      screenshotSimilarityResult: { pass: true, status: "passed", checkedPairs: 1, issues: [], warnings: [] },
    }));
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "design-variant-missing-variant-manifest"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active multi-variant run fails when variants launcher is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-launcher-"));
  try {
    await writeValidPrototype(root, { launcher: false, screenshot: true });
    const result = validateDesignActiveCompletion(root, completionOptions());
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-variant-launcher"));
    assert.equal(validateVariantLauncher(root, { slug: "agent-chat", requestedVariantCount: 2 }).pass, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active multi-variant run fails when screenshot similarity evidence is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-screenshot-"));
  try {
    await writeValidPrototype(root, { launcher: true, screenshot: false });
    const result = validateDesignActiveCompletion(root, completionOptions());
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-screenshot-similarity-evidence"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active prototype outputs require browser evidence by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-browser-default-"));
  try {
    await writeValidPrototype(root, { launcher: true, screenshot: true });
    const result = validateDesignActiveCompletion(root, completionOptions());
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-browser-evidence"));
    assert.ok(result.checks.some((item) => item.id === "browser-evidence:active" && item.pass === false));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("capability and browser evidence flags are hard blockers when requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-capability-"));
  try {
    await writeValidPrototype(root, { launcher: true, screenshot: true });
    const result = validateDesignActiveCompletion(root, completionOptions({
      requireCapabilityPlan: true,
      requireBrowserEvidence: true,
    }));
    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-prototype-capability-plan"));
    assert.ok(result.issues.some((issue) => issue.code === "missing-browser-evidence"));
    assert.equal(validateCapabilityPlan(root, completionOptions({ requireCapabilityPlan: true })).pass, false);
    assert.equal(validateBrowserEvidence(root, completionOptions({ requireBrowserEvidence: true })).pass, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("browser evidence requires keyboard, focus trap, and contrast proofs", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-browser-fields-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_evidence/browser-verification.json", `${JSON.stringify({
      desktopViewport: true,
      mobileViewport: true,
      nonblankRender: true,
      noHorizontalOverflow: true,
      feedbackButtonVisible: true,
      drawerOpenClose: true,
      textOverlapScan: true,
      focusVisible: true,
    }, null, 2)}\n`);
    const result = validateBrowserEvidence(root, completionOptions());
    const messages = result.issues.map((issue) => issue.message).join("\n");
    assert.equal(result.pass, false);
    assert.match(messages, /keyboard navigation proof is required/);
    assert.match(messages, /drawer\/modal focus-trap proof is required/);
    assert.match(messages, /contrast audit proof is required/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("full active completion fixture passes with real artifact shapes and injected runtime receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-pass-"));
  try {
    await writeValidPrototype(root, {
      launcher: true,
      screenshot: true,
      capability: true,
      browser: true,
    });
    const result = validateDesignActiveCompletion(root, completionOptions({
      requireCapabilityPlan: true,
      requireBrowserEvidence: true,
    }));
    assert.equal(result.pass, true);
    assert.equal(result.status, "passed");
    assert.equal(result.designCompletion, "completed");
    assert.match(formatDesignActiveCompletionReport(result), /GLOBAL_MATURITY:/);
    assert.match(formatDesignActiveCompletionReport(result), /ACTIVE_WORKFLOW_MATURITY:/);
    assert.match(formatDesignActiveCompletionReport(result), /DESIGN_COMPLETION: completed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI reports active blockers instead of treating not-started as success", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-active-completion-cli-"));
  try {
    assert.throws(() => {
      execFileSync(process.execPath, [
        join(ROOT, "scripts", "validate-design-active-completion.mjs"),
        "--root",
        root,
        "--active",
        "--command",
        "/supervibe-design",
        "--slug",
        "agent-chat",
        "--handoff-id",
        "handoff-123",
        "--requested-variants",
        "2",
      ], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }, (error) => {
      assert.match(error.stdout.toString(), /PASS: false/);
      assert.match(error.stdout.toString(), /BLOCKER:/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
