const SOURCE_PRIORITY = Object.freeze({
  "exact-command": 4,
  "exact-corpus": 3,
  "intent-arbiter": 2.5,
  "semantic-intent-profile": 2,
  "keyword-rule": 1,
});

const ROUTING_SUBJECT_TERMS = Object.freeze([
  "intent", "intents", "trigger", "triggers", "router", "route", "routing", "semantic router",
  "command", "commands", "agent routing", "agent selection", "which agent", "which command",
  "choose agent", "pick agent", "selected agent", "prompt-ai-engineer", "network-router-engineer",
  "\u0438\u043d\u0442\u0435\u043d\u0442", "\u0438\u043d\u0442\u0435\u043d\u0442\u044b", "\u0442\u0440\u0438\u0433\u0433\u0435\u0440", "\u0440\u043e\u0443\u0442\u0435\u0440", "\u0440\u043e\u0443\u0442\u0438\u043d\u0433",
  "\u043c\u0430\u0440\u0448\u0440\u0443\u0442", "\u043a\u043e\u043c\u0430\u043d\u0434\u0430", "\u043a\u043e\u043c\u0430\u043d\u0434\u0443", "\u0430\u0433\u0435\u043d\u0442", "\u0430\u0433\u0435\u043d\u0442\u0430", "\u0430\u0433\u0435\u043d\u0442\u043e\u0432",
  "\u043a\u0430\u043a\u043e\u0433\u043e \u0430\u0433\u0435\u043d\u0442\u0430", "\u043a\u0430\u043a\u0443\u044e \u043a\u043e\u043c\u0430\u043d\u0434\u0443", "\u0432\u044b\u0431\u043e\u0440 \u0430\u0433\u0435\u043d\u0442\u0430", "\u0432\u044b\u0431\u043e\u0440 \u043a\u043e\u043c\u0430\u043d\u0434",
]);

const DIAGNOSTIC_TERMS = Object.freeze([
  "why", "why did", "why would", "how did", "how well", "explain", "diagnose", "diagnostic",
  "what does", "inspect", "check", "would route", "would pick", "choose", "picked", "selected", "misroute", "wrong route",
  "fewer misses", "reduce misses", "less misses", "false positive", "false positives", "tiny question",
  "without calling agents", "do not call agents", "not call agents", "good at", "quality of routing",
  "\u043f\u043e\u0447\u0435\u043c\u0443", "\u0437\u0430\u0447\u0435\u043c", "\u043e\u0431\u044a\u044f\u0441\u043d\u0438", "\u0434\u0438\u0430\u0433\u043d\u043e\u0441\u0442", "\u043f\u0440\u043e\u0432\u0435\u0440\u044c",
  "\u0445\u043e\u0440\u043e\u0448\u043e \u043b\u0438", "\u043f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u043e \u043b\u0438", "\u043a\u0430\u043a \u0432\u044b\u0431\u0440\u0430\u043b", "\u043f\u043e\u0447\u0435\u043c\u0443 \u0432\u044b\u0431\u0440\u0430\u043b",
  "\u043c\u0435\u043d\u044c\u0448\u0435 \u043f\u0440\u043e\u043c\u0430\u0445\u043e\u0432", "\u043f\u0440\u043e\u043c\u0430\u0445", "\u043d\u0435 \u0442\u0443\u0434\u0430", "\u043a\u0430\u043a \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u044f\u0435\u0442",
  "\u0443\u043c\u043d\u0430\u044f \u0438\u043d\u0442\u0435\u043d\u0442 \u0441\u0438\u0441\u0442\u0435\u043c\u0430", "\u0443\u043c\u043d\u0443\u044e \u0438\u043d\u0442\u0435\u043d\u0442 \u0441\u0438\u0441\u0442\u0435\u043c\u0443",
]);

const IMPLEMENTATION_TERMS = Object.freeze([
  "implement", "build", "create", "make", "fix", "repair", "change code", "feature", "code change",
  "\u0441\u0434\u0435\u043b\u0430\u0439", "\u0441\u0434\u0435\u043b\u0430\u0442\u044c", "\u0440\u0435\u0430\u043b\u0438\u0437\u0443\u0439", "\u0440\u0435\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u0442\u044c", "\u0438\u0441\u043f\u0440\u0430\u0432\u044c", "\u0444\u0438\u0447\u0443", "\u043a\u043e\u0434",
]);

