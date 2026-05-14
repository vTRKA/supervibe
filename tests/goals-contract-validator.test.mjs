import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateGoalsContractRecord } from "../scripts/validate-goals-contract.mjs";

const VALID_GOALS_RECORD = {
  goals: [
    {
      id: "goal-verify-review-ship",
      title: "Verify review ship workflow",
      acceptanceCriteria: [
        {
          id: "criterion-goals",
          description: "Validators pass valid fixtures and reject malformed fixtures.",
          evidenceIds: ["evidence-tests"],
        },
      ],
      evidenceIds: ["evidence-tests"],
    },
  ],
  questions: [
    {
      id: "question-release-choice",
      prompt: "Step 1/1: Choose the release path.",
      resumeCursor: "cursor-release-choice",
      choices: [
        { id: "ship", label: "Ship", ordinal: 1 },
        { id: "revise", label: "Revise", ordinal: 2 },
      ],
    },
  ],
  approvals: [
    {
      id: "approval-release",
      targetId: "goal-verify-review-ship",
      targetType: "goal",
      actor: "user",
      approvedAt: "2026-05-14T00:00:00.000Z",
      expiresAt: "2026-06-14T00:00:00.000Z",
      evidenceIds: ["evidence-tests"],
    },
  ],
  evidence: {
    "evidence-tests": {
      kind: "test-output",
      path: "tests/goals-contract-validator.test.mjs",
      hash: "sha256:valid-goals",
    },
  },
};

test("goals contract validator accepts goals, questions, choices, approvals, and evidence", () => {
  const result = validateGoalsContractRecord(VALID_GOALS_RECORD, { now: "2026-05-14T00:00:00.000Z" });

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
});

test("goals contract validator rejects malformed goals and choices", () => {
  const result = validateGoalsContractRecord({
    goals: [{ id: "bad goal", title: "", acceptanceCriteria: [] }],
    questions: [{ id: "question", prompt: "Choose", resumeCursor: "cursor", choices: [{ id: "dup", label: "A" }, { id: "dup", label: "B" }] }],
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "goal-record-id-invalid"));
  assert.ok(result.issues.some((issue) => issue.code === "goal-record-title-missing"));
  assert.ok(result.issues.some((issue) => issue.code === "question-record-choice-duplicate"));
});

test("goals contract validator rejects unsafe waivers", () => {
  const result = validateGoalsContractRecord({
    ...VALID_GOALS_RECORD,
    waivers: [
      {
        id: "waiver-missing-approval",
        risk: "critical",
        affectedGoals: ["goal-verify-review-ship"],
        evidenceIds: ["evidence-tests"],
        revisitTrigger: "before ship",
        releaseImpact: "blocks release",
      },
    ],
  });

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "waiver-record-approval-missing"));
});

test("validate-goals-contract CLI has deterministic pass and fail output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "goals-contract-validator-"));
  const validFile = join(dir, "valid.json");
  const badFile = join(dir, "bad.json");
  await writeFile(validFile, JSON.stringify(VALID_GOALS_RECORD, null, 2), "utf8");
  await writeFile(badFile, JSON.stringify({ goals: [{ id: "bad goal" }] }, null, 2), "utf8");

  const ok = execFileSync(process.execPath, ["scripts/validate-goals-contract.mjs", "--file", validFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(ok, /^OK   goals-contract .*valid\.json/m);
  assert.match(ok, /All 1 goals contract record\(s\) passed/);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-goals-contract.mjs", "--file", badFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /goals contract record\(s\) failed/);
});
