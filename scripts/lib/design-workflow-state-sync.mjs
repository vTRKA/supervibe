import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  evaluateDesignQualityGate,
} from "./design-quality-gate-aggregator.mjs";
import {
  artifactRoot,
} from "./supervibe-artifact-roots.mjs";

export async function syncDesignWorkflowStateAfterStage(rootDir = process.cwd(), {
  slug = "",
  stageId = "",
  owner = "",
  outputArtifact = "",
  receiptPath = null,
  confidence = null,
  updatedAt = new Date().toISOString(),
} = {}) {
  if (!slug) return { pass: true, updatedFiles: [], issues: ["slug missing; state sync skipped"] };
  const updatedFiles = [];
  const prototypesRoot = artifactRoot(rootDir, "prototypes");
  const prototypeRoot = join(prototypesRoot, slug);
  const designSystemRoot = join(prototypesRoot, "_design-system");
  const configPath = join(prototypeRoot, "config.json");
  const flowPath = join(designSystemRoot, "design-flow-state.json");
  const manifestPath = join(designSystemRoot, "manifest.json");
  const prototypeExists = existsSync(join(prototypeRoot, "index.html"));
  const prototypeApproved = normalizeStatus(readJson(join(prototypeRoot, ".approval.json"))?.status) === "approved";
  const prototypeStage = isPrototypeWorkflowStage(stageId);
  const qualityGate = existsSync(prototypeRoot)
    ? evaluateDesignQualityGate(rootDir, { slug, requireReviews: prototypeApproved })
    : null;

  const stageRecord = {
    status: "outputs_ready",
    owner,
    outputArtifact,
    receiptPath,
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : null,
    updatedAt,
  };

  const config = readJson(configPath) || {};
  config.schemaVersion = config.schemaVersion || 1;
  config.mode = prototypeExists && config.mode === "design-system-only"
    ? "full-prototype-pipeline"
    : (config.mode || (prototypeStage ? "full-prototype-pipeline" : "design-system-only"));
  config.prototypeUnlocked = prototypeStage || config.prototypeUnlocked === true;
  config.prototypeExists = prototypeExists;
  config.handoffBlocked = !prototypeApproved || qualityGate?.approvalAllowed === false;
  config.lifecycleStage = prototypeApproved ? "handoff ready" : prototypeExists ? "prototype draft" : "prototype missing";
  config.status = prototypeApproved ? "approved" : prototypeExists ? "draft" : (config.status || "prototype-ready");
  config.nextAction = prototypeApproved
    ? "Package handoff"
    : prototypeExists
      ? "Review prototype / revise prototype / approve / stop"
      : "Build prototype / revise DS / stop";
  config.qualityGate = qualityGate ? {
    pass: qualityGate.pass,
    approvalAllowed: qualityGate.approvalAllowed,
    blockerCount: qualityGate.blockerCount,
    highCount: qualityGate.highCount,
    confidence: qualityGate.confidence,
    updatedAt,
  } : null;
  config.stageTriage = {
    ...(config.stageTriage || {}),
    [stageId]: stageRecord,
  };
  await writeJson(configPath, config);
  updatedFiles.push(rel(rootDir, configPath));

  const flow = readJson(flowPath) || {};
  flow.prototype = {
    ...(flow.prototype || {}),
    requested: prototypeStage ? "ALLOWED" : (flow.prototype?.requested || "BLOCKED"),
    exists: prototypeExists,
    status: prototypeApproved ? "approved" : prototypeExists ? "prototype-draft" : "prototype-ready",
    current_stage: stageId,
    next_action: config.nextAction,
    handoff_blocked_reason: config.handoffBlocked
      ? qualityGate?.approvalAllowed === false
        ? "quality gate blocks prototype approval"
        : "handoff requires approved prototype"
      : null,
    quality_gate: config.qualityGate,
    stage_triage: {
      ...(flow.prototype?.stage_triage || {}),
      [stageId]: stageRecord,
    },
    updated_at: updatedAt,
  };
  await writeJson(flowPath, flow);
  updatedFiles.push(rel(rootDir, flowPath));

  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    if (manifest) {
      manifest.workflowState = {
        ...(manifest.workflowState || {}),
        prototypeExists,
        prototypeApproved,
        lastStage: stageId,
        qualityGate: config.qualityGate,
        updatedAt,
      };
      await writeJson(manifestPath, manifest);
      updatedFiles.push(rel(rootDir, manifestPath));
    }
  }

  return { pass: true, updatedFiles, issues: [] };
}

