import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadRuleContext, scoreRuleCompliance, selectRulesForTask } from "../scripts/lib/autonomous-loop-rule-context.mjs";

const rootDir = fileURLToPath(new URL("../", import.meta.url));

test("frontend work binds design-system rules", () => {
  const rules = selectRulesForTask({ goal: "build UI", category: "design" });
  assert.ok(rules.includes("design-system-governance.md"));
});

test("privacy violations cap confidence", () => {
  assert.equal(scoreRuleCompliance({ violations: ["privacy leak"] }).cap, 5);
});

test("rule context loads selected rule files or marks gaps", async () => {
  const rules = await loadRuleContext(rootDir, { goal: "build UI", category: "design" });
  assert.ok(rules.some((rule) => rule.file === "rules/design-system-governance.md"));
  assert.ok(rules.every((rule) => "content" in rule || rule.missing === true));
});
