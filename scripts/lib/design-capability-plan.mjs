import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROTOTYPE_CAPABILITY_MODES = Object.freeze([
  "native-static",
  "enhanced-native",
  "bundled-dependency",
  "framework-sandbox",
  "handoff-only",
]);

const PROTOTYPE_CAPABILITY_FIELDS = Object.freeze([
  "mode",
  "purpose",
  "libraries",
  "artifactScope",
  "rejectedNativeAlternative",
  "licenseSecurity",
  "bundlePerformance",
  "accessibilityFallback",
  "reducedMotionFallback",
  "verificationCommands",
]);

const REQUIRED_LIBRARY_TERMS = Object.freeze([
  "Motion",
  "GSAP",
  "Lottie",
  "Rive",
  "Three.js",
  "PixiJS",
  "D3",
  "Observable Plot",
  "ECharts",
  "MapLibre",
  "Theatre.js",
  "Rough.js",
  "Matter.js",
  "Monaco",
  "CodeMirror",
]);

const REQUIRED_DATASET_TERMS = Object.freeze([
  "product",
  "style",
  "color",
  "typography",
  "ux",
  "landing",
  "app-interface",
  "charts",
  "icons",
  "google-fonts",
  "react-performance",
  "ui-reasoning",
  "stack",
  "slides",
  "collateral",
  "creative packs",
]);

