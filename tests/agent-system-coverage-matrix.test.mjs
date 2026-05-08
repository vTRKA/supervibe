import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

const DOC_PATH = "docs/references/agent-system-coverage-matrix.md";

test("agent system coverage matrix records audit, research, planning and visual gates", async () => {
  const content = await readFile(DOC_PATH, "utf8");

  for (const section of [
    "## Coverage Matrix",
    "## Source Of Truth Hierarchy",
    "## Research And Audit Readiness Gate",
    "## Internal And Private Sources",
    "## External Research Sources",
    "## Regulated Domain Policies",
    "## Raw Task Prevention",
    "## Visual Chat Explanation Policy",
    "## Negative Source Patterns",
    "## Runtime Telemetry And Maturity Dashboard",
  ]) {
    assert.match(content, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing section ${section}`);
  }

  for (const phrase of [
    "| User intent | Command | Skill | Primary agents | Gates | Eval fixture |",
    "Internal application or private-source audit",
    "External research or public-source audit",
    "Source-of-truth conflict resolution",
    "Raw task prevention before agents start",
    "Visual chat explanation of system or task logic",
    "Regulated domain audit",
    "Plugin update or local plugin drift repair",
    "Tier 1 sources are authoritative",
    "Mermaid or ASCII fallback",
    "managed checkout drift restore",
    "Tasks below readiness score 9/10 stay in intake or planning",
    "accTitle:",
    "accDescr:",
    "Text fallback:",
  ]) {
    assert.match(content, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing phrase ${phrase}`);
  }
});

test("scenario fixture covers new audit, source-truth, visual, readiness and update cases", async () => {
  const scenarios = JSON.parse(await readFile("tests/fixtures/scenario-evals/supervibe-user-flows.json", "utf8"));
  const ids = new Set(scenarios.map((scenario) => scenario.id));

  for (const id of [
    "internal-application-audit",
    "external-research-source-truth",
    "source-of-truth-conflict-resolution",
    "visual-chat-explanation-required",
    "raw-task-prevention",
    "regulated-domain-evidence",
    "plugin-update-local-drift",
  ]) {
    assert.equal(ids.has(id), true, `missing scenario ${id}`);
  }
});

test("trigger router recognizes source-truth, visual, readiness and plugin update repair intents", () => {
  const cases = [
    ["research external vendor documentation and resolve source of truth conflicts", "source_truth_research"],
    ["explain this system visually with a diagram before implementation", "visual_explanation"],
    ["raw vague task needs requirements intake before agents start", "task_readiness_intake"],
    ["update plugin should replace local plugin drift with upstream files", "plugin_update_repair"],
  ];

  for (const [request, intent] of cases) {
    const route = routeTriggerRequest(request, { artifacts: { request, userRequest: request } });
    assert.equal(route.intent, intent, `${request} routed to ${route.intent}`);
  }
});
