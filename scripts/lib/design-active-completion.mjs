import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

import {
  buildRuntimeCommandAgentPlan,
  commandAgentPlanStrictReady,
} from "../command-agent-plan.mjs";
import {
  discoverActiveWorkflows,
} from "../validate-active-workflows.mjs";
import {
  validateDesignAgentInvocationReceipts,
} from "./design-agent-orchestration.mjs";
import {
  evaluateDesignQualityGate,
} from "./design-quality-gate-aggregator.mjs";
import {
  validateScreenshotSimilarityEvidence,
} from "./design-screenshot-similarity.mjs";
import {
  validateDesignVariantSet,
} from "./design-variant-set.mjs";

const DESIGN_COMMAND = "/supervibe-design";
const BROWSER_EVIDENCE_CANDIDATES = Object.freeze([
  "browser-verification.json",
  "_evidence/browser-verification.json",
  "_verification/browser.json",
]);
const REQUIRED_BROWSER_PROOFS = Object.freeze([
  ["desktopViewport", "desktop viewport proof"],
  ["desktopScreenshot", "desktop screenshot proof"],
  ["mobileViewport", "mobile viewport proof"],
  ["mobileScreenshot", "mobile screenshot proof"],
  ["url", "browser URL proof"],
  ["capturedAt", "browser evidence timestamp proof"],
  ["selectorReady", "selector readiness proof"],
  ["nonblankRender", "nonblank render proof"],
  ["noHorizontalOverflow", "no horizontal overflow proof"],
  ["feedbackButtonVisible", "visible feedback button proof"],
  ["feedbackQueueWrite", "feedback queue write proof"],
  ["drawerOpenClose", "drawer/modal open-close proof"],
  ["focusTrap", "drawer/modal focus-trap proof"],
  ["keyboardNavigation", "keyboard navigation proof"],
  ["textOverlapScan", "text-overlap scan proof"],
  ["contrastAudit", "contrast audit proof"],
  ["focusVisible", "focus visibility proof"],
  ["feedbackOverlayNonOverlap", "feedback overlay non-overlap proof"],
]);
const CAPABILITY_PLAN_CANDIDATES = Object.freeze([
  "prototype-capability-plan.md",
  "_design/prototype-capability-plan.md",
  "_evidence/prototype-capability-plan.md",
]);
const CAPABILITY_MODE_RE = /\b(?:three\.?js|canvas|webgl|gsap|pixi(?:js)?|rive|lottie|enhanced-native|bundled-dependency|framework-sandbox|native\s+(?:css|js|javascript))\b/i;

