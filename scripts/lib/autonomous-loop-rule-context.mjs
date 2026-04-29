import { readFile } from "node:fs/promises";
import { join } from "node:path";

const RULE_BINDINGS = {
  design: ["design-system-governance.md", "i18n.md", "prototype-to-production.md"],
  backend: ["modular-backend.md", "observability.md", "privacy-pii.md", "no-hardcode.md"],
  infrastructure: ["infrastructure-patterns.md", "observability.md", "privacy-pii.md"],
  refactor: ["use-codegraph-before-refactor.md", "no-dead-code.md"],
};

export function selectRulesForTask(task) {
  const category = task.category || "implementation";
  const selected = new Set(["anti-hallucination.md", "confidence-discipline.md", "git-discipline.md", "no-half-finished.md"]);
  for (const rule of RULE_BINDINGS[category] || []) selected.add(rule);
  if (/design|ui/i.test(`${task.goal} ${task.category}`)) {
    for (const rule of RULE_BINDINGS.design) selected.add(rule);
  }
  return [...selected];
}

export async function loadRuleContext(rootDir, task) {
  const rules = [];
  for (const file of selectRulesForTask(task)) {
    try {
      const path = join(rootDir, "rules", file);
      rules.push({ file: `rules/${file}`, content: await readFile(path, "utf8") });
    } catch {
      rules.push({ file: `rules/${file}`, missing: true });
    }
  }
  return rules;
}

export function scoreRuleCompliance({ rulesLoaded = [], violations = [] } = {}) {
  if (violations.some((item) => /privacy|credential|secret|hardcode/i.test(item))) return { cap: 5, status: "rule_violation" };
  if (violations.some((item) => /design-system/i.test(item))) return { cap: 6, status: "rule_violation" };
  if (violations.length > 0) return { cap: 7, status: "rule_violation" };
  if (rulesLoaded.some((rule) => rule.missing)) return { cap: 8, status: "unverified_rule_context" };
  return { cap: 10, status: "ok" };
}
