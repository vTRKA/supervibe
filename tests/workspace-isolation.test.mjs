import assert from "node:assert/strict";
import test from "node:test";

import {
  attachWorkspaceNamespace,
  createWorkspaceNamespace,
  formatWorkspaceIsolationReport,
  validateWorkspaceIsolation,
} from "../scripts/lib/supervibe-workspace-isolation.mjs";

test("workspace isolation denies cross-project context without import approval", () => {
  const projectA = createWorkspaceNamespace({ projectRoot: "D:/workspace/project-a" });
  const projectB = createWorkspaceNamespace({ projectRoot: "D:/workspace/project-b" });
  const items = [
    ...attachWorkspaceNamespace([{ id: "memory-a", path: ".supervibe/memory/a.md" }], projectA),
    ...attachWorkspaceNamespace([{ id: "memory-b", path: ".supervibe/memory/b.md" }], projectB),
  ];

  const denied = validateWorkspaceIsolation({ targetNamespace: projectA, contextItems: items });
  assert.equal(denied.pass, false, "context result crossed workspace namespace without import approval");
  assert.match(denied.violations[0].reason, /crossed workspace namespace/);

  const approved = validateWorkspaceIsolation({
    targetNamespace: projectA,
    contextItems: items,
    approvedImports: [projectB.workspaceId],
  });
  assert.equal(approved.pass, true, formatWorkspaceIsolationReport({
    namespace: projectA,
    pass: approved.pass,
    checked: approved.checked,
    violations: approved.violations,
  }));
});

test("workspace isolation allows global plugin knowledge", () => {
  const project = createWorkspaceNamespace({ projectRoot: "D:/workspace/project-a" });
  const globalItem = {
    id: "global-rule",
    workspaceId: "global:supervibe-plugin",
    projectRoot: "D:/workspace/supervibe",
    sourceKind: "rule",
    visibility: "global-plugin",
  };
  const report = validateWorkspaceIsolation({ targetNamespace: project, contextItems: [globalItem] });
  assert.equal(report.pass, true);
});