export function validateDesignActiveCompletion(rootDir = process.cwd(), options = {}) {
  const explicit = isExplicitActiveRequest(options);
  const workflows = Array.isArray(options.activeWorkflows)
    ? options.activeWorkflows
    : discoverActiveWorkflows(rootDir, {
      command: options.command,
      host: options.host,
      slug: options.slug,
      handoffId: options.handoffId,
      workflowRunId: options.workflowRunId,
      requestedVariantCount: options.requestedVariantCount ?? options.requestedVariants,
      target: options.target,
      mode: options.mode,
      requiresCapabilityPlan: options.requireCapabilityPlan ?? options.requiresCapabilityPlan,
      requireBrowserEvidence: options.requireBrowserEvidence,
  });
  const workflow = resolveWorkflow(options, workflows);
  if (!explicit && !workflow) {
    const durableArtifacts = discoverDurablePrototypeArtifacts(rootDir);
    if (durableArtifacts.length > 0) {
      return {
        schemaVersion: 1,
        pass: false,
        status: "blocked",
        active: false,
        command: null,
        slug: inferPrototypeSlugFromArtifact(durableArtifacts[0]) || null,
        handoffId: null,
        requestedVariantCount: 0,
        globalMaturity: "blocked",
        activeWorkflowMaturity: "missing-active-receipts",
        designCompletion: "blocked",
        checks: [],
        issues: [issue(
          "durable-design-artifacts-without-active-receipts",
          rel(rootDir, durableArtifacts[0]),
          "durable prototype artifacts exist but no active scoped design receipts were validated",
        )],
        warnings: [],
        nextAction: "run validate-design-active-completion with --active and scoped receipt context, or mark exploratory prototype folders with .draft-exploration",
      };
    }
    return {
      schemaVersion: 1,
      pass: true,
      status: "not-started",
      active: false,
      command: null,
      slug: null,
      handoffId: null,
      requestedVariantCount: 0,
      globalMaturity: "not-evaluated",
      activeWorkflowMaturity: "not-started",
      designCompletion: "not-started",
      checks: [],
      issues: [],
      warnings: [],
      nextAction: "run with --active --command /supervibe-design --slug <slug> --handoff-id <id> --requested-variants <n>",
    };
  }

  const context = normalizeCompletionContext(options, workflow);
  const issues = [];
  const warnings = [];
  const checks = [];

  requireActiveField(context.command, "missing-active-command", "active completion requires --command /supervibe-design", issues);
  requireActiveField(context.slug, "missing-active-slug", "active completion requires --slug", issues);
  requireActiveField(context.handoffId || context.workflowRunId, "missing-active-handoff", "active completion requires --handoff-id or --workflow-run-id", issues);
  if (!context.requestedVariantCount) {
    issues.push(issue("missing-requested-variant-count", "active-workflow-context", "active design completion requires --requested-variants or active workflow requestedVariantCount"));
  }
  if (context.command && normalizeCommand(context.command) !== DESIGN_COMMAND) {
    issues.push(issue("unsupported-active-command", "active-workflow-context", `design active completion only supports ${DESIGN_COMMAND}; got ${context.command}`));
  }

  const commandPlan = options.commandPlanResult || buildRuntimeCommandAgentPlan({
    command: context.command || DESIGN_COMMAND,
    projectRoot: rootDir,
    pluginRoot: options.pluginRoot,
    host: context.host || null,
    workflowContext: {
      active: true,
      slug: context.slug || "",
      handoffId: context.handoffId || "",
      workflowRunId: context.workflowRunId || "",
    },
  });
  const commandPlanPass = options.commandPlanStrictReady ?? commandAgentPlanStrictReady(commandPlan);
  checks.push(check("command-agent-plan:active", commandPlanPass, commandPlan));
  if (!commandPlanPass) {
    const plan = commandPlan.plan || {};
    issues.push(issue(
      "active-command-agent-plan-blocked",
      ".supervibe/artifacts/_workflow-invocations",
      `active command plan is not strict-ready: durableWritesAllowed=${plan.durableWritesAllowed === true}, receiptGate=${plan.receiptGate || "unknown"}, missingScoped=${(plan.scopedReceiptTrust?.missingSubjects || []).join(",") || "none"}`,
    ));
  }

  const receiptValidation = options.designReceiptResult || validateDesignAgentInvocationReceipts(rootDir, {
    active: true,
    slug: context.slug || "",
    handoffId: context.handoffId || "",
    workflowRunId: context.workflowRunId || "",
  });
  checks.push(check("design-agent-receipts:active", receiptValidation.pass === true, receiptValidation));
  if (receiptValidation.checked === 0) {
    issues.push(issue("active-design-receipts-checked-zero", ".supervibe/artifacts/_workflow-invocations/supervibe-design", "active design receipt validation checked 0 durable outputs"));
  }
  if (receiptValidation.pass !== true) {
    for (const item of receiptValidation.issues || []) {
      issues.push(issue(`design-receipt-${item.code || "invalid"}`, item.file || ".supervibe/artifacts/_workflow-invocations/supervibe-design", item.message || "design receipt validation failed"));
    }
  }

  const variantSet = options.variantSetResult || validateDesignVariantSet(rootDir, {
    slug: context.slug || "",
    requestedVariantCount: context.requestedVariantCount || null,
  });
  checks.push(check("design-variant-set:active", variantSet.pass === true && variantSet.status !== "not-started", variantSet));
  if (variantSet.status === "not-started") {
    issues.push(issue("active-design-variant-set-not-started", variantSet.manifestPath || "variant-manifest.json", "variant set returned PASS/not-started; active completion requires concrete variant evidence"));
  }
  if (variantSet.pass !== true) {
    for (const item of variantSet.issues || []) {
      issues.push(issue(`design-variant-${item.code || "invalid"}`, item.file || variantSet.manifestPath || "variant-manifest.json", item.message || "variant set validation failed"));
    }
  }
  for (const warning of variantSet.warnings || []) {
    warnings.push(warning);
  }

  const multiVariant = Number(context.requestedVariantCount || variantSet.requestedVariantCount || 0) > 1;
  if (multiVariant) {
    const launcher = options.launcherResult || validateVariantLauncher(rootDir, {
      slug: context.slug,
      requestedVariantCount: context.requestedVariantCount || variantSet.requestedVariantCount,
    });
    checks.push(check("variant-launcher:active", launcher.pass === true, launcher));
    for (const item of launcher.issues || []) issues.push(item);

    const screenshot = options.screenshotSimilarityResult || validateScreenshotSimilarityEvidence(rootDir, {
      prototypeSlug: context.slug || "",
    });
    const coveredPairs = screenshotCoveredPairCount(screenshot);
    checks.push(check("screenshot-similarity:active", screenshot.pass === true && screenshot.status === "passed" && coveredPairs > 0, screenshot));
    if (screenshot.pass !== true) {
      for (const item of screenshot.issues || []) issues.push(issue(`screenshot-${item.code || "invalid"}`, item.file || screenshot.evidencePath || "screenshot-similarity.json", item.message || "screenshot similarity validation failed"));
    }
    const expectedPairs = expectedScreenshotPairCount(context.requestedVariantCount || variantSet.requestedVariantCount || 0);
    if (screenshot.status !== "passed" || coveredPairs < expectedPairs) {
      issues.push(issue(
        "missing-screenshot-similarity-evidence",
        screenshot.evidencePath || "screenshot-similarity.json",
        `active multi-variant completion requires screenshot similarity evidence for all requested variant pairs (${coveredPairs}/${expectedPairs})`,
      ));
    }
    for (const warning of screenshot.warnings || []) warnings.push(warning);
  }

  const capabilityRequired = context.requireCapabilityPlan === true || context.requiresCapabilityPlan === true;
  if (capabilityRequired) {
    const capability = options.capabilityPlanResult || validateCapabilityPlan(rootDir, context);
    checks.push(check("prototype-capability-plan:active", capability.pass === true, capability));
    for (const item of capability.issues || []) issues.push(item);
  }

  const browserRequired = context.requireBrowserEvidence === true
    || context.requiresBrowserEvidence === true
    || hasActivePrototypeOutput(rootDir, context);
  const browserEvidence = browserRequired
    ? (options.browserEvidenceResult || validateBrowserEvidence(rootDir, context))
    : null;
  if (browserRequired) {
    checks.push(check("browser-evidence:active", browserEvidence.pass === true, browserEvidence));
    for (const item of browserEvidence.issues || []) issues.push(item);
  }

  const qualityGate = options.qualityGateResult || evaluateDesignQualityGate(rootDir, {
    slug: context.slug || "",
    requireReviews: true,
    handoffId: context.handoffId || "",
    workflowRunId: context.workflowRunId || "",
    receiptValidation,
    browserVerification: browserEvidence,
  });
  checks.push(check("design-quality-gate:active", qualityGate.pass === true, qualityGate));
  if (qualityGate.pass !== true) {
    for (const item of qualityGate.issues || []) {
      issues.push(issue(`quality-gate-${item.code || "invalid"}`, item.file || "_reviews", item.message || "quality gate failed"));
    }
  }

  const pass = issues.length === 0 && checks.every((item) => item.pass === true);
  return {
    schemaVersion: 1,
    pass,
    status: pass ? "passed" : "blocked",
    active: true,
    command: context.command || null,
    slug: context.slug || null,
    handoffId: context.handoffId || null,
    workflowRunId: context.workflowRunId || null,
    requestedVariantCount: context.requestedVariantCount || 0,
    globalMaturity: options.globalMaturity || "diagnostic-only",
    activeWorkflowMaturity: commandPlanPass ? "active-workflow-ready" : "active-workflow-blocked",
    designCompletion: pass ? "completed" : "blocked",
    checks,
    issues,
    warnings,
    nextAction: pass
      ? "design active completion is ready"
      : nextActionForIssues(issues, context),
  };
}

