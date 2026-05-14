import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateSpecialistEvidenceContract } from "../scripts/validate-specialist-evidence.mjs";

const VALID_SPECIALIST_EVIDENCE = {
  id: "specialist-quality-gate-reviewer",
  specialist: "quality-gate-reviewer",
  role: "reviewer",
  source: "codex-spawn-agent",
  invocationId: "agent-invocation-123",
  receiptId: "receipt-specialist-123",
  outputArtifact: ".supervibe/artifacts/reviews/review.md",
  artifactHash: "sha256:specialist-artifact",
  confidence: 9,
  decisions: ["approve-release-path-validator"],
  risks: ["release checks are scoped to current contracts"],
  acceptanceMapping: [{ criterionId: "AC-1", evidence: "validator tests pass" }],
  unresolvedGaps: ["no broad npm check in focused worker"],
  evidenceIds: ["receipt-specialist-123"],
  artifactIds: ["review-artifact"],
};

test("specialist evidence validator accepts complete SpecialistEvidenceRecord fixtures", () => {
  const result = validateSpecialistEvidenceContract(VALID_SPECIALIST_EVIDENCE);

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
});

test("specialist evidence validator accepts plan-shaped receipt-bound records", () => {
  const result = validateSpecialistEvidenceContract({
    role: "quality-gate-reviewer",
    receiptId: "workflow-specialist-123",
    outputArtifact: ".supervibe/artifacts/reviews/review.md",
    artifactHash: "sha256:specialist-artifact",
    confidence: 9,
    acceptanceMapping: [{ criterionId: "AC-1", evidence: "review receipt is trusted" }],
    unresolvedGaps: [],
  });

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.record.specialist, "quality-gate-reviewer");
  assert.equal(result.record.source, "runtime-receipt");
});

test("specialist evidence validator requires role, proof, receipt, artifact, confidence, acceptance mapping, gaps, and hash", () => {
  const result = validateSpecialistEvidenceContract({ id: "specialist-quality-gate-reviewer", specialist: "quality-gate-reviewer", source: "codex-spawn-agent" });

  assert.equal(result.pass, false);
  for (const code of [
    "specialist-evidence-role-missing",
    "specialist-evidence-receipt-id-missing",
    "specialist-evidence-output-artifact-missing",
    "specialist-evidence-confidence-missing",
    "specialist-evidence-acceptance-mapping-missing",
    "specialist-evidence-unresolved-gaps-missing",
    "specialist-evidence-artifact-hash-missing",
  ]) {
    assert.ok(result.issues.some((issue) => issue.code === code), code);
  }
});

test("specialist evidence validator rejects weak confidence", () => {
  const result = validateSpecialistEvidenceContract({ ...VALID_SPECIALIST_EVIDENCE, confidence: 6 });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "specialist-evidence-confidence-low"));
});

test("validate-specialist-evidence CLI validates fixtures deterministically", async () => {
  const dir = await mkdtemp(join(tmpdir(), "specialist-evidence-validator-"));
  const validFile = join(dir, "valid.json");
  const badFile = join(dir, "bad.json");
  await writeFile(validFile, JSON.stringify(VALID_SPECIALIST_EVIDENCE, null, 2), "utf8");
  await writeFile(badFile, JSON.stringify({ id: "specialist-quality-gate-reviewer" }, null, 2), "utf8");

  const ok = execFileSync(process.execPath, ["scripts/validate-specialist-evidence.mjs", "--file", validFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(ok, /^OK   specialist-evidence .*valid\.json/m);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-specialist-evidence.mjs", "--file", badFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /specialist evidence record\(s\) failed/);
});
