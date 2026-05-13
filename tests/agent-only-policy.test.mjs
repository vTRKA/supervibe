import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildCommandAgentPlan,
  COMMAND_AGENT_SELECTOR_INPUT_FIELDS,
  copyCommandAgentContract,
  listDynamicAgentSelectors,
  REGULATED_DOMAIN_REVIEWER_GATES,
  resolveHostAgentDispatcher,
} from "../scripts/lib/command-agent-orchestration-contract.mjs";
import {
  buildRuntimeCommandAgentPlan,
  commandAgentPlanStrictReady,
} from "../scripts/command-agent-plan.mjs";
import { evaluateAgentOnlyPolicy } from "../scripts/lib/supervibe-agent-only-policy.mjs";
import { resolveCommandRequest } from "../scripts/lib/supervibe-command-catalog.mjs";
import { WORKFLOW_INTENT_SCENARIO_FIXTURES } from "../scripts/lib/supervibe-workflow-scenario-fixtures.mjs";

const ROOT = process.cwd();
const AGENT_PLAN_SCRIPT = join(ROOT, "scripts", "command-agent-plan.mjs");
const COMMANDS_SCRIPT = join(ROOT, "scripts", "supervibe-commands.mjs");

test("active durable command plan ignores old global receipts without scoped proof", () => {
  const requiredAgents = ["supervibe-orchestrator", "systems-analyst", "architect-reviewer", "quality-gate-reviewer"];
  const plan = buildCommandAgentPlan("/supervibe-plan", {
    availableAgentIds: requiredAgents,
    callableAgentIds: requiredAgents,
    hostAdapterId: "codex",
    enforceHostProof: true,
    receiptTrust: {
      pass: true,
      trustedHostAgentReceipts: requiredAgents.length,
      agentInvocations: requiredAgents.length,
      minHostAgentReceipts: 1,
      minAgentInvocations: 1,
    },
    scopedReceiptTrust: {
      pass: false,
      trustedHostAgentReceipts: 0,
      agentInvocations: 0,
      minHostAgentReceipts: requiredAgents.length,
      minAgentInvocations: requiredAgents.length,
      missingSubjects: requiredAgents,
    },
    workflowContext: {
      active: true,
      handoffId: "agent-only-policy-probe-without-scoped-receipts",
    },
  });
  const report = { pass: true, plan };
  const policy = evaluateAgentOnlyPolicy(report);

  assert.equal(report.plan.scopedReceiptGateActive, true);
  assert.equal(report.plan.activeScopedCommandAgentPlanRequired, true);
  assert.equal(report.plan.globalReceiptTrustIgnoredForActiveScope, true);
  assert.equal(report.plan.durableWritesAllowed, false);
  assert.equal(commandAgentPlanStrictReady(report), false);
  assert.equal(policy.pass, false);
  assert.equal(policy.globalReceiptTrustIgnoredForActiveScope, true);
  assert.equal(policy.durableWritesAllowed, false);
  assert.match(policy.blockedReason, /missing scoped receipts|logical fallback agents|durable writes are blocked/);
});