export function validateVariantLauncher(rootDir = process.cwd(), {
  slug = "",
  requestedVariantCount = 0,
} = {}) {
  const prototypeRoot = join(rootDir, ".supervibe", "artifacts", "prototypes", sanitizePathPart(slug));
  const candidates = [
    join(prototypeRoot, "variants", "index.html"),
    join(prototypeRoot, "index.html"),
  ];
  const launcherPath = candidates.find((file) => existsSync(file) && statSync(file).isFile());
  if (!launcherPath) {
    return {
      pass: false,
      launcherPath: rel(rootDir, join(prototypeRoot, "variants", "index.html")),
      checkedLinks: 0,
      issues: [issue("missing-variant-launcher", rel(rootDir, join(prototypeRoot, "variants", "index.html")), "active multi-variant preview requires variants/index.html or a root launcher linking every variant")],
    };
  }

  const text = readFileSync(launcherPath, "utf8");
  const hrefs = extractHrefs(text);
  const expected = expectedVariantTargets(rootDir, { slug, requestedVariantCount });
  const issues = [];
  for (const item of expected) {
    const href = hrefs.find((candidate) => hrefTargetsVariant(candidate, item.id, launcherPath, item.absPath));
    if (!href) {
      issues.push(issue("variant-launcher-missing-link", rel(rootDir, launcherPath), `${item.id}: launcher does not link to variant artifact`));
      continue;
    }
    const target = resolveHrefTarget(launcherPath, href);
    if (!target || !existsSync(target)) {
      issues.push(issue("variant-launcher-broken-link", rel(rootDir, launcherPath), `${item.id}: launcher href ${href} does not resolve to an existing file or directory`));
    }
  }
  return {
    pass: issues.length === 0,
    launcherPath: rel(rootDir, launcherPath),
    checkedLinks: expected.length,
    issues,
  };
}