const SECURITY_TERMS = Object.freeze([
  "security", "vulnerability", "vulnerabilities", "secret", "secrets", "appsec", "owasp", "cve",
  "\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442", "\u0443\u044f\u0437\u0432\u0438\u043c\u043e\u0441\u0442", "\u0441\u0435\u043a\u0440\u0435\u0442", "\u0441\u0435\u043a\u044c\u044e\u0440\u0438\u0442\u0438",
]);

const REVIEW_TERMS = Object.freeze([
  "review", "code review", "pr review", "reviewer", "pre-merge",
  "\u043e\u0442\u0440\u0435\u0432\u044c\u044e\u0439", "\u0440\u0435\u0432\u044c\u044e", "\u0440\u0435\u0432\u044c\u044e\u0435\u0440", "\u043f\u0435\u0440\u0435\u0434 \u043c\u0435\u0440\u0434\u0436",
]);

const PROMPT_REQUEST_TERMS = Object.freeze([
  "prompt", "prompts", "system prompt", "agent prompt", "instructions", "eval", "evals", "red-team",
  "structured output", "tool policy", "injection", "\u043f\u0440\u043e\u043c\u043f\u0442", "\u043f\u0440\u043e\u043c\u043f\u0442\u044b", "\u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438",
]);

const PROMPT_ACTION_TERMS = Object.freeze([
  "strengthen", "harden", "improve", "review", "debug", "red-team", "evaluate",
  "\u0443\u0441\u0438\u043b\u044c", "\u0443\u043b\u0443\u0447\u0448\u0438", "\u043f\u0440\u043e\u0432\u0435\u0440\u044c", "\u043e\u0446\u0435\u043d\u0438",
]);

const AUDIT_TERMS = Object.freeze([
  "audit", "maturity", "score", "rate", "10/10", "coverage", "receipts",
  "\u0430\u0443\u0434\u0438\u0442", "\u0437\u0440\u0435\u043b\u043e\u0441\u0442", "\u043e\u0446\u0435\u043d\u0438", "10 \u0438\u0437 10", "\u043f\u043e\u043a\u0440\u044b\u0442\u0438\u0435",
]);

const NETWORK_OPS_TERMS = Object.freeze([
  "wifi", "wi-fi", "vpn", "firewall", "nat", "dhcp", "dns", "network stability", "network config",
  "\u0432\u0430\u0439\u0444\u0430\u0439", "\u0441\u0435\u0442\u044c", "\u0441\u0435\u0442\u0438", "\u0444\u0430\u0435\u0440\u0432\u043e\u043b", "\u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442",
]);

export function arbitrateIntentCandidates(candidates = [], options = {}) {
  const text = normalizeArbiterText(options.text ?? options.input ?? "");
  const routeIntents = new Set(options.routeIntents || options.availableIntents || []);
  const signals = classifyIntentRequest(text);
  let scored = candidates.map((candidate) => scoreCandidate(candidate, signals, text));
  scored = injectMissingDiagnosticCandidate(scored, signals, routeIntents);
  scored.sort(compareCandidates);

  const ambiguity = detectAmbiguity(scored, signals, routeIntents);
  if (ambiguity.guardApplied) {
    scored = [
      buildDiagnosticCandidate({
        confidence: ambiguity.confidence,
        reason: "Intent arbiter ambiguity guard selected diagnostics before dispatch.",
        arbiterEvidence: ["top candidates were too close for a dispatch route"],
      }),
      ...scored.filter((candidate) => candidate.intent !== "trigger_diagnostics"),
    ];
  }

  const selected = scored[0] || null;
  return {
    selected,
    candidates: scored,
    intentArbiter: {
      requestType: signals.requestType,
      signals: signals.evidence,
      selectedIntent: selected?.intent || null,
      ambiguity,
      topCandidates: scored.slice(0, 3).map((candidate) => ({
        intent: candidate.intent,
        confidence: candidate.confidence,
        originalConfidence: candidate.originalConfidence ?? candidate.confidence,
        source: candidate.source,
        negativeEvidence: candidate.negativeEvidence || [],
        arbiterEvidence: candidate.arbiterEvidence || [],
      })),
    },
  };
}

