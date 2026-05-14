import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateReleasePathContract } from "../scripts/validate-release-path.mjs";

const VALID_RELEASE_PATH = {
  schemaVersion: 1,
  id: "workflow-verify-review-ship",
  command: "/supervibe-loop",
  stage: "ship",
  goals: [
    {
      id: "goal-ship",
      title: "Ship verified workflow",
      acceptanceCriteria: [{ id: "ac-ship", description: "Release path evidence is complete." }],
    },
  ],
  currentQuestion: null,
  resumeCursor: "cursor-ship",
  nextCommand: "/supervibe-loop --ship",
  nextAction: "Ship after verify and review gates pass.",
  approvals: [
    {
      id: "approval-ship",
      targetId: "goal-ship",
      targetType: "goal",
      actor: "user",
      approvedAt: "2026-05-14T00:00:00.000Z",
      expiresAt: "2026-06-14T00:00:00.000Z",
      evidenceIds: ["receipt-release"],
    },
  ],
  evidence: {
    "receipt-release": {
      kind: "workflow-receipt",
      path: ".supervibe/receipts/release.json",
      hash: "sha256:receipt-release",
    },
  },
  artifactManifest: {
    id: "manifest-release",
    artifacts: [
      {
        id: "release-report",
        path: ".supervibe/artifacts/release/report.md",
        hash: "sha256:release-report",
        evidenceIds: ["receipt-release"],
      },
    ],
  },
  summaries: [
    {
      id: "summary-ship",
      stage: "ship",
      kind: "post-artifact",
      summary: "Ship path has evidence and approvals.",
      createdAt: "2026-05-14T00:00:00.000Z",
      evidenceIds: ["receipt-release"],
      artifactIds: ["release-report"],
    },
  ],
  specialistEvidence: [
    {
      id: "specialist-release",
      specialist: "quality-gate-reviewer",
      source: "codex-spawn-agent",
      invocationId: "agent-release-1",
      evidenceIds: ["receipt-release"],
      artifactIds: ["release-report"],
    },
  ],
  events: [
    {
      id: "event-verify",
      type: "stage-completed",
      stage: "verify",
      createdAt: "2026-05-14T00:00:00.000Z",
      evidenceIds: ["receipt-release"],
      artifactIds: ["release-report"],
    },
    {
      id: "event-review",
      type: "stage-completed",
      stage: "review",
      createdAt: "2026-05-14T00:00:00.000Z",
      evidenceIds: ["receipt-release"],
      artifactIds: ["release-report"],
    },
    {
      id: "event-ship",
      type: "stage-completed",
      stage: "ship",
      createdAt: "2026-05-14T00:00:00.000Z",
      evidenceIds: ["receipt-release"],
      artifactIds: ["release-report"],
    },
  ],
};

test("release path validator accepts valid workflow state fixtures", () => {
  const result = validateReleasePathContract(VALID_RELEASE_PATH, { now: "2026-05-14T00:00:00.000Z" });

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
});

test("release path validator rejects missing receipts", () => {
  const result = validateReleasePathContract({ ...VALID_RELEASE_PATH, evidence: {} });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "release-path-receipt-evidence-missing"));
});

test("release path validator accepts newer re-review after stale early review", () => {
  const result = validateReleasePathContract({
    ...VALID_RELEASE_PATH,
    events: [
      {
        id: "event-review-old",
        type: "stage-completed",
        stage: "review",
        createdAt: "2026-05-13T23:00:00.000Z",
        evidenceIds: ["receipt-release"],
        artifactIds: ["release-report"],
      },
      {
        id: "event-verify",
        type: "stage-completed",
        stage: "verify",
        createdAt: "2026-05-14T00:00:00.000Z",
        evidenceIds: ["receipt-release"],
        artifactIds: ["release-report"],
      },
      {
        id: "event-review-new",
        type: "stage-completed",
        stage: "review",
        createdAt: "2026-05-14T00:01:00.000Z",
        evidenceIds: ["receipt-release"],
        artifactIds: ["release-report"],
      },
      {
        id: "event-ship",
        type: "stage-completed",
        stage: "ship",
        createdAt: "2026-05-14T00:02:00.000Z",
        evidenceIds: ["receipt-release"],
        artifactIds: ["release-report"],
      },
    ],
  });

  assert.equal(result.pass, true);
});

test("release path validator rejects ship before review completion", () => {
  const result = validateReleasePathContract({
    ...VALID_RELEASE_PATH,
    events: [
      {
        id: "event-verify",
        type: "stage-completed",
        stage: "verify",
        createdAt: "2026-05-14T00:00:00.000Z",
        evidenceIds: ["receipt-release"],
        artifactIds: ["release-report"],
      },
      {
        id: "event-ship",
        type: "stage-completed",
        stage: "ship",
        createdAt: "2026-05-14T00:02:00.000Z",
        evidenceIds: ["receipt-release"],
        artifactIds: ["release-report"],
      },
      {
        id: "event-review",
        type: "stage-completed",
        stage: "review",
        createdAt: "2026-05-14T00:03:00.000Z",
        evidenceIds: ["receipt-release"],
        artifactIds: ["release-report"],
      },
    ],
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "production-release-ship-before-review"));
});

test("release path validator rejects ship without verify and review evidence", () => {
  const result = validateReleasePathContract({
    ...VALID_RELEASE_PATH,
    events: [
      {
        id: "event-ship",
        type: "stage-completed",
        stage: "ship",
        createdAt: "2026-05-14T00:00:00.000Z",
        evidenceIds: ["receipt-release"],
        artifactIds: ["release-report"],
      },
    ],
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "production-release-verify-missing"));
  assert.ok(result.issues.some((issue) => issue.code === "production-release-review-missing"));
});

test("release path validator rejects unsafe waivers", () => {
  const result = validateReleasePathContract({
    ...VALID_RELEASE_PATH,
    waivers: [
      {
        id: "waiver-critical",
        risk: "critical",
        affectedGoals: ["goal-ship"],
        evidenceIds: ["receipt-release"],
        revisitTrigger: "after release",
        releaseImpact: "skips release gate",
      },
    ],
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "waiver-record-approval-missing"));
});

test("validate-release-path CLI validates fixtures deterministically", async () => {
  const dir = await mkdtemp(join(tmpdir(), "release-path-validator-"));
  const validFile = join(dir, "valid.json");
  const badFile = join(dir, "bad.json");
  await writeFile(validFile, JSON.stringify(VALID_RELEASE_PATH, null, 2), "utf8");
  await writeFile(badFile, JSON.stringify({ ...VALID_RELEASE_PATH, evidence: {} }, null, 2), "utf8");

  const ok = execFileSync(process.execPath, ["scripts/validate-release-path.mjs", "--file", validFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(ok, /^OK   release-path .*valid\.json/m);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-release-path.mjs", "--file", badFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /release path record\(s\) failed/);
});
