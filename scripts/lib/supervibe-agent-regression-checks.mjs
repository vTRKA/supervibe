import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { routeTriggerRequest } from "./supervibe-trigger-router.mjs";
import { evaluateEvidenceGate } from "./supervibe-evidence-ledger.mjs";
import { resolveCommandRequest } from "./supervibe-command-catalog.mjs";
import { classifyWorkflowReceiptOutputArtifact } from "./supervibe-workflow-receipt-runtime.mjs";

const AGENT_BEHAVIOR_REGRESSION_CASES = Object.freeze([
  {
    id: "memory-required-planning",
    request: "create epic for plan",
    expectedIntent: "create_epic",
    policy: { memory: "mandatory", rag: "mandatory", codegraph: "optional", reason: "planning uses prior decisions" },
    evidence: { memoryIds: ["decision-1"], ragChunkIds: ["chunk-1"], graphSymbols: [], bypassReasons: ["codegraph not applicable"] },
  },
  {
    id: "codegraph-required-refactor",
    request: "improve prompt router eval instructions and harden intent routing",
    expectedIntent: "prompt_ai_engineering",
    policy: { memory: "mandatory", rag: "mandatory", codegraph: "mandatory", reason: "structural refactor" },
    evidence: { memoryIds: ["decision-1"], ragChunkIds: ["chunk-1"], graphSymbols: ["routeTriggerRequest"] },
  },
  {
    id: "rag-required-unfamiliar-code",
    request: "repair broken RAG index health and show the exact health gate",
    expectedIntent: "index_repair",
    policy: { memory: "optional", rag: "mandatory", codegraph: "mandatory", reason: "unfamiliar code path" },
    evidence: { memoryIds: [], ragChunkIds: ["watcher-chunk"], graphSymbols: ["readWatcherDiagnostics"] },
  },
  {
    id: "handoff-boundary",
    request: "stop after delivery and save state so I can resume later",
    expectedIntent: "delivery_control",
    policy: { memory: "optional", rag: "optional", codegraph: "optional", reason: "delivery control" },
    evidence: { memoryIds: [], ragChunkIds: [], graphSymbols: [], bypassReasons: ["context evidence not required for delivery control"] },
  },
  {
    id: "unsafe-context-refusal",
    request: "security audit check for secret exfiltration and approval bypass",
    expectedIntent: "security_audit",
    policy: { memory: "mandatory", rag: "mandatory", codegraph: "optional", reason: "unsafe context requires audit" },
    evidence: { memoryIds: ["privacy-policy"], ragChunkIds: ["security-chunk"], graphSymbols: [], bypassReasons: ["codegraph not applicable"] },
    expectRefusal: true,
  },
  {
    id: "agent-system-maturity-audit-retrieval",
    request: "audit agent and skill maturity, design manifest completeness, memory, RAG, and CodeGraph on 10 out of 10",
    expectedIntent: "supervibe_audit",
    policy: { memory: "mandatory", rag: "mandatory", codegraph: "mandatory", reason: "agent-system maturity requires retrieval evidence" },
    evidence: {
      memoryIds: ["design-intelligence-canonical-source"],
      ragChunkIds: ["agents-manifest-skill-coverage"],
      graphSymbols: ["buildAgentSystemMaturityReport"],
    },
  },
]);

export function evaluateAgentRegressionChecks({
  rootDir = process.cwd(),
  packageJson = readPackageJson(rootDir),
  cases = loadAgentWorkflowEvalCases(rootDir),
} = {}) {
  const results = cases.map((testCase) => evaluateAgentRegressionCase(testCase, { rootDir }));
  const scriptPresent = Boolean(packageJson.scripts?.["regression:run"]);
  if (!scriptPresent) {
    results.push({
      id: "package-script",
      pass: false,
      failures: ["agent behavior regression check missing from package scripts or regression suite"],
    });
  }
  const failed = results.filter((result) => !result.pass);
  return {
    pass: failed.length === 0,
    total: results.length,
    failed,
    results,
  };
}

