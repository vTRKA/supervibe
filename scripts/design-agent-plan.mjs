#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import {
  evaluateDesignArtifactIntake,
} from "./lib/design-artifact-intake.mjs";
import {
  buildDesignAgentPlan,
  formatDesignPlanPrompt,
} from "./lib/design-agent-orchestration.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const scriptPluginRoot = fileURLToPath(new URL("../", import.meta.url));
  const brief = arg("--brief", "");
  const target = arg("--target", "unknown");
  const flowType = arg("--flow", "in-product");
  const projectRoot = arg("--root", process.cwd());
  const pluginRoot = arg("--plugin-root", scriptPluginRoot);
  const json = process.argv.includes("--json");
  const intake = await evaluateDesignArtifactIntake({ brief, projectRoot });
  const plan = buildDesignAgentPlan({
    brief,
    target,
    flowType,
    referenceSources: intake.referenceSources ?? [],
    rootDir: projectRoot,
    pluginRoot,
    intake,
  });

  if (json) {
    console.log(JSON.stringify({ intake, plan }, null, 2));
  } else {
    console.log("SUPERVIBE_DESIGN_AGENT_PLAN");
    console.log(`REFERENCE_SCOPE_REQUIRED: ${intake.needsReferenceSourceScopeQuestion === true}`);
    console.log(`OLD_ARTIFACT_SCOPE_REQUIRED: ${intake.needsOldArtifactScopeQuestion === true}`);
    console.log(`EXECUTION_MODE: ${plan.executionStatus.executionMode}`);
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
    console.log(formatDesignPlanPrompt(plan, { intake }));
    for (const stage of plan.stages) {
      console.log(`- ${stage.id}: ${stage.agentId || stage.skillId} :: ${stage.reason}`);
    }
  }
}
