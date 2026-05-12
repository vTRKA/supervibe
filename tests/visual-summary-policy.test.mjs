import assert from "node:assert/strict";
import test from "node:test";

import { validateVisualExplanationArtifact } from "../scripts/validate-visual-explanation-artifacts.mjs";
import { validatePlanArtifact } from "../scripts/validate-plan-artifacts.mjs";

test("visual explanation accepts text-first summary without browser preview", () => {
  const issues = validateVisualExplanationArtifact(`# Task Flow Summary

Visual mode: text-first stage map
Audience summary: The user sees the current stage and next action without opening a browser.
Text fallback: idea -> plan -> graph -> loop -> completion
Stop condition: user chooses stop or completion passes.
Accessibility: no color-only status statement.
`);

  assert.deepEqual(issues, []);
});

test("visual explanation still requires accessible Mermaid metadata when Mermaid is used", () => {
  const issues = validateVisualExplanationArtifact(`# Task Flow Summary

Visual mode: text-first stage map
Audience summary: The user sees the current stage.
Text fallback: idea -> plan -> graph
Stop condition: user chooses stop.
Accessibility: no color-only status statement.

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`);

  assert.ok(issues.some((issue) => /mermaid fallback/i.test(issue)));
});

test("plan validator accepts text-first visual evidence", () => {
  const markdown = `# Sample Implementation Plan

**Goal:** Ship the sample.
**Architecture:** Keep the existing command architecture.
**Tech Stack:** Node.js.
**Constraints:** Do not require browser previews for summary schemes.

## AI/Data Boundary

MCP: none. Figma: none. External: none. PII: none. approval: explicit user approval before writes.

## Retrieval, CodeGraph, And Visual Evidence

memory checked, RAG checked, CodeGraph checked.
Visual mode: text-first stage map with text fallback.
Text-first summary: idea -> plan -> graph -> loop -> completion.

## Development Contract Map

Behavior: covered. Architecture: covered. Data: none. API: none. UI: summary only.
Security: no secrets. Performance: no runtime cost. Observability: command output.
Rollout: validator only. Documentation: command docs. Owner: Supervibe. Verification: node --test.

## File Structure

- Modify: \`scripts/example.mjs\`.

## Critical Path

T1 -> T2. Parallel: none.

## Scope Safety Gate

Approved: sample validator. Deferred: none. Rejected: browser requirement. Tradeoff: text-first summaries are enough for schemes.
Scope expansion rule: any new sample behavior requires explicit approved scope before implementation.

## Delivery Strategy

MVP phase delivers production value with anti-bloat boundary.
Task budget policy: max tasks per phase=12; max child items per atomization run=80; phase-split required before graph write when either limit is exceeded.

## Production Readiness

Tests, security, performance, observability, rollback, release, docs, and support are covered.

## Final 10/10 Acceptance Gate

10/10 acceptance requires verification, no open blockers, contract coverage, and production readiness.

## Task 1: Build sample

**Files:**
- Modify: \`scripts/example.mjs\`

**Estimated time:** 5 minutes, confidence: high
**Scope IDs:** sample
**Requirement IDs:** sample
**Contract rows touched:** Behavior, Verification
**Acceptance Criteria:**
- The sample passes a concrete assertion.

**Stop conditions:** test fails.
**Rollback:** revert this file.
**Risks:**
- R1: sample breaks; mitigation: run the test.

- [ ] **Step 1:** Red phase: write failing test.
- [ ] **Step 2:** Implement the sample.
- [ ] **Step 3:** Verify.

\`\`\`bash
node --test tests/example.test.mjs
\`\`\`

Commit suppressed until final batch.

## Self-Review

Spec coverage matrix:

| Requirement | Task |
| --- | --- |
| sample | Task 1 |

Placeholder scan: none.
Type consistency: no type boundary changed.
Scope consistency: the task remains inside the user-approved scope.

## Execution Handoff

Real-agent receipt-backed handoff:
- Runtime-issued workflow receipts are required for producer, reviewer, and validator work.
- Subagent-Driven batches are prohibited for this flow.
- Inline batches are prohibited for this flow.
`;

  assert.deepEqual(validatePlanArtifact(markdown), []);
});
