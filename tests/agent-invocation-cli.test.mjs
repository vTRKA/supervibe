import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  readTraceSpans,
} from "../scripts/lib/supervibe-runtime-trace.mjs";

const ROOT = process.cwd();

test("agent invocation CLI records Codex spawn proof usable by receipts", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-invocation-"));
  try {
    const artifactDir = join(projectRoot, ".supervibe", "artifacts", "brandbook");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, "direction.md"), "# Direction\n", "utf8");

    const logged = execFileSync(process.execPath, [
      join(ROOT, "scripts", "agent-invocation.mjs"),
      "log",
      "--root",
      projectRoot,
      "--agent",
      "creative-director",
      "--host",
      "codex",
      "--host-invocation-id",
      "codex-agent-123",
      "--task",
      "Create brand direction",
      "--confidence",
      "9",
      "--retrieval-policy",
      "memory=mandatory,rag=mandatory,codegraph=mandatory,reason=brand-direction",
      "--memory-ids",
      "brand-direction-memory",
      "--rag-chunk-ids",
      ".supervibe/artifacts/brandbook/direction.md:1",
      "--graph-symbols",
      "brandbookProducer",
      "--citations",
      "direction|code-rag|.supervibe/artifacts/brandbook/direction.md:1",
      "--verification-commands",
      "node scripts/validate-plan-artifacts.mjs --file .supervibe/artifacts/brandbook/direction.md",
      "--redaction-status",
      "not-needed",
      "--changed-files",
      ".supervibe/artifacts/brandbook/direction.md",
      "--risks",
      "Needs approval",
      "--recommendations",
      "Review styleboard",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(logged, /SUPERVIBE_AGENT_INVOCATION_LOGGED/);
    assert.match(logged, /HOST_SOURCE: codex-spawn-agent/);
    assert.match(logged, /INVOCATION_ID: codex-agent-123/);
    assert.match(logged, /AGENT_OUTPUT_JSON: \.supervibe\/artifacts\/_agent-outputs\/codex-agent-123\/agent-output\.json/);

    const record = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl"), "utf8").trim());
    assert.equal(record.agent_id, "creative-director");
    assert.equal(record.invocation_id, "codex-agent-123");
    assert.equal(record.host_invocation_id, "codex-agent-123");
    assert.equal(record.host_invocation_source, "codex-spawn-agent");
    assert.equal(record.retrieval_policy.provided, true);
    assert.equal(record.retrieval_policy.policy.memory, "mandatory");
    assert.equal(record.retrieval_policy.policy.rag, "mandatory");
    assert.equal(record.retrieval_policy.policy.codegraph, "mandatory");
    assert.equal(record.evidence.provided, true);
    assert.deepEqual(record.evidence.memoryIds, ["brand-direction-memory"]);
    assert.deepEqual(record.evidence.ragChunkIds, [".supervibe/artifacts/brandbook/direction.md:1"]);
    assert.deepEqual(record.evidence.graphSymbols, ["brandbookProducer"]);
    assert.deepEqual(record.evidence.verificationCommands, ["node scripts/validate-plan-artifacts.mjs --file .supervibe/artifacts/brandbook/direction.md"]);
    assert.equal(record.evidence.redactionStatus, "not-needed");
    assert.equal(record.evidence_gate.pass, true);
    assert.deepEqual(record.changed_files, [".supervibe/artifacts/brandbook/direction.md"]);
    assert.deepEqual(record.risks, ["Needs approval"]);
    assert.deepEqual(record.recommendations, ["Review styleboard"]);
    assert.deepEqual(record.confidence, {
      schemaVersion: 1,
      score: 9,
      status: "pass",
    });
    assert.equal(record.structured_output.json, ".supervibe/artifacts/_agent-outputs/codex-agent-123/agent-output.json");
    const agentOutput = JSON.parse(readFileSync(join(projectRoot, ...record.structured_output.json.split("/")), "utf8"));
    assert.equal(agentOutput.hostInvocationId, "codex-agent-123");
    assert.equal(agentOutput.retrievalPolicy.provided, true);
    assert.equal(agentOutput.evidence.provided, true);
    assert.equal(agentOutput.confidence.score, 9);
    assert.deepEqual(agentOutput.changedFiles, [".supervibe/artifacts/brandbook/direction.md"]);
    assert.deepEqual(agentOutput.risks, ["Needs approval"]);
    const effectiveness = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "effectiveness.jsonl"), "utf8").trim());
    assert.equal(effectiveness.agent, "creative-director");
    assert.equal(effectiveness.invocationId, "codex-agent-123");
    assert.equal(effectiveness.outcome, "success");

    const receipt = execFileSync(process.execPath, [
      join(ROOT, "scripts", "workflow-receipt.mjs"),
      "issue",
      "--root",
      projectRoot,
      "--command",
      "/supervibe-design",
      "--agent",
      "creative-director",
      "--host-invocation-source",
      "codex-spawn-agent",
      "--host-invocation-id",
      "codex-agent-123",
      "--stage",
      "stage-1-brand-direction",
      "--reason",
      "Brand direction specialist output",
      "--output",
      ".supervibe/artifacts/brandbook/direction.md",
      "--handoff",
      "brand-direction",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(receipt, /SUPERVIBE_WORKFLOW_RECEIPT_ISSUED/);
    assert.match(receipt, /HOST_INVOCATION_EVIDENCE: \.supervibe\/artifacts\/_agent-outputs\/codex-agent-123\/agent-output\.json/);

    const validation = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-agent-producer-receipts.mjs"),
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(validation, /PASS: true/);
    assert.match(validation, /HOST_AGENT_RECEIPTS: 1/);
    assert.match(validation, /COVERAGE_STATUS: trusted-host-agent-receipts-present/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("receipt validators label zero-receipt runs as not started", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-zero-receipts-"));
  try {
    const producer = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-agent-producer-receipts.mjs"),
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const workflow = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-workflow-receipts.mjs"),
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const design = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-design-agent-receipts.mjs"),
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(producer, /PASS: true/);
    assert.match(producer, /COVERAGE_STATUS: not-started-no-durable-outputs/);
    assert.match(workflow, /PASS: true/);
    assert.match(workflow, /COVERAGE_STATUS: not-started-no-receipts/);
    assert.match(design, /PASS: true/);
    assert.match(design, /COVERAGE_STATUS: not-started-no-durable-design-outputs/);
    assert.match(design, /APPROVAL_READY: false/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agent invocation CLI rejects unknown design receipt stages before logging", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-bad-stage-"));
  try {
    const artifact = join(projectRoot, ".supervibe", "artifacts", "_agent-outputs", "orchestrator", "agent-output.json");
    mkdirSync(join(projectRoot, ".supervibe", "artifacts", "_agent-outputs", "orchestrator"), { recursive: true });
    writeFileSync(artifact, "{\"ok\":true}\n", "utf8");

    assert.throws(
      () => execFileSync(process.execPath, [
        join(ROOT, "scripts", "agent-invocation.mjs"),
        "log",
        "--root",
        projectRoot,
        "--agent",
        "supervibe-orchestrator",
        "--host",
        "codex",
        "--host-invocation-id",
        "codex-agent-bad-stage",
        "--task",
        "Orchestrate design wizard",
        "--confidence",
        "9",
        "--issue-receipt",
        "--command",
        "/supervibe-design",
        "--stage",
        "stage-0-orchestration",
        "--handoff-id",
        "agent-chat",
        "--output-artifacts",
        ".supervibe/artifacts/_agent-outputs/orchestrator/agent-output.json",
      ], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
      /unknown stage "stage-0-orchestration" for \/supervibe-design/,
    );
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agent invocation CLI validates specialist question contracts before receipt issue", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-question-contract-"));
  try {
    const relArtifact = ".supervibe/artifacts/_agent-outputs/agent-chat/question-proposals/stage-1-brand-direction-creative-director.json";
    const artifact = join(projectRoot, ...relArtifact.split("/"));
    mkdirSync(join(artifact, ".."), { recursive: true });
    writeFileSync(artifact, `${JSON.stringify({
      questionProposals: [{
        stage: "stage-1-brand-direction",
        specialist: "creative-director",
        ownerAgent: "creative-director",
        question: "Which direction?",
        why: "It changes direction.md.",
        choices: [
          { id: "a", label: "A", tradeoff: "Thin." },
          { id: "b", label: "B", tradeoff: "Thin." },
          { id: "c", label: "C", tradeoff: "Thin." },
        ],
        blocks: ["direction.md"],
        artifactImpact: "direction.md",
        skipDefault: "Stop.",
        canAnswerFromEvidence: false,
      }],
    }, null, 2)}\n`, "utf8");

    assert.throws(
      () => execFileSync(process.execPath, [
        join(ROOT, "scripts", "agent-invocation.mjs"),
        "log",
        "--root",
        projectRoot,
        "--agent",
        "creative-director",
        "--host",
        "codex",
        "--host-invocation-id",
        "codex-agent-invalid-question",
        "--task",
        "Produce question proposal",
        "--confidence",
        "9",
        "--issue-receipt",
        "--command",
        "/supervibe-design",
        "--stage",
        "stage-1-brand-direction",
        "--handoff-id",
        "agent-chat",
        "--output-artifacts",
        relArtifact,
      ], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
      /missing-specialist-question-options|missing-specialist-question-decision|thin-specialist-question-evidence/,
    );
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agent invocation CLI rejects placeholder receipt outputs before telemetry writes", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-placeholder-output-"));
  try {
    assert.throws(
      () => execFileSync(process.execPath, [
        join(ROOT, "scripts", "agent-invocation.mjs"),
        "log",
        "--root",
        projectRoot,
        "--agent",
        "creative-director",
        "--host",
        "codex",
        "--host-invocation-id",
        "codex-agent-placeholder-output",
        "--task",
        "Produce brand direction",
        "--confidence",
        "9",
        "--issue-receipt",
        "--command",
        "/supervibe-design",
        "--stage",
        "stage-1-brand-direction",
        "--handoff-id",
        "agent-chat",
        "--output-artifacts",
        "none",
      ], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
      /--output-artifacts must name stable output files/,
    );
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl")), false);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "effectiveness.jsonl")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agent invocation CLI rolls back telemetry if receipt issue fails after logging", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-receipt-rollback-"));
  try {
    const outputRel = ".supervibe/artifacts/_agent-outputs/codex-agent-rollback-output/agent-output.json";
    assert.throws(
      () => execFileSync(process.execPath, [
        join(ROOT, "scripts", "agent-invocation.mjs"),
        "log",
        "--root",
        projectRoot,
        "--agent",
        "creative-director",
        "--host",
        "codex",
        "--host-invocation-id",
        "codex-agent-rollback-output",
        "--task",
        "Produce brand direction",
        "--confidence",
        "9",
        "--issue-receipt",
        "--command",
        "/supervibe-design",
        "--stage",
        "stage-1-brand-direction",
        "--output-artifacts",
        outputRel,
      ], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
      /--handoff-id required when --issue-receipt is set/,
    );
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl")), false);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "memory", "effectiveness.jsonl")), false);
    assert.equal(existsSync(join(projectRoot, ".supervibe", "artifacts", "_agent-outputs", "codex-agent-rollback-output")), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agent invocation CLI writes evidence ledger from retrieval flags", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-evidence-"));
  try {
    const logged = execFileSync(process.execPath, [
      join(ROOT, "scripts", "agent-invocation.mjs"),
      "log",
      "--root",
      projectRoot,
      "--agent",
      "repo-researcher",
      "--host",
      "codex",
      "--host-invocation-id",
      "codex-agent-evidence-1",
      "--task",
      "Refactor checkout callers",
      "--confidence",
      "9",
      "--retrieval-policy",
      "memory=mandatory,rag=mandatory,codegraph=mandatory,reason=structural",
      "--memory-ids",
      "checkout-decision",
      "--rag-chunk-ids",
      "scripts/checkout.mjs:12",
      "--graph-symbols",
      "checkoutService",
      "--citations",
      "checkout|code-rag|scripts/checkout.mjs:12",
      "--verification-commands",
      "node --test tests/checkout.test.mjs",
      "--redaction-status",
      "not-needed",
      "--subtool-usage",
      "memory=1,rag=1,codegraph=1",
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(logged, /SUPERVIBE_AGENT_INVOCATION_LOGGED/);
    const record = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl"), "utf8").trim());
    assert.equal(record.retrieval_enforcement.evidenceLedger, "written");
    assert.equal(record.retrieval_policy.provided, true);
    assert.equal(record.retrieval_policy.policy.memory, "mandatory");
    assert.equal(record.evidence.provided, true);
    assert.deepEqual(record.evidence.verificationCommands, ["node --test tests/checkout.test.mjs"]);
    assert.equal(record.evidence_gate.pass, true);
    const agentOutput = JSON.parse(readFileSync(join(projectRoot, ...record.structured_output.json.split("/")), "utf8"));
    assert.equal(agentOutput.retrievalPolicy.provided, true);
    assert.equal(agentOutput.evidence.provided, true);
    assert.deepEqual(agentOutput.evidence.ragChunkIds, ["scripts/checkout.mjs:12"]);
    const ledger = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "evidence-ledger.jsonl"), "utf8").trim());
    assert.equal(ledger.agentId, "repo-researcher");
    assert.equal(ledger.gate.pass, true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agent invocation CLI emits runtime trace span and binds receipt trace metadata", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-agent-trace-"));
  try {
    const outputRel = ".supervibe/artifacts/_agent-outputs/codex-agent-trace-1/agent-output.json";
    const logged = execFileSync(process.execPath, [
      join(ROOT, "scripts", "agent-invocation.mjs"),
      "log",
      "--root",
      projectRoot,
      "--agent",
      "repo-researcher",
      "--host",
      "codex",
      "--host-invocation-id",
      "codex-agent-trace-1",
      "--task",
      "Review runtime trace plan",
      "--confidence",
      "9",
      "--trace-id",
      "trace-cli-1",
      "--span-id",
      "span-cli-1",
      "--issue-receipt",
      "--command",
      "/supervibe-plan",
      "--stage",
      "plan-review-repo-researcher",
      "--handoff-id",
      "trace-cli",
      "--output-artifacts",
      outputRel,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    assert.match(logged, /TRACE_ID: trace-cli-1/);
    assert.match(logged, /SPAN_ID: span-cli-1/);
    const record = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl"), "utf8").trim());
    assert.equal(record.trace_id, "trace-cli-1");
    assert.equal(record.span_id, "span-cli-1");
    const receipt = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "artifacts", "_workflow-invocations", "supervibe-plan", "trace-cli", "repo-researcher-plan-review-repo-researcher.json"), "utf8"));
    assert.equal(receipt.hostInvocation.traceId, "trace-cli-1");
    assert.equal(receipt.hostInvocation.spanId, "span-cli-1");

    const spans = await readTraceSpans({ rootDir: projectRoot });
    const agentSpan = spans.find((span) => span.name === "supervibe.agent.invocation");
    const receiptSpan = spans.find((span) => span.name === "supervibe.workflow.receipt.issue");
    assert.equal(spans.length, 2);
    assert.ok(agentSpan);
    assert.ok(receiptSpan);
    assert.equal(agentSpan.traceId, "trace-cli-1");
    assert.equal(agentSpan.spanId, "span-cli-1");
    assert.equal(agentSpan.attributes["supervibe.workflow.receipt_path"], ".supervibe/artifacts/_workflow-invocations/supervibe-plan/trace-cli/repo-researcher-plan-review-repo-researcher.json");
    assert.equal(receiptSpan.traceId, "trace-cli-1");
    assert.equal(receiptSpan.parentSpanId, "span-cli-1");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
