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
  formatDesignPlanUserPrompt,
} from "./lib/design-agent-orchestration.mjs";
import {
  formatDesignWizardStatus,
} from "./lib/design-wizard-catalog.mjs";
import {
  formatDesignWorkflowStatus,
  readDesignWorkflowStatus,
} from "./lib/design-workflow-status.mjs";
import {
  mergeRuntimeDesignWizardConfig,
} from "./lib/design-wizard-runtime-state.mjs";
import {
  classifyDesignIntent,
} from "./lib/design-intent-classifier.mjs";

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
  const rawTarget = arg("--target", persistedConfig?.target || "unknown");
  const rawFlowType = arg("--flow", persistedConfig?.flowType || persistedConfig?.flow || "");
  const requestedExecutionMode = arg("--execution-mode", persistedConfig?.executionMode || "");
  const mode = arg("--mode", persistedConfig?.mode || persistedConfig?.designWizard?.mode || "");
  const host = arg("--host", "");
  const initialDecisions = extractPersistedDesignDecisions(persistedConfig);
  const json = process.argv.includes("--json");
  const status = process.argv.includes("--status");
  const planWrites = process.argv.includes("--plan-writes");
  const dispatchHostAgents = process.argv.includes("--dispatch-host-agents") || process.argv.includes("--dispatch") || process.argv.includes("--continue");
  const protocolPrompt = process.argv.includes("--protocol");
  const intent = classifyDesignIntent({ brief, target: rawTarget, flowType: rawFlowType });
  const target = intent.target;
  const flowType = intent.flowType;
  const intake = await evaluateDesignArtifactIntake({
    brief,
    projectRoot,
    referenceScopeDecision: initialDecisions.reference_borrow_avoid,
    currentSlug: slug,
  });
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
    hostAdapterId: host,
    intake,
  });
  const prewriteManifest = buildDesignPrewriteManifest(plan, { slug });
  const nextDispatch = nextDispatchTarget(plan, prewriteManifest.nextProducer, prewriteManifest);
  const continuation = canonicalDesignContinuation({ plan, prewriteManifest, nextDispatch });

  if (json) {
    console.log(JSON.stringify({
      intake,
      plan,
      prewriteManifest: planWrites || dispatchHostAgents ? prewriteManifest : null,
      continuation,
    }, null, 2));
  } else {
    console.log("SUPERVIBE_DESIGN_AGENT_PLAN");
    console.log("STAGES: intake -> candidate DS -> review styleboard -> approval -> prototype unlock");
    console.log(`REFERENCE_SCOPE_REQUIRED: ${intake.needsReferenceSourceScopeQuestion === true}`);
    console.log(`OLD_ARTIFACT_SCOPE_REQUIRED: ${intake.needsOldArtifactScopeQuestion === true}`);
    console.log(`EXECUTION_MODE: ${plan.executionStatus.executionMode}`);
    console.log(`RECEIPT_GATE: ${plan.executionStatus.receiptGate}`);
    console.log(`AGENTS_INSTALLED: ${plan.executionStatus.agentsInstalled === true}`);
    console.log(`HOST_DISPATCH_AVAILABLE: ${plan.executionStatus.hostDispatchAvailable === true}`);
    console.log(`HOST_DISPATCH: ${plan.executionStatus.hostDispatch?.hostAdapterId || "unspecified"}:${plan.executionStatus.hostDispatch?.status || "not-checked"}`);
    console.log(`HOST_TOOL: ${plan.executionStatus.hostDispatch?.nativeTool || "unspecified"}`);
    console.log(`AGENT_INVOCATIONS_COMPLETED: ${plan.executionStatus.agentInvocationsCompleted === true}`);
    console.log(`AGENT_RECEIPTS_TRUSTED: ${plan.executionStatus.agentReceiptsTrusted === true}`);
    console.log(`PRODUCER_RECEIPTS_TRUSTED: ${plan.executionStatus.producerReceiptsTrusted === true}`);
    console.log(`NEXT_ACTION: ${continuation.nextAction}`);
    console.log(`NEXT_QUESTION: ${continuation.nextQuestion}`);
    console.log(`NEXT_DISPATCH: ${formatDispatchTarget(nextDispatch)}`);
    console.log(`NEXT_HOST_DISPATCH: ${formatHostDispatchTarget(nextDispatch)}`);
    console.log(`NEXT_SKILL_PRODUCER: ${formatSkillProducerTarget(prewriteManifest.nextProducer)}`);
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
        const workflowStatus = formatDesignWorkflowStatus(readDesignWorkflowStatus(projectRoot, { slug }));
        console.log(dispatchHostAgents ? namespaceNestedNextLines(workflowStatus, "STATUS") : workflowStatus);
      }
    }
    if (planWrites) {
      console.log(formatDesignPrewriteManifest(prewriteManifest));
    }
    if (dispatchHostAgents) {
      console.log("SUPERVIBE_DESIGN_CONTINUE");
      console.log(`MACHINE_JSON: ${JSON.stringify(continuation.machine)}`);
      console.log(`NEXT_RUN: ${continuation.nextAction}`);
      console.log("CONTINUE_GUIDANCE:");
      console.log(dispatchGuidance(nextDispatch));
    }
    console.log(protocolPrompt ? formatDesignPlanPrompt(plan, { intake }) : formatDesignPlanUserPrompt(plan, { intake }));
    for (const stage of plan.stages) {
      console.log(`- ${stage.id}: ${stage.agentId || stage.skillId} :: ${stage.reason}`);
    }
  }
}

