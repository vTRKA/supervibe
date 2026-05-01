export const WORK_ITEM_TEMPLATE_IDS = Object.freeze([
  "feature",
  "bugfix",
  "refactor",
  "ui-story",
  "integration",
  "migration",
  "documentation",
  "release-prep",
  "production-prep",
  "research-spike",
]);

export const GUIDED_FORM_TEMPLATE_MAP = Object.freeze({
  epic: "feature",
  task: "feature",
  bug: "bugfix",
  integration: "integration",
  "ui-story": "ui-story",
  "review-request": "documentation",
  blocker: "integration",
  "research-spike": "research-spike",
  "release-prep": "release-prep",
  "production-prep": "production-prep",
});

const TEMPLATE_CATALOG = {
  feature: template({
    id: "feature",
    label: "Feature",
    match: [/feature|implementation|build|add|create/i],
    taskTypes: ["task", "review"],
    acceptanceCriteria: [
      "User outcome, scope boundary, and non-goals are explicit",
      "Feature behavior is implemented with success, edge, and error states covered",
      "Interface/data contracts are documented or encoded in tests",
      "10/10 acceptance evidence is attached before completion",
    ],
    verificationHints: ["focused tests", "contract or integration test", "regression check"],
    labels: ["feature"],
    riskLevel: "low",
    requiredGates: ["review", "10/10-acceptance"],
    sdlcCoverage: ["discovery", "implementation", "verification", "release-readiness"],
    contractChecklist: [
      "User-facing goal and acceptance contract",
      "Input/output, API, data, or UI state contract",
      "Owner, rollout, and support expectation",
    ],
    productionReadinessChecklist: [
      "Security/privacy impact is considered",
      "Observability or user-visible failure evidence is defined",
      "Rollback, disable, or recovery path is named",
    ],
    tenOfTenChecklist: [
      "No known acceptance gaps",
      "Verification commands pass or blockers are explicit",
      "Release readiness is clear for the intended SDLC stage",
    ],
  }),
  bugfix: template({
    id: "bugfix",
    label: "Bugfix",
    match: [/bug|fix|repair|regression|defect/i],
    taskTypes: ["bug", "review"],
    acceptanceCriteria: [
      "Failure mode, user impact, and affected contract are described",
      "Bug is reproduced or described and fixed",
      "Regression coverage proves the issue does not return",
      "10/10 fix evidence includes root-cause and blast-radius notes",
    ],
    verificationHints: ["failing regression test", "focused fix verification", "blast-radius check"],
    labels: ["bugfix"],
    riskLevel: "medium",
    requiredGates: ["regression-review", "10/10-acceptance"],
    sdlcCoverage: ["triage", "root-cause", "fix", "regression-release"],
    contractChecklist: [
      "Broken behavior contract",
      "Expected behavior contract",
      "Regression prevention contract",
    ],
    productionReadinessChecklist: [
      "Customer/user impact is bounded",
      "Monitoring or detection signal is checked where relevant",
      "Rollback or mitigation is documented for risky fixes",
    ],
    tenOfTenChecklist: [
      "Root cause is credible",
      "Regression check is present",
      "No adjacent behavior is unintentionally changed",
    ],
  }),
  refactor: template({
    id: "refactor",
    label: "Refactor",
    match: [/refactor|cleanup|restructure|extract|rename/i],
    taskTypes: ["task", "review"],
    acceptanceCriteria: [
      "Behavior is preserved after refactor",
      "Public contracts and compatibility boundaries are unchanged or migrated",
      "Blast radius is reviewed with callers/usages",
      "10/10 completion has before/after verification evidence",
    ],
    verificationHints: ["focused tests", "contract compatibility check", "blast-radius evidence"],
    labels: ["refactor"],
    riskLevel: "medium",
    requiredGates: ["codegraph-review", "10/10-acceptance"],
    sdlcCoverage: ["design", "migration", "verification", "release-readiness"],
    contractChecklist: [
      "Preserved external behavior",
      "Updated internal module contract",
      "Migration or compatibility boundary",
    ],
    productionReadinessChecklist: [
      "Rollback path or revert scope is simple",
      "Performance and dependency impact are checked where relevant",
      "No hidden production configuration drift",
    ],
    tenOfTenChecklist: [
      "Callers/usages are accounted for",
      "Tests cover behavior, not only structure",
      "Unrelated churn is avoided",
    ],
  }),
  "ui-story": template({
    id: "ui-story",
    label: "UI Story",
    match: [/ui|frontend|browser|screen|component|figma|visual/i],
    taskTypes: ["task", "review"],
    acceptanceCriteria: [
      "User workflow, empty/loading/error states, and accessibility contract are defined",
      "UI behavior is implemented with visual verification",
      "Responsive desktop/mobile layout has evidence",
      "10/10 completion includes no overlap, clipping, or broken interaction states",
    ],
    verificationHints: ["browser or preview evidence", "responsive screenshot", "accessibility/state check"],
    labels: ["ui", "visual-verification"],
    riskLevel: "medium",
    requiredGates: ["browser-evidence", "10/10-acceptance"],
    sdlcCoverage: ["ux-design", "implementation", "visual-qa", "release-readiness"],
    contractChecklist: [
      "User workflow contract",
      "State model contract",
      "Accessibility and responsive behavior contract",
    ],
    productionReadinessChecklist: [
      "Browser/device coverage is named",
      "Error and disabled states are visible",
      "Telemetry or user feedback path is considered where relevant",
    ],
    tenOfTenChecklist: [
      "Visual evidence matches acceptance",
      "Text fits every checked viewport",
      "Critical interactions are verified",
    ],
  }),
  integration: template({
    id: "integration",
    label: "Integration",
    match: [/integration|api|mcp|webhook|provider|external|sync/i],
    taskTypes: ["task", "gate", "review"],
    acceptanceCriteria: [
      "Provider/API contract, auth, retries, and failure envelope are explicit",
      "Integration behavior is verified or blocked by explicit access gate",
      "Secrets, rate limits, and sandbox/production split are accounted for",
      "10/10 completion includes degradation and recovery evidence",
    ],
    verificationHints: ["integration check", "contract test", "environment/access evidence"],
    labels: ["integration"],
    riskLevel: "medium",
    requiredGates: ["access-gate", "10/10-acceptance"],
    sdlcCoverage: ["contract-design", "implementation", "integration-test", "release-readiness"],
    contractChecklist: [
      "External API/provider contract",
      "Auth and secret handling contract",
      "Retry, timeout, and partial-failure contract",
    ],
    productionReadinessChecklist: [
      "Rate limits and quotas are considered",
      "Observability for failures is defined",
      "Fallback or rollback path is named",
    ],
    tenOfTenChecklist: [
      "Happy and failure paths are verified",
      "Access blockers are explicit",
      "Production credentials are not required for unsafe tests",
    ],
  }),
  migration: template({
    id: "migration",
    label: "Migration",
    match: [/migration|schema|data change|backfill/i],
    taskTypes: ["task", "gate", "review"],
    acceptanceCriteria: [
      "Data/schema contract, affected records, and compatibility window are explicit",
      "Migration has rollback or cleanup path",
      "Dry-run, idempotency, and post-migration validation are defined",
      "10/10 completion includes no-open-blockers release evidence",
    ],
    verificationHints: ["migration dry run", "idempotency check", "rollback evidence"],
    labels: ["migration"],
    riskLevel: "high",
    requiredGates: ["approval", "rollback-review", "production-readiness", "10/10-acceptance"],
    sdlcCoverage: ["planning", "dry-run", "execution", "post-release-validation"],
    contractChecklist: [
      "Schema/data contract",
      "Backward/forward compatibility contract",
      "Rollback and cleanup contract",
    ],
    productionReadinessChecklist: [
      "Backup or restore point is explicit",
      "Operational owner and timing window are clear",
      "Post-migration monitoring and validation are defined",
    ],
    tenOfTenChecklist: [
      "Dry-run evidence exists",
      "Rollback path is credible",
      "No unowned production risk remains",
    ],
  }),
  documentation: template({
    id: "documentation",
    label: "Documentation",
    match: [/doc|readme|changelog|guide|manual/i],
    taskTypes: ["chore", "review"],
    acceptanceCriteria: [
      "Audience, goal, and decision/action contract are explicit",
      "Documentation matches implemented behavior",
      "Examples, commands, and caveats are verified",
      "10/10 completion leaves no stale or misleading guidance",
    ],
    verificationHints: ["docs validation", "example command check", "stale-reference scan"],
    labels: ["documentation"],
    riskLevel: "low",
    requiredGates: ["docs-review", "10/10-acceptance"],
    sdlcCoverage: ["knowledge-capture", "implementation-support", "release-readiness"],
    contractChecklist: [
      "Reader outcome contract",
      "Source-of-truth alignment contract",
      "Examples and commands contract",
    ],
    productionReadinessChecklist: [
      "Release notes or operational docs are updated when relevant",
      "Security/privacy caveats are explicit where relevant",
      "No private paths, secrets, or stale references remain",
    ],
    tenOfTenChecklist: [
      "Docs match behavior",
      "Validation commands or reviewed examples are present",
      "Next action is unambiguous",
    ],
  }),
  "release-prep": template({
    id: "release-prep",
    label: "Release Prep",
    match: [/release|package|version|publish|provenance/i],
    taskTypes: ["chore", "gate", "review"],
    acceptanceCriteria: [
      "Release scope, version, changelog, and artifact contract are synchronized",
      "Release evidence is complete and version metadata is synchronized",
      "Security/provenance/audit gates pass or blockers are explicit",
      "10/10 completion has no open release blockers",
    ],
    verificationHints: ["release gate", "package audit", "provenance/security check"],
    labels: ["release"],
    riskLevel: "medium",
    requiredGates: ["release-gate", "10/10-acceptance"],
    sdlcCoverage: ["release-candidate", "verification", "packaging", "launch"],
    contractChecklist: [
      "Version and changelog contract",
      "Artifact contents contract",
      "Rollback/withdrawal contract",
    ],
    productionReadinessChecklist: [
      "Package audit passes",
      "Release notes and compatibility notes are ready",
      "Rollback or hotfix path is clear",
    ],
    tenOfTenChecklist: [
      "All release checks pass",
      "Artifacts contain only intended files",
      "No known blocker remains",
    ],
  }),
  "production-prep": template({
    id: "production-prep",
    label: "Production Prep",
    match: [/production|deploy|rollback|dns|billing|credential|account/i],
    taskTypes: ["gate", "review"],
    acceptanceCriteria: [
      "Production goal, blast radius, operator, and approval contract are explicit",
      "Production mutation remains blocked without exact approval",
      "Observability, rollback, incident response, and support paths are ready",
      "10/10 completion requires no open production blockers",
    ],
    verificationHints: ["production readiness evidence", "approval boundary", "rollback rehearsal or documented proof"],
    labels: ["production-prep", "approval-required"],
    riskLevel: "high",
    requiredGates: ["human-approval", "production-readiness", "10/10-acceptance"],
    sdlcCoverage: ["go-live-planning", "approval", "deployment-readiness", "post-launch-validation"],
    contractChecklist: [
      "Exact production mutation contract",
      "Approval and operator contract",
      "Incident response and support contract",
    ],
    productionReadinessChecklist: [
      "Observability, alerts, and success metrics are defined",
      "Rollback/disable path is rehearsed or documented",
      "Credentials, billing, DNS, and data risks are explicitly reviewed",
    ],
    tenOfTenChecklist: [
      "Human approval boundary is intact",
      "No production blocker remains",
      "Post-launch validation owner is assigned",
    ],
  }),
  "research-spike": template({
    id: "research-spike",
    label: "Research Spike",
    match: [/research|investigate|spike|evaluate|compare/i],
    taskTypes: ["task", "chore"],
    acceptanceCriteria: [
      "Question, decision criteria, alternatives, and evidence contract are explicit",
      "Research output has decision, evidence, and next action",
      "MVP/production impact and follow-up implementation path are stated",
      "10/10 completion distinguishes facts, assumptions, and unknowns",
    ],
    verificationHints: ["source/evidence summary", "alternative comparison", "implementation handoff check"],
    labels: ["research"],
    riskLevel: "low",
    requiredGates: ["decision-review", "10/10-acceptance"],
    sdlcCoverage: ["discovery", "decision", "planning-handoff"],
    contractChecklist: [
      "Research question contract",
      "Decision criteria contract",
      "Handoff/action contract",
    ],
    productionReadinessChecklist: [
      "Production constraints are called out",
      "Risks and open questions are explicit",
      "Recommended path includes verification needs",
    ],
    tenOfTenChecklist: [
      "Evidence supports the decision",
      "Alternatives are fairly compared",
      "Next implementation step is actionable",
    ],
  }),
};