export function classifyIntentRequest(input = "") {
  const text = normalizeArbiterText(input);
  const routeSubject = hasAny(text, ROUTING_SUBJECT_TERMS);
  const diagnosticLanguage = hasAny(text, DIAGNOSTIC_TERMS) || (routeSubject && /[??]/u.test(input));
  const implementationLanguage = hasAny(text, IMPLEMENTATION_TERMS);
  const securityLanguage = hasAny(text, SECURITY_TERMS);
  const reviewLanguage = hasAny(text, REVIEW_TERMS);
  const promptLanguage = hasAny(text, PROMPT_REQUEST_TERMS);
  const promptActionLanguage = hasAny(text, PROMPT_ACTION_TERMS);
  const auditLanguage = hasAny(text, AUDIT_TERMS);
  const networkOpsLanguage = hasAny(text, NETWORK_OPS_TERMS) || /\bnetwork\s+(router|wifi|vpn|stability|config)\b/u.test(text);
  const routeQualityQuestion = routeSubject && diagnosticLanguage;
  const promptEngineeringRequest = promptLanguage && promptActionLanguage && !routeQualityQuestion;
  const implementationRequest = implementationLanguage && !routeQualityQuestion && !securityLanguage && !reviewLanguage;

  let requestType = "task_request";
  if (securityLanguage && (implementationLanguage || auditLanguage || diagnosticLanguage || reviewLanguage)) {
    requestType = "security_request";
  } else if (reviewLanguage && !routeQualityQuestion) {
    requestType = "review_request";
  } else if (routeQualityQuestion) {
    requestType = "route_diagnostic_question";
  } else if (promptEngineeringRequest) {
    requestType = "prompt_engineering_request";
  } else if (implementationRequest) {
    requestType = "implementation_request";
  }

  return {
    requestType,
    routeSubject,
    routeQualityQuestion,
    implementationRequest,
    securityRequest: requestType === "security_request",
    reviewRequest: requestType === "review_request",
    promptEngineeringRequest,
    auditLanguage,
    networkOpsLanguage,
    evidence: {
      routeSubject,
      diagnosticLanguage,
      implementationLanguage,
      securityLanguage,
      reviewLanguage,
      promptLanguage,
      promptActionLanguage,
      auditLanguage,
      networkOpsLanguage,
    },
  };
}

function scoreCandidate(candidate, signals, text) {
  const originalConfidence = numberOr(candidate.confidence, 0);
  let score = originalConfidence;
  const negativeEvidence = [...(candidate.negativeEvidence || [])];
  const arbiterEvidence = [...(candidate.arbiterEvidence || [])];

  if (signals.routeQualityQuestion) {
    if (candidate.intent === "trigger_diagnostics") {
      score += 0.24;
      arbiterEvidence.push("routing/agent selection question matches trigger diagnostics");
    }
    if (candidate.intent === "supervibe_audit") {
      score += signals.auditLanguage ? 0.08 : 0.02;
      if (!signals.auditLanguage) negativeEvidence.push("no audit/score/maturity wording; diagnostics is narrower");
    }
    if (candidate.intent === "prompt_ai_engineering") {
      score -= 0.32;
      negativeEvidence.push("routing quality question, not a prompt engineering task");
      if (hasAny(text, ["prompt-ai-engineer", "prompt ai engineer"])) {
        negativeEvidence.push("prompt-ai-engineer is mentioned as routing evidence, not requested as worker");
      }
    }
    if (candidate.intent === "agent_strengthen") {
      score -= 0.14;
      negativeEvidence.push("question is about route choice, not strengthening agent artifacts");
    }
  }

  if (candidate.intent === "network_ops" && signals.routeSubject && !signals.networkOpsLanguage) {
    score -= 0.28;
    negativeEvidence.push("routing words are about Supervibe command/agent routing, not network equipment");
  }

  if (signals.securityRequest) {
    if (candidate.intent === "security_audit") {
      score += 0.16;
      arbiterEvidence.push("security/vulnerability language should prefer security audit");
    } else if (candidate.intent === "prompt_ai_engineering" || candidate.intent === "trigger_diagnostics") {
      score -= 0.12;
      negativeEvidence.push("security request should not be handled as prompt or trigger diagnostics");
    }
  }

  if (signals.promptEngineeringRequest && candidate.intent === "prompt_ai_engineering") {
    score += 0.08;
    arbiterEvidence.push("explicit prompt/eval/instruction improvement request");
  }

  if (signals.implementationRequest && candidate.intent === "trigger_diagnostics") {
    score -= 0.08;
    negativeEvidence.push("implementation wording asks for worker/system change, not diagnostics only");
  }

  const confidence = clampConfidence(score);
  const reason = negativeEvidence.length || arbiterEvidence.length
    ? appendReason(candidate.reason, confidence, originalConfidence)
    : candidate.reason;

  return {
    ...candidate,
    originalConfidence,
    confidence,
    reason,
    negativeEvidence,
    arbiterEvidence,
    intentArbiterRequestType: signals.requestType,
  };
}