function namespaceNestedNextLines(text = "", namespace = "STATUS") {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^NEXT_ACTION:/, `${namespace}_NEXT_ACTION:`).replace(/^NEXT_QUESTION:/, `${namespace}_NEXT_QUESTION:`))
    .join("\n");
}

function canonicalDesignContinuation({ plan = {}, prewriteManifest = {}, nextDispatch = null } = {}) {
  const question = plan.writeGate?.nextQuestion || null;
  const nextAction = nextDispatch
    ? `dispatch:${nextDispatch.producerType}:${nextDispatch.producerId}@${nextDispatch.stageId}`
    : question
      ? `answer:${question.source || "question"}:${question.question?.axis || prewriteManifest.nextQuestionAxis || "unknown"}`
      : prewriteManifest.nextProducer
        ? `produce:${prewriteManifest.nextProducer.producerType}:${prewriteManifest.nextProducer.producerId}@${prewriteManifest.nextProducer.stageId}`
        : plan.writeGate?.durableWritesAllowed === true
          ? "write:durable-design-artifacts"
          : "none";
  const nextQuestion = question
    ? `${question.source || "question"}:${question.question?.axis || prewriteManifest.nextQuestionAxis || "unknown"}`
    : "none";
  return {
    nextAction,
    nextQuestion,
    machine: {
      schemaVersion: 1,
      command: "/supervibe-design",
      slug: plan.slug || null,
      executionMode: plan.executionStatus?.executionMode || null,
      writeGateAllowed: plan.writeGate?.durableWritesAllowed === true,
      nextAction,
      nextQuestion,
      nextDispatch: nextDispatch
        ? {
            producerType: nextDispatch.producerType,
            producerId: nextDispatch.producerId,
            stageId: nextDispatch.stageId,
            outputArtifact: nextDispatch.outputArtifact || null,
            reason: nextDispatch.reason || null,
          }
        : null,
      nextProducer: prewriteManifest.nextProducer || null,
      nextQuestionSource: prewriteManifest.nextQuestionSource || question?.source || null,
      nextQuestionAxis: prewriteManifest.nextQuestionAxis || question?.question?.axis || null,
    },
  };
}