const REQUIRED_SURFACES = Object.freeze([
  {
    file: "commands/supervibe-design.md",
    label: "design command capability policy",
    required: [
      /Prototype Capability Plan/i,
      /native-static/i,
      /enhanced-native/i,
      /bundled-dependency/i,
      /framework-sandbox/i,
      /handoff-only/i,
      /unapproved .*dependency|No unapproved dependency/i,
    ],
    forbidden: [
      /Native HTML\/CSS\/JS only/i,
      /Pure native \(no frameworks, no npm\)/i,
    ],
  },
  {
    file: "skills/prototype/SKILL.md",
    label: "prototype skill capability policy",
    required: [
      /Prototype Capability Plan/i,
      /capability-aware/i,
      /native-static/i,
      /enhanced-native/i,
      /bundled-dependency/i,
      /framework-sandbox/i,
      /handoff-only/i,
      /Motion.*GSAP.*Lottie.*Rive.*Three\.js.*PixiJS.*D3.*Observable Plot.*ECharts.*MapLibre.*Theatre\.js.*Rough\.js.*Matter\.js.*Monaco.*CodeMirror/is,
    ],
    forbidden: [
      /Native only\..*No React.*npm dependencies/is,
      /No framework imports/i,
      /DO NOT install any npm package/i,
    ],
  },
  {
    file: "skills/landing-page/SKILL.md",
    label: "landing skill capability policy",
    required: [
      /Prototype Capability Plan/i,
      /capability-aware/i,
      /native-static/i,
      /enhanced-native/i,
      /bundled-dependency/i,
      /framework-sandbox/i,
      /handoff-only/i,
    ],
    forbidden: [
      /Native only\..*No frameworks.*no npm/is,
    ],
  },
  {
    file: "agents/_design/prototype-builder.md",
    label: "prototype builder capability policy",
    required: [
      /Prototype Capability Plan/i,
      /capability-aware-prototypes/i,
      /native-static/i,
      /enhanced-native/i,
      /bundled-dependency/i,
      /framework-sandbox/i,
      /handoff-only/i,
      /Motion.*GSAP.*Lottie.*Rive.*Three\.js.*PixiJS.*D3.*Observable Plot.*ECharts.*MapLibre.*Theatre\.js.*Rough\.js.*Matter\.js.*Monaco.*CodeMirror/is,
    ],
    forbidden: [
      /no-framework-prototypes/i,
      /no-framework-imports/i,
      /Scaffold HTML.*native only/i,
      /Vanilla HTML\/CSS\/JS only/i,
      /no JS animation libs/i,
    ],
  },
  {
    file: "agents/_design/creative-director.md",
    label: "creative director capability handoff",
    required: [
      /Prototype Capability Plan/i,
      /prototype capability recommendation/i,
      /native-static/i,
      /enhanced-native/i,
      /bundled-dependency/i,
      /framework-sandbox/i,
      /handoff-only/i,
      /Motion.*GSAP.*Lottie.*Rive.*Three\.js.*PixiJS.*D3.*Observable Plot.*ECharts.*MapLibre.*Theatre\.js.*Rough\.js.*Matter\.js.*Monaco.*CodeMirror/is,
    ],
    forbidden: [],
  },
  {
    file: "agents/_design/ux-ui-designer.md",
    label: "ux designer capability handoff",
    required: [
      /Prototype Capability Handoff/i,
      /prototypeCapability\.mode/i,
      /native-static/i,
      /enhanced-native/i,
      /bundled-dependency/i,
      /framework-sandbox/i,
      /handoff-only/i,
    ],
    forbidden: [],
  },
  {
    file: "agents/_design/design-system-architect.md",
    label: "design-system capability bridge",
    required: [
      /Capability And Library Bridge QA/i,
      /Prototype Capability Plan/i,
      /library default theme is\s+not a design system/i,
    ],
    forbidden: [],
  },
  {
    file: "agents/_design/ui-polish-reviewer.md",
    label: "polish reviewer advanced visual gate",
    required: [
      /Prototype Capability Plan/i,
      /bundled-dependency/i,
      /framework-sandbox/i,
      /handoff-only/i,
      /unreviewed-wow-dependency/i,
    ],
    forbidden: [],
  },
  {
    file: "agents/_design/accessibility-reviewer.md",
    label: "accessibility advanced visual gate",
    required: [
      /Prototype Capability Plan/i,
      /bundled-dependency/i,
      /framework-sandbox/i,
      /handoff-only/i,
      /advanced-visual-without-fallback/i,
    ],
    forbidden: [],
  },
  {
    file: "skills/design-intelligence/SKILL.md",
    label: "design intelligence dataset breadth",
    required: [
      /Required Dataset Breadth For Design Agents/i,
      ...REQUIRED_DATASET_TERMS.map((term) => new RegExp(escapeRegExp(term), "i")),
      ...REQUIRED_LIBRARY_TERMS.map((term) => new RegExp(escapeRegExp(term), "i")),
    ],
    forbidden: [],
  },
  {
    file: "skills/interaction-design-patterns/SKILL.md",
    label: "interaction dependency discipline",
    required: [
      /Prototype Capability Plan/i,
      /Motion One|Motion/i,
      /GSAP/i,
      /Three\.js/i,
      /Lottie/i,
      /Do not paste a CDN player/i,
    ],
    forbidden: [
      /cdnjs\.cloudflare\.com\/ajax\/libs\/lottie-web/i,
    ],
  },
  {
    file: "docs/references/design-expert-knowledge.md",
    label: "design expert dataset and artifact evidence",
    required: [
      /Prototype Capability Plan/i,
      ...REQUIRED_DATASET_TERMS.map((term) => new RegExp(escapeRegExp(term), "i")),
      /domLayoutSignature.*cssTokenSignature.*screenshotViewportPlan.*interactionMotionSignature/is,
    ],
    forbidden: [],
  },
  {
    file: "references/design-intelligence-source-coverage.md",
    label: "design intelligence source coverage advanced tools",
    required: [
      /Advanced Prototype Tool Families/i,
      ...REQUIRED_LIBRARY_TERMS.map((term) => new RegExp(escapeRegExp(term), "i")),
      /Prototype Capability Plan/i,
    ],
    forbidden: [],
  },
  {
    file: "templates/design-decisions/prototype-capability-plan.md.tpl",
    label: "prototype capability plan template",
    required: [
      /Prototype Capability Plan/i,
      /Mode/i,
      /Libraries \/ APIs/i,
      /Rejected Native Alternative/i,
      /License \/ Security/i,
      /Bundle \/ Performance/i,
      /Accessibility Fallback/i,
      /Reduced-Motion Fallback/i,
      /Verification Commands/i,
    ],
    forbidden: [],
  },
  {
    file: "scripts/hooks/pre-write-prototype-guard.mjs",
    label: "prototype prewrite dependency boundary",
    required: [
      /Prototype Capability Plan/i,
      /hasApprovedPrototypeCapabilityPlan/i,
      /Unapproved dependency coupling/i,
      /unapproved-dependency-coupling/i,
    ],
    forbidden: [
      /Framework coupling detected/i,
      /native HTML\/CSS\/JS only/i,
      /framework-coupling/i,
    ],
  },
]);