function injectMissingDiagnosticCandidate(candidates, signals, routeIntents) {
  if (!signals.routeQualityQuestion) return candidates;
  if (!routeIntents.has("trigger_diagnostics")) return candidates;
  if (candidates.some((candidate) => candidate.intent === "trigger_diagnostics")) return candidates;
  return [
    ...candidates,
    buildDiagnosticCandidate({
      confidence: signals.auditLanguage ? 0.91 : 0.93,
      reason: "Intent arbiter recognized a routing/agent selection diagnostic question.",
      arbiterEvidence: ["route subject plus diagnostic/quality language"],
    }),
  ];
}

function detectAmbiguity(candidates, signals, routeIntents) {
  if (!routeIntents.has("trigger_diagnostics")) return { guardApplied: false };
  if (signals.implementationRequest || signals.securityRequest || signals.promptEngineeringRequest) return { guardApplied: false };
  const [first, second] = candidates;
  if (!first || !second) return { guardApplied: false };
  if (first.intent === "trigger_diagnostics") return { guardApplied: false };
  const margin = Number((first.confidence - second.confidence).toFixed(3));
  const guardApplied = signals.routeSubject && margin <= 0.03;
  return guardApplied
    ? { guardApplied, margin, confidence: Math.max(0.88, Math.min(0.92, first.confidence)), competingIntents: [first.intent, second.intent] }
    : { guardApplied: false, margin, competingIntents: [first.intent, second.intent] };
}

function buildDiagnosticCandidate({ confidence = 0.9, reason, arbiterEvidence = [] } = {}) {
  return {
    intent: "trigger_diagnostics",
    confidence,
    originalConfidence: 0,
    source: "intent-arbiter",
    reason,
    semanticEvidence: {
      matchedGroups: ["routing subject", "diagnostic wording"],
      painMatches: [],
    },
    negativeEvidence: [],
    arbiterEvidence,
    intentArbiterRequestType: "route_diagnostic_question",
  };
}

function appendReason(reason, confidence, originalConfidence) {
  const suffix = "Intent arbiter reranked confidence " + originalConfidence.toFixed(2) + " -> " + confidence.toFixed(2) + ".";
  return reason ? reason + "; " + suffix : suffix;
}

function normalizeArbiterText(input = "") {
  return String(input)
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}+#./?\-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text, phrases) {
  return phrases.some((phrase) => includesPhrase(text, phrase));
}

function includesPhrase(text, phrase) {
  const normalized = normalizeArbiterText(phrase);
  if (!normalized) return false;
  if (normalized.length <= 3) {
    return new RegExp("(^| )" + escapeRegExp(normalized) + "( |$)", "u").test(text);
  }
  return text.includes(normalized);
}

function compareCandidates(a, b) {
  return b.confidence - a.confidence
    || sourcePriority(b.source) - sourcePriority(a.source)
    || String(a.intent).localeCompare(String(b.intent));
}

function sourcePriority(source) {
  return SOURCE_PRIORITY[source] || 0;
}

function numberOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clampConfidence(value) {
  return Number(Math.max(0, Math.min(0.99, value)).toFixed(2));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
}