export function validateCapabilityPlan(rootDir = process.cwd(), context = {}) {
  const prototypeRoot = join(rootDir, ".supervibe", "artifacts", "prototypes", sanitizePathPart(context.slug));
  const planPath = CAPABILITY_PLAN_CANDIDATES.map((item) => join(prototypeRoot, ...item.split("/")))
    .find((file) => existsSync(file) && statSync(file).isFile());
  if (!planPath) {
    return {
      pass: false,
      issues: [issue("missing-prototype-capability-plan", rel(rootDir, join(prototypeRoot, "prototype-capability-plan.md")), "WOW or enhanced prototype completion requires a bound prototype-capability-plan.md")],
    };
  }
  const text = readFileSync(planPath, "utf8");
  const issues = [];
  if (context.slug && !text.includes(context.slug)) {
    issues.push(issue("capability-plan-not-bound-to-slug", rel(rootDir, planPath), `capability plan must mention slug ${context.slug}`));
  }
  if (context.handoffId && !text.includes(context.handoffId)) {
    issues.push(issue("capability-plan-not-bound-to-handoff", rel(rootDir, planPath), `capability plan must mention handoff ${context.handoffId}`));
  }
  if (!CAPABILITY_MODE_RE.test(text)) {
    issues.push(issue("capability-plan-missing-mode", rel(rootDir, planPath), "capability plan must name a concrete rendering/motion mode or native downgrade rationale"));
  }
  return {
    pass: issues.length === 0,
    planPath: rel(rootDir, planPath),
    issues,
  };
}

