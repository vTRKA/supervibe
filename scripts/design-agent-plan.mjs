#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateDesignArtifactIntake,
} from "./lib/design-artifact-intake.mjs";
import {
  buildDesignAgentPlan,
  buildDesignPrewriteManifest,
  formatDesignPrewriteManifest,
  formatDesignPlanPrompt,
} from "./lib/design-agent-orchestration.mjs";
import {
  formatDesignWizardStatus,
} from "./lib/design-wizard-catalog.mjs";
import {
  formatDesignWorkflowStatus,
  readDesignWorkflowStatus,
} from "./lib/design-workflow-status.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const scriptPluginRoot = fileURLToPath(new URL("../", import.meta.url));
  const slug = arg("--slug", "");
  const projectRoot = arg("--root", process.cwd());
  const pluginRoot = arg("--plugin-root", scriptPluginRoot);
  const persistedConfig = slug ? readPersistedDesignConfig(projectRoot, slug) : null;
  const brief = arg("--brief", persistedConfig?.brief || persistedConfig?.userBrief || "");
  const target = arg("--target", persistedConfig?.target || "unknown");
  const flowType = arg("--flow", persistedConfig?.flowType || persistedConfig?.flow || "in-product");
  const requestedExecutionMode = arg("--execution-mode", persistedConfig?.executionMode || "");
  const mode = arg("--mode", persistedConfig?.mode || persistedConfig?.designWizard?.mode || "");
  const initialDecisions = extractPersistedDesignDecisions(persistedConfig);
  const json = process.argv.includes("--json");
  const status = process.argv.includes("--status");
  const planWrites = process.argv.includes("--plan-writes");
  const intake = await evaluateDesignArtifactIntake({ brief, projectRoot });
  const plan = buildDesignAgentPlan({
    brief,
    target,
    flowType,
    requestedExecutionMode,
    slug,
    mode,
    initialDecisions,
    referenceSources: intake.referenceSources ?? [],
    rootDir: projectRoot,
    pluginRoot,
    intake,
  });

  if (json) {
    const prewriteManifest = planWrites ? buildDesignPrewriteManifest(plan, { slug }) : null;
    console.log(JSON.stringify({ intake, plan, prewriteManifest }, null, 2));
  } else {
    console.log("SUPERVIBE_DESIGN_AGENT_PLAN");
    console.log("STAGES: intake -> candidate DS -> review styleboard -> approval -> prototype unlock");
    console.log(`REFERENCE_SCOPE_REQUIRED: ${intake.needsReferenceSourceScopeQuestion === true}`);
    console.log(`OLD_ARTIFACT_SCOPE_REQUIRED: ${intake.needsOldArtifactScopeQuestion === true}`);
    console.log(`EXECUTION_MODE: ${plan.executionStatus.executionMode}`);
    console.log(`RECEIPT_GATE: ${plan.executionStatus.receiptGate}`);
    console.log(`AGENTS_INSTALLED: ${plan.executionStatus.agentsInstalled === true}`);
    console.log(`HOST_DISPATCH_AVAILABLE: ${plan.executionStatus.hostDispatchAvailable === true}`);
    console.log(`AGENT_INVOCATIONS_COMPLETED: ${plan.executionStatus.agentInvocationsCompleted === true}`);
    console.log(`AGENT_RECEIPTS_TRUSTED: ${plan.executionStatus.agentReceiptsTrusted === true}`);
    console.log(`MISSING_RUNTIME_PROOFS: ${(plan.executionStatus.missingRuntimeProofs || []).map((proof) => `${proof.subjectId}@${proof.stageId}`).join(",") || "none"}`);
    console.log(`MISSING_AGENTS: ${plan.executionStatus.missingAgents.join(",") || "none"}`);
    console.log(`AGENT_PROVISIONING_READY: ${plan.executionStatus.provisioningPlan?.readyToApply === true}`);
    if (plan.executionStatus.provisioningPlan?.applyCommand) {
      console.log(`AGENT_PROVISIONING_APPLY: ${plan.executionStatus.provisioningPlan.applyCommand}`);
    }
    console.log(`WIZARD_COVERAGE: ${plan.wizard.coverage.score}`);
    console.log(`WIZARD_BLOCKED_REASON: ${plan.wizard.gates.blockedReason || "none"}`);
    console.log(`WRITE_GATE_ALLOWED: ${plan.writeGate.durableWritesAllowed === true}`);
    console.log(`WRITE_GATE_BLOCKED_REASON: ${plan.writeGate.blockedReason || "none"}`);
    console.log(`ALLOWED_WRITE_CLASSES: ${plan.writeGate.allowedWriteClasses.join(",")}`);
    if (status) {
      console.log(formatDesignWizardStatus(plan.wizard));
      if (slug) {
        console.log(formatDesignWorkflowStatus(readDesignWorkflowStatus(projectRoot, { slug })));
      }
    }
    if (planWrites) {
      console.log(formatDesignPrewriteManifest(buildDesignPrewriteManifest(plan, { slug })));
    }
    console.log(formatDesignPlanPrompt(plan, { intake }));
    for (const stage of plan.stages) {
      console.log(`- ${stage.id}: ${stage.agentId || stage.skillId} :: ${stage.reason}`);
    }
  }
}

function readPersistedDesignConfig(projectRoot, slug) {
  const configPath = join(projectRoot, ".supervibe", "artifacts", "prototypes", slug, "config.json");
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

function extractPersistedDesignDecisions(config = null) {
  const decisions = {
    ...(config?.designWizard?.decisions || {}),
    ...(config?.decisions || {}),
  };
  if (!decisions.viewport && Array.isArray(config?.viewports) && config.viewports.length > 0) {
    decisions.viewport = viewportDecisionFromConfig(config.viewports[0]);
  }
  return decisions;
}

function viewportDecisionFromConfig(viewport) {
  if (typeof viewport === "string") {
    return {
      axis: "viewport",
      answer: viewport,
      choiceId: viewport,
      source: "config.json",
    };
  }
  if (viewport && typeof viewport === "object") {
    const width = viewport.width || viewport.w;
    const height = viewport.height || viewport.h;
    return {
      axis: "viewport",
      answer: width && height ? `${width}x${height}` : viewport.label || viewport.id || "configured viewport",
      choiceId: viewport.id || null,
      value: viewport,
      source: "config.json",
    };
  }
  return {
    axis: "viewport",
    answer: "configured viewport",
    source: "config.json",
  };
}
