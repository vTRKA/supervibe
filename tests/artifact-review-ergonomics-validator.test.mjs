import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateArtifactReviewErgonomics } from "../scripts/validate-artifact-review-ergonomics.mjs";

const VALID_REVIEW = `# Artifact Review: Verify Review Ship

## Outcome Summary

The validator set covers goals, next actions, artifacts, specialist evidence, visual blocks, and release path.

## Pre-Artifact Summary

Before creating artifacts, the reviewer summarized the intended review scope, accepted evidence, blocked shortcuts, and user decision that authorized artifact creation.

## Changed Artifacts

| Artifact | Purpose | Evidence |
| --- | --- | --- |
| \`scripts/validate-goals-contract.mjs\` | validates goal contracts | \`receipt-goals\` |

## Post-Artifact Summary

After artifact creation, the reviewer summarized the saved artifact path, validator result, remaining risks, and next user decision.

## Reviewer Decision

- Verdict: pass
- Confidence: 9/10
- Receipt: \`receipt-reviewer-1\`

## Evidence

- Verification command: \`node --test tests/goals-contract-validator.test.mjs\`
- Workflow receipt: \`receipt-reviewer-1\`
- Artifact hash: \`sha256:artifact-review\`

## Risks And Gaps

- Risk: release path scope remains bounded to current contracts.
- Gap: no unrelated release checks are claimed.

## Acceptance Mapping

- AC-1: goals contract evidence maps to \`receipt-goals\`.

## Next User Decision

Recommendation: Ship reviewed workflow.

- Ship reviewed workflow
- Revise before ship
- Keep reviewed artifacts and stop
`;

test("artifact review ergonomics validator accepts complete review artifacts", () => {
  const result = validateArtifactReviewErgonomics(VALID_REVIEW);

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
});

test("artifact review ergonomics validator rejects weak artifacts", () => {
  const result = validateArtifactReviewErgonomics("# Artifact Review\n\nLooks good. TBD.");

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "artifact-review-section-missing"));
  assert.ok(result.issues.some((issue) => issue.code === "artifact-review-placeholder"));
});

test("artifact review ergonomics validator rejects missing receipts", () => {
  const result = validateArtifactReviewErgonomics(VALID_REVIEW.replaceAll("receipt-reviewer-1", ""));

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "artifact-review-receipt-missing"));
});

test("artifact review ergonomics validator rejects missing pre and post artifact summaries", () => {
  const weakReview = VALID_REVIEW
    .replace(/\n## Pre-Artifact Summary\n\n[\s\S]*?\n## Changed Artifacts/, "\n## Changed Artifacts")
    .replace(/\n## Post-Artifact Summary\n\n[\s\S]*?\n## Reviewer Decision/, "\n## Reviewer Decision");

  const result = validateArtifactReviewErgonomics(weakReview);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "artifact-review-pre-summary-missing"));
  assert.ok(result.issues.some((issue) => issue.code === "artifact-review-post-summary-missing"));
});

test("artifact review ergonomics validator rejects raw handoff leakage in review prose", () => {
  const result = validateArtifactReviewErgonomics(`${VALID_REVIEW}\n\nNEXT_STEP_HANDOFF\nCurrent phase: review\nEND_NEXT_STEP_HANDOFF\n`);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "artifact-review-raw-handoff-leak"));
});

test("validate-artifact-review-ergonomics CLI validates fixtures deterministically", async () => {
  const dir = await mkdtemp(join(tmpdir(), "artifact-review-validator-"));
  const validFile = join(dir, "valid.md");
  const badFile = join(dir, "bad.md");
  await writeFile(validFile, VALID_REVIEW, "utf8");
  await writeFile(badFile, "# Artifact Review\n\nLooks fine.", "utf8");

  const ok = execFileSync(process.execPath, ["scripts/validate-artifact-review-ergonomics.mjs", "--file", validFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(ok, /^OK   artifact-review .*valid\.md/m);

  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-artifact-review-ergonomics.mjs", "--file", badFile], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }), /artifact review record\(s\) failed/);
});
