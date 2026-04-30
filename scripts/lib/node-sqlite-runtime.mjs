import {
  SQLITE_NODE_MIN_VERSION,
  nodeMeetsMinimum,
} from "./node-runtime-requirements.mjs";

export { SQLITE_NODE_MIN_VERSION } from "./node-runtime-requirements.mjs";

export function hasNodeSqliteSupport(version = process.versions.node) {
  return nodeMeetsMinimum(version, SQLITE_NODE_MIN_VERSION);
}

function nodeSqliteUnavailableMessage(feature = "SQLite-backed Supervibe storage") {
  return `${feature} requires Node.js ${SQLITE_NODE_MIN_VERSION}+ because it uses the built-in node:sqlite module. Current runtime: ${process.version}. Re-run the installer and approve the Node.js upgrade prompt, or install Node.js ${SQLITE_NODE_MIN_VERSION}+ manually.`;
}

export async function loadNodeSqliteDatabaseSync(feature) {
  if (!hasNodeSqliteSupport()) {
    throw new Error(nodeSqliteUnavailableMessage(feature));
  }
  try {
    const sqlite = await import("node:sqlite");
    if (!sqlite.DatabaseSync) throw new Error("node:sqlite DatabaseSync export is missing");
    return sqlite.DatabaseSync;
  } catch (err) {
    const wrapped = new Error(nodeSqliteUnavailableMessage(feature));
    wrapped.cause = err;
    throw wrapped;
  }
}
