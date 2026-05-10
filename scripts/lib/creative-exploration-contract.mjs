import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

const REQUIRED_DIRECTION_FIELDS = Object.freeze([
  "id",
  "label",
  "ownableMoment",
  "nonStandardUx",
  "hardConstraints",
  "forbiddenShells",
  "navigationModel",
  "composerModel",
  "agentStateModel",
]);

export function validateCreativeExplorationContract(state = {}) {
  const issues = [];
  const directions = Array.isArray(state.directionSpecs)
    ? state.directionSpecs
    : Array.isArray(state.directions)
      ? state.directions
      : [];
  const semanticMap = state.semanticMap || state.oldPrototypeSemanticMap || null;
  const gate = state.userGate || state.designGate || null;
  const prototypeArtifacts = Array.isArray(state.prototypeArtifacts) ? state.prototypeArtifacts : [];

  if (!semanticMap || typeof semanticMap !== "object") {
    issues.push(issue("missing-semantic-map", "creative-exploration", "old prototype semantic map is required before creative direction"));
  } else if (Array.isArray(semanticMap.missingSignals) && semanticMap.missingSignals.length > 0) {
    issues.push(issue("incomplete-semantic-map", "semanticMap", `semantic map is missing required signals: ${semanticMap.missingSignals.join(", ")}`));
  }

  if (directions.length < 5) {
    issues.push(issue("too-few-direction-specs", "directionSpecs", `expected at least 5 direction specs, found ${directions.length}`));
  }

  for (const [index, direction] of directions.entries()) {
    validateDirection(direction, index, issues);
  }

  if (prototypeArtifacts.length > 0 && gate?.status !== "approved") {
    issues.push(issue("prototype-before-design-gate", "prototypeArtifacts", "prototype artifacts are blocked until the creative direction gate is approved"));
  }

  if (directions.length >= 5 && gate?.status !== "approved") {
    issues.push(issue("missing-design-gate", "userGate", "creative direction specs require explicit user/design approval before prototype build"));
  }

  return {
    schemaVersion: 1,
    pass: issues.length === 0,
    checkedDirections: directions.length,
    prototypeArtifacts: prototypeArtifacts.length,
    gateStatus: gate?.status || "missing",
    issues,
  };
}

export function validateCreativeExplorationFile(rootDir = process.cwd(), relPath = ".supervibe/artifacts/design/creative-exploration.json") {
  const normalized = normalizeRelPath(relPath);
  const absPath = join(rootDir, ...normalized.split("/"));
  if (!existsSync(absPath)) {
    return {
      schemaVersion: 1,
      pass: true,
      status: "not-started",
      file: normalized,
      checkedDirections: 0,
      prototypeArtifacts: 0,
      gateStatus: "missing",
      issues: [],
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(absPath, "utf8"));
    return {
      ...validateCreativeExplorationContract(parsed),
      status: "checked",
      file: normalized,
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      pass: false,
      status: "failed",
      file: normalized,
      checkedDirections: 0,
      prototypeArtifacts: 0,
      gateStatus: "unknown",
      issues: [issue("invalid-creative-exploration-json", normalized, error.message)],
    };
  }
}

function validateDirection(direction = {}, index, issues) {
  const id = direction.id || `direction-${index + 1}`;
  for (const field of REQUIRED_DIRECTION_FIELDS) {
    if (!strongValue(direction[field])) {
      issues.push(issue("missing-direction-field", id, `${field} is required`));
    }
  }
  const constraints = Array.isArray(direction.hardConstraints) ? direction.hardConstraints : [];
  if (constraints.length < 3) {
    issues.push(issue("weak-direction-constraints", id, "direction needs at least 3 hard constraints"));
  }
  const forbidden = Array.isArray(direction.forbiddenShells) ? direction.forbiddenShells.join(" ") : String(direction.forbiddenShells || "");
  if (!/topbar|composer|drawer|chat|shell/i.test(forbidden)) {
    issues.push(issue("missing-forbidden-shells", id, "direction must explicitly forbid at least one ordinary shell pattern"));
  }
}

function strongValue(value) {
  if (Array.isArray(value)) return value.length > 0 && value.every((item) => strongValue(item));
  const text = String(value ?? "").trim();
  return text.length >= 3 && !/^(tbd|todo|n\/a|none|null|undefined|same)$/i.test(text);
}

function issue(code, file, message) {
  return { code, file, message };
}

function normalizeRelPath(path = "") {
  return String(path || "").split(sep).join("/").replace(/^\.\//, "");
}
