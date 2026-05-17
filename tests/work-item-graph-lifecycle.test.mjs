import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { atomizePlanToWorkItems, writeWorkItemGraph } from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import { validateWorkItemGraphFiles } from "../scripts/validate-work-item-graphs.mjs";

const execFileAsync = promisify(execFile);
const REPO_ROOT = new URL("../", import.meta.url);

const PLAN = `# Graph Producer Proof Plan

## Task 1: Build graph producer proof
**Files:**
- Modify: \`scripts/lib/supervibe-plan-to-work-items.mjs\`
**Scope IDs:** SCOPE-GRAPH-001
**Requirement IDs:** REQ-GRAPH-001
**Contract rows touched:** C3
**Estimated time:** 20min, confidence: high
**Rollback:** revert graph proof metadata changes.
**Stop conditions:** stop if proof cannot be scoped to the graph artifact.
**Acceptance Criteria:**
- Graph producer proof is first-class metadata.
\`\`\`bash
npm run validate:work-item-graphs
\`\`\`
`;

function graphWithProducerProof(epicId = "epic-graph-proof") {
  return atomizePlanToWorkItems(PLAN, {
    planPath: ".supervibe/artifacts/plans/graph-proof.md",
    epicId,
    planReviewPassed: true,
    releaseProof: true,
    graphProducerProof: {
      command: "/supervibe-loop",
      stage: "work-item-atomization",
      subjectType: "agent",
      subjectId: "work-item-graph-builder",
      agentId: "work-item-graph-builder",
      hostInvocation: {
        source: "codex-spawn-agent",
        invocationId: "codex-graph-builder-1",
      },
    },
  });
}

test("persisted non-dry-run graph records first-class producer proof output binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-item-graph-proof-"));
  try {
    const graph = graphWithProducerProof();
    await writeGraphBuilderInvocation(root, graph.epicId);
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: root });
    const report = await validateWorkItemGraphFiles({ rootDir: root, files: [graphPath], scopeMode: "graph-scoped" });
    const saved = JSON.parse(await readUtf8(graphPath));

    assert.equal(report.pass, true);
    assert.equal(report.results[0].validation.valid, true);
    assert.equal(saved.metadata.graphProducerProof.command, "/supervibe-loop");
    assert.equal(saved.metadata.graphProducerProof.stage, "work-item-atomization");
    assert.equal(saved.metadata.graphProducerProof.subjectId, "work-item-graph-builder");
    assert.equal(saved.metadata.graphProducerProof.hostInvocation.invocationId, "codex-graph-builder-1");
    assert.match(saved.metadata.graphProducerProof.outputBinding.artifact, /\.supervibe\/memory\/work-items\/epic-graph-proof\/graph\.json$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("first-class graph producer proof makes unrelated receipt damage irrelevant", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-item-graph-proof-unrelated-"));
  try {
    const graph = graphWithProducerProof("epic-graph-proof-unrelated");
    await writeGraphBuilderInvocation(root, graph.epicId);
    const { graphPath } = await writeWorkItemGraph(graph, { rootDir: root });
    const brokenReceipt = join(root, ".supervibe", "artifacts", "_workflow-invocations", "other", "broken.json");
    await mkdir(dirname(brokenReceipt), { recursive: true });
    await writeFile(brokenReceipt, "{ not json\n", "utf8");

    const report = await validateWorkItemGraphFiles({ rootDir: root, files: [graphPath], scopeMode: "graph-scoped" });

    assert.equal(report.pass, true);
    assert.equal(report.results[0].validation.valid, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("graph validator CLI exposes scoped and strict graph validation modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "work-item-graph-scope-modes-"));
  try {
    const valid = graphWithProducerProof("epic-graph-scope-valid");
    const invalid = atomizePlanToWorkItems(PLAN, {
      planPath: ".supervibe/artifacts/plans/graph-proof.md",
      epicId: "epic-graph-scope-invalid",
      planReviewPassed: true,
      dryRun: true,
    });
    invalid.items.find((item) => item.itemId.endsWith("-t1")).verificationCommands = [];
    await writeGraphBuilderInvocation(root, valid.epicId);
    const { graphPath: validPath } = await writeWorkItemGraph(valid, { rootDir: root });
    const invalidDir = join(root, ".supervibe", "memory", "work-items", "epic-graph-scope-invalid");
    await mkdir(invalidDir, { recursive: true });
    await writeFile(join(invalidDir, "graph.json"), JSON.stringify(invalid, null, 2) + "\n", "utf8");

    const scoped = await execFileAsync(process.execPath, [
      "scripts/validate-work-item-graphs.mjs",
      "--root",
      root,
      "--scope-file",
      validPath,
    ], { cwd: REPO_ROOT });
    assert.match(scoped.stdout, /SCOPE: graph-scoped/);
    assert.match(scoped.stdout, /CHECKED: 1/);

    await assert.rejects(
      () => execFileAsync(process.execPath, [
        "scripts/validate-work-item-graphs.mjs",
        "--root",
        root,
        "--strict",
      ], { cwd: REPO_ROOT }),
      (error) => {
        assert.match(error.stdout, /SCOPE: graph-strict/);
        assert.match(error.stdout, /CHECKED: 2/);
        assert.match(error.stderr, /missing-verification/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeGraphBuilderInvocation(root, epicId) {
  const invocationId = "codex-graph-builder-1";
  const outputRel = `.supervibe/artifacts/_agent-outputs/${invocationId}/agent-output.json`;
  const graphRel = `.supervibe/memory/work-items/${epicId}/graph.json`;
  await mkdir(dirname(join(root, outputRel)), { recursive: true });
  await mkdir(join(root, ".supervibe", "memory"), { recursive: true });
  await writeFile(join(root, outputRel), `${JSON.stringify({ ok: true })}\n`, "utf8");
  await appendFile(join(root, ".supervibe", "memory", "agent-invocations.jsonl"), `${JSON.stringify({
    schemaVersion: 1,
    invocation_id: invocationId,
    agent_id: "work-item-graph-builder",
    subject_id: "work-item-graph-builder",
    subject_type: "agent",
    task_summary: "create durable epic/task graph",
    command: "/supervibe-loop",
    stage: "work-item-atomization",
    handoff_id: epicId,
    host: "codex",
    host_invocation_source: "codex-spawn-agent",
    status: "completed",
    output_artifact: outputRel,
    output_artifacts: [graphRel],
    structured_output: { json: outputRel },
  })}\n`, "utf8");
}

async function readUtf8(path) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}
