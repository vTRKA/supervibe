import { readFileSync } from "node:fs";

import { routeTriggerRequest } from "./supervibe-trigger-router.mjs";
import { evaluateEvidenceGate } from "./supervibe-evidence-ledger.mjs";

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
]);

export function evaluateAgentRegressionChecks({ packageJson = readPackageJson(), cases = AGENT_BEHAVIOR_REGRESSION_CASES } = {}) {
  const results = cases.map((testCase) => evaluateAgentRegressionCase(testCase));
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

function evaluateAgentRegressionCase(testCase = {}) {
  const route = routeTriggerRequest(testCase.request, { artifacts: { request: testCase.request, userRequest: true } });
  const gate = evaluateEvidenceGate({
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
  });
  const failures = [];
  if (testCase.expectedIntent && route.intent !== testCase.expectedIntent) failures.push(`expected intent ${testCase.expectedIntent} got ${route.intent}`);
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

function readPackageJson() {
  try {
    return JSON.parse(readFileSync("package.json", "utf8"));
  } catch {
    return {};
  }
}
