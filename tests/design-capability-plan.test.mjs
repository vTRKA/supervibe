import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateDesignCapabilityContracts,
  validatePrototypeCapabilityPlan,
} from "../scripts/lib/design-capability-plan.mjs";

async function writeFixture(root, files) {
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }
}

function validPlan(overrides = {}) {
  return {
    mode: "bundled-dependency",
    purpose: "Prove an interaction that native-only output cannot represent well.",
    libraries: ["Three.js"],
    artifactScope: "Prototype hero scene only.",
    rejectedNativeAlternative: "Static SVG did not prove depth, selection, and camera behavior.",
    licenseSecurity: "Local bundle only; no remote runtime.",
    bundlePerformance: "Lazy-load below primary content and cap GPU work.",
    accessibilityFallback: "Adjacent semantic DOM list exposes all scene items.",
    reducedMotionFallback: "Disable camera movement and particles.",
    verificationCommands: ["npm run validate:design-capability-plan"],
    ...overrides,
  };
}

test("prototype capability plan rejects missing required fields", () => {
  const result = validatePrototypeCapabilityPlan(validPlan({ accessibilityFallback: "" }));

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((item) => item.code === "missing-plan-field"));
});

test("prototype capability plan validates a complete dependency plan", () => {
  const result = validatePrototypeCapabilityPlan(validPlan());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});

test("current repository passes design capability contracts", () => {
  const result = validateDesignCapabilityContracts(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});

test("validator rejects old absolute native-only prototype policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-capability-"));
  const good = [
    "Prototype Capability Plan",
    "native-static enhanced-native bundled-dependency framework-sandbox handoff-only",
    "capability-aware capability-aware-prototypes",
    "prototype capability recommendation Prototype Capability Handoff prototypeCapability.mode",
    "Capability And Library Bridge QA library default theme is not a design system",
    "unreviewed-wow-dependency advanced-visual-without-fallback",
    "Required Dataset Breadth For Design Agents",
    "product style color typography ux landing app-interface charts icons google-fonts react-performance ui-reasoning stack slides collateral creative packs",
    "Motion GSAP Lottie Rive Three.js PixiJS D3 Observable Plot ECharts MapLibre Theatre.js Rough.js Matter.js Monaco CodeMirror",
    "Do not paste a CDN player",
    "domLayoutSignature cssTokenSignature screenshotViewportPlan interactionMotionSignature",
    "Advanced Prototype Tool Families",
    "No unapproved dependency",
  ].join("\n");

  await writeFixture(root, {
    "tests/fixtures/design-capability-plan.json": JSON.stringify({
      schemaVersion: 1,
      plans: [validPlan(), validPlan({ mode: "enhanced-native", libraries: ["Web Animations API"] }), validPlan({ mode: "handoff-only", libraries: ["ffmpeg production pipeline"] })],
    }),
    "commands/supervibe-design.md": `${good}\nNative HTML/CSS/JS only`,
    "skills/prototype/SKILL.md": good,
    "skills/landing-page/SKILL.md": good,
    "agents/_design/prototype-builder.md": good,
    "agents/_design/creative-director.md": good,
    "agents/_design/ux-ui-designer.md": good,
    "agents/_design/design-system-architect.md": good,
    "agents/_design/ui-polish-reviewer.md": good,
    "agents/_design/accessibility-reviewer.md": good,
    "skills/design-intelligence/SKILL.md": good,
    "skills/interaction-design-patterns/SKILL.md": good,
    "docs/references/design-expert-knowledge.md": good,
    "references/design-intelligence-source-coverage.md": good,
    "templates/design-decisions/prototype-capability-plan.md.tpl": [
      "Prototype Capability Plan",
      "Mode",
      "Libraries / APIs",
      "Rejected Native Alternative",
      "License / Security",
      "Bundle / Performance",
      "Accessibility Fallback",
      "Reduced-Motion Fallback",
      "Verification Commands",
    ].join("\n"),
    "scripts/hooks/pre-write-prototype-guard.mjs": [
      "Prototype Capability Plan",
      "hasApprovedPrototypeCapabilityPlan",
      "Unapproved dependency coupling",
      "unapproved-dependency-coupling",
    ].join("\n"),
  });

  const result = validateDesignCapabilityContracts(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((item) => item.code === "forbidden-capability-conflict"));
});