export function validateBrowserEvidence(rootDir = process.cwd(), context = {}) {
  const prototypeRoot = join(rootDir, ".supervibe", "artifacts", "prototypes", sanitizePathPart(context.slug));
  const evidencePath = BROWSER_EVIDENCE_CANDIDATES.map((item) => join(prototypeRoot, ...item.split("/")))
    .find((file) => existsSync(file) && statSync(file).isFile());
  if (!evidencePath) {
    return {
      pass: false,
      issues: [issue("missing-browser-evidence", rel(rootDir, join(prototypeRoot, "_evidence", "browser-verification.json")), "active preview completion requires browser verification evidence")],
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (error) {
    return {
      pass: false,
      issues: [issue("invalid-browser-evidence-json", rel(rootDir, evidencePath), error.message)],
    };
  }
  const issues = [];
  for (const [field, label] of REQUIRED_BROWSER_PROOFS) {
    if (!proofPass(parsed, field, { rootDir, evidencePath })) {
      issues.push(issue("missing-browser-proof", rel(rootDir, evidencePath), `${label} is required`));
    }
  }
  return {
    pass: issues.length === 0,
    evidencePath: rel(rootDir, evidencePath),
    issues,
  };
}

export function formatDesignActiveCompletionReport(result = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_ACTIVE_COMPLETION",
    `PASS: ${result.pass === true}`,
    `STATUS: ${result.status || "unknown"}`,
    `COMMAND: ${result.command || "none"}`,
    `SLUG: ${result.slug || "none"}`,
    `HANDOFF_ID: ${result.handoffId || "none"}`,
    `WORKFLOW_RUN_ID: ${result.workflowRunId || "none"}`,
    `REQUESTED_VARIANTS: ${result.requestedVariantCount || 0}`,
    `GLOBAL_MATURITY: ${result.globalMaturity || "not-evaluated"}`,
    `ACTIVE_WORKFLOW_MATURITY: ${result.activeWorkflowMaturity || "unknown"}`,
    `DESIGN_COMPLETION: ${result.designCompletion || "unknown"}`,
    `CHECKS: ${(result.checks || []).length}`,
    `BLOCKERS: ${(result.issues || []).length}`,
    `WARNINGS: ${(result.warnings || []).length}`,
  ];
  for (const item of result.checks || []) {
    lines.push(`CHECK: ${item.id} pass=${item.pass === true}`);
  }
  for (const warning of result.warnings || []) {
    lines.push(`WARNING: ${warning.code || "warning"} ${warning.file || ""} - ${warning.message || ""}`.trim());
  }
  for (const item of result.issues || []) {
    lines.push(`BLOCKER: ${item.code} ${item.file || ""} - ${item.message || ""}`.trim());
  }
  lines.push(`NEXT_ACTION: ${result.nextAction || "none"}`);
  return lines.join("\n");
}

function resolveWorkflow(options = {}, workflows = []) {
  if (options.workflow) return options.workflow;
  const normalized = workflows.map((item) => normalizeWorkflow(item));
  if (options.command || options.slug || options.handoffId || options.workflowRunId) {
    return normalized.find((item) => {
      if (options.command && normalizeCommand(item.command) !== normalizeCommand(options.command)) return false;
      if (options.slug && item.slug !== options.slug) return false;
      if (options.handoffId && item.handoffId !== options.handoffId) return false;
      if (options.workflowRunId && item.workflowRunId !== options.workflowRunId) return false;
      return true;
    }) || null;
  }
  return normalized.find((item) => normalizeCommand(item.command) === DESIGN_COMMAND) || null;
}

function normalizeCompletionContext(options = {}, workflow = null) {
  const merged = { ...(workflow || {}), ...removeUndefined(options) };
  return {
    command: normalizeCommand(merged.command || ""),
    host: String(merged.host || ""),
    slug: sanitizePathPart(merged.slug || ""),
    handoffId: String(merged.handoffId || merged.handoff || ""),
    workflowRunId: String(merged.workflowRunId || merged.workflow_run_id || ""),
    requestedVariantCount: requestedVariantCountFromOption(merged.requestedVariantCount ?? merged.requestedVariants ?? merged["requested-variants"]),
    target: String(merged.target || ""),
    mode: String(merged.mode || ""),
    requireCapabilityPlan: boolish(merged.requireCapabilityPlan ?? merged.requiresCapabilityPlan),
    requiresCapabilityPlan: boolish(merged.requiresCapabilityPlan ?? merged.requireCapabilityPlan),
    requireBrowserEvidence: boolish(merged.requireBrowserEvidence),
    requiresBrowserEvidence: boolish(merged.requiresBrowserEvidence ?? merged.requireBrowserEvidence),
  };
}

function normalizeWorkflow(item = {}) {
  return {
    command: item.command || item.workflow || item.activeCommand || "",
    host: item.host || item.activeHost || "",
    slug: item.slug || item.prototypeSlug || "",
    handoffId: item.handoffId || item.handoff || "",
    workflowRunId: item.workflowRunId || item.workflow_run_id || "",
    requestedVariantCount: item.requestedVariantCount ?? item.requestedVariants ?? item.variantCount ?? item.requested_variants ?? null,
    target: item.target || "",
    mode: item.mode || "",
    requiresCapabilityPlan: item.requiresCapabilityPlan ?? item.requireCapabilityPlan ?? false,
    requireBrowserEvidence: item.requireBrowserEvidence ?? item.requiresBrowserEvidence ?? false,
  };
}

function removeUndefined(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isExplicitActiveRequest(options = {}) {
  return options.active === true
    || Boolean(options.command)
    || Boolean(options.slug)
    || Boolean(options.handoffId)
    || Boolean(options.workflowRunId)
    || Boolean(options.requestedVariantCount)
    || Boolean(options.requestedVariants)
    || Boolean(options.requireBrowserEvidence)
    || Boolean(options.requireCapabilityPlan);
}

function requireActiveField(value, code, message, issues) {
  if (String(value || "").trim()) return;
  issues.push(issue(code, "active-workflow-context", message));
}

function check(id, pass, result = {}) {
  return { id, pass: pass === true, result };
}

function issue(code, file, message) {
  return { code, file, message };
}

function nextActionForIssues(issues = [], context = {}) {
  const codes = new Set(issues.map((item) => item.code));
  if (codes.has("active-command-agent-plan-blocked") || codes.has("active-design-receipts-checked-zero")) {
    return `run real /supervibe-design specialists and issue scoped receipts for ${context.handoffId || context.workflowRunId || "active handoff"}`;
  }
  if ([...codes].some((code) => code.includes("variant") || code.includes("launcher") || code.includes("screenshot"))) {
    return `repair prototype artifacts for slug ${context.slug || "unknown"} and rerun validate-design-active-completion`;
  }
  if ([...codes].some((code) => code.includes("capability"))) {
    return "create a bound prototype-capability-plan.md and rerun active completion";
  }
  if ([...codes].some((code) => code.includes("quality-gate") || code.includes("review"))) {
    return "run scoped ui-polish, accessibility, and quality-gate reviewer stages";
  }
  return "repair listed blockers and rerun validate-design-active-completion";
}

function discoverDurablePrototypeArtifacts(rootDir = process.cwd()) {
  const prototypeRoot = join(rootDir, ".supervibe", "artifacts", "prototypes");
  if (!existsSync(prototypeRoot)) return [];
  const artifacts = [];
  const visit = (dir) => {
    if (isDraftExplorationDir(dir, prototypeRoot)) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "_design-system") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (isDurablePrototypeArtifact(entry.name)) {
        artifacts.push(path);
      }
    }
  };
  visit(prototypeRoot);
  return artifacts;
}

