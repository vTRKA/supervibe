import { existsSync } from "node:fs";
import { join } from "node:path";

import { buildTaskGraphMaturityReport } from "./supervibe-task-graph-maturity.mjs";
import { summarizeHostManagedSubagentDebtSync } from "./runtime-cleanup-registry.mjs";
import { validateWorkflowReceipts } from "./supervibe-workflow-receipt-runtime.mjs";
import { buildWorkflowReadinessModel } from "./supervibe-workflow-readiness-model.mjs";
import { buildWorkflowLogicTenOfTenReport } from "../validate-workflow-logic-10of10.mjs";

export async function buildRuntimeWorkflowReadiness({
  rootDir = process.cwd(),
  command = "/supervibe-audit",
  profile = "development",
} = {}) {
  const maturity = await buildWorkflowLogicTenOfTenReport(rootDir, { profile });
  const rag = findDimension(maturity, "rag");
  const codegraph = findDimension(maturity, "codegraph");
  const receipts = validateWorkflowReceipts(rootDir);
  const graphProof = buildTaskGraphMaturityReport(rootDir, { requireActiveGraph: profile === "release" });
  const cleanupDebt = summarizeHostManagedSubagentDebtSync({
    rootDir,
    scope: { command },
    strictRelease: profile === "release",
  });
  const commandAgentPlan = {
    pass: existsSync(join(rootDir, "scripts", "command-agent-plan.mjs")),
    summary: "command-agent-plan runtime is present; scoped execution checks run in command-agent-plan.mjs",
    nextAction: "repair scripts/command-agent-plan.mjs or run node scripts/command-agent-plan.mjs --strict --command " + command,
  };
  const indexHealth = {
    pass: rag?.pass === true && codegraph?.pass === true,
    status: rag?.pass === true && codegraph?.pass === true ? "ready" : "failed",
    strictReady: rag?.pass === true && codegraph?.pass === true,
    summary: "rag=" + (rag?.pass === true) + ", codegraph=" + (codegraph?.pass === true),
    nextAction: "run node scripts/build-code-index.mjs --root . --resume --source-only --health --json-progress",
  };
  return buildWorkflowReadinessModel({
    receipts,
    indexHealth,
    graphProof,
    commandAgentPlan,
    cleanupDebt,
    maturity,
  });
}

function findDimension(report = {}, id) {
  return (report.dimensions || []).find((dimension) => dimension.id === id) || null;
}
