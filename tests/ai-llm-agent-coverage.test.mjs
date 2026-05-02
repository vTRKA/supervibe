import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import matter from "gray-matter";

import { buildCapabilityRegistry, validateCapabilityRegistry } from "../scripts/lib/supervibe-capability-registry.mjs";

const AI_AGENT_FILES = [
  "agents/_ops/llm-rag-architect.md",
  "agents/_ops/llm-evals-engineer.md",
  "agents/_ops/ai-agent-orchestrator.md",
  "agents/_ops/model-ops-engineer.md",
];

test("AI/LLM specialist agents are senior, gated, and production-oriented", async () => {
  for (const file of AI_AGENT_FILES) {
    const raw = await readFile(file, "utf8");
    const parsed = matter(raw);
    const data = parsed.data;

    assert.ok(Number(data["persona-years"]) >= 15, `${file} must have 15+ years`);
    assert.ok(data.description.includes("Use WHEN"), `${file} needs trigger-oriented description`);
    assert.ok(Array.isArray(data.capabilities) && data.capabilities.length >= 5, `${file} needs concrete capabilities`);
    assert.ok(data.skills.includes("supervibe:project-memory"), `${file} missing project memory`);
    assert.ok(data.skills.includes("supervibe:code-search"), `${file} missing code search`);
    assert.ok(data.skills.includes("supervibe:verification"), `${file} missing verification`);
    assert.ok(data.verification.length >= 4, `${file} needs verification gates`);
    assert.ok(parsed.content.includes("## RAG + Memory pre-flight"), `${file} missing RAG pre-flight`);
    assert.ok(parsed.content.includes("Production") || parsed.content.includes("release"), `${file} missing production/release framing`);
    assert.match(parsed.content, /Confidence: (?:<N>\.<dd>|<score>)\/10/, `${file} missing confidence footer`);
    assert.ok(parsed.content.includes("Rubric: agent-delivery"), `${file} missing rubric footer`);
  }
});

test("capability registry exposes AI/LLM production engineering capability", () => {
  const registry = buildCapabilityRegistry({ rootDir: process.cwd() });
  const validation = validateCapabilityRegistry(registry);
  const capability = registry.capabilities.find((entry) => entry.id === "ai.llm-production");

  assert.equal(validation.pass, true);
  assert.ok(capability, "ai.llm-production capability missing");
  for (const agent of ["llm-rag-architect", "llm-evals-engineer", "ai-agent-orchestrator", "model-ops-engineer"]) {
    assert.ok(capability.agents.includes(agent), `capability missing ${agent}`);
  }
});
