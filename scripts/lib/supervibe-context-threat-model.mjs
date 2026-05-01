import { readFileSync } from "node:fs";
import { join } from "node:path";

import { classifyPrivacyPath, redactContextForOutput } from "./supervibe-privacy-policy.mjs";
import { decideRetrievalPolicy } from "./supervibe-retrieval-decision-policy.mjs";

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior) instructions/i,
  /developer mode/i,
  /print (every|all) (env|secret|token)/i,
  /send .*https?:\/\//i,
  /paste .*private/i,
  /skip approval/i,
  /capture .*private|private .*screenshot|screenshot .*private/i,
];

const APPROVAL_PATTERNS = [
  /network|https?:\/\//i,
  /screenshot|browser window|private window/i,
  /secret|token|api[_-]?key|private key|id_rsa/i,
  /\.\.\//,
];

export function evaluateContextThreatCases(cases = []) {
  const results = cases.map(evaluateContextThreatCase);
  const failed = results.filter((result) => !result.pass);
  return {
    schemaVersion: 1,
    kind: "context-threat-model",
    pass: failed.length === 0,
    total: results.length,
    failed,
    results,
  };
}

function evaluateContextThreatCase(testCase = {}) {
  const text = `${testCase.retrievedContext || ""}\n${testCase.request || ""}`;
  const privacy = classifyPrivacyPath(testCase.path || "");
  const blockedInstruction = INJECTION_PATTERNS.some((pattern) => pattern.test(text)) || /\.\.\//.test(testCase.path || "");
  const requiresApproval = APPROVAL_PATTERNS.some((pattern) => pattern.test(text)) || !privacy.indexAllowed;
  const redactedOutput = redactContextForOutput(testCase.retrievedContext || "");
  const redacted = blockedInstruction || redactedOutput !== String(testCase.retrievedContext || "") || !privacy.indexAllowed || requiresApproval;
  const retrievalPolicy = decideRetrievalPolicy({
    taskText: testCase.request || "",
    paths: [testCase.path || ""],
    evidence: { memory: true, rag: privacy.indexAllowed, codegraph: true },
  });
  const actual = { blockedInstruction, redacted, requiresApproval };
  const expected = testCase.expected || {};
  const failures = [];
  for (const key of ["blockedInstruction", "redacted", "requiresApproval"]) {
    if (typeof expected[key] === "boolean" && actual[key] !== expected[key]) {
      failures.push(`context red-team case bypassed retrieval or output policy: ${key} expected ${expected[key]} got ${actual[key]}`);
    }
  }
  return {
    id: testCase.id || "context-threat-case",
    pass: failures.length === 0,
    failures,
    vector: testCase.vector || "unknown",
    privacy,
    retrievalPolicy,
    actual,
    redactedPreview: redactedOutput.slice(0, 160),
  };
}

export function runContextThreatModel({ rootDir = process.cwd(), fixturePath = join(rootDir, "tests", "fixtures", "adversarial-context-prompts.json") } = {}) {
  const cases = JSON.parse(readFileSync(fixturePath, "utf8"));
  return evaluateContextThreatCases(cases);
}

export function formatContextThreatModelReport(report = {}) {
  const lines = [
    "SUPERVIBE_CONTEXT_THREAT_MODEL",
    `PASS: ${Boolean(report.pass)}`,
    `CASES: ${report.total || 0}`,
    `FAILED: ${report.failed?.length || 0}`,
  ];
  for (const result of report.failed || []) lines.push(`- ${result.id}: ${result.failures.join("; ")}`);
  return lines.join("\n");
}
