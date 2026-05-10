import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = process.cwd();

import {
  DESIGN_WIZARD_AXES,
} from "../scripts/lib/design-wizard-catalog.mjs";
import {
  evaluateDesignArtifactIntake,
} from "../scripts/lib/design-artifact-intake.mjs";
import {
  buildSpecialistQuestionProposal,
} from "../scripts/lib/specialist-question-contract.mjs";
import {
  assertDesignWriteAllowed,
  buildDesignAgentPlan,
  buildDesignPrewriteManifest,
  buildDesignWriteGate,
  formatDesignPrewriteManifest,
  formatDesignPlanPrompt,
  validateDesignAgentInvocationReceipts,
} from "../scripts/lib/design-agent-orchestration.mjs";
import {
  issueWorkflowInvocationReceipt,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

async function writeAgentInvocation(root, {
  invocationId = "agent-invocation-1",
  agentId = "creative-director",
  taskSummary = "brand direction required",
  ts = "2026-05-03T00:00:30.000Z",
  confidenceScore = 9.5,
} = {}) {
  await writeUtf8(root, ".supervibe/memory/agent-invocations.jsonl", `${JSON.stringify({
    schemaVersion: 1,
    invocation_id: invocationId,
    ts,
    agent_id: agentId,
    task_summary: taskSummary,
    confidence_score: confidenceScore,
  })}\n`);
  return {
    source: "agent-invocations-jsonl",
    invocationId,
  };
}

const DESIGN_AGENT_IDS = [
  "supervibe-orchestrator",
  "creative-director",
  "design-system-architect",
  "ux-ui-designer",
  "copywriter",
  "prototype-builder",
  "ui-polish-reviewer",
  "accessibility-reviewer",
  "quality-gate-reviewer",
];

async function installCodexDesignAgents(root) {
  for (const agentId of DESIGN_AGENT_IDS) {
    await writeUtf8(root, `.codex/agents/${agentId}.md`, `# ${agentId}\n`);
  }
}

function completedWizardDecisions() {
  return {
    viewport: {
      axis: "viewport",
      answer: "1440x900",
      source: "user",
      timestamp: "2026-05-03T00:00:00.000Z",
      decisionUnlocked: "viewport policy",
    },
    ...Object.fromEntries(DESIGN_WIZARD_AXES.map((axis) => [axis.id, {
      axis: axis.id,
      choiceId: axis.defaultChoiceId,
      answer: axis.choices.find((choice) => choice.id === axis.defaultChoiceId)?.label || axis.defaultChoiceId,
      source: "explicit-default",
      prompt: axis.prompt,
      timestamp: "2026-05-03T00:00:00.000Z",
      decisionUnlocked: axis.decisionUnlocked,
    }])),
  };
}

test("design agent plan maps source types and stages to explicit agents and skills", () => {
  const plan = buildDesignAgentPlan({
    brief: "new desktop agent chat app with website and pdf references",
    target: "desktop-app",
    referenceSources: [
      { kind: "website", value: "https://example.com" },
      { kind: "pdf", value: "C:\\refs\\brand.pdf" },
    ],
    flowType: "in-product",
  });

  assert.equal(plan.requiresReceipts, true);
  assert.equal(plan.receiptDirectory, ".supervibe/artifacts/_workflow-invocations/supervibe-design/<handoff-id>/");
  assert.equal(plan.executionStatus.executionMode, "agent-required-blocked");
  assert.equal(plan.executionStatus.agentsInstalled, true);
  assert.equal(plan.executionStatus.callableAgentsReady, false);
  assert.equal(plan.executionStatus.agentReceiptsTrusted, false);
  assert.equal(plan.executionStatus.producerReceiptsTrusted, false);
  assert.ok(plan.executionStatus.missingCallableAgents.includes("creative-director"));
  assert.equal(plan.executionStatus.missingAgents.length, 0);
  assert.ok(plan.wizard.questionQueue.some((question) => question.axis === "mode"));
  assert.ok(plan.wizard.questionQueue.some((question) => question.axis === "viewport"));
  assert.equal(plan.viewportPolicy.requiresActualWindowQuestion, true);
  assert.ok(plan.stages.some((stage) => stage.agentId === "supervibe-orchestrator" && stage.immediate === true));
  assert.ok(plan.stages.some((stage) => stage.agentId === "creative-director"));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:brandbook"));
  assert.ok(plan.stages.some((stage) => stage.agentId === "design-system-architect"));
  assert.ok(plan.stages.some((stage) => stage.agentId === "ux-ui-designer"));
  assert.ok(plan.stages.some((stage) => stage.agentId === "prototype-builder"));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:mcp-discovery" && stage.reason.includes("website")));
  assert.ok(plan.stages.some((stage) => stage.skillId === "supervibe:design-intelligence" && stage.reason.includes("pdf")));

  const prompt = formatDesignPlanPrompt(plan);
  assert.match(prompt, /EXECUTION_GATE: specialist agents are unavailable/);
  assert.match(prompt, /AGENT_PROVISIONING:/);
  assert.match(prompt, /Install missing agents/);
  assert.doesNotMatch(prompt, /Step 1\/|Decision unlocked:|If skipped:|\(recommended\)/);
});

test("design agent plan classifies multilingual legal landing as web landing with regulated trust", () => {
  const brief = "\u043b\u0435\u043d\u0434\u0438\u043d\u0433 \u044e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0441\u0430\u0439\u0442\u0430";
  const plan = buildDesignAgentPlan({
    brief,
    target: "unknown",
    mode: "full-prototype-pipeline",
    pluginRoot: ROOT,
  });

  assert.equal(plan.target, "web");
  assert.equal(plan.flowType, "landing");
  assert.equal(plan.intent.signals.landing, true);
  assert.equal(plan.intent.signals.regulatedTrust, true);
  assert.equal(plan.wizard.locale, "ru");
  assert.equal(plan.wizard.questionStrategy.profile, "regulatedTrust");
  assert.ok(plan.stages.some((stage) => stage.id === "stage-5-landing-skill" && stage.skillId === "supervibe:landing-page"));
  assert.deepEqual(plan.viewportPolicy.defaultViewports.map((viewport) => viewport.width), [375, 1440]);
});

test("design agent plan CLI resumes mode and decisions from saved prototype config", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-resume-config-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat-ds/config.json", `${JSON.stringify({
      target: "tauri",
      mode: "full-prototype-pipeline",
      designWizard: {
        decisions: {
          reference_borrow_avoid: {
            axis: "reference_borrow_avoid",
            choiceId: "functional-only",
            answer: "сохранить только функционал, не скелет",
            source: "user",
          },
        },
      },
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-agent-plan.mjs"),
      "--slug",
      "agent-chat-ds",
      "--root",
      root,
      "--json",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const parsed = JSON.parse(output);

    assert.equal(parsed.plan.mode, "full-prototype-pipeline");
    assert.equal(parsed.plan.executionStatus.executionMode, "agent-required-blocked");
    assert.equal(parsed.plan.executionStatus.callableAgentsReady, false);
    assert.equal(parsed.plan.wizard.decisions.reference_borrow_avoid.choiceId, "functional-only");
    assert.equal(parsed.plan.wizard.questionQueue[0].axis, "viewport");
    assert.equal(parsed.plan.wizard.questionQueue[0].step, 3);
    assert.match(parsed.plan.wizard.gates.blockedReason, /missing viewport policy/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan dispatches orchestrator before specialists while wizard is open", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-dispatch-wizard-"));
  try {
    await installCodexDesignAgents(root);
    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-agent-plan.mjs"),
      "--root",
      root,
      "--plugin-root",
      ROOT,
      "--slug",
      "agent-chat",
      "--dispatch-host-agents",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.match(output, /NEXT_DISPATCH: agent:supervibe-orchestrator@stage-0-orchestrator/);
    assert.match(output, /SPECIALISTS_DEFERRED: true/);
    assert.doesNotMatch(output, /NEXT_HOST_AGENT: creative-director@stage-1-brand-direction/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan does not dispatch missing host-callable agents", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-missing-host-dispatch-"));
  try {
    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-agent-plan.mjs"),
      "--root",
      root,
      "--plugin-root",
      ROOT,
      "--slug",
      "agent-chat",
      "--dispatch-host-agents",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.match(output, /EXECUTION_MODE: agent-required-blocked/);
    assert.match(output, /CALLABLE_AGENTS_READY: false/);
    assert.match(output, /MISSING_CALLABLE_AGENTS: .*supervibe-orchestrator/);
    assert.match(output, /NEXT_DISPATCH: none/);
    assert.match(output, /NEXT_HOST_DISPATCH: none/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan treats namespaced host agent subfolders as non-callable", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-namespaced-host-"));
  try {
    await writeUtf8(root, ".codex/agents/_design/creative-director.md", "# creative-director\n");
    await writeUtf8(root, ".codex/agents/_design/prototype-builder.md", "# prototype-builder\n");

    const plan = buildDesignAgentPlan({
      brief: "design a new agent chat",
      rootDir: root,
      pluginRoot: ROOT,
      hostAdapterId: "codex",
    });

    assert.equal(plan.executionStatus.callableAgentsReady, false);
    assert.ok(plan.executionStatus.missingCallableAgents.includes("creative-director"));
    assert.ok(plan.executionStatus.missingCallableAgents.includes("prototype-builder"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan does not redispatch orchestrator after trusted stage-0 receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-dispatch-orchestrator-done-"));
  try {
    await installCodexDesignAgents(root);
    await writeUtf8(root, ".supervibe/artifacts/_agent-outputs/orchestrator/agent-output.json", "{\"ok\":true}\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "supervibe-orchestrator",
      agentId: "supervibe-orchestrator",
      stage: "stage-0-orchestrator",
      invocationReason: "wizard gate triage completed",
      outputArtifacts: [".supervibe/artifacts/_agent-outputs/orchestrator/agent-output.json"],
      startedAt: "2026-05-04T00:00:00.000Z",
      completedAt: "2026-05-04T00:01:00.000Z",
      handoffId: "agent-chat",
      hostInvocation: await writeAgentInvocation(root, {
        invocationId: "orchestrator-invocation-1",
        agentId: "supervibe-orchestrator",
        taskSummary: "wizard gate triage completed",
      }),
    });

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-agent-plan.mjs"),
      "--root",
      root,
      "--plugin-root",
      ROOT,
      "--slug",
      "agent-chat",
      "--dispatch-host-agents",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.match(output, /NEXT_DISPATCH: agent:creative-director@stage-1-brand-direction/);
    assert.match(output, /NEXT_HOST_DISPATCH: agent:creative-director@stage-1-brand-direction/);
    assert.match(output, /SPECIALIST_QUESTION_PROPOSAL: true/);
    assert.match(output, /The next visible design question must come from its owning specialist/);
    assert.match(output, /Continue command: node scripts\/design-agent-plan\.mjs --continue --dispatch --status --plan-writes --slug <slug>/);
    assert.doesNotMatch(output, /NEXT_WIZARD_QUESTION:/);
    assert.doesNotMatch(output, /NEXT_DISPATCH: agent:supervibe-orchestrator@stage-0-orchestrator/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan exposes pre-gate specialist question proposal queue", () => {
  const plan = buildDesignAgentPlan({
    brief: "Agent chat workspace with approvals, tool calls, traces, and compact desktop panels.",
    target: "tauri",
    mode: "full-prototype-pipeline",
    pluginRoot: ROOT,
    initialDecisions: {
      viewport: { axis: "viewport", answer: "1440x900", source: "user" },
    },
  });

  assert.equal(plan.executionStatus.specialistDispatchDeferred, true);
  assert.ok(plan.executionStatus.questionProposalDispatchAllowed);
  assert.ok(plan.executionStatus.questionProposalProducers.some((item) => item.producerId === "creative-director"));
  assert.ok(plan.executionStatus.questionProposalProducers.some((item) => item.producerId === "ux-ui-designer"));
  assert.ok(plan.wizard.questionProposals.every((proposal) => proposal.ownerAgent && proposal.whyNow));
  assert.ok(plan.wizard.questionQueue.every((question) => question.source === "fallback-scratch-question"));
  assert.ok(plan.wizard.questionQueue.every((question) => question.trustedSpecialistProposal === false));
});

test("design agent plan shows wizard question only after trusted specialist proposal receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-trusted-question-proposal-"));
  try {
    await installCodexDesignAgents(root);
    const initial = buildDesignAgentPlan({
      brief: "Agent chat workspace with approvals, tool calls, traces, and compact desktop panels.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      slug: "agent-chat",
      rootDir: root,
      pluginRoot: ROOT,
      initialDecisions: {
        viewport: { axis: "viewport", answer: "1440x900", source: "user" },
      },
    });
    const firstQuestion = initial.wizard.questionQueue[0];
    const producer = initial.executionStatus.questionProposalProducers.find((item) => {
      return item.producerId === firstQuestion.ownerAgent && item.stageId === firstQuestion.stage;
    });
    assert.ok(producer);
    assert.match(formatDesignPlanPrompt(initial), /SPECIALIST_QUESTION_GATE: blocked/);

    const proposal = buildSpecialistQuestionProposal({
      proposalId: `${firstQuestion.stage}:${firstQuestion.ownerAgent}:${firstQuestion.axis}`,
      axis: firstQuestion.axis,
      stage: firstQuestion.stage,
      specialist: firstQuestion.specialist,
      ownerAgent: firstQuestion.ownerAgent,
      question: `For the agent workflow workspace, which ${firstQuestion.axis} risk should ${firstQuestion.ownerAgent} resolve before the next artifact?`,
      why: "The answer changes the next design artifact, agent trace hierarchy, and approval workflow ergonomics.",
      whyNow: "The next producer cannot proceed until this workspace risk is explicit and bound to the current agent-chat brief.",
      choices: [
        { id: "trace-first", label: "Trace-first workspace signal", tradeoff: "Prioritizes tool calls and evidence scan speed.", unlocks: ["direction.md"], risk: "May feel dense.", evidence: ["agent-chat brief", "trace review risk"], artifactImpact: "trace hierarchy", recommended: true },
        { id: "approval-first", label: "Approval-first workflow signal", tradeoff: "Makes human decision gates more visible.", unlocks: ["spec.md"], risk: "May slow repeated review.", evidence: ["approval workflow", "artifact impact"], artifactImpact: "approval gate hierarchy" },
        { id: "conversation-first", label: "Conversation-first workspace signal", tradeoff: "Keeps assistant answers easier to read.", unlocks: ["styleboard.html"], risk: "May hide automation state.", evidence: ["agent chat reading", "artifact impact"], artifactImpact: "chat reading rhythm" },
      ],
      blocks: firstQuestion.blocks,
      artifactImpact: firstQuestion.artifactImpact,
      skipDefault: "Stop and regenerate a specialist proposal if the user does not choose.",
      canAnswerFromEvidence: false,
      evidence: ["agent chat workspace brief", "trusted specialist proposal receipt"],
      currentContext: "agent workflow workspace with approvals, traces, and compact panels",
    });
    await writeUtf8(root, producer.outputArtifact, `${JSON.stringify({ questionProposals: [proposal] }, null, 2)}\n`);
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: producer.producerId,
      agentId: producer.producerId,
      stage: producer.stageId,
      invocationReason: "scratch specialist question proposal produced",
      outputArtifacts: [producer.outputArtifact],
      startedAt: "2026-05-04T00:00:00.000Z",
      completedAt: "2026-05-04T00:01:00.000Z",
      handoffId: "agent-chat",
      hostInvocation: await writeAgentInvocation(root, {
        invocationId: "trusted-question-proposal-1",
        agentId: producer.producerId,
        taskSummary: "scratch specialist question proposal produced",
      }),
    });

    const trusted = buildDesignAgentPlan({
      brief: "Agent chat workspace with approvals, tool calls, traces, and compact desktop panels.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      slug: "agent-chat",
      rootDir: root,
      pluginRoot: ROOT,
      initialDecisions: {
        viewport: { axis: "viewport", answer: "1440x900", source: "user" },
      },
    });

    assert.equal(trusted.wizard.questionQueue[0].source, "real-specialist-proposal");
    assert.equal(trusted.wizard.questionQueue[0].trustedSpecialistProposal, true);
    assert.deepEqual(trusted.executionStatus.missingRuntimeProofs, []);
    assert.ok(trusted.executionStatus.durableMissingRuntimeProofs.some((proof) => proof.subjectId === "creative-director"));
    assert.match(formatDesignPlanPrompt(trusted), /NEXT_WIZARD_QUESTION:/);
    assert.doesNotMatch(formatDesignPlanPrompt(trusted), /SPECIALIST_QUESTION_GATE: blocked/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan localizes runtime dispatch question for Russian briefs", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-ru-dispatch-"));
  try {
    await installCodexDesignAgents(root);
    const plan = buildDesignAgentPlan({
      brief: "Использовать безопасные дефолты для новой дизайн-системы агентского чата.",
      target: "web",
      mode: "design-system-only",
      rootDir: root,
      pluginRoot: ROOT,
      initialDecisions: completedWizardDecisions(),
    });
    const prompt = formatDesignPlanPrompt(plan);

    assert.equal(plan.wizard.locale, "ru");
    assert.equal(plan.executionStatus.executionMode, "agent-dispatch-required");
    assert.doesNotMatch(prompt, /Runtime agent receipts are missing|Dispatch host agents|Scratch only|Stop here/);
    assert.match(prompt, /runtime receipts|Запустить host agents|Только scratch|Остановиться/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan CLI emits Russian output as UTF-8, not mojibake", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-ru-output-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Использовать безопасные дефолты для новой дизайн-системы агентского чата.",
      target: "web",
      mode: "design-system-only",
      designWizard: {
        decisions: completedWizardDecisions(),
      },
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-agent-plan.mjs"),
      "--root",
      root,
      "--plugin-root",
      ROOT,
      "--slug",
      "agent-chat",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.match(output, /Запустить host agents|Только scratch|Остановиться/);
    assert.doesNotMatch(output, /(?:\u0420[\u0080-\u00bf]|\u0421[\u0080-\u00bf])/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan inserts functional reference inventory before creative direction for old prototypes", () => {
  const intake = {
    needsQuestion: false,
    reason: "old-artifact-reference-scope-explicit",
    oldArtifactReferences: ["docs/old prototypes/agent-chat"],
    referenceSources: [],
    referenceScopeDecision: {
      axis: "reference_borrow_avoid",
      choiceId: "functional-only",
      answer: "Functional inventory only",
      source: "user",
    },
    artifacts: [
      {
        path: ".supervibe/artifacts/prototypes/old-agent-chat",
        kind: "prototype",
        status: "draft",
        target: "tauri",
        signals: ["config.json", "spec.md", "index.html"],
      },
    ],
  };
  const plan = buildDesignAgentPlan({
    brief: "Create a new agent chat design; old prototypes are functional inventory only.",
    target: "tauri",
    slug: "agent-chat-desktop",
    mode: "full-prototype-pipeline",
    intake,
  });
  const referenceStageIndex = plan.stages.findIndex((stage) => stage.id === "stage-0-reference-inventory");
  const creativeStageIndex = plan.stages.findIndex((stage) => stage.id === "stage-1-brand-direction");

  assert.ok(referenceStageIndex >= 0);
  assert.ok(creativeStageIndex > referenceStageIndex);
  assert.equal(plan.referenceInventory.path, ".supervibe/artifacts/prototypes/agent-chat-desktop/reference-inventory.md");
  assert.deepEqual(plan.referenceInventory.requiredSections, ["flows", "states", "capabilities", "explicit-avoid-list"]);
  assert.match(plan.referenceInventory.sources[0], /old-agent-chat|old prototypes/);
});

test("design agent plan treats same-structure website brief as IA reference inventory", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-reference-structure-"));
  try {
    const brief = "посмотри на главную страницу - https://dune-imperium.ru/. Сделай по структуре также, только 5 разных вариантов дизайна прототипа, совершенно разных по стилю";
    const intake = await evaluateDesignArtifactIntake({ projectRoot: root, brief });
    const plan = buildDesignAgentPlan({
      brief,
      target: "web",
      flowType: "landing",
      slug: "dune-home-variants",
      mode: "full-prototype-pipeline",
      rootDir: root,
      intake,
      referenceSources: intake.referenceSources,
    });

    assert.equal(intake.needsQuestion, false);
    assert.equal(intake.referenceScopeDecision.choiceId, "ia-only");
    assert.equal(plan.referenceInventory.scope, "ia-only");
    assert.deepEqual(plan.referenceInventory.sources, ["website: https://dune-imperium.ru/"]);
    assert.equal(plan.wizard.decisions.creative_alternatives.choiceId, "five-style-variants");
    assert.equal(plan.wizard.decisions.creative_alternatives.variantCount, 5);
    assert.ok(plan.stages.some((stage) => stage.id === "stage-0-reference-website"));
    assert.ok(plan.stages.some((stage) => stage.id === "stage-0-reference-inventory"));
    assert.ok(!plan.writeGate.blockedReasons.some((reason) => reason.code === "intake-question-open"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan converts explicit five-variant request into separate prewrite artifacts", () => {
  const brief = [
    "study old prototypes C:/workspace/docs/old prototypes and file:///C:/workspace/docs/old%20prototypes/screen-chat.html",
    "make 5 creative and different variants with feedback overlay system",
    "hide navigation under a button, use floating drawers, one common chat, dark theme",
    "1 to 1 app screen, chats in windows discouraged",
  ].join(". ");
  const plan = buildDesignAgentPlan({
    brief,
    target: "tauri",
    slug: "agent-chat",
    mode: "full-prototype-pipeline",
    designSystemStatus: "approved",
    pluginRoot: ROOT,
    initialDecisions: completedWizardDecisions(),
  });
  const manifest = buildDesignPrewriteManifest(plan, { slug: "agent-chat" });
  const report = formatDesignPrewriteManifest(manifest);
  const variantHtml = manifest.files.filter((file) => /\/variants\/variant-\d\/index\.html$/.test(file.path));

  assert.equal(plan.acceptanceContract.requestedVariantCount, 5);
  assert.equal(plan.variantSet.active, true);
  assert.equal(plan.variantSet.requestedVariantCount, 5);
  assert.equal(plan.variantSet.primarySwitcherForbidden, true);
  assert.equal(manifest.variantSet.active, true);
  assert.equal(variantHtml.length, 5);
  assert.ok(manifest.files.some((file) => file.path.endsWith("agent-chat/variant-manifest.json")));
  assert.ok(!manifest.files.some((file) => file.path.endsWith("agent-chat/index.html")));
  assert.ok(plan.executionStatus.runtimeProofRequirements.some((proof) => /\/variants\/variant-1\/index\.html$/.test(proof.outputArtifact)));
  assert.match(report, /VARIANT_SET: active count=5/);
});

test("design write gate blocks durable artifacts when wizard or agent questions are open", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-write-gate-"));
  try {
    const plan = buildDesignAgentPlan({
      brief: "New Tauri design. Use graphite cyan only.",
      target: "tauri",
      rootDir: root,
      intake: { needsQuestion: false },
    });

    assert.equal(plan.executionStatus.executionMode, "agent-required-blocked");
    assert.equal(plan.writeGate.durableWritesAllowed, false);
    assert.ok(plan.writeGate.blockedReasons.some((reason) => reason.code === "agent-required-blocked"));
    assert.ok(plan.writeGate.blockedReasons.some((reason) => reason.code === "tokens-locked"));
    assert.deepEqual(plan.writeGate.allowedWriteClasses, ["run-state", "diagnostic-scratch"]);
    assert.equal(assertDesignWriteAllowed(plan.writeGate, { writeClass: "diagnostic-scratch", artifact: "scratch" }), true);
    assert.throws(
      () => assertDesignWriteAllowed(plan.writeGate, { writeClass: "durable-design-artifacts", artifact: "tokens.css" }),
      /durable-design-artifacts write blocked/,
    );

    const prompt = formatDesignPlanPrompt(plan);
    assert.match(prompt, /WRITE_GATE: blocked/);
    assert.match(prompt, /specialist agents are unavailable/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design write gate blocks durable writes after wizard completion until runtime receipts exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-receipt-gate-"));
  try {
    await installCodexDesignAgents(root);
    const plan = buildDesignAgentPlan({
      brief: "Use safe defaults for a new desktop agent chat design system.",
      target: "web",
      mode: "design-system-only",
      rootDir: root,
      pluginRoot: ROOT,
      initialDecisions: completedWizardDecisions(),
    });

    assert.equal(plan.wizard.questionQueue.length, 0);
    assert.equal(plan.executionStatus.agentsInstalled, true);
    assert.equal(plan.executionStatus.executionMode, "agent-dispatch-required");
    assert.equal(plan.executionStatus.receiptGate, "pending-runtime-agent-receipts");
    assert.equal(plan.executionStatus.hostDispatchAvailable, true);
    assert.equal(plan.executionStatus.hostInvocationsLogged, false);
    assert.equal(plan.executionStatus.agentInvocationsCompleted, false);
    assert.equal(plan.executionStatus.agentReceiptsTrusted, false);
    assert.ok(plan.executionStatus.missingRuntimeProofs.some((proof) => proof.subjectId === "creative-director"));
    assert.equal(plan.writeGate.durableWritesAllowed, false);
    assert.ok(plan.writeGate.blockedReasons.some((reason) => reason.code === "pending-runtime-agent-receipts"));
    assert.match(formatDesignPlanPrompt(plan), /Run the required specialists before writing design artifacts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan uses the same Codex host dispatch capability as command agent plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-host-dispatch-"));
  try {
    await writeUtf8(root, "AGENTS.md", "# test host marker\n");
    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-agent-plan.mjs"),
      "--root",
      root,
      "--plugin-root",
      ROOT,
      "--slug",
      "agent-chat",
      "--host",
      "codex",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.match(output, /HOST_DISPATCH_AVAILABLE: true/);
    assert.match(output, /HOST_DISPATCH: codex:supported/);
    assert.match(output, /HOST_TOOL: spawn_agent/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan respects persisted reference scope before choosing next question", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-reference-scope-"));
  try {
    await installCodexDesignAgents(root);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", `${JSON.stringify({
      brief: "Create a new desktop agent chat workspace with approvals and traces; study docs/old prototypes.",
      target: "tauri",
      mode: "full-prototype-pipeline",
      designWizard: {
        decisions: {
          viewport: { axis: "viewport", answer: "1440x900", choiceId: "custom", source: "user" },
          reference_borrow_avoid: {
            axis: "reference_borrow_avoid",
            choiceId: "functional-only",
            answer: "Functional inventory only",
            source: "user",
          },
        },
      },
    }, null, 2)}\n`);

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "design-agent-plan.mjs"),
      "--root",
      root,
      "--plugin-root",
      ROOT,
      "--slug",
      "agent-chat",
      "--status",
      "--plan-writes",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });

    assert.match(output, /OLD_ARTIFACT_SCOPE_REQUIRED: false/);
    assert.doesNotMatch(output, /NEXT_BLOCKING_QUESTION:|Old artifact reference scope|existing-artifacts-ambiguous-brief/);
    assert.match(output, /SUPERVIBE_DESIGN_WIZARD_STATUS[\s\S]*NEXT: anti_generic_guardrail/);
    assert.match(output, /NEXT_QUESTION_SOURCE: specialist-question-gate/);
    assert.match(output, /NEXT_QUESTION_AXIS: anti_generic_guardrail/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design execution modes are explicit and non-real modes cannot claim specialist output", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-execution-modes-"));
  try {
    await installCodexDesignAgents(root);
    const inlinePlan = buildDesignAgentPlan({
      brief: "Draft a design direction using deterministic checks only.",
      target: "web",
      rootDir: root,
      pluginRoot: ROOT,
      requestedExecutionMode: "inline",
      mode: "design-system-only",
    });

    assert.equal(inlinePlan.executionStatus.executionMode, "inline");
    assert.equal(inlinePlan.executionStatus.agentReceiptsAllowed, false);
    assert.equal(inlinePlan.writeGate.durableWritesAllowed, false);
    assert.ok(inlinePlan.writeGate.blockedReasons.some((reason) => reason.code === "non-real-agent-execution-mode"));

    const hybridPlan = buildDesignAgentPlan({
      brief: "Hybrid design run with agents for final outputs.",
      target: "web",
      rootDir: root,
      pluginRoot: ROOT,
      requestedExecutionMode: "hybrid",
      mode: "design-system-only",
    });

    assert.equal(hybridPlan.executionStatus.executionMode, "hybrid");
    assert.equal(hybridPlan.executionStatus.agentReceiptsAllowed, true);
    assert.equal(hybridPlan.writeGate.durableWritesAllowed, false);
    assert.match(formatDesignPlanPrompt(hybridPlan), /hybrid/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design write gate prioritizes intake question before wizard or artifact writes", () => {
  const intake = {
    needsQuestion: true,
    needsOldArtifactScopeQuestion: true,
    reason: "old-artifact-reference-scope-required",
    oldArtifactReferences: ["docs/old prototypes"],
    referenceSources: [],
    artifacts: [],
  };
  const plan = buildDesignAgentPlan({
    brief: "Use old prototypes.",
    target: "web",
    mode: "design-system-only",
    intake,
  });
  const gate = buildDesignWriteGate({ intake, plan });

  assert.equal(gate.durableWritesAllowed, false);
  assert.equal(gate.nextQuestion.source, "intake");
  assert.match(gate.nextQuestion.markdown, /Old artifact reference scope/);
  assert.match(formatDesignPlanPrompt(plan, { intake, writeGate: gate }), /NEXT_BLOCKING_QUESTION/);
});

test("design prewrite manifest lists blocked durable writes before artifact mutation", () => {
  const plan = buildDesignAgentPlan({
    brief: "New web design with graphite cyan only.",
    target: "web",
    mode: "design-system-only",
  });
  const manifest = buildDesignPrewriteManifest(plan, { slug: "agent-chat" });
  const report = formatDesignPrewriteManifest(manifest);

  assert.equal(manifest.durableWritesAllowed, false);
  assert.ok(manifest.files.some((file) => file.path.endsWith("tokens.css") && file.status === "blocked"));
  assert.ok(manifest.files.some((file) => file.path.endsWith("agent-chat/index.html") && file.writeClass === "prototype"));
  assert.match(report, /SUPERVIBE_DESIGN_PREWRITE_MANIFEST/);
  assert.match(report, /WORKFLOW_STAGE:/);
  assert.match(report, /FILES:/);
});

test("design prewrite manifest completes per-artifact receipts without unblocking later stages", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-prewrite-per-artifact-"));
  try {
    await installCodexDesignAgents(root);
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation: await writeAgentInvocation(root),
    });

    const plan = buildDesignAgentPlan({
      brief: "Use completed preferences for a desktop agent chat design system.",
      target: "web",
      mode: "design-system-only",
      rootDir: root,
      pluginRoot: ROOT,
      initialDecisions: completedWizardDecisions(),
    });
    const manifest = buildDesignPrewriteManifest(plan, { slug: "agent-chat" });
    const direction = manifest.files.find((file) => file.path === ".supervibe/artifacts/brandbook/direction.md");
    const tokens = manifest.files.find((file) => file.path.endsWith("tokens.css"));
    const report = formatDesignPrewriteManifest(manifest);

    assert.equal(plan.executionStatus.executionMode, "agent-dispatch-required");
    assert.equal(plan.executionStatus.agentReceiptsTrusted, false);
    assert.ok(plan.executionStatus.durableMissingRuntimeProofs.some((proof) => proof.subjectId === "design-system-architect"));
    assert.equal(plan.executionStatus.producerReceiptsTrusted, false);
    assert.equal(manifest.durableWritesAllowed, false);
    assert.equal(direction.status, "complete");
    assert.equal(direction.receiptTrusted, true);
    assert.equal(tokens.status, "blocked");
    assert.equal(tokens.producerType, "skill");
    assert.equal(tokens.producerId, "supervibe:brandbook");
    assert.equal(manifest.nextProducer.producerId, "supervibe:brandbook");
    assert.ok(manifest.files.some((file) => file.path === ".supervibe/artifacts/prototypes/_design-system/_reviews/architecture.md" && file.producerId === "design-system-architect"));
    assert.match(report, /complete durable-design-artifacts .supervibe\/artifacts\/brandbook\/direction\.md/);
    assert.match(report, /NEXT_PRODUCER: skill:supervibe:brandbook@stage-2-design-system/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects durable outputs without completed receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/spec.md", "# Spec\n");

    const result = validateDesignAgentInvocationReceipts(root);

    assert.equal(result.pass, false);
    assert.equal(result.executionMode, "agent-required-blocked");
    assert.deepEqual(result.missingAgents.sort(), ["creative-director", "ux-ui-designer"].sort());
    assert.match(result.qualityImpact, /creative-director/);
    assert.ok(result.issues.some((issue) => issue.expectedAgentId === "creative-director"));
    assert.ok(result.issues.some((issue) => issue.expectedAgentId === "ux-ui-designer"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design system architect becomes next producer after brandbook artifacts are trusted", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-system-architect-next-"));
  try {
    const brandbookArtifacts = [
      ".supervibe/artifacts/prototypes/_design-system/tokens.css",
      ".supervibe/artifacts/prototypes/_design-system/manifest.json",
      ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json",
      ".supervibe/artifacts/prototypes/_design-system/styleboard.html",
    ];
    for (const artifact of brandbookArtifacts) {
      await writeUtf8(root, artifact, artifact.endsWith(".json") ? "{}\n" : "ok\n");
    }
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "skill",
      subjectId: "supervibe:brandbook",
      skillId: "supervibe:brandbook",
      stage: "stage-2-design-system",
      invocationReason: "brandbook skill produced candidate design-system artifacts",
      inputEvidence: [".supervibe/artifacts/brandbook/direction.md"],
      outputArtifacts: brandbookArtifacts,
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
    });
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation: await writeAgentInvocation(root),
    });

    const plan = buildDesignAgentPlan({
      brief: "Use completed preferences for a desktop agent chat design system.",
      target: "web",
      mode: "design-system-only",
      rootDir: root,
      pluginRoot: ROOT,
      initialDecisions: completedWizardDecisions(),
    });
    const manifest = buildDesignPrewriteManifest(plan, { slug: "agent-chat" });

    assert.equal(manifest.nextProducer.producerType, "agent");
    assert.equal(manifest.nextProducer.producerId, "design-system-architect");
    assert.equal(manifest.nextProducer.stageId, "stage-2-design-system-review");
    assert.match(formatDesignPrewriteManifest(manifest), /NEXT_PRODUCER: agent:design-system-architect@stage-2-design-system-review/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator labels receipt-only runs with warnings", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-receipt-only-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/_agent-outputs/memory/summary.md", "# Memory lookup\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "skill",
      subjectId: "supervibe:project-memory",
      skillId: "supervibe:project-memory",
      stage: "stage-0-memory",
      invocationReason: "project memory lookup",
      outputArtifacts: [".supervibe/artifacts/_agent-outputs/memory/summary.md"],
      startedAt: "2026-05-04T00:00:00.000Z",
      completedAt: "2026-05-04T00:01:00.000Z",
      handoffId: "agent-chat",
    });

    const result = validateDesignAgentInvocationReceipts(root);

    assert.equal(result.pass, true);
    assert.equal(result.checked, 0);
    assert.equal(result.executionMode, "receipt-only");
    assert.ok(result.warnings.some((warning) => warning.code === "design-receipts-without-durable-output-checks"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator flags incompatible duplicate artifact receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-duplicate-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "skill",
      subjectId: "supervibe:project-memory",
      skillId: "supervibe:project-memory",
      stage: "stage-0-memory",
      invocationReason: "bad duplicate direction proof",
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-04T00:00:00.000Z",
      completedAt: "2026-05-04T00:01:00.000Z",
      handoffId: "agent-chat",
    });
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "skill",
      subjectId: "supervibe:brandbook",
      skillId: "supervibe:brandbook",
      stage: "stage-2-design-system",
      invocationReason: "second incompatible direction proof",
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-04T00:02:00.000Z",
      completedAt: "2026-05-04T00:03:00.000Z",
      handoffId: "agent-chat",
    });

    const result = validateDesignAgentInvocationReceipts(root);

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "incompatible-design-receipts"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent plan consumes host-provided Tauri window metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-window-metrics-"));
  try {
    await writeUtf8(root, ".supervibe/memory/desktop-window-metrics.json", `${JSON.stringify({
      target: "tauri",
      currentWindow: { width: 1366, height: 768, deviceScaleFactor: 1.25, label: "Current Tauri window" },
      minWindow: { width: 800, height: 600 },
    })}\n`);

    const plan = buildDesignAgentPlan({
      brief: "Tauri desktop app",
      target: "tauri",
      rootDir: root,
    });

    assert.equal(plan.viewportPolicy.metricsSource, ".supervibe/memory/desktop-window-metrics.json");
    assert.equal(plan.viewportPolicy.defaultViewports[0].width, 1366);
    assert.equal(plan.viewportPolicy.defaultViewports[0].deviceScaleFactor, 1.25);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator does not let command receipts substitute specialist receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "command",
      subjectId: "supervibe-design",
      stage: "stage-1-brand-direction",
      invocationReason: "main command drafted direction manually",
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      secret: "test-secret",
    });

    const result = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.equal(result.executionMode, "agent-required-blocked");
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-agent-receipt" && issue.expectedAgentId === "creative-director"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects hand-written completed receipts without runtime provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await writeUtf8(root, ".supervibe/artifacts/_workflow-invocations/supervibe-design/design-agent-chat/creative-director-stage-1.json", JSON.stringify({
      schemaVersion: 1,
      command: "/supervibe-design",
      invokedBy: "supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      status: "completed",
      invocationReason: "brand direction required",
      inputEvidence: ["preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
    }, null, 2));

    const result = validateDesignAgentInvocationReceipts(root);

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "untrusted-design-agent-receipt"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects runtime-issued agent receipts without host invocation proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");

    await assert.rejects(
      issueWorkflowInvocationReceipt({
        rootDir: root,
        command: "/supervibe-design",
        subjectType: "agent",
        subjectId: "creative-director",
        agentId: "creative-director",
        stage: "stage-1-brand-direction",
        invocationReason: "brand direction required",
        inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
        outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
        startedAt: "2026-05-03T00:00:00.000Z",
        completedAt: "2026-05-03T00:01:00.000Z",
        handoffId: "design-agent-chat",
        secret: "test-secret",
      }),
      /hostInvocation proof required/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator accepts runtime-issued receipts with host invocation proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    const hostInvocation = await writeAgentInvocation(root);

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation,
      secret: "test-secret",
    });

    const result = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, true);
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active design receipt validator fails instead of passing checked-zero workflows", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-active-receipts-"));
  try {
    const result = validateDesignAgentInvocationReceipts(root, {
      active: true,
      slug: "agent-chat",
      handoffId: "agent-chat-run",
      secret: "test-secret",
    });

    assert.equal(result.pass, false);
    assert.equal(result.checked, 0);
    assert.equal(result.executionMode, "agent-required-blocked");
    assert.ok(result.issues.some((issue) => issue.code === "active-design-receipt-scope-empty"));
    assert.match(result.qualityImpact, /Active design workflow has no scoped durable-output receipt coverage/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active design receipt validator requires reviewer stage receipts after prototype output exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-active-reviewers-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html>\n");

    const result = validateDesignAgentInvocationReceipts(root, {
      active: true,
      slug: "agent-chat",
      handoffId: "agent-chat-run",
      secret: "test-secret",
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-agent-receipt" && issue.expectedAgentId === "prototype-builder"));
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-agent-receipt" && issue.expectedAgentId === "ui-polish-reviewer"));
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-agent-receipt" && issue.expectedAgentId === "accessibility-reviewer"));
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-agent-receipt" && issue.expectedAgentId === "quality-gate-reviewer"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("baseline design receipt validator keeps reviewer stages conditional for draft prototypes", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-baseline-reviewers-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html>\n");

    const result = validateDesignAgentInvocationReceipts(root, {
      slug: "agent-chat",
      secret: "test-secret",
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-agent-receipt" && issue.expectedAgentId === "prototype-builder"));
    assert.equal(result.issues.some((issue) => issue.expectedAgentId === "ui-polish-reviewer"), false);
    assert.equal(result.issues.some((issue) => issue.expectedAgentId === "accessibility-reviewer"), false);
    assert.equal(result.issues.some((issue) => issue.expectedAgentId === "quality-gate-reviewer"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator scopes active checks to the requested handoff", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-scoped-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    const hostInvocation = await writeAgentInvocation(root);

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "previous-design-run",
      hostInvocation,
      secret: "test-secret",
    });

    const unscoped = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });
    const scoped = validateDesignAgentInvocationReceipts(root, {
      active: true,
      handoffId: "current-design-run",
      secret: "test-secret",
    });

    assert.equal(unscoped.pass, true);
    assert.equal(scoped.pass, false);
    assert.ok(scoped.issues.some((issue) => issue.code === "missing-design-agent-receipt" && issue.expectedAgentId === "creative-director"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator accepts runtime-issued scoped active receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-positive-scoped-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    const hostInvocation = await writeAgentInvocation(root, {
      invocationId: "agent-invocation-scoped-1",
      agentId: "creative-director",
      taskSummary: "scoped brand direction required",
    });

    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "scoped brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "current-design-run",
      hostInvocation,
      secret: "test-secret",
    });

    const result = validateDesignAgentInvocationReceipts(root, {
      active: true,
      handoffId: "current-design-run",
      secret: "test-secret",
    });

    assert.equal(result.pass, true);
    assert.equal(result.scope.active, true);
    assert.equal(result.scope.handoffId, "current-design-run");
    assert.equal(result.executionMode, "real-agents");
    assert.deepEqual(result.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects output artifact hash drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation: await writeAgentInvocation(root),
      secret: "test-secret",
    });
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Changed after receipt\n");

    const result = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "untrusted-design-agent-receipt" && /hash mismatch/.test(issue.message)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design agent receipt validator rejects missing artifact link manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-agent-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/brandbook/preferences.json", "{\"ok\":true}\n");
    await writeUtf8(root, ".supervibe/artifacts/brandbook/direction.md", "# Direction\n");
    await issueWorkflowInvocationReceipt({
      rootDir: root,
      command: "/supervibe-design",
      subjectType: "agent",
      subjectId: "creative-director",
      agentId: "creative-director",
      stage: "stage-1-brand-direction",
      invocationReason: "brand direction required",
      inputEvidence: [".supervibe/artifacts/brandbook/preferences.json"],
      outputArtifacts: [".supervibe/artifacts/brandbook/direction.md"],
      startedAt: "2026-05-03T00:00:00.000Z",
      completedAt: "2026-05-03T00:01:00.000Z",
      handoffId: "design-agent-chat",
      hostInvocation: await writeAgentInvocation(root),
      secret: "test-secret",
    });
    await rm(join(root, ".supervibe", "artifacts", "_workflow-invocations", "supervibe-design", "design-agent-chat", "artifact-links.json"), { force: true });

    const result = validateDesignAgentInvocationReceipts(root, { secret: "test-secret" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "missing-design-artifact-receipt-link"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
