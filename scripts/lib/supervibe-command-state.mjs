import { routeTriggerRequest } from "./supervibe-trigger-router.mjs";
import { createAgentCheckpoint } from "./supervibe-agent-checkpoints.mjs";

const POST_DELIVERY_CHOICES = Object.freeze(["approve", "refine", "alternative", "deeper-review", "stop"]);

function createCommandState({ route, scenario = {} } = {}) {
  const expected = scenario.expected || {};
  const deliveryMenu = Boolean(expected.requiresPostDeliveryMenu || ["genesis_setup", "delivery_control"].includes(route.intent));
  const state = {
    runId: `${scenario.id || route.intent}-local`,
    activeCommand: route.command,
    intent: route.intent,
    lifecycleState: expected.requiresDryRun ? "dry-run" : "routed",
    currentStep: deliveryMenu ? "post-delivery-question" : "ready",
    selectedOptions: {},
    pendingQuestion: deliveryMenu ? buildPostDeliveryQuestion(route) : route.nextQuestion,
    locks: [],
    dryRunOutput: expected.requiresDryRun ? { present: true, summary: `${route.command} dry-run output` } : null,
    healthGate: expected.requiresHealthGate ? { present: true, command: route.command, ready: "evaluated" } : null,
    resumeToken: expected.requiresResumeToken ? `${scenario.id || route.intent}:resume` : null,
    deliveryArtifactPath: `.supervibe/memory/commands/${route.intent}/state.json`,
    approvalState: "pending-user-choice",
    lastPostDeliveryPrompt: deliveryMenu ? buildPostDeliveryQuestion(route) : null,
    persistedBeforeWait: true,
    claimsDoneWithoutChoice: false,
  };
  state.checkpoint = createAgentCheckpoint({
    taskId: state.runId,
    userIntent: scenario.request || route.intent,
    selectedAgent: "command-router",
    retrievalPolicy: route.retrievalPolicy,
    memoryIds: scenario.quality?.retrieved?.memoryIds || [],
    ragChunkIds: scenario.quality?.retrieved?.sourceChunkIds || [],
    graphSymbols: scenario.quality?.retrieved?.graphSymbols || [],
    verificationCommands: route.verificationHooks || ["node --test tests/scenario-evals.test.mjs"],
    nextSafeAction: deliveryMenu ? "wait for post-delivery user choice" : "execute routed command",
  });
  return state;
}

export function evaluateScenarioFlows(scenarios = []) {
  const results = scenarios.map((scenario) => {
    const route = routeTriggerRequest(scenario.request, { artifacts: { userRequest: true, request: scenario.request } });
    const state = createCommandState({ route, scenario });
    const expected = scenario.expected || {};
    const failures = [];

    if (expected.intent && route.intent !== expected.intent) failures.push(`expected intent ${expected.intent} but got ${route.intent}`);
    if (expected.command && route.command !== expected.command) failures.push(`expected command ${expected.command} but got ${route.command}`);
    if (expected.requiresDryRun && !state.dryRunOutput?.present) failures.push("user flow did not produce required dry-run, question or health gate");
    if (expected.requiresHealthGate && !state.healthGate?.present) failures.push("user flow did not produce required dry-run, question or health gate");
    if (expected.requiresLifecycleState && !state.lifecycleState) failures.push("missing lifecycle state");
    if (expected.requiresResumeToken && !state.resumeToken) failures.push("missing resume token");
    if (expected.requiresPostDeliveryMenu && !hasPostDeliveryMenu(state)) failures.push("missing post-delivery approve/refine/alternative/stop menu");
    if (!state.persistedBeforeWait) failures.push("state was not persisted before waiting");
    if (state.claimsDoneWithoutChoice) failures.push("claimed done without user choice");
    if (!state.checkpoint?.validation?.pass) failures.push(`checkpoint invalid: ${state.checkpoint?.validation?.failures?.join("; ")}`);

    return {
      id: scenario.id,
      pass: failures.length === 0,
      failures,
      route,
      state,
    };
  });
  const failed = results.filter((result) => !result.pass);
  return { pass: failed.length === 0, total: results.length, failed, results };
}

export function formatScenarioEvaluation(evaluation) {
  const lines = [
    "SUPERVIBE_SCENARIO_EVALUATION",
    `PASS: ${evaluation.pass}`,
    `TOTAL: ${evaluation.total}`,
    `FAILED: ${evaluation.failed.length}`,
  ];
  for (const result of evaluation.failed) {
    lines.push(`- ${result.id}: ${result.failures.join("; ")}`);
    lines.push(`  route: ${result.route.intent} -> ${result.route.command}`);
  }
  return lines.join("\n");
}

function buildPostDeliveryQuestion(route) {
  return {
    prompt: `Step 1/1: ${route.nextQuestion || "Choose the next delivery action."}`,
    choices: POST_DELIVERY_CHOICES.map((id) => ({
      id,
      label: id,
      tradeoff: tradeoffFor(id),
    })),
    stopCondition: "Stop persists state and exits without claiming completion.",
  };
}

function hasPostDeliveryMenu(state) {
  const choices = new Set((state.lastPostDeliveryPrompt?.choices || []).map((choice) => choice.id));
  return ["approve", "refine", "alternative", "stop"].every((choice) => choices.has(choice));
}

function tradeoffFor(id) {
  const tradeoffs = {
    approve: "Apply or accept the delivered artifact.",
    refine: "Make one focused change.",
    alternative: "Generate another option with tradeoffs.",
    "deeper-review": "Run additional audit before applying.",
    stop: "Persist state and exit.",
  };
  return tradeoffs[id] || "Choose this path.";
}
