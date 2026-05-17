const SOURCE_PRIORITY = Object.freeze({
  "exact-command": 4,
  "exact-corpus": 3,
  "intent-arbiter": 2.5,
  "semantic-intent-profile": 2,
  "keyword-rule": 1,
});

const ROUTING_SUBJECT_TERMS = Object.freeze([
  "intent", "intents", "trigger", "triggers", "router", "route", "routing", "semantic router",
  "intent system", "intent matcher", "matcher", "metcher", "classifier", "routing system",
  "plugin understands", "plugin understanding", "understand user", "understands user",
  "command", "commands", "agent routing", "agent selection", "which agent", "which command",
  "choose agent", "pick agent", "selected agent", "prompt-ai-engineer", "network-router-engineer",
  "\u0438\u043d\u0442\u0435\u043d\u0442", "\u0438\u043d\u0442\u0435\u043d\u0442\u044b", "\u0442\u0440\u0438\u0433\u0433\u0435\u0440", "\u0440\u043e\u0443\u0442\u0435\u0440", "\u0440\u043e\u0443\u0442\u0438\u043d\u0433",
  "\u0438\u043d\u0442\u0435\u043d\u0442\u0430", "\u0438\u043d\u0442\u0435\u043d\u0442\u043e\u0432", "\u0440\u043e\u0443\u0442\u0438\u043d\u0433\u0430", "\u043c\u0435\u0442\u0447\u0435\u0440", "\u043c\u0430\u0442\u0447\u0435\u0440", "\u043a\u043b\u0430\u0441\u0441\u0438\u0444\u0438\u043a\u0430\u0442\u043e\u0440",
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

const ROUTING_FAILURE_TERMS = Object.freeze([
  "wrong", "wrongly", "incorrect", "incorrectly", "misclassified", "misclassification", "misroute", "misrouted",
  "bad route", "wrong intent", "wrong command", "false positive", "false positives", "instead of", "should not route",
  "\u043e\u0448\u0438\u0431\u043e\u0447\u043d\u043e", "\u043d\u0435 \u0442\u0443\u0434\u0430", "\u043d\u0435 \u0442\u043e\u0442", "\u043d\u0435 \u0442\u0430 \u043a\u043e\u043c\u0430\u043d\u0434\u0430",
  "\u043d\u0435 \u0442\u043e\u0442 \u0438\u043d\u0442\u0435\u043d\u0442", "\u043a\u0438\u0434\u0430\u0435\u0442", "\u0437\u0430\u043a\u0438\u0434\u044b\u0432\u0430\u0435\u0442", "\u0432\u043c\u0435\u0441\u0442\u043e",
  "\u043d\u0435 \u0434\u043e\u043b\u0436\u043d\u043e", "\u043b\u043e\u0436\u043d\u043e\u0435 \u0441\u0440\u0430\u0431\u0430\u0442\u044b\u0432\u0430\u043d\u0438\u0435",
]);

const IMPLEMENTATION_TERMS = Object.freeze([
  "implement", "implementation", "build", "create", "make", "fix", "repair", "change code", "feature", "code change", "improve", "upgrade",
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
  "audit", "maturity", "score", "rate", "10/10", "coverage", "receipts", "best practices", "practices", "approaches",
  "what is broken", "what broke", "what to improve", "improve", "upgrade", "make smarter",
  "\u0430\u0443\u0434\u0438\u0442", "\u0437\u0440\u0435\u043b\u043e\u0441\u0442", "\u043e\u0446\u0435\u043d\u0438", "10 \u0438\u0437 10", "\u043f\u043e\u043a\u0440\u044b\u0442\u0438\u0435",
  "\u0447\u0442\u043e \u0441\u043b\u043e\u043c\u0430\u043d\u043e", "\u043f\u0440\u043e\u043a\u0430\u0447", "\u0443\u043b\u0443\u0447\u0448", "\u043b\u0443\u0447\u0448\u0438\u0445 \u043f\u0440\u0430\u043a\u0442\u0438\u043a", "\u043f\u043e\u0434\u0445\u043e\u0434",
]);

const RESEARCH_TERMS = Object.freeze([
  "research", "internet", "web", "online", "find solution", "solution", "external source", "official source",
  "\u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442", "\u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442\u0435", "\u043d\u0430\u0439\u0434\u0438", "\u043d\u0430\u0439\u0442\u0438", "\u0440\u0435\u0448\u0435\u043d\u0438\u0435", "\u0438\u0441\u0441\u043b\u0435\u0434",
]);

const NETWORK_OPS_TERMS = Object.freeze([
  "wifi", "wi-fi", "vpn", "firewall", "nat", "dhcp", "dns", "network stability", "network config", "internet down", "internet not working", "internet offline", "internet problem", "internet issue", "router internet", "internet router", "home router", "connection problem", "connection issue",
  "\u0432\u0430\u0439\u0444\u0430\u0439", "\u0441\u0435\u0442\u044c", "\u0441\u0435\u0442\u0438", "\u0444\u0430\u0435\u0440\u0432\u043e\u043b",
]);

const ROUTER_IMPLEMENTATION_SUPPRESSED_INTENTS = new Set([
  "agent_strengthen",
  "agent_provisioning",
  "cleanup_stale_work",
  "docs_audit",
  "memory_audit",
  "security_audit",
  "supervibe_audit",
  "workflow_chain_audit",
]);

const ROUTING_MENTION_SUPPRESSED_INTENTS = new Set([
  "cleanup_stale_work",
  "docs_audit",
  "memory_audit",
  "security_audit",
  "supervibe_audit",
  "workflow_chain_audit",
]);

export function arbitrateIntentCandidates(candidates = [], options = {}) {
  const text = normalizeArbiterText(options.text ?? options.input ?? "");
  const routeIntents = new Set(options.routeIntents || options.availableIntents || []);
  const signals = classifyIntentRequest(text);
  let scored = candidates.map((candidate) => scoreCandidate(candidate, signals, text));
  scored = injectMissingPromptEngineeringCandidate(scored, signals, routeIntents);
  scored = injectMissingNetworkOpsCandidate(scored, signals, routeIntents);
  scored = injectMissingResearchCandidate(scored, signals, routeIntents);
  scored = injectMissingAuditCandidate(scored, signals, routeIntents);
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
  const routingFailureLanguage = hasAny(text, ROUTING_FAILURE_TERMS);
  const diagnosticLanguage = hasAny(text, DIAGNOSTIC_TERMS) || routingFailureLanguage || (routeSubject && /[??]/u.test(input));
  const implementationLanguage = hasAny(text, IMPLEMENTATION_TERMS);
  const securityLanguage = hasAny(text, SECURITY_TERMS);
  const reviewLanguage = hasAny(text, REVIEW_TERMS);
  const promptLanguage = hasAny(text, PROMPT_REQUEST_TERMS);
  const promptActionLanguage = hasAny(text, PROMPT_ACTION_TERMS);
  const auditLanguage = hasAny(text, AUDIT_TERMS);
  const researchLanguage = hasAny(text, RESEARCH_TERMS);
  const strongResearchLanguage = hasStrongResearchLanguage(text);
  const networkOpsLanguage = hasAny(text, NETWORK_OPS_TERMS) || hasNetworkConnectivityIssue(text) || /\bnetwork\s+(router|wifi|vpn|stability|config)\b/u.test(text);
  const routeQualityQuestion = routeSubject && diagnosticLanguage;
  const routeDiagnosticOnlyQuestion = routeQualityQuestion && routingFailureLanguage && !implementationLanguage;
  const promptEngineeringRequest = promptLanguage && promptActionLanguage && !routeQualityQuestion;
  const routerImplementationRequest = routeSubject && implementationLanguage && !securityLanguage && !networkOpsLanguage;
  const routeResearchRequest = routeSubject && researchLanguage && strongResearchLanguage && !routeDiagnosticOnlyQuestion && !routerImplementationRequest && !securityLanguage && !networkOpsLanguage;
  const routerReviewRequest = routeSubject && reviewLanguage && !routeResearchRequest && !routerImplementationRequest && !routeQualityQuestion && !securityLanguage && !networkOpsLanguage;
  const routeAuditRequest = routeSubject && auditLanguage && !routeResearchRequest && !routeDiagnosticOnlyQuestion && !routerImplementationRequest && !routerReviewRequest && !securityLanguage && !reviewLanguage;
  const implementationRequest = implementationLanguage && !routeQualityQuestion && !securityLanguage && !reviewLanguage;

  let requestType = "task_request";
  if (securityLanguage && (implementationLanguage || auditLanguage || diagnosticLanguage || reviewLanguage)) {
    requestType = "security_request";
  } else if (routerImplementationRequest) {
    requestType = "router_implementation_request";
  } else if (routeResearchRequest) {
    requestType = "route_research_request";
  } else if (routerReviewRequest) {
    requestType = "router_review_request";
  } else if (reviewLanguage && !routeQualityQuestion) {
    requestType = "review_request";
  } else if (networkOpsLanguage) {
    requestType = "network_ops_request";
  } else if (routeAuditRequest) {
    requestType = "route_audit_request";
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
    routeAuditRequest,
    routeResearchRequest,
    routerReviewRequest,
    implementationRequest,
    routerImplementationRequest,
    securityRequest: requestType === "security_request",
    reviewRequest: requestType === "review_request",
    promptEngineeringRequest,
    auditLanguage,
    researchLanguage,
    strongResearchLanguage,
    networkOpsLanguage,
    routingFailureLanguage,
    evidence: {
      routeSubject,
      diagnosticLanguage,
      implementationLanguage,
      routerImplementationRequest,
      routingFailureLanguage,
      securityLanguage,
      reviewLanguage,
      promptLanguage,
      promptActionLanguage,
      auditLanguage,
      researchLanguage,
      strongResearchLanguage,
      networkOpsLanguage,
    },
  };
}

function scoreCandidate(candidate, signals, text) {
  const originalConfidence = numberOr(candidate.confidence, 0);
  let score = originalConfidence;
  const negativeEvidence = [...(candidate.negativeEvidence || [])];
  const arbiterEvidence = [...(candidate.arbiterEvidence || [])];

  if (signals.routerImplementationRequest || signals.routerReviewRequest) {
    if (candidate.intent === "prompt_ai_engineering") {
      score += signals.routerReviewRequest ? 0.12 : 0.16;
      arbiterEvidence.push(signals.routerReviewRequest ? "review request targets the intent/router contract" : "implementation request targets the intent/router contract");
    }
    if (ROUTER_IMPLEMENTATION_SUPPRESSED_INTENTS.has(candidate.intent)) {
      score -= 0.42;
      negativeEvidence.push("route/intent implementation request, not a domain workflow dispatch");
    }
    if (candidate.intent === "trigger_diagnostics") {
      score -= 0.04;
      negativeEvidence.push("implementation wording asks for a router fix, not diagnostics only");
    }
  }

  if (signals.networkOpsLanguage) {
    if (candidate.intent === "network_ops") {
      score += 0.18;
      arbiterEvidence.push("network/router connectivity language should prefer network diagnostics");
    } else if (candidate.intent === "trigger_diagnostics") {
      score -= 0.18;
      negativeEvidence.push("network/router connectivity wording is not a Supervibe route diagnostic");
    } else if (candidate.intent === "source_truth_research") {
      score -= 0.22;
      negativeEvidence.push("internet wording describes connectivity, not source-of-truth research");
    }
  }

  if (signals.routeQualityQuestion) {
    if (candidate.intent === "trigger_diagnostics") {
      if (!signals.routerImplementationRequest) {
        if (signals.routeAuditRequest || signals.routeResearchRequest) {
          score -= 0.1;
          negativeEvidence.push("audit/research wording asks for broader routing analysis, not diagnostics only");
        } else {
          score += 0.24;
          arbiterEvidence.push("routing/agent selection question matches trigger diagnostics");
        }
      }
    }
    if (candidate.intent === "supervibe_audit") {
      score += signals.routeAuditRequest ? 0.18 : signals.auditLanguage ? 0.08 : 0.02;
      if (!signals.auditLanguage) negativeEvidence.push("no audit/score/maturity wording; diagnostics is narrower");
    }
    if (candidate.intent === "source_truth_research" && signals.routeResearchRequest) {
      score += 0.12;
      arbiterEvidence.push("internet/source research wording targets routing source-of-truth investigation");
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
    if (signals.routingFailureLanguage && ROUTING_MENTION_SUPPRESSED_INTENTS.has(candidate.intent)) {
      score -= 0.28;
      negativeEvidence.push("candidate is mentioned as the suspected wrong route, not requested as the target workflow");
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
  if (signals.routeAuditRequest || signals.routeResearchRequest) return candidates;
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

function injectMissingAuditCandidate(candidates, signals, routeIntents) {
  if (!signals.routeAuditRequest) return candidates;
  if (!routeIntents.has("supervibe_audit")) return candidates;
  if (candidates.some((candidate) => candidate.intent === "supervibe_audit")) return candidates;
  return [
    ...candidates,
    {
      intent: "supervibe_audit",
      confidence: 0.94,
      originalConfidence: 0,
      source: "intent-arbiter",
      reason: "Intent arbiter recognized an audit request for the intent/router contract.",
      semanticEvidence: {
        matchedGroups: ["routing subject", "audit wording"],
        painMatches: [],
      },
      negativeEvidence: [],
      arbiterEvidence: ["route subject plus audit/improvement language"],
      intentArbiterRequestType: "route_audit_request",
    },
  ];
}

function injectMissingNetworkOpsCandidate(candidates, signals, routeIntents) {
  if (!signals.networkOpsLanguage) return candidates;
  if (!routeIntents.has("network_ops")) return candidates;
  if (candidates.some((candidate) => candidate.intent === "network_ops")) return candidates;
  return [
    ...candidates,
    {
      intent: "network_ops",
      confidence: 0.93,
      originalConfidence: 0,
      source: "intent-arbiter",
      reason: "Intent arbiter recognized a network/router connectivity diagnostics request.",
      semanticEvidence: {
        matchedGroups: ["network subject", "connectivity problem"],
        painMatches: [],
      },
      negativeEvidence: [],
      arbiterEvidence: ["network/router connectivity language"],
      intentArbiterRequestType: "network_ops_request",
    },
  ];
}

function injectMissingResearchCandidate(candidates, signals, routeIntents) {
  if (!signals.routeResearchRequest) return candidates;
  if (!routeIntents.has("source_truth_research")) return candidates;
  if (candidates.some((candidate) => candidate.intent === "source_truth_research")) return candidates;
  return [
    ...candidates,
    {
      intent: "source_truth_research",
      confidence: 0.94,
      originalConfidence: 0,
      source: "intent-arbiter",
      reason: "Intent arbiter recognized a source-research request for the intent/router contract.",
      semanticEvidence: {
        matchedGroups: ["routing subject", "research wording"],
        painMatches: [],
      },
      negativeEvidence: [],
      arbiterEvidence: ["route subject plus internet/source research language"],
      intentArbiterRequestType: "route_research_request",
    },
  ];
}

function injectMissingPromptEngineeringCandidate(candidates, signals, routeIntents) {
  if (!signals.routerImplementationRequest && !signals.routerReviewRequest) return candidates;
  if (!routeIntents.has("prompt_ai_engineering")) return candidates;
  if (candidates.some((candidate) => candidate.intent === "prompt_ai_engineering")) return candidates;
  return [
    ...candidates,
    {
      intent: "prompt_ai_engineering",
      confidence: signals.routerReviewRequest ? 0.93 : 0.95,
      originalConfidence: 0,
      source: "intent-arbiter",
      reason: signals.routerReviewRequest ? "Intent arbiter recognized a review request for the intent/router contract." : "Intent arbiter recognized an implementation request for the intent/router contract.",
      semanticEvidence: {
        matchedGroups: ["routing subject", signals.routerReviewRequest ? "review wording" : "implementation wording"],
        painMatches: [],
      },
      negativeEvidence: [],
      arbiterEvidence: [signals.routerReviewRequest ? "route subject plus review language" : "route subject plus implementation language"],
      intentArbiterRequestType: signals.routerReviewRequest ? "router_review_request" : "router_implementation_request",
    },
  ];
}

function detectAmbiguity(candidates, signals, routeIntents) {
  if (!routeIntents.has("trigger_diagnostics")) return { guardApplied: false };
  if (signals.implementationRequest || signals.routerImplementationRequest || signals.routerReviewRequest || signals.routeAuditRequest || signals.routeResearchRequest || signals.networkOpsLanguage || signals.securityRequest || signals.promptEngineeringRequest) return { guardApplied: false };
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

function hasStrongResearchLanguage(text) {
  return hasAny(text, [
    "research", "find", "find solution", "solution", "source", "source of truth", "official source",
    "best practices", "practices", "approaches", "web", "online",
    "\u043d\u0430\u0439\u0434\u0438", "\u043d\u0430\u0439\u0442\u0438", "\u0440\u0435\u0448\u0435\u043d\u0438\u0435", "\u0438\u0441\u0441\u043b\u0435\u0434",
    "\u043b\u0443\u0447\u0448\u0438\u0445 \u043f\u0440\u0430\u043a\u0442\u0438\u043a", "\u043f\u043e\u0434\u0445\u043e\u0434",
  ]);
}

function hasNetworkConnectivityIssue(text) {
  if (hasAny(text, ["intent", "command", "agent", "trigger", "supervibe", "picked", "selected", "wrong command", "agent selection"])) return false;
  const networkSubject = hasAny(text, ["internet", "router", "home router", "vpn", "wifi", "wi-fi", "connection", "connectivity"]);
  const networkProblem = hasAny(text, ["not working", "down", "offline", "drops", "drop", "problem", "issue", "unstable", "diagnose", "diagnostic", "diagnostics"]);
  return networkSubject && networkProblem;
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
