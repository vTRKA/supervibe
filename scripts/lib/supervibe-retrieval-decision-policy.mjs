import { classifyPrivacyPath } from "./supervibe-privacy-policy.mjs";

export function decideRetrievalPolicy({ taskText = "", paths = [], evidence = {} } = {}) {
  const text = String(taskText).toLowerCase();
  const blocked = paths
    .map((path) => classifyPrivacyPath(path))
    .filter((entry) => !entry.indexAllowed && ["secret-like", "generated", "binary", "archive", "local-config"].includes(entry.classification));
  const required = [];
  const optional = [];
  let mode = "required";
  let skipReason = "";

  if (isTrivial(text)) {
    mode = "optional";
    skipReason = "trivial exact answer or terminal-only request";
    optional.push("memory", "rag", "codegraph");
  } else {
    if (requiresMemory(text)) required.push("memory");
    if (requiresRag(text)) required.push("rag");
    if (requiresCodegraph(text)) required.push("codegraph");
    if (required.length === 0) {
      mode = "optional";
      skipReason = "read-only or low-complexity request";
      optional.push("memory", "rag", "codegraph");
    }
  }

  const missingEvidence = required.filter((source) => !evidence[source]);
  const pass = blocked.length === 0 && missingEvidence.length === 0;
  return {
    mode,
    pass,
    required,
    optional,
    blocked,
    evidence,
    missingEvidence,
    skipReason,
    maxCalls: {
      memory: required.includes("memory") ? 2 : 1,
      rag: required.includes("rag") ? 3 : 1,
      codegraph: required.includes("codegraph") ? 2 : 1,
    },
    pipeline: {
      requiredStages: ["rewrite", "exact-symbol", "fts", "embedding", "repo-map", "graph-neighbor", "dedupe", "rerank"],
      fallbackRequired: true,
    },
  };
}

export function formatRetrievalPolicyDecision(decision) {
  const lines = [
    "SUPERVIBE_RETRIEVAL_POLICY",
    `PASS: ${decision.pass}`,
    `MODE: ${decision.mode}`,
    `REQUIRED: ${decision.required.join(", ") || "none"}`,
    `MISSING: ${decision.missingEvidence.join(", ") || "none"}`,
    `BLOCKED: ${decision.blocked.map((entry) => `${entry.path}:${entry.classification}`).join(", ") || "none"}`,
  ];
  if (decision.missingEvidence.includes("codegraph")) {
    lines.push("task policy required codegraph but no graph evidence was attached");
  }
  if (decision.skipReason) lines.push(`SKIP_REASON: ${decision.skipReason}`);
  return lines.join("\n");
}

function requiresMemory(text) {
  return /(plan|planning|architecture|decision|policy|recurring|again|history|feature|implement|bug|fix|debug)/i.test(text);
}

function requiresRag(text) {
  return /(code|implement|bug|fix|debug|feature|stack|unfamiliar|refactor|rename|api|delete|extract|move)/i.test(text);
}

function requiresCodegraph(text) {
  return /(rename|move|delete|extract|public api|caller|callee|impact|architecture review|multi-file refactor|refactor callers|dependency impact)/i.test(text);
}

function isTrivial(text) {
  return /(current time|what time|date$|show the time|echo|pwd|exact file read|format only)/i.test(text);
}
