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
    acceptanceCriteria: ["Feature behavior is implemented and verified"],
    verificationHints: ["focused tests", "regression check"],
    labels: ["feature"],
    riskLevel: "low",
    requiredGates: ["review"],
  }),
  bugfix: template({
    id: "bugfix",
    label: "Bugfix",
    match: [/bug|fix|repair|regression|defect/i],
    taskTypes: ["bug", "review"],
    acceptanceCriteria: ["Bug is reproduced or described and fixed"],
    verificationHints: ["failing regression test", "focused fix verification"],
    labels: ["bugfix"],
    riskLevel: "medium",
    requiredGates: ["regression-review"],
  }),
  refactor: template({
    id: "refactor",
    label: "Refactor",
    match: [/refactor|cleanup|restructure|extract|rename/i],
    taskTypes: ["task", "review"],
    acceptanceCriteria: ["Behavior is preserved after refactor"],
    verificationHints: ["focused tests", "blast-radius evidence"],
    labels: ["refactor"],
    riskLevel: "medium",
    requiredGates: ["codegraph-review"],
  }),
  "ui-story": template({
    id: "ui-story",
    label: "UI Story",
    match: [/ui|frontend|browser|screen|component|figma|visual/i],
    taskTypes: ["task", "review"],
    acceptanceCriteria: ["UI behavior is implemented with visual verification"],
    verificationHints: ["browser or preview evidence", "responsive screenshot"],
    labels: ["ui", "visual-verification"],
    riskLevel: "medium",
    requiredGates: ["browser-evidence"],
  }),
  integration: template({
    id: "integration",
    label: "Integration",
    match: [/integration|api|mcp|webhook|provider|external|sync/i],
    taskTypes: ["task", "gate", "review"],
    acceptanceCriteria: ["Integration behavior is verified or blocked by explicit access gate"],
    verificationHints: ["integration check", "environment/access evidence"],
    labels: ["integration"],
    riskLevel: "medium",
    requiredGates: ["access-gate"],
  }),
  migration: template({
    id: "migration",
    label: "Migration",
    match: [/migration|schema|data change|backfill/i],
    taskTypes: ["task", "gate", "review"],
    acceptanceCriteria: ["Migration has rollback or cleanup path"],
    verificationHints: ["migration dry run", "rollback evidence"],
    labels: ["migration"],
    riskLevel: "high",
    requiredGates: ["approval", "rollback-review"],
  }),
  documentation: template({
    id: "documentation",
    label: "Documentation",
    match: [/doc|readme|changelog|guide|manual/i],
    taskTypes: ["chore", "review"],
    acceptanceCriteria: ["Documentation matches implemented behavior"],
    verificationHints: ["docs validation"],
    labels: ["documentation"],
    riskLevel: "low",
    requiredGates: ["docs-review"],
  }),
  "release-prep": template({
    id: "release-prep",
    label: "Release Prep",
    match: [/release|package|version|publish|provenance/i],
    taskTypes: ["chore", "gate", "review"],
    acceptanceCriteria: ["Release evidence is complete and version metadata is synchronized"],
    verificationHints: ["release gate", "package audit"],
    labels: ["release"],
    riskLevel: "medium",
    requiredGates: ["release-gate"],
  }),
  "production-prep": template({
    id: "production-prep",
    label: "Production Prep",
    match: [/production|deploy|rollback|dns|billing|credential|account/i],
    taskTypes: ["gate", "review"],
    acceptanceCriteria: ["Production mutation remains blocked without exact approval"],
    verificationHints: ["production readiness evidence", "approval boundary"],
    labels: ["production-prep", "approval-required"],
    riskLevel: "high",
    requiredGates: ["human-approval", "production-readiness"],
  }),
  "research-spike": template({
    id: "research-spike",
    label: "Research Spike",
    match: [/research|investigate|spike|evaluate|compare/i],
    taskTypes: ["task", "chore"],
    acceptanceCriteria: ["Research output has decision, evidence, and next action"],
    verificationHints: ["source/evidence summary"],
    labels: ["research"],
    riskLevel: "low",
    requiredGates: ["decision-review"],
  }),
};

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
    executionHints: {
      ...(item.executionHints || {}),
      templateId: selected.id,
      policyRiskLevel: item.executionHints?.policyRiskLevel || selected.riskLevel,
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
