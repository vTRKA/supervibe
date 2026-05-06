import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  validateAgentContentQuality,
} from "../scripts/validate-agent-content-quality.mjs";

test("agent content quality accepts a complete evidence-backed agent", async () => {
  const root = await createTempAgentRoot();
  try {
    await writeAgent(root, "complete.md", completeAgentBody());

    const report = validateAgentContentQuality(root);

    assert.equal(report.pass, true);
    assert.equal(report.issues.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent content quality blocks missing project context", async () => {
  const root = await createTempAgentRoot();
  try {
    await writeAgent(root, "thin.md", completeAgentBody().replace(/## Project Context[\s\S]*?(?=\n## 2026 Expert Standard)/, ""));

    const report = validateAgentContentQuality(root);

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "missing-project-context-section"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("agent content quality blocks unresolved template placeholders", async () => {
  const root = await createTempAgentRoot();
  try {
    await writeAgent(root, "placeholder.md", completeAgentBody().replace("complete-agent", "{{NAME}}"));

    const report = validateAgentContentQuality(root);

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "template-placeholder"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createTempAgentRoot() {
  const root = await mkdtemp(join(tmpdir(), "supervibe-agent-quality-"));
  await mkdir(join(root, "agents", "_core"), { recursive: true });
  return root;
}

async function writeAgent(root, fileName, body) {
  await writeFile(join(root, "agents", "_core", fileName), `${body}\n`, "utf8");
}

function completeAgentBody() {
  return `---
name: complete-agent
namespace: _core
description: "Use WHEN testing agent quality TO validate content gates."
persona-years: 15
capabilities: [agent-quality]
stacks: [any]
tools: [Read, Grep, Bash]
skills: [supervibe:project-memory, supervibe:code-search, supervibe:verification]
verification: [npm-test, npm-run-check]
anti-patterns: [asking-multiple-questions-at-once, no-project-context, no-verification, no-codegraph]
version: 1.0
last-verified: 2026-05-06
verified-against: HEAD
---

# complete-agent

## Persona

15+ years building agent systems.

## Project Context

Read repository paths before acting.

## 2026 Expert Standard

Follow docs/references/agent-modern-expert-standard.md.

## Scope Safety

Apply docs/references/scope-safety-standard.md.

## RAG + Memory pre-flight

Use supervibe:project-memory and supervibe:code-search before changes.
Use Code Graph with --callers, --callees, or --neighbors for structural work.

## User dialogue discipline

Ask Step N/M with one question at a time.

## Procedure

1. Gather evidence.
2. Verify.

## Anti-patterns

- asking-multiple-questions-at-once
- no-project-context
- no-verification
- no-codegraph

## Verification

- npm test
- npm run check

## Output Contract

\`\`\`
Confidence: 9.0/10
Override: false
Rubric: agent-quality
\`\`\`
`;
}
