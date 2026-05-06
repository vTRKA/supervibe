import { existsSync } from "node:fs";
import { join } from "node:path";

import { CodeStore } from "./code-store.mjs";
import {
  collectIndexHealthFromStore,
  evaluateIndexHealthGate,
} from "./supervibe-index-health.mjs";
import {
  CODEGRAPH_INDEX_COMMAND,
  SOURCE_RAG_INDEX_COMMAND,
} from "./supervibe-command-catalog.mjs";
import {
  discoverSourceFiles,
} from "./supervibe-index-policy.mjs";

export async function collectIndexHealthPreflight(rootDir = process.cwd(), {
  strictGraph = true,
} = {}) {
  const dbPath = join(rootDir, ".supervibe", "memory", "code.db");
  if (!existsSync(dbPath)) {
    const inventory = await discoverSourceFiles(rootDir);
    return {
      ready: inventory.files.length === 0,
      status: inventory.files.length === 0 ? "no-source-files" : "missing-code-index",
      failed: inventory.files.length === 0 ? [] : ["missing-code-index"],
      warnings: [],
      eligibleSourceFiles: inventory.files.length,
      indexedSourceFiles: 0,
      repairCommand: SOURCE_RAG_INDEX_COMMAND,
      graphRepairCommand: CODEGRAPH_INDEX_COMMAND,
    };
  }
  const store = new CodeStore(rootDir, { useEmbeddings: false, useGraph: true });
  try {
    await store.init();
    const health = await collectIndexHealthFromStore(store, { rootDir });
    const gate = evaluateIndexHealthGate(health, { strictGraph });
    return {
      ready: gate.ready === true,
      status: gate.ready === true ? "ready" : "not-ready",
      failed: (gate.failedGates || []).map((item) => item.code),
      warnings: (gate.warnings || []).map((item) => item.code),
      eligibleSourceFiles: gate.eligibleSourceFiles || 0,
      indexedSourceFiles: gate.indexedSourceFiles || 0,
      repairCommand: gate.repairCommand || SOURCE_RAG_INDEX_COMMAND,
      graphRepairCommand: gate.graphRepairCommand || CODEGRAPH_INDEX_COMMAND,
    };
  } finally {
    store.close();
  }
}

export function formatIndexHealthPreflight(preflight = {}) {
  return [
    `INDEX_HEALTH_READY: ${preflight.ready === true}`,
    `INDEX_HEALTH_STATUS: ${preflight.status || "unknown"}`,
    `INDEX_HEALTH_FAILED: ${(preflight.failed || []).join(",") || "none"}`,
    `INDEX_HEALTH_WARNINGS: ${(preflight.warnings || []).join(",") || "none"}`,
    `INDEX_HEALTH_REPAIR: ${preflight.repairCommand || SOURCE_RAG_INDEX_COMMAND}`,
    `INDEX_GRAPH_REPAIR: ${preflight.graphRepairCommand || CODEGRAPH_INDEX_COMMAND}`,
  ].join("\n");
}
