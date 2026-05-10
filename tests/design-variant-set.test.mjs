import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

import {
  buildDesignAcceptanceContract,
  buildDesignVariantSet,
  formatDesignVariantSetReport,
  validateDesignVariantSet,
} from "../scripts/lib/design-variant-set.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

function incidentBrief() {
  return [
    "study old prototypes C:/workspace/docs/old prototypes and file:///C:/workspace/docs/old%20prototypes/screen-chat.html",
    "create 5 creative and different variants with feedback overlay system",
    "use creative director",
    "less UI noise, more air, hide navigation under a button, use floating drawers",
    "one common chat without choosing agents",
    "1 to 1 app screen, dark theme, light themes discouraged, chats in windows discouraged",
  ].join(". ");
}

function validVariantManifest() {
  const variants = [];
  const axes = [
    ["graphite", "dense-ui", "split-focus", "drawer"],
    ["ink", "quiet-ui", "timeline", "command"],
    ["carbon", "open-ui", "canvas", "ambient"],
    ["midnight", "compact-ui", "flow", "radial"],
    ["black", "spacious-ui", "console", "dock"],
  ];
  for (let index = 0; index < 5; index += 1) {
    const id = `variant-${index + 1}`;
    variants.push({
      id,
      label: `Variant ${index + 1}`,
      artifactPath: `.supervibe/artifacts/prototypes/agent-chat/variants/${id}/index.html`,
      feedbackTargetId: `agent-chat:${id}`,
      fullscreen: true,
      primaryArtifact: true,
      oldPrototypeEvidence: ["tasks", "approvals", "memory", "skills", "automations"],
      differsBecause: `different composition ${index + 1}`,
      givesUp: `tradeoff ${index + 1}`,
      gains: `benefit ${index + 1}`,
      axes: {
        palette: axes[index][0],
        typography: `type-${index + 1}`,
        motion: `motion-${index + 1}`,
        imagery: `imagery-${index + 1}`,
        hierarchy: axes[index][1],
        density: `density-${index + 1}`,
        composition: axes[index][2],
        interaction: axes[index][3],
      },
      evidence: {
        referencePacket: "old prototype functional inventory",
        screenshotPlan: "desktop and mobile",
        tokenNotes: "candidate tokens",
        domLayoutSignature: `dom-${index + 1}`,
        cssTokenSignature: `css-${index + 1}`,
        screenshotViewportPlan: "1440x900, 390x844",
        interactionMotionSignature: `motion-signature-${index + 1}`,
      },
    });
  }
  return {
    schemaVersion: 1,
    slug: "agent-chat",
    requestedVariantCount: 5,
    separateArtifactsRequired: true,
    feedbackOverlayRequired: true,
    oldPrototypeEvidenceRequired: true,
    primarySwitcherForbidden: true,
    variants,
  };
}

test("acceptance contract captures explicit multi-variant designer-agent constraints", () => {
  const contract = buildDesignAcceptanceContract({
    brief: incidentBrief(),
    slug: "agent-chat",
    target: "tauri",
  });

  assert.equal(contract.requestedVariantCount, 5);
  assert.equal(contract.separateFullscreenArtifacts, true);
  assert.equal(contract.feedbackOverlayPerVariant, true);
  assert.equal(contract.oldPrototypeEvidenceRequired, true);
  assert.equal(contract.darkThemeRequired, true);
  assert.equal(contract.hiddenNavigation, true);
  assert.equal(contract.floatingDrawers, true);
  assert.equal(contract.unifiedChat, true);
  assert.equal(contract.chatWindowsDiscouraged, true);
  assert.ok(contract.referenceSources.some((source) => source.value.includes("screen-chat.html")));
  assert.ok(contract.acceptanceCriteria.includes("five-separate-fullscreen-artifacts"));
});

test("variant set builds separate artifact and feedback targets for five explicit variants", () => {
  const contract = buildDesignAcceptanceContract({
    brief: incidentBrief(),
    slug: "agent-chat",
    target: "tauri",
  });
  const variantSet = buildDesignVariantSet({ slug: "agent-chat", acceptanceContract: contract });

  assert.equal(variantSet.active, true);
  assert.equal(variantSet.requestedVariantCount, 5);
  assert.equal(variantSet.variants.length, 5);
  assert.equal(new Set(variantSet.variants.map((variant) => variant.artifactPath)).size, 5);
  assert.equal(new Set(variantSet.variants.map((variant) => variant.feedbackTargetId)).size, 5);
  assert.ok(variantSet.variants.every((variant) => /\/variants\/variant-\d\/index\.html$/.test(variant.artifactPath)));
  assert.equal(variantSet.primarySwitcherForbidden, true);
});

test("variant validator rejects one switcher shell when five separate variants were requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-variant-switcher-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<button role=\"tab\">Variant 1</button><section data-feedback-overlay></section>\n");

    const result = validateDesignVariantSet(root, {
      slug: "agent-chat",
      requestedVariantCount: 5,
      acceptanceContract: buildDesignAcceptanceContract({ brief: incidentBrief(), slug: "agent-chat" }),
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-variant-manifest"));
    assert.ok(result.issues.some((issue) => issue.code === "primary-switcher-shell"));
    assert.match(formatDesignVariantSetReport(result), /REQUESTED_VARIANTS: 5/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("variant validator requires unique feedback targets and reference evidence per variant", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-variant-invalid-"));
  try {
    const manifest = validVariantManifest();
    manifest.variants[1].feedbackTargetId = manifest.variants[0].feedbackTargetId;
    manifest.variants[2].oldPrototypeEvidence = [];
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variant-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    for (const variant of manifest.variants) {
      await writeUtf8(root, variant.artifactPath, "<main data-feedback-overlay data-supervibe-feedback-target=\"agent-chat\"></main>\n");
    }

    const result = validateDesignVariantSet(root, {
      slug: "agent-chat",
      acceptanceContract: buildDesignAcceptanceContract({ brief: incidentBrief(), slug: "agent-chat" }),
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "duplicate-feedback-target"));
    assert.ok(result.issues.some((issue) => issue.code === "missing-old-prototype-evidence"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("variant validator passes five separate fullscreen variants with overlay and diversity evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-variant-valid-"));
  try {
    const manifest = validVariantManifest();
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variant-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    for (const variant of manifest.variants) {
      await writeUtf8(root, variant.artifactPath, `<main data-feedback-overlay data-supervibe-feedback-target="${variant.feedbackTargetId}"></main>\n`);
    }

    const result = validateDesignVariantSet(root, {
      slug: "agent-chat",
      acceptanceContract: buildDesignAcceptanceContract({ brief: incidentBrief(), slug: "agent-chat" }),
    });

    assert.equal(result.pass, true);
    assert.equal(result.checkedVariants, 5);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("variant validator CLI reports missing requested variants", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-variant-cli-"));
  try {
    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-design-variant-set.mjs"),
      "--root",
      root,
      "--slug",
      "agent-chat",
      "--requested",
      "5",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.match(output, /PASS: false/);
  } catch (error) {
    assert.match(error.stdout.toString(), /PASS: false/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
