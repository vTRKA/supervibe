import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export function createWorkspaceNamespace({ projectRoot = process.cwd(), sourceKind = "project", visibility = "private", importedFrom = null } = {}) {
  const normalizedRoot = normalizeWorkspaceRoot(projectRoot);
  return {
    workspaceId: `ws_${sha1(normalizedRoot).slice(0, 12)}`,
    projectRoot: normalizedRoot,
    sourceKind,
    visibility,
    importedFrom,
  };
}

export function attachWorkspaceNamespace(items = [], namespace = createWorkspaceNamespace()) {
  return (items || []).map((item) => ({
    ...item,
    workspaceId: item.workspaceId || namespace.workspaceId,
    projectRoot: item.projectRoot || namespace.projectRoot,
    sourceKind: item.sourceKind || namespace.sourceKind,
    visibility: item.visibility || namespace.visibility,
    importedFrom: item.importedFrom ?? namespace.importedFrom,
  }));
}

export function validateWorkspaceIsolation({
  targetNamespace = createWorkspaceNamespace(),
  contextItems = [],
  approvedImports = [],
  globalWorkspaceIds = ["global:supervibe-plugin"],
} = {}) {
  const approved = new Set(approvedImports.map((item) => typeof item === "string" ? item : item.workspaceId || item.projectRoot));
  const violations = [];
  for (const item of contextItems || []) {
    const itemWorkspace = item.workspaceId || targetNamespace.workspaceId;
    const imported = item.importedFrom || item.projectRoot;
    const allowed = itemWorkspace === targetNamespace.workspaceId
      || globalWorkspaceIds.includes(itemWorkspace)
      || item.visibility === "global-plugin"
      || approved.has(itemWorkspace)
      || approved.has(imported);
    if (!allowed) {
      violations.push({
        itemId: item.id || item.path || "context-item",
        workspaceId: itemWorkspace,
        projectRoot: item.projectRoot || "",
        reason: "context result crossed workspace namespace without import approval",
      });
    }
  }
  return {
    pass: violations.length === 0,
    targetWorkspaceId: targetNamespace.workspaceId,
    checked: contextItems.length,
    violations,
  };
}

export function buildWorkspaceIsolationReport({ rootDir = process.cwd(), contextItems = [] } = {}) {
  const namespace = createWorkspaceNamespace({ projectRoot: rootDir });
  const annotated = attachWorkspaceNamespace(contextItems, namespace);
  const validation = validateWorkspaceIsolation({ targetNamespace: namespace, contextItems: annotated });
  return {
    schemaVersion: 1,
    namespace,
    pass: validation.pass,
    checked: validation.checked,
    violations: validation.violations,
    orphanedEntries: annotated.filter((item) => !item.workspaceId || !item.projectRoot).length,
  };
}

export function formatWorkspaceIsolationReport(report = {}) {
  const lines = [
    "SUPERVIBE_WORKSPACE_ISOLATION",
    `PASS: ${Boolean(report.pass)}`,
    `WORKSPACE_ID: ${report.namespace?.workspaceId || "unknown"}`,
    `PROJECT_ROOT: ${report.namespace?.projectRoot || "unknown"}`,
    `CHECKED: ${report.checked || 0}`,
    `VIOLATIONS: ${report.violations?.length || 0}`,
    `ORPHANED: ${report.orphanedEntries || 0}`,
  ];
  for (const violation of report.violations || []) lines.push(`- ${violation.itemId}: ${violation.reason}`);
  return lines.join("\n");
}

function normalizeWorkspaceRoot(projectRoot = process.cwd()) {
  const resolved = resolve(projectRoot);
  try {
    return realpathSync.native(resolved).replace(/\\/g, "/").toLowerCase();
  } catch {
    return resolved.replace(/\\/g, "/").toLowerCase();
  }
}

function sha1(value) {
  return createHash("sha1").update(String(value)).digest("hex");
}