const DEFAULT_SCOPE_SAFETY_CHECKLIST = Object.freeze([
  "Task maps to approved scope or explicit scope-change approval",
  "Optional extras are deferred or rejected with rationale",
  "Accepted scope growth has tradeoff, owner, verification, rollout, and rollback",
]);

export function listWorkItemTemplates() {
  return WORK_ITEM_TEMPLATE_IDS.map((id) => TEMPLATE_CATALOG[id]);
}

export function getWorkItemTemplate(id = "feature") {
  return TEMPLATE_CATALOG[id] || TEMPLATE_CATALOG.feature;
}

export function getTemplateForGuidedForm(formType = "task") {
  return getWorkItemTemplate(GUIDED_FORM_TEMPLATE_MAP[formType] || formType || "feature");
}

export function inferWorkItemTemplate(input = {}) {
  const text = [
    input.title,
    input.goal,
    input.type,
    input.planText,
    ...(input.labels || []),
    ...(input.writeScope || []).map((entry) => entry.path || entry),
  ].join(" ");
  const candidates = listWorkItemTemplates().filter((candidate) => candidate.id !== "feature");
  const match = candidates.find((candidate) => candidate.match.some((pattern) => pattern.test(text)));
  return match || TEMPLATE_CATALOG.feature;
}

