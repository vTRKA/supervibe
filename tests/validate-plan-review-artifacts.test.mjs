import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import {
  PLAN_REVIEW_BASE_REVIEWERS,
  PLAN_REVIEW_MANDATORY_RISK_REVIEWERS,
  validatePlanReviewGateForPlan,
} from "../scripts/validate-plan-review-artifacts.mjs";

const execFileAsync = promisify(execFile);
const FIXTURE = "tests/fixtures/artifacts/plan-reviews/review-loop-hardening-plan-review.md";
const REVIEW_REL = ".supervibe/artifacts/plan-reviews/example-plan-review.md";
const PLAN_REL = ".supervibe/artifacts/plans/example.md";
const AGENT_INVOCATION = fileURLToPath(new URL("../scripts/agent-invocation.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

function withPlanPath(markdown) {
  return markdown.replaceAll(".supervibe/artifacts/plans/review-loop-hardening.md", PLAN_REL);
}

function withMandatoryRiskCoverage(markdown, mode = "selected") {
  const lines = mode === "waived"
    ? [
      "- security-auditor: user-waived by user because this plan has no security boundary.",
      "- qa-test-engineer: user-waived by user because verification risk is accepted for this review.",
      "- release-governance-reviewer: user-waived by user because release governance is out of scope for this plan.",
      "- db-reviewer: user-waived by user because this plan has no data topology change.",
    ]
    : [
      "- security-auditor: mandatory risk reviewer selected for security and privacy risk.",
      "- qa-test-engineer: mandatory risk reviewer selected for verification coverage risk.",
      "- release-governance-reviewer: mandatory risk reviewer selected for release and rollback risk.",
      "- db-reviewer: mandatory risk reviewer selected for database topology risk.",
    ];
  return markdown.replace(
    "- quality-gate-reviewer: confirms tests, validators, release gates, rollback, and evidence.\n",
    `- quality-gate-reviewer: confirms tests, validators, release gates, rollback, and evidence.\n${lines.join("\n")}\n`,
  );
}

async function writeReview(root, markdown) {
  await writeUtf8(root, REVIEW_REL, markdown);
}

async function issueReviewerReceipt(root, reviewer) {
  await execFileAsync(process.execPath, [
    AGENT_INVOCATION,
    "log",
    "--root",
    root,
    "--reviewer",
    reviewer,
    "--host",
    "codex",
    "--host-invocation-id",
    `codex-${reviewer}`,
    "--task",
    `${reviewer} reviewed the plan-review artifact`,
    "--confidence",
    "9",
    "--issue-receipt",
    "--command",
    "/supervibe-plan",
    "--stage",
    `plan-review-${reviewer}`,
    "--handoff-id",
    "plan-review-example",
    "--output-artifacts",
    REVIEW_REL,
  ], { cwd: REPO_ROOT });
}

async function issueReviewerReceipts(root, reviewers) {
  for (const reviewer of reviewers) await issueReviewerReceipt(root, reviewer);
}

test("active plan review gate accepts explicit user waivers for mandatory risk reviewers", async () => {
  const root = await mkdtemp(join(tmpdir(), "plan-review-waived-risk-"));
  try {
    const fixture = await readFile(FIXTURE, "utf8");
    await writeReview(root, withMandatoryRiskCoverage(withPlanPath(fixture), "waived"));
    await issueReviewerReceipts(root, PLAN_REVIEW_BASE_REVIEWERS);

    const gate = await validatePlanReviewGateForPlan({
      rootDir: root,
      planPath: PLAN_REL,
      requireActiveReview: true,
    });

    assert.equal(gate.pass, true);
    assert.deepEqual(gate.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active plan review gate requires mandatory risk reviewer receipts when not waived", async () => {
  const root = await mkdtemp(join(tmpdir(), "plan-review-risk-receipts-"));
  try {
    const fixture = await readFile(FIXTURE, "utf8");
    await writeReview(root, withMandatoryRiskCoverage(withPlanPath(fixture), "selected"));
    await issueReviewerReceipts(root, PLAN_REVIEW_BASE_REVIEWERS);

    const gate = await validatePlanReviewGateForPlan({
      rootDir: root,
      planPath: PLAN_REL,
      requireActiveReview: true,
    });

    assert.equal(gate.pass, false);
    for (const reviewer of PLAN_REVIEW_MANDATORY_RISK_REVIEWERS) {
      assert.ok(gate.issues.some((issue) => issue.includes(`missing trusted reviewer receipt for ${reviewer}`)), reviewer);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active plan review gate passes with baseline and mandatory risk reviewer receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "plan-review-all-receipts-"));
  try {
    const fixture = await readFile(FIXTURE, "utf8");
    await writeReview(root, withMandatoryRiskCoverage(withPlanPath(fixture), "selected"));
    await issueReviewerReceipts(root, [
      ...PLAN_REVIEW_BASE_REVIEWERS,
      ...PLAN_REVIEW_MANDATORY_RISK_REVIEWERS,
    ]);

    const gate = await validatePlanReviewGateForPlan({
      rootDir: root,
      planPath: PLAN_REL,
      requireActiveReview: true,
    });

    assert.equal(gate.pass, true);
    assert.deepEqual(gate.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("active plan review gate without explicit plan accepts latest review when an active graph exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "plan-review-active-no-plan-"));
  try {
    const fixture = await readFile(FIXTURE, "utf8");
    await writeReview(root, withMandatoryRiskCoverage(withPlanPath(fixture), "selected"));
    await writeUtf8(root, ".supervibe/memory/work-items/example/graph.json", JSON.stringify({
      epicId: "example",
      items: [
        { itemId: "example", type: "epic", status: "open" },
        { itemId: "example-followup", type: "followup", status: "open", acceptanceCriteria: ["triaged"], verificationCommands: ["node --version"], noWriteScopeRequired: true },
      ],
    }, null, 2));
    await issueReviewerReceipts(root, [
      ...PLAN_REVIEW_BASE_REVIEWERS,
      ...PLAN_REVIEW_MANDATORY_RISK_REVIEWERS,
    ]);

    const gate = await validatePlanReviewGateForPlan({
      rootDir: root,
      requireActiveReview: true,
    });

    assert.equal(gate.pass, true);
    assert.deepEqual(gate.issues, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