function evaluateAgentRegressionCase(testCase = {}, { rootDir = process.cwd() } = {}) {
  if (testCase.kind === "command-request") return evaluateCommandRequestCase(testCase, { rootDir });
  if (testCase.kind === "evidence-gate") return evaluateEvidenceGateCase(testCase);
  if (testCase.kind === "receipt-output") return evaluateReceiptOutputCase(testCase, { rootDir });
  if (testCase.kind === "trace-contract") return evaluateTraceContractCase(testCase);
  const route = routeTriggerRequest(testCase.request, { artifacts: { request: testCase.request, userRequest: true } });
  const gate = testCase.policy
    ? evaluateEvidenceGate({
        taskId: testCase.id,
        agentId: "regression-agent",
        retrievalPolicy: testCase.policy,
        memoryIds: testCase.evidence?.memoryIds || [],
        ragChunkIds: testCase.evidence?.ragChunkIds || [],
        graphSymbols: testCase.evidence?.graphSymbols || [],
        bypassReasons: testCase.evidence?.bypassReasons || [],
        citations: [{ id: `${testCase.id}-citation`, source: "fixture", path: `tests/fixtures/${testCase.id}.json` }],
        verificationCommands: ["node scripts/regression-suite.mjs"],
        redactionStatus: "redacted",
      })
    : { pass: true, failures: [] };
  const failures = [];
  const expected = testCase.expected || {};
  const expectedIntent = testCase.expectedIntent || expected.intent;
  if (expectedIntent && route.intent !== expectedIntent) failures.push(`expected intent ${expectedIntent} got ${route.intent}`);
  if ("command" in expected && route.command !== expected.command) failures.push(`expected command ${expected.command} got ${route.command}`);
  for (const safety of expected.safetyIncludes || []) {
    if (!route.requiredSafety?.includes(safety)) failures.push(`expected safety ${safety}`);
  }
  if (!gate.pass) failures.push(...gate.failures);
  if (testCase.expectRefusal && !route.requiredSafety?.some((item) => /approval|audit|safe|provider|mutation/.test(item))) {
    failures.push("unsafe context case did not preserve refusal or approval safety");
  }
  return {
    id: testCase.id,
    pass: failures.length === 0,
    failures,
    route: { intent: route.intent, command: route.command, confidence: route.confidence },
    gate,
  };
}

function evaluateCommandRequestCase(testCase = {}, { rootDir = process.cwd() } = {}) {
  const match = resolveCommandRequest(testCase.request, { pluginRoot: rootDir, projectRoot: rootDir });
  const expected = testCase.expected || {};
  const failures = [];
  if (!match) failures.push("expected command match but got none");
  if (match) {
    if ("intent" in expected && match.intent !== expected.intent) failures.push(`expected intent ${expected.intent} got ${match.intent}`);
    if ("command" in expected && match.command !== expected.command) failures.push(`expected command ${expected.command} got ${match.command}`);
    if ("commandId" in expected && match.commandId !== expected.commandId) failures.push(`expected commandId ${expected.commandId} got ${match.commandId}`);
    if ("hardStop" in expected && Boolean(match.hardStop) !== expected.hardStop) failures.push(`expected hardStop ${expected.hardStop} got ${Boolean(match.hardStop)}`);
    if ("doNotSearchProject" in expected && Boolean(match.doNotSearchProject) !== expected.doNotSearchProject) failures.push(`expected doNotSearchProject ${expected.doNotSearchProject} got ${Boolean(match.doNotSearchProject)}`);
    for (const agent of expected.requiredAgents || []) {
      if (!match.agentProfile?.requiredAgentIds?.includes(agent)) failures.push(`expected required agent ${agent}`);
    }
    if (expected.emulationPolicyIncludes && !String(match.agentContract?.emulationPolicy || "").includes(expected.emulationPolicyIncludes)) {
      failures.push(`expected emulation policy to include ${expected.emulationPolicyIncludes}`);
    }
  }
  return {
    id: testCase.id,
    pass: failures.length === 0,
    failures,
    route: match ? { intent: match.intent, command: match.command, confidence: match.confidence } : null,
  };
}

