export const SQLITE_NODE_MIN_VERSION = "22.5.0";

function parseNodeVersion(version = process.versions.node) {
  const raw = String(version || "").trim().replace(/^v/i, "");
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { raw, major: 0, minor: 0, patch: 0 };
  return {
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareNodeVersions(a, b) {
  const left = typeof a === "string" ? parseNodeVersion(a) : a;
  const right = typeof b === "string" ? parseNodeVersion(b) : b;
  for (const key of ["major", "minor", "patch"]) {
    if ((left?.[key] || 0) > (right?.[key] || 0)) return 1;
    if ((left?.[key] || 0) < (right?.[key] || 0)) return -1;
  }
  return 0;
}

export function nodeMeetsMinimum(version, minimum) {
  return compareNodeVersions(parseNodeVersion(version), parseNodeVersion(minimum)) >= 0;
}

export function getNodeRuntimeCapability(version = process.versions.node) {
  const parsed = parseNodeVersion(version);
  const fullRuntime = nodeMeetsMinimum(parsed.raw, SQLITE_NODE_MIN_VERSION);
  return {
    version: parsed.raw,
    installSupported: fullRuntime,
    sqliteSupported: fullRuntime,
    devCheckSupported: fullRuntime,
  };
}

export function formatNodeRuntimeMode(version = process.versions.node) {
  const capability = getNodeRuntimeCapability(version);
  if (!capability.installSupported) {
    return `Node.js ${SQLITE_NODE_MIN_VERSION}+ is required to install Supervibe with SQLite-backed semantic RAG, code graph, and project memory (current ${versionString(version)}).`;
  }
  return `Node.js ${versionString(version)} supports Supervibe SQLite-backed features and developer checks.`;
}

function versionString(version) {
  const raw = String(version || process.versions.node).trim();
  return raw.startsWith("v") ? raw : `v${raw}`;
}
