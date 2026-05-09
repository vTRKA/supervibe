import assert from "node:assert/strict";
import test from "node:test";

import {
  getSemanticIntentProfiles,
  rankSemanticIntents,
  routeSemanticIntent,
} from "../scripts/lib/supervibe-semantic-intent-router.mjs";
import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

test("semantic router ranks implicit work-control UI requests", () => {
  assert.ok(getSemanticIntentProfiles().length >= 8);
  const route = routeTriggerRequest("users cannot see epics phases cycles tasks or control status from one UI");

  assert.equal(route.intent, "work_control_ui");
  assert.equal(route.command, "/supervibe-ui");
  assert.equal(route.source, "semantic-intent-profile");
  assert.ok(route.confidence >= 0.9);
  assert.ok(route.semanticEvidence.matchedGroups.length >= 2);
});

test("semantic router catches cleanup, agent, docs, and Figma pain without slash commands", () => {
  const cases = [
    ["old closed epics and stale tasks are cluttering memory", "cleanup_stale_work", "/supervibe-gc --all --dry-run"],
    ["agents feel weak and do not use tools memory rag or codegraph", "agent_strengthen", "/supervibe-strengthen"],
    ["docs folder has internal todo garbage and stale documentation", "docs_audit", "/supervibe-audit --docs"],
    ["Figma variables components tokens and Code Connect drift from code", "figma_source_of_truth", "/supervibe-design --figma-source-of-truth"],
    ["security audit should scan vulnerabilities and prioritize remediation", "security_audit", "/supervibe-security-audit"],
    ["router vpn wifi network stability needs read only diagnostics", "network_ops", "/supervibe --agent network-router-engineer --read-only"],
    ["strengthen the prompt agent instructions and intent router evals", "prompt_ai_engineering", "/supervibe --agent prompt-ai-engineer"],
  ];

  for (const [phrase, intent, command] of cases) {
    const route = routeTriggerRequest(phrase);
    assert.equal(route.intent, intent, phrase);
    assert.equal(route.command, command, phrase);
    assert.equal(route.source, "semantic-intent-profile", phrase);
  }
});

test("semantic router returns alternatives for ambiguous pain statements", () => {
  const ranked = rankSemanticIntents("agents are weak and memory rag codegraph quality wastes tokens");
  const top = routeSemanticIntent("agents are weak and memory rag codegraph quality wastes tokens");

  assert.ok(ranked.length >= 2);
  assert.equal(top.intent, ranked[0].intent);
  assert.ok(new Set(ranked.map((entry) => entry.intent)).has("agent_strengthen"));
  assert.ok(new Set(ranked.map((entry) => entry.intent)).has("memory_audit"));
});

test("semantic profiles distinguish full agent-system audits from agent strengthening", () => {
  const ranked = rankSemanticIntents("audit agent system maturity receipts skills semantic rag codegraph coverage", { limit: 5 });
  const top = routeSemanticIntent("audit agent system maturity receipts skills semantic rag codegraph coverage");

  assert.equal(top.intent, "supervibe_audit");
  assert.equal(ranked[0].intent, "supervibe_audit");
  assert.ok(ranked.some((entry) => entry.intent === "agent_strengthen"));
  assert.ok(ranked[0].confidence > ranked.find((entry) => entry.intent === "agent_strengthen").confidence);
});

test("semantic router recognizes creative variant feedback overlay design prompts", () => {
  const top = routeSemanticIntent("Сделай 5 креативных и РАЗНЫХ вариантов с фидбек оверлей системой от плагина.");

  assert.equal(top.intent, "design_new");
  assert.ok(top.confidence >= 0.9);
  assert.ok(top.matchedGroups.length >= 2);
});