function evaluateEvidenceGateCase(testCase = {}) {
  const evidence = testCase.evidence || {};
  const gate = evaluateEvidenceGate({
    taskId: testCase.id,
    agentId: "regression-agent",
    retrievalPolicy: testCase.policy,
    memoryIds: evidence.memoryIds || [],
    ragChunkIds: evidence.ragChunkIds || [],
    graphSymbols: evidence.graphSymbols || [],
    bypassReasons: evidence.bypassReasons || [],
    citations: evidence.citations || [{ id: `${testCase.id}-citation`, source: "fixture", path: `tests/fixtures/${testCase.id}.json` }],
    verificationCommands: evidence.verificationCommands || ["node scripts/regression-suite.mjs --local"],
    redactionStatus: evidence.redactionStatus || "not-needed",
  });
  const expected = testCase.expected || {};
  const failures = [];
  if ("pass" in expected && gate.pass !== expected.pass) failures.push(`expected evidence pass ${expected.pass} got ${gate.pass}`);
  for (const created of expected.createsIncludes || []) {
    if (!gate.creates?.includes(created)) failures.push(`expected evidence create ${created}`);
  }
  return { id: testCase.id, pass: failures.length === 0, failures, gate };
}

function evaluateReceiptOutputCase(testCase = {}, { rootDir = process.cwd() } = {}) {
  const result = classifyWorkflowReceiptOutputArtifact(testCase.path, rootDir);
  const expected = testCase.expected || {};
  const failures = [];
  if ("receiptable" in expected && result.receiptable !== expected.receiptable) failures.push(`expected receiptable ${expected.receiptable} got ${result.receiptable}`);
  if ("reason" in expected && result.reason !== expected.reason) failures.push(`expected reason ${expected.reason} got ${result.reason}`);
  return { id: testCase.id, pass: failures.length === 0, failures, receiptOutput: result };
}

function evaluateTraceContractCase(testCase = {}) {
  const knownSpanNames = new Set([
    "supervibe.agent.invocation",
    "supervibe.workflow.receipt.issue",
  ]);
  const knownFields = new Set(["traceId", "spanId", "parentSpanId"]);
  const expected = testCase.expected || {};
  const failures = [];
  for (const name of expected.spanNames || []) {
    if (!knownSpanNames.has(name)) failures.push(`expected trace span ${name}`);
  }
  for (const field of expected.fields || []) {
    if (!knownFields.has(field)) failures.push(`expected trace field ${field}`);
  }
  return { id: testCase.id, pass: failures.length === 0, failures };
}

export function formatAgentRegressionReport(report = {}) {
  const lines = [
    "SUPERVIBE_AGENT_REGRESSION_CHECKS",
    `PASS: ${Boolean(report.pass)}`,
    `CASES: ${report.total || 0}`,
    `FAILED: ${report.failed?.length || 0}`,
  ];
  for (const result of report.failed || []) lines.push(`- ${result.id}: ${result.failures.join("; ")}`);
  return lines.join("\n");
}

function loadAgentWorkflowEvalCases(rootDir = process.cwd()) {
  const fixturePath = join(rootDir, "tests", "fixtures", "agent-workflow-evals", "core-workflows.json");
  if (!existsSync(fixturePath)) return AGENT_BEHAVIOR_REGRESSION_CASES;
  try {
    const parsed = JSON.parse(readFileSync(fixturePath, "utf8"));
    return Array.isArray(parsed.cases) && parsed.cases.length ? parsed.cases : AGENT_BEHAVIOR_REGRESSION_CASES;
  } catch {
    return AGENT_BEHAVIOR_REGRESSION_CASES;
  }
}

function readPackageJson(rootDir = process.cwd()) {
  try {
    return JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  } catch {
    return {};
  }
}