function isDurablePrototypeArtifact(name = "") {
  if (name === ".draft-exploration") return false;
  return /^(?:index|variant-manifest|browser-verification|approval|prototype-capability-plan)\.(?:html|json|md)$/i.test(name)
    || /\.(?:html|md)$/i.test(name);
}

function isDraftExplorationDir(dir, prototypeRoot) {
  let current = dir;
  while (normalizeRelPath(current).startsWith(normalizeRelPath(prototypeRoot))) {
    if (existsSync(join(current, ".draft-exploration"))) return true;
    if (current === prototypeRoot) return false;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  return false;
}

function inferPrototypeSlugFromArtifact(path = "") {
  const normalized = normalizeRelPath(path);
  const marker = ".supervibe/artifacts/prototypes/";
  const index = normalized.indexOf(marker);
  if (index < 0) return "";
  return normalized.slice(index + marker.length).split("/")[0] || "";
}

function hasActivePrototypeOutput(rootDir, context = {}) {
  const safeSlug = sanitizePathPart(context.slug || "");
  if (!safeSlug) return false;
  const marker = `.supervibe/artifacts/prototypes/${safeSlug}/`;
  return discoverDurablePrototypeArtifacts(rootDir)
    .some((artifactPath) => normalizeRelPath(artifactPath).includes(marker));
}

function expectedVariantTargets(rootDir, { slug = "", requestedVariantCount = 0 } = {}) {
  const safeSlug = sanitizePathPart(slug);
  const prototypeRoot = join(rootDir, ".supervibe", "artifacts", "prototypes", safeSlug);
  const manifestPath = join(prototypeRoot, "variant-manifest.json");
  const manifest = readJsonIfExists(manifestPath);
  const variants = Array.isArray(manifest?.variants) ? manifest.variants : [];
  if (variants.length) {
    return variants.map((variant, index) => {
      const id = variant.id || `variant-${index + 1}`;
      const relPath = normalizeRelPath(variant.artifactPath || `.supervibe/artifacts/prototypes/${safeSlug}/variants/${id}/index.html`);
      return {
        id,
        relPath,
        absPath: join(rootDir, ...relPath.split("/")),
      };
    });
  }
  const count = Math.max(0, Number(requestedVariantCount || 0));
  return Array.from({ length: count }, (_, index) => {
    const id = `variant-${index + 1}`;
    const relPath = `.supervibe/artifacts/prototypes/${safeSlug}/variants/${id}/index.html`;
    return {
      id,
      relPath,
      absPath: join(rootDir, ...relPath.split("/")),
    };
  });
}

function extractHrefs(text = "") {
  return [...String(text || "").matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((href) => href && !/^(?:https?:|mailto:|#)/i.test(href));
}

function hrefTargetsVariant(href = "", id = "", launcherPath = "", absArtifactPath = "") {
  const normalized = normalizeRelPath(href);
  if (normalized.includes(`${id}/`) || normalized.endsWith(`${id}`) || normalized.includes(`variants/${id}`)) return true;
  const target = resolveHrefTarget(launcherPath, href);
  if (!target) return false;
  return normalizeRelPath(target) === normalizeRelPath(absArtifactPath)
    || normalizeRelPath(join(target, "index.html")) === normalizeRelPath(absArtifactPath);
}

function resolveHrefTarget(launcherPath, href = "") {
  const clean = String(href || "").split("#")[0].split("?")[0];
  if (!clean) return null;
  const base = dirname(launcherPath);
  const target = join(base, ...clean.split("/").filter(Boolean));
  if (clean.endsWith("/") || !/\.[a-z0-9]+$/i.test(clean)) return target;
  return target;
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function proofPass(parsed = {}, field = "", context = {}) {
  const direct = parsed[field];
  const nested = parsed.checks?.[field] ?? parsed.proofs?.[field];
  for (const value of [direct, nested]) {
    if (field === "url" && urlProofPass(value)) return true;
    if (field === "capturedAt" && timestampProofPass(value)) return true;
    if ((field === "desktopScreenshot" || field === "mobileScreenshot") && screenshotProofPass(value, context)) return true;
    if (field !== "url" && field !== "capturedAt" && field !== "desktopScreenshot" && field !== "mobileScreenshot") {
      if (value === true) return true;
      if (value && typeof value === "object" && value.pass === true) return true;
    }
  }
  return false;
}

function urlProofPass(value) {
  const candidate = typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? value.url
      : "";
  if (typeof candidate !== "string") return false;
  return /^https?:\/\/[^\s]+$/i.test(candidate.trim());
}

function timestampProofPass(value) {
  const candidate = typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? value.capturedAt || value.timestamp || value.ts
      : "";
  if (typeof candidate !== "string" || !candidate.trim()) return false;
  return Number.isFinite(Date.parse(candidate));
}

function screenshotProofPass(value, { rootDir = process.cwd(), evidencePath = "" } = {}) {
  const candidate = typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? value.path || value.screenshotPath
      : "";
  if (typeof candidate !== "string" || !candidate.trim()) return false;
  if (isPlaceholderProof(candidate)) return false;
  const resolved = resolveEvidenceFile(rootDir, evidencePath, candidate);
  return Boolean(resolved && existsSync(resolved) && statSync(resolved).isFile());
}

function isPlaceholderProof(value = "") {
  return /^(?:skipped|skip|not[- ]?checked|none|null|n\/a|todo|pending)$/i.test(String(value || "").trim());
}

function resolveEvidenceFile(rootDir, evidencePath, value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (isAbsolute(raw)) return raw;
  const normalized = normalizeRelPath(raw);
  if (normalized.startsWith(".supervibe/")) {
    return join(rootDir, ...normalized.split("/"));
  }
  return join(dirname(evidencePath), ...normalized.split("/"));
}

function requestedVariantCountFromOption(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 1 ? Math.trunc(count) : 0;
}

function expectedScreenshotPairCount(variantCount) {
  const count = Number(variantCount);
  if (!Number.isFinite(count) || count <= 1) return 0;
  return Math.trunc(count * (count - 1) / 2);
}

function screenshotCoveredPairCount(screenshot = {}) {
  const count = Number(screenshot.coveredPairs ?? screenshot.uniquePairs ?? screenshot.checkedPairs ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function boolish(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return /^(1|true|yes|on|required)$/i.test(String(value));
}

function normalizeCommand(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function sanitizePathPart(value = "") {
  return String(value || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeRelPath(path = "") {
  return String(path || "").split(sep).join("/").replace(/^\.\//, "");
}

function rel(rootDir, path) {
  return normalizeRelPath(relative(rootDir, path));
}