export function applyTemplateToWorkItem(item = {}, templateOrId = null, overrides = {}) {
  const selected = typeof templateOrId === "string"
    ? getWorkItemTemplate(templateOrId)
    : templateOrId || inferWorkItemTemplate(item);
  return {
    ...item,
    templateId: selected.id,
    labels: unique([...(item.labels || []), ...selected.labels, ...(overrides.labels || [])]),
    severity: overrides.severity || item.severity || severityForRisk(selected.riskLevel),
    owner: overrides.owner || item.owner || null,
    component: overrides.component || item.component || inferComponent(item),
    stack: overrides.stack || item.stack || inferStack(item),
    repo: overrides.repo || item.repo || item.executionHints?.repo || null,
    package: overrides.package || item.package || item.executionHints?.package || null,
    workspace: overrides.workspace || item.workspace || item.executionHints?.workspace || null,
    subproject: overrides.subproject || item.subproject || item.executionHints?.subproject || null,
    requiredGates: unique([...(item.requiredGates || []), ...selected.requiredGates]),
    verificationHints: unique([...(item.verificationHints || []), ...selected.verificationHints]),
    acceptanceCriteria: unique([...(item.acceptanceCriteria || []), ...selected.acceptanceCriteria]),
    contractChecklist: unique([...(item.contractChecklist || []), ...(selected.contractChecklist || []), ...(overrides.contractChecklist || [])]),
    scopeSafetyChecklist: unique([...(item.scopeSafetyChecklist || []), ...DEFAULT_SCOPE_SAFETY_CHECKLIST, ...(overrides.scopeSafetyChecklist || [])]),
    productionReadinessChecklist: unique([
      ...(item.productionReadinessChecklist || []),
      ...(selected.productionReadinessChecklist || []),
      ...(overrides.productionReadinessChecklist || []),
    ]),
    tenOfTenChecklist: unique([...(item.tenOfTenChecklist || []), ...(selected.tenOfTenChecklist || []), ...(overrides.tenOfTenChecklist || [])]),
    executionHints: {
      ...(item.executionHints || {}),
      templateId: selected.id,
      policyRiskLevel: item.executionHints?.policyRiskLevel || selected.riskLevel,
      templateSdlcCoverage: selected.sdlcCoverage || [],
    },
  };
}

export function enrichWorkItemGraphWithTemplates(graph = {}, options = {}) {
  return {
    ...graph,
    items: (graph.items || []).map((item) => {
      if (item.type === "epic") return item;
      return applyTemplateToWorkItem(item, options.templateId || null, options);
    }),
  };
}

function template(fields) {
  return Object.freeze(fields);
}

function severityForRisk(risk) {
  if (risk === "high") return "critical";
  if (risk === "medium") return "normal";
  return "low";
}

function inferComponent(item = {}) {
  const path = item.writeScope?.[0]?.path || "";
  if (!path) return null;
  return path.split(/[\\/]/).slice(0, 2).join("/") || null;
}

function inferStack(item = {}) {
  const paths = (item.writeScope || []).map((entry) => entry.path || "");
  if (paths.some((path) => /\.(tsx|jsx|vue|svelte|css)$/i.test(path))) return "frontend";
  if (paths.some((path) => /\.(mjs|js|ts)$/i.test(path))) return "node";
  if (paths.some((path) => /\.md$/i.test(path))) return "docs";
  return null;
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}