function nextDispatchTarget(plan = {}, producer = null, manifest = {}) {
  if (manifest.nextQuestionSource === "intake" || plan.writeGate?.nextQuestion?.source === "intake") {
    return null;
  }
  if (plan.executionStatus?.specialistDispatchDeferred === true) {
    if (hasCompletedStageSubject(plan, {
      subjectType: "agent",
      subjectId: "supervibe-orchestrator",
      stageId: "stage-0-orchestrator",
    }) !== true) {
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
    const nextProposal = (plan.executionStatus.questionProposalProducers || [])
      .find((item) => item.receiptTrusted !== true);
    return nextProposal || null;
  }
  return producer;
}

function hasCompletedStageSubject(plan = {}, expected = {}) {
  return (plan.executionStatus?.completedStageSubjects || []).some((item) => {
    return item.subjectType === expected.subjectType
      && item.subjectId === expected.subjectId
      && item.stageId === expected.stageId;
  });
}

function formatDispatchTarget(target = null) {
  if (!target) return "none";
  if (String(target.producerType || "").toLowerCase() === "skill") {
    return "none (skill producer pending; see NEXT_SKILL_PRODUCER)";
  }
  return `${target.producerType}:${target.producerId}@${target.stageId} (${target.reason || "producer-proof"})`;
}

function formatHostDispatchTarget(target = null) {
  if (!target) return "none";
  if (!["agent", "worker", "reviewer"].includes(String(target.producerType || "").toLowerCase())) return "none";
  return `${target.producerType}:${target.producerId}@${target.stageId} (${target.reason || "producer-proof"})`;
}

function formatSkillProducerTarget(producer = null) {
  if (!producer || String(producer.producerType || "").toLowerCase() !== "skill") return "none";
  const receipt = producer.receiptTrusted
    ? "trusted"
    : producer.receiptPresent
      ? "present-untrusted"
      : "missing";
  return `${producer.producerId}@${producer.stageId} -> ${producer.outputArtifact} (${receipt})`;
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
        ? "SPECIALISTS_DEFERRED: true; run the owner/orchestrator agent now, then collect specialist scratch question proposals before durable writes."
        : producer.reason === "specialist-question-proposal"
          ? "SPECIALIST_QUESTION_PROPOSAL: true; run this specialist for scratch SpecialistQuestionContract output only. Durable artifacts remain locked by the wizard/write gate."
          : "SPECIALISTS_DEFERRED: false; run this stage producer before claiming or approving its durable output.",
      "SPAWN: use the host-native agent tool for this logical Supervibe agent; in Codex use spawn_agent with fork_context=true and encode the role in message.",
      `RECORD_STAGE: node <resolved-supervibe-plugin-root>/scripts/agent-invocation.mjs log --agent ${producer.producerId} --host <host> --host-invocation-id <returned-host-agent-id> --task <summary> --confidence <0-10> --issue-receipt --command /supervibe-design --stage ${producer.stageId} --handoff-id <handoff-id> --input-evidence <paths> --output-artifacts ${producer.outputArtifact}`,
    ].join("\n");
  }
  if (producer.producerId === "supervibe:brandbook") {
    return [
      `NEXT_SKILL_PRODUCER: ${producer.producerId}@${producer.stageId}`,
      "RUN: prepare brandbook outputs in scratch, then let the executable producer promote durable files and issue the skill receipt.",
      "RUN_BRANDBOOK: node <resolved-supervibe-plugin-root>/scripts/brandbook-producer.mjs run --source <prepared-design-system-dir> --handoff <handoff-id> --slug <prototype-slug> --target <target>",
      "RECORD_STAGE: included in brandbook-producer; do not hand-write or separately issue this skill record unless the producer reports failure.",
    ].join("\n");
  }
  return [
    `NEXT_SKILL_PRODUCER: ${producer.producerId}@${producer.stageId}`,
    "RUN: execute the deterministic skill producer, then issue a skill workflow receipt for its durable outputs.",
    `RECORD_STAGE: node <resolved-supervibe-plugin-root>/scripts/workflow-receipt.mjs issue --command /supervibe-design --skill ${producer.producerId} --stage ${producer.stageId} --reason <summary> --handoff <handoff-id> --input <paths> --output ${producer.outputArtifact}`,
  ].join("\n");
}

function readPersistedDesignConfig(projectRoot, slug) {
  const configPath = join(projectRoot, ".supervibe", "artifacts", "prototypes", slug, "config.json");
  if (!existsSync(configPath)) return null;
  try {
    return mergeRuntimeDesignWizardConfig(projectRoot, JSON.parse(readFileSync(configPath, "utf8")));
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
