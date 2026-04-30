import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";

export const DEFAULT_BENCHMARK_CORPUS_PATH = "docs/audits/autonomous-loop-evals/benchmark-corpus.json";
export const DEFAULT_GOLDEN_OUTCOMES_PATH = "docs/audits/autonomous-loop-evals/golden-outcomes.json";

export const REQUIRED_BENCHMARK_CASES = Object.freeze([
  "plan-execution",
  "brainstorm-to-plan",
  "plan-review-loop",
  "atomization",
  "worktree-run",
  "blocked-credentials",
  "flaky-tests",
  "ui-verification",
  "integration-repair",
  "refactor",
  "docs-only-change",
  "release-prep",
  "policy-stop",
  "resume-after-compaction",
]);

export async function loadBenchmarkCorpus(path = DEFAULT_BENCHMARK_CORPUS_PATH, { rootDir = process.cwd() } = {}) {
  return validateBenchmarkCorpus(JSON.parse(await readFile(join(rootDir, path), "utf8")));
}

export async function loadGoldenOutcomes(path = DEFAULT_GOLDEN_OUTCOMES_PATH, { rootDir = process.cwd() } = {}) {
  return validateGoldenOutcomes(JSON.parse(await readFile(join(rootDir, path), "utf8")));
}

export function validateBenchmarkCorpus(corpus = {}) {
  const issues = [];
  if (corpus.schemaVersion !== 1) issues.push({ code: "schema-version", message: "schemaVersion must be 1" });
  if (!Array.isArray(corpus.cases)) issues.push({ code: "cases-required", message: "cases must be an array" });
  const ids = new Set((corpus.cases || []).map((entry) => entry.id));
  for (const required of REQUIRED_BENCHMARK_CASES) {
    if (!ids.has(required)) issues.push({ code: "missing-case", caseId: required });
  }
  for (const entry of corpus.cases || []) {
    if (!entry.id || !entry.inputArtifacts?.state || !entry.expected) issues.push({ code: "invalid-case", caseId: entry.id || "unknown" });
    const serialized = JSON.stringify(entry);
    if (/password|api[_-]?key|secret-value|sk-[a-z0-9]/i.test(serialized)) issues.push({ code: "credential-like-fixture", caseId: entry.id });
    if (/dangerously-skip-permissions|bypassPermissions|--all-tools/i.test(serialized)) issues.push({ code: "provider-bypass-fixture", caseId: entry.id });
    if (/production mutation|live remote/i.test(serialized)) issues.push({ code: "live-production-fixture", caseId: entry.id });
  }
  return { ...corpus, valid: issues.length === 0, issues };
}

export function validateGoldenOutcomes(golden = {}) {
  const issues = [];
  if (golden.schemaVersion !== 1) issues.push({ code: "schema-version", message: "schemaVersion must be 1" });
  for (const caseId of REQUIRED_BENCHMARK_CASES) {
    if (!golden.outcomes?.[caseId]) issues.push({ code: "missing-golden", caseId });
  }
  return { ...golden, valid: issues.length === 0, issues };
}

export function filterBenchmarkCases(corpus = {}, { caseId = null } = {}) {
  const cases = corpus.cases || [];
  return caseId ? cases.filter((entry) => entry.id === caseId) : cases;
}

export function redactBenchmarkArtifact(value = "") {
  return redactSensitiveContent(String(value))
    .replace(/[A-Z]:\\Users\\[^\\\n"]+/g, "[USER_PATH]")
    .replace(/[A-Z]:\\\\Users\\\\[^"\n]+/g, "[USER_PATH]")
    .replace(/("?(?:token|password|secret|apiKey)"?\s*:\s*")([^"]+)(")/gi, "$1[REDACTED]$3")
    .replace(/\b(?:token|password|secret|apiKey)=\S+/gi, "[REDACTED]");
}
