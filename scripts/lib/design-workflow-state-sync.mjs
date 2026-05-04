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

function isPrototypeWorkflowStage(stageId = "") {
  return /^stage-[3-7]-/.test(String(stageId || ""));
}

function rel(rootDir, path) {
  return String(relative(rootDir, path)).split(sep).join("/");
}