test("strict command-agent CLI fails when durable writes are blocked", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-only-cli-"));
  try {
    const result = spawnSync(process.execPath, [
      AGENT_PLAN_SCRIPT,
      "--root",
      projectRoot,
      "--command",
      "/supervibe-plan",
      "--host",
      "codex",
      "--active",
      "--handoff-id",
      "missing-scoped-receipts",
      "--strict",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.equal(result.status, 3);
    assert.match(result.stdout, /ACTIVE_SCOPED_COMMAND_AGENT_PLAN_REQUIRED: true/);
    assert.match(result.stdout, /DURABLE_WRITES_ALLOWED: false/);
    assert.match(result.stdout, /DURABLE_WRITE_PROOF_SOURCE: blocked/);
    assert.match(result.stdout, /STRICT_READY: false/);
    assert.match(result.stdout, /STRICT_BLOCK_REASON: missing scoped receipts/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("scoped real-agent receipts unlock active durable command plans", () => {
  const agents = ["supervibe-orchestrator", "systems-analyst", "architect-reviewer", "quality-gate-reviewer"];
  const plan = buildCommandAgentPlan("/supervibe-plan", {
    availableAgentIds: agents,
    callableAgentIds: agents,
    hostAdapterId: "codex",
    enforceHostProof: true,
    receiptTrust: {
      pass: true,
      trustedHostAgentReceipts: 10,
      agentInvocations: 10,
      minHostAgentReceipts: 1,
      minAgentInvocations: 1,
    },
    scopedReceiptTrust: {
      pass: true,
      trustedHostAgentReceipts: agents.length,
      agentInvocations: agents.length,
      minHostAgentReceipts: agents.length,
      minAgentInvocations: agents.length,
      missingSubjects: [],
    },
    workflowContext: {
      active: true,
      handoffId: "trusted-active-plan-review",
    },
  });
  const report = { pass: true, plan };
  const policy = evaluateAgentOnlyPolicy(report);

  assert.equal(plan.scopedReceiptGateActive, true);
  assert.equal(plan.globalReceiptTrustIgnoredForActiveScope, false);
  assert.equal(plan.durableWriteProofSource, "scoped-runtime-agent-receipts");
  assert.equal(plan.durableWritesAllowed, true);
  assert.equal(policy.pass, true);
  assert.equal(commandAgentPlanStrictReady(report), true);
});

test("global runtime receipts can prove non-active Codex logical fallback command plans", () => {
  const agents = ["supervibe-orchestrator", "repo-researcher", "memory-curator", "quality-gate-reviewer"];
  const plan = buildCommandAgentPlan("/supervibe-audit", {
    availableAgentIds: agents,
    callableAgentIds: agents,
    callableAgentSources: new Map([
      ["supervibe-orchestrator", "host callable"],
      ["repo-researcher", "codex-spawn-agent logical role"],
      ["memory-curator", "codex-spawn-agent logical role"],
      ["quality-gate-reviewer", "host callable"],
    ]),
    hostAdapterId: "codex",
    enforceHostProof: true,
    receiptTrust: {
      pass: true,
      trustedHostAgentReceipts: 10,
      agentInvocations: 10,
      minHostAgentReceipts: 1,
      minAgentInvocations: 1,
    },
    workflowContext: {},
  });
  const report = { pass: true, plan };
  const policy = evaluateAgentOnlyPolicy(report);

  assert.equal(plan.scopedReceiptGateActive, false);
  assert.deepEqual(plan.logicalFallbackRequiredAgents, ["repo-researcher", "memory-curator"]);
  assert.equal(policy.pass, true);
  assert.equal(commandAgentPlanStrictReady(report), true);
});

test("command-agent enforcement validator uses the agent-only policy helper", () => {
  const output = execFileSync(process.execPath, [
    join(ROOT, "scripts", "validate-command-agent-enforcement.mjs"),
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  assert.match(output, /SUPERVIBE_COMMAND_AGENT_ENFORCEMENT/);
  assert.match(output, /PASS: true/);
  assert.match(output, /agentOnlyPolicyPass=false/);
  assert.match(output, /blockedReason=/);
});

test("agent-only contract requires host invocation receipt evidence fields", () => {
  const contract = copyCommandAgentContract();
  assert.ok((contract.requiredReceiptFields || []).includes("hostInvocation.source"));
  assert.ok((contract.requiredReceiptFields || []).includes("hostInvocation.invocationId"));
});

test("agent-only policy requires Codex spawn_agent invocation evidence", () => {
  const codex = resolveHostAgentDispatcher("codex");
  assert.equal(codex?.nativeTool, "spawn_agent");
  assert.equal(codex?.invocationProof, "codex-spawn-agent");
  assert.match(String(codex?.evidencePath || ""), /agent-invocations\.jsonl$/);
});

test("dynamic agent selectors are executable and use intent, stack, risk, artifact, and stage", () => {
  assert.ok(listDynamicAgentSelectors().includes("stack-architects"));
  assert.ok(listDynamicAgentSelectors().includes("regulated-domain-reviewer-gates") === false);

  const plan = buildCommandAgentPlan("/supervibe-plan", {
    hostAdapterId: "codex",
    enforceHostProof: true,
    workflowContext: {
      intent: "plan",
      stackTags: ["nextjs", "postgres"],
      riskDomains: ["finance"],
      artifactType: "plan",
      stage: "review",
    },
  });

  assert.deepEqual(plan.selectorInputFields, [...COMMAND_AGENT_SELECTOR_INPUT_FIELDS]);
  assert.deepEqual(plan.selectorInputs.stackTags, ["nextjs", "postgres"]);
  assert.deepEqual(plan.selectorInputs.riskDomains, ["finance"]);
  for (const agentId of [
    "nextjs-architect",
    "postgres-architect",
    "payments-billing-architect",
    "privacy-compliance-architect",
    "security-auditor",
    "release-governance-reviewer",
  ]) {
    assert.ok(plan.requiredAgentIds.includes(agentId), agentId);
  }
  assert.equal(plan.regulatedDomainGates[0].domain, "finance");
  assert.deepEqual(plan.reviewerGateAgentIds, REGULATED_DOMAIN_REVIEWER_GATES.finance.reviewerGateAgentIds);
  assert.ok(plan.mandatoryEvidence.includes("domain-evidence"));
  assert.equal(plan.orchestratorDecisionArtifact.artifactType, "supervibe-orchestrator-agent-selection-decision");
  assert.ok(plan.orchestratorDecisionArtifact.decisions.some((entry) => entry.agentId === "payments-billing-architect"));
});

test("workflow scenario fixtures cover design, audit, plan, adapt, gc, review, continuation, and ambiguity intents", () => {
  const seen = new Set();
  for (const fixture of WORKFLOW_INTENT_SCENARIO_FIXTURES) {
    let commandId = String(fixture.expectedCommand).split(/\s+/)[0];
    if (fixture.expectedIntent === "task_graph_resume") {
      const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-command-match-"));
      try {
        const output = execFileSync(process.execPath, [
          COMMANDS_SCRIPT,
          "--project",
          projectRoot,
          "--match",
          fixture.request,
          "--no-color",
        ], {
          cwd: ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        assert.match(output, new RegExp(`INTENT: ${fixture.expectedIntent}`), fixture.id);
        assert.match(output, new RegExp(`COMMAND: ${fixture.expectedCommand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), fixture.id);
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    } else {
      const match = resolveCommandRequest(fixture.request, {
        pluginRoot: ROOT,
        projectRoot: ROOT,
      });
      assert.equal(match?.intent, fixture.expectedIntent, fixture.id);
      assert.equal(match?.command, fixture.expectedCommand, fixture.id);
      commandId = String(match.commandId || fixture.expectedCommand).split(/\s+/)[0];
    }
    seen.add(fixture.id);

    const plan = buildCommandAgentPlan(commandId, {
      hostAdapterId: "codex",
      enforceHostProof: true,
      workflowContext: fixture.workflowContext,
    });
    for (const agentId of fixture.expectedAgents) {
      assert.ok(plan.requiredAgentIds.includes(agentId), `${fixture.id} expected ${agentId}`);
    }
    assert.equal(plan.orchestratorDecisionArtifact.commandId, commandId);
  }

  assert.deepEqual([...seen].sort(), [
    "adapt-artifact-update",
    "ambiguous-status",
    "audit-agent-maturity",
    "design-web-prototype",
    "finance-plan-review",
    "gc-memory-cleanup",
    "loop-continuation",
    "plan-review",
  ]);
});

test("command-agent CLI can write an orchestrator decision artifact", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-decision-"));
  const artifactPath = join(projectRoot, ".supervibe", "artifacts", "agent-selection.json");
  try {
    const output = execFileSync(process.execPath, [
      AGENT_PLAN_SCRIPT,
      "--root",
      projectRoot,
      "--command",
      "/supervibe-plan",
      "--host",
      "codex",
      "--intent",
      "plan",
      "--stack",
      "nextjs,postgres",
      "--risk-domain",
      "finance",
      "--artifact-type",
      "plan",
      "--stage",
      "review",
      "--decision-artifact",
      artifactPath,
      "--json",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const report = JSON.parse(output);
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    assert.equal(existsSync(artifactPath), true);
    assert.equal(artifact.commandId, "/supervibe-plan");
    assert.deepEqual(artifact.selectedDynamicAgentIds, report.plan.orchestratorDecisionArtifact.selectedDynamicAgentIds);
    assert.ok(artifact.mandatoryEvidence.includes("domain-evidence"));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
