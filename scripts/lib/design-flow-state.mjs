import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { artifactRoot } from "./supervibe-artifact-roots.mjs";

const DESIGN_FLOW_STATE_FILE = "design-flow-state.json";

export const REQUIRED_DESIGN_SYSTEM_SECTIONS = Object.freeze([
  "palette",
  "typography",
  "spacing-density",
  "radius-elevation",
  "motion",
  "component-set",
  "copy-language",
  "accessibility-platform",
]);

function designFlowStatePath(projectRoot) {
  return resolve(artifactRoot(projectRoot, "prototypes"), "_design-system", DESIGN_FLOW_STATE_FILE);
}

function readDesignFlowState(projectRoot) {
  const path = designFlowStatePath(projectRoot);
  if (!existsSync(path)) return { path, state: null, error: null };
  try {
    return { path, state: JSON.parse(readFileSync(path, "utf8")), error: null };
  } catch (error) {
    return { path, state: null, error };
  }
}

function readDesignSystemManifest(projectRoot) {
  const path = resolve(artifactRoot(projectRoot, "prototypes"), "_design-system", "manifest.json");
  if (!existsSync(path)) return { path, manifest: null, error: null };
  try {
    return { path, manifest: JSON.parse(readFileSync(path, "utf8")), error: null };
  } catch (error) {
    return { path, manifest: null, error };
  }
}

export function evaluatePrototypeTransition(projectRoot) {
  const flow = readDesignFlowState(projectRoot);
  if (flow.error) {
    return block("invalid-design-flow-state", `Cannot parse ${flow.path}: ${flow.error.message}`, flow);
  }

  if (!flow.state) {
    return evaluateLegacyManifestTransition(projectRoot, flow);
  }

  const designSystem = flow.state.design_system ?? flow.state.designSystem ?? {};
  const status = normalizeStatus(designSystem.status);
  if (status !== "approved") {
    return block(
      "design-system-not-approved",
      `Prototype phase is blocked until design_system.status === approved in ${flow.path}. Current status: ${status || "missing"}.`,
      flow,
    );
  }

  const approvedSections = collectApprovedSections(designSystem);
  const missingSections = REQUIRED_DESIGN_SYSTEM_SECTIONS.filter((section) => !approvedSections.has(section));
  if (missingSections.length > 0) {
    return block(
      "missing-design-system-sections",
      `Prototype phase is blocked until required design-system sections are approved: ${missingSections.join(", ")}.`,
      flow,
      { missingSections },
    );
  }

  return {
    allowed: true,
    code: "design-system-approved",
    reason: `Prototype phase allowed: design_system.status is approved and required sections are approved in ${flow.path}.`,
    statePath: flow.path,
    missingSections: [],
  };
}

function evaluateLegacyManifestTransition(projectRoot, flow) {
  const { path, manifest, error } = readDesignSystemManifest(projectRoot);
  if (error) {
    return block("invalid-design-system-manifest", `Cannot parse ${path}: ${error.message}`, flow);
  }
  if (!manifest) {
    return block(
      "missing-design-flow-state",
      `Prototype phase is blocked until ${flow.path} exists and design_system.status === approved.`,
      flow,
    );
  }

  const status = normalizeStatus(manifest.status);
  if (status !== "approved") {
    return block(
      "design-system-not-approved",
      `Prototype phase is blocked: ${path} status is ${status || "missing"}, but approved is required.`,
      flow,
    );
  }

  const approvedSections = collectApprovedSections(manifest);
  const missingSections = REQUIRED_DESIGN_SYSTEM_SECTIONS.filter((section) => !approvedSections.has(section));
  if (missingSections.length > 0) {
    return block(
      "missing-design-flow-state",
      `Prototype phase is blocked until ${flow.path} records approved sections: ${missingSections.join(", ")}.`,
      flow,
      { missingSections },
    );
  }

  return {
    allowed: true,
    code: "legacy-approved-design-system",
    reason: `Prototype phase allowed from approved manifest with all required sections; write ${flow.path} on the next design state update.`,
    statePath: flow.path,
    manifestPath: path,
    missingSections: [],
  };
}

function collectApprovedSections(value) {
  const approved = new Set();
  for (const section of arrayValues(value.approved_sections ?? value.approvedSections)) {
    approved.add(normalizeSection(section));
  }
  const sectionMap = value.sections ?? value.approvals ?? {};
  if (sectionMap && typeof sectionMap === "object") {
    for (const [name, sectionValue] of Object.entries(sectionMap)) {
      const status = normalizeStatus(typeof sectionValue === "object" ? sectionValue.status : sectionValue);
      if (status === "approved") approved.add(normalizeSection(name));
    }
  }
  return approved;
}

function arrayValues(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", "-");
}

function normalizeSection(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", "-");
}

function block(code, reason, flow, extra = {}) {
  return {
    allowed: false,
    code,
    reason,
    statePath: flow.path,
    missingSections: [],
    ...extra,
  };
}