export async function syncApprovedPrototypeState(rootDir = process.cwd(), {
  slug = "",
  target = "",
  updatedAt = new Date().toISOString(),
} = {}) {
  if (!slug) return { pass: false, updatedFiles: [], issues: ["slug missing"] };
  const updatedFiles = [];
  const issues = [];
  const prototypesRoot = artifactRoot(rootDir, "prototypes");
  const prototypeRoot = join(prototypesRoot, slug);
  const designSystemRoot = join(prototypesRoot, "_design-system");
  const approvalPath = join(prototypeRoot, ".approval.json");
  const configPath = join(prototypeRoot, "config.json");
  const flowPath = join(designSystemRoot, "design-flow-state.json");
  const manifestPath = join(designSystemRoot, "manifest.json");
  const approved = normalizeStatus(readJson(approvalPath)?.status) === "approved";
  const prototypeExists = existsSync(join(prototypeRoot, "index.html"));
  if (!approved) issues.push(`prototype approval missing or not approved: ${rel(rootDir, approvalPath)}`);
  if (!prototypeExists) issues.push(`prototype index missing: ${rel(rootDir, join(prototypeRoot, "index.html"))}`);
  if (!approved || !prototypeExists) return { pass: false, updatedFiles, issues };

  const manifest = readJson(manifestPath) || {};
  const config = readJson(configPath) || {};
  const resolvedTarget = resolveTarget(target, config, manifest);
  const handoffExists = existsSync(join(prototypeRoot, "handoff")) || existsSync(join(prototypeRoot, "designer-package.json"));
  const qualityGate = evaluateDesignQualityGate(rootDir, { slug, requireReviews: true });
  const handoffBlocked = qualityGate?.approvalAllowed === false;

  config.schemaVersion = config.schemaVersion || 1;
  config.target = resolvedTarget;
  config.designSystemStatus = "approved";
  config.mode = config.mode === "design-system-only" ? "full-prototype-pipeline" : (config.mode || "full-prototype-pipeline");
  config.approval = "approved";
  config.status = "approved";
  config.prototypeUnlocked = true;
  config.prototypeExists = true;
  config.prototypeApproved = true;
  config.handoffExists = handoffExists;
  config.handoffBlocked = handoffBlocked;
  config.lifecycleStage = handoffBlocked ? "approval drift" : "handoff ready";
  config.nextAction = handoffBlocked ? "Resolve quality gate drift before handoff" : "Package handoff";
  config.qualityGate = qualityGate ? {
    pass: qualityGate.pass,
    approvalAllowed: qualityGate.approvalAllowed,
    blockerCount: qualityGate.blockerCount,
    highCount: qualityGate.highCount,
    confidence: qualityGate.confidence,
    updatedAt,
  } : null;
  config.syncedFromApproval = {
    status: "approved",
    approvalPath: rel(rootDir, approvalPath),
    updatedAt,
  };
  await writeJson(configPath, config);
  updatedFiles.push(rel(rootDir, configPath));

  const flow = readJson(flowPath) || {};
  flow.target = resolvedTarget;
  flow.designSystemApproved = true;
  flow.prototypeUnlocked = true;
  flow.prototypeApproved = true;
  flow.design_system = {
    ...(flow.design_system || {}),
    status: "approved",
  };
  flow.prototype = {
    ...(flow.prototype || {}),
    requested: "ALLOWED",
    exists: true,
    approved: true,
    status: "approved",
    current_stage: flow.prototype?.current_stage || "approval",
    next_action: config.nextAction,
    handoff_blocked_reason: handoffBlocked ? "quality gate blocks approved prototype handoff" : null,
    handoff_exists: handoffExists,
    quality_gate: config.qualityGate,
    updated_at: updatedAt,
  };
  await writeJson(flowPath, flow);
  updatedFiles.push(rel(rootDir, flowPath));

  manifest.schemaVersion = manifest.schemaVersion || 1;
  manifest.target = resolvedTarget;
  manifest.status = "approved";
  manifest.tokensState = "final";
  manifest.workflowState = {
    ...(manifest.workflowState || {}),
    target: resolvedTarget,
    prototypeExists: true,
    prototypeApproved: true,
    designSystemApproved: true,
    handoffExists,
    handoffBlocked,
    qualityGate: config.qualityGate,
    updatedAt,
  };
  const variant = resolveApprovedDesignSystemVariant(config, readJson(approvalPath), manifest);
  if (variant) {
    promoteManifestVariant(manifest, {
      variant,
      slug,
      source: rel(rootDir, approvalPath),
      approvedAt: updatedAt,
    });
  }
  await writeJson(manifestPath, manifest);
  updatedFiles.push(rel(rootDir, manifestPath));

  return { pass: !handoffBlocked, updatedFiles: [...new Set(updatedFiles)], issues };
}

function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", "-");
}

function resolveTarget(target, config, manifest) {
  for (const value of [
    target,
    config?.target,
    manifest?.target,
    manifest?.workflowState?.target,
    "web",
  ]) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized && normalized !== "unknown") return normalized;
  }
  return "web";
}

export function resolveApprovedDesignSystemVariant(config = {}, approval = {}, manifest = {}) {
  for (const value of [
    approval?.designSystemVariant,
    approval?.themeVariant,
    approval?.theme,
    config?.approvedDesignSystemVariant,
    config?.designSystemVariant,
    config?.themeVariant,
    config?.theme,
    config?.designWizard?.decisions?.palette_mood?.choiceId,
    manifest?.approvedVariant,
    manifest?.workflowState?.approvedVariant,
  ]) {
    const normalized = String(value || "").trim();
    if (normalized && normalized !== "unknown") return normalized;
  }
  return "";
}

export function promoteManifestVariant(manifest = {}, {
  variant = "",
  slug = "",
  source = "",
  approvedAt = new Date().toISOString(),
} = {}) {
  const normalized = String(variant || "").trim();
  if (!normalized) return manifest;
  manifest.approvedVariant = normalized;
  manifest.variants = {
    ...(manifest.variants || {}),
    [normalized]: {
      ...(manifest.variants?.[normalized] || {}),
      status: "approved",
      sourcePrototype: slug || manifest.variants?.[normalized]?.sourcePrototype || null,
      source,
      approvedAt,
    },
  };
  manifest.workflowState = {
    ...(manifest.workflowState || {}),
    approvedVariant: normalized,
  };
  return manifest;
}

function isPrototypeWorkflowStage(stageId = "") {
  return /^stage-[3-7]-/.test(String(stageId || ""));
}

function rel(rootDir, path) {
  return String(relative(rootDir, path)).split(sep).join("/");
}