export function validatePrototypeCapabilityPlan(plan = {}) {
  const issues = [];

  for (const field of PROTOTYPE_CAPABILITY_FIELDS) {
    if (!hasValue(plan[field])) {
      issues.push(issue("capability-plan", "missing-plan-field", `plan must provide ${field}`));
    }
  }

  if (hasValue(plan.mode) && !PROTOTYPE_CAPABILITY_MODES.includes(String(plan.mode))) {
    issues.push(issue("capability-plan", "invalid-mode", `mode must be one of ${PROTOTYPE_CAPABILITY_MODES.join(", ")}`));
  }

  if (Array.isArray(plan.libraries) && plan.libraries.length === 0) {
    issues.push(issue("capability-plan", "empty-library-list", "libraries must name at least one browser API, dependency, or handoff target"));
  }

  if (Array.isArray(plan.verificationCommands) && plan.verificationCommands.length === 0) {
    issues.push(issue("capability-plan", "empty-verification-list", "verificationCommands must include at least one command or review action"));
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

function loadDesignCapabilityFixture(rootDir, relPath = "tests/fixtures/design-capability-plan.json") {
  const fixturePath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(fixturePath)) {
    return { fixturePath, fixture: null, error: "missing-fixture" };
  }
  try {
    return {
      fixturePath,
      fixture: JSON.parse(readFileSync(fixturePath, "utf8")),
      error: null,
    };
  } catch (error) {
    return { fixturePath, fixture: null, error: `invalid-json: ${error.message}` };
  }
}

function validateDesignCapabilityFixture(fixture = {}) {
  const issues = [];
  if (fixture.schemaVersion !== 1) {
    issues.push(issue("tests/fixtures/design-capability-plan.json", "schema-version", "schemaVersion must be 1"));
  }
  const plans = Array.isArray(fixture.plans) ? fixture.plans : [];
  if (plans.length < 3) {
    issues.push(issue("tests/fixtures/design-capability-plan.json", "too-few-plans", "expected at least 3 capability plan examples"));
  }
  for (const [index, plan] of plans.entries()) {
    const result = validatePrototypeCapabilityPlan(plan);
    for (const item of result.issues) {
      issues.push(issue(`plan-${index + 1}`, item.code, item.message));
    }
  }
  return {
    pass: issues.length === 0,
    checkedPlans: plans.length,
    issues,
  };
}

export function validateDesignCapabilityContracts(rootDir = process.cwd()) {
  const issues = [];
  const loaded = loadDesignCapabilityFixture(rootDir);
  if (loaded.error) {
    issues.push(issue("tests/fixtures/design-capability-plan.json", loaded.error, "design capability fixture is required"));
  } else {
    const fixtureResult = validateDesignCapabilityFixture(loaded.fixture);
    issues.push(...fixtureResult.issues);
  }

  for (const surface of REQUIRED_SURFACES) {
    const text = readProjectFile(rootDir, surface.file);
    if (text === null) {
      issues.push(issue(surface.file, "missing-file", `${surface.file}: file not found`, surface.label));
      continue;
    }
    for (const pattern of surface.required) {
      if (!pattern.test(text)) {
        issues.push(issue(surface.file, "missing-capability-contract", `${surface.file}: missing ${pattern}`, surface.label));
      }
    }
    for (const pattern of surface.forbidden || []) {
      if (pattern.test(text)) {
        issues.push(issue(surface.file, "forbidden-capability-conflict", `${surface.file}: still matches ${pattern}`, surface.label));
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: REQUIRED_SURFACES.length + 1,
    modes: PROTOTYPE_CAPABILITY_MODES,
    issues,
  };
}

function readProjectFile(rootDir, relPath) {
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) return null;
  return readFileSync(absPath, "utf8");
}

function hasValue(value) {
  if (Array.isArray(value)) return value.some((item) => hasValue(item));
  return String(value || "").trim().length >= 3 && !/^(tbd|todo|n\/a|none|null|undefined)$/i.test(String(value).trim());
}

function issue(file, code, message, label = "design capability contract") {
  return { file, label, code, message };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
