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
  const dispatchHostAgents = process.argv.includes("--dispatch-host-agents") || process.argv.includes("--continue");
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
  const prewriteManifest = buildDesignPrewriteManifest(plan, { slug });
  const nextDispatch = nextDispatchTarget(plan, prewriteManifest.nextProducer);

  if (json) {
    console.log(JSON.stringify({ intake, plan, prewriteManifest: planWrites || dispatchHostAgents ? prewriteManifest : null }, null, 2));
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
    console.log(`PRODUCER_RECEIPTS_TRUSTED: ${plan.executionStatus.producerReceiptsTrusted === true}`);
    console.log(`NEXT_DISPATCH: ${formatDispatchTarget(nextDispatch)}`);
    console.log(`NEXT_PRODUCER: ${formatNextProducer(prewriteManifest.nextProducer)}`);
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
      console.log(formatDesignPrewriteManifest(prewriteManifest));
    }
    if (dispatchHostAgents) {
      console.log("DISPATCH_HOST_AGENTS:");
      console.log(dispatchGuidance(nextDispatch));
    }
    console.log(formatDesignPlanPrompt(plan, { intake }));
    for (const stage of plan.stages) {
      console.log(`- ${stage.id}: ${stage.agentId || stage.skillId} :: ${stage.reason}`);
    }
  }
}

function nextDispatchTarget(plan = {}, producer = null) {
  if (plan.executionStatus?.specialistDispatchDeferred === true) {
    return {
      producerType: "agent",
      producerId: "supervibe-orchestrator",
      stageId: "stage-0-orchestrator",
      outputArtifact: "<run-state-or-scratch-artifact>",
      receiptPresent: false,
      receiptTrusted: false,
      reason: "wizard-gate-open",
    };
  }
  return producer;
}

function formatDispatchTarget(target = null) {
  if (!target) return "none";
  return `${target.producerType}:${target.producerId}@${target.stageId} (${target.reason || "producer-proof"})`;
}

function formatNextProducer(producer = null) {
  if (!producer) return "none";
  const receipt = producer.receiptTrusted
    ? "trusted"
    : producer.receiptPresent
      ? "present-untrusted"
      : "missing";
  return `${producer.producerType}:${producer.producerId}@${producer.stageId} -> ${producer.outputArtifact} (${receipt})`;
}

function dispatchGuidance(producer = null) {
  if (!producer) return "NEXT: no pending producer proof";
  if (["agent", "worker", "reviewer"].includes(String(producer.producerType || "").toLowerCase())) {
    return [
      `NEXT_HOST_AGENT: ${producer.producerId}@${producer.stageId}`,
      producer.reason === "wizard-gate-open"
        ? "SPECIALISTS_DEFERRED: true; run the owner/orchestrator agent now, then return to the wizard gate before creative-director or later specialists."
        : "SPECIALISTS_DEFERRED: false; run this stage producer before claiming or approving its durable output.",
      "SPAWN: use the host-native agent tool for this logical Supervibe agent; in Codex use spawn_agent with fork_context=true and encode the role in message.",
      `RECEIPT_BRIDGE: node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log --agent ${producer.producerId} --host <host> --host-invocation-id <returned-host-agent-id> --task <summary> --confidence <0-10> --issue-receipt --command /supervibe-design --stage ${producer.stageId} --handoff-id <handoff-id> --input-evidence <paths> --output-artifacts ${producer.outputArtifact}`,
    ].join("\n");
  }
  return [
    `NEXT_SKILL_PRODUCER: ${producer.producerId}@${producer.stageId}`,
    "RUN: execute the deterministic skill producer, then issue a skill workflow receipt for its durable outputs.",
    `RECEIPT_BRIDGE: node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue --command /supervibe-design --skill ${producer.producerId} --stage ${producer.stageId} --reason <summary> --handoff <handoff-id> --input <paths> --output ${producer.outputArtifact}`,
  ].join("\n");
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
