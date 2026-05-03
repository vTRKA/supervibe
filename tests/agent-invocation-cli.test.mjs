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
    ], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(logged, /SUPERVIBE_AGENT_INVOCATION_LOGGED/);
    assert.match(logged, /HOST_SOURCE: codex-spawn-agent/);
    assert.match(logged, /INVOCATION_ID: codex-agent-123/);

    const record = JSON.parse(readFileSync(join(projectRoot, ".supervibe", "memory", "agent-invocations.jsonl"), "utf8").trim());
    assert.equal(record.agent_id, "creative-director");
    assert.equal(record.invocation_id, "codex-agent-123");
    assert.equal(record.host_invocation_source, "codex-spawn-agent");

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

    const validation = execFileSync(process.execPath, [
      join(ROOT, "scripts", "validate-agent-producer-receipts.mjs"),
    ], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.match(validation, /PASS: true/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
