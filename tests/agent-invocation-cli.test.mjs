import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
    assert.equal(record.host_invocation_source, "codex-spawn-agent");
    assert.equal(record.structured_output.json, ".supervibe/artifacts/_agent-outputs/codex-agent-123/agent-output.json");
    const agentOutput = JSON.parse(readFileSync(join(projectRoot, ...record.structured_output.json.split("/")), "utf8"));
    assert.deepEqual(agentOutput.changedFiles, [".supervibe/artifacts/brandbook/direction.md"]);
    assert.deepEqual(agentOutput.risks, ["Needs approval"]);

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
    assert.match(validation, /COVERAGE_STATUS: agent-receipts-present/);
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
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
