import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeNpmAuditForcePlan,
  formatNpmAuditForcePolicy,
} from "../scripts/lib/npm-audit-force-policy.mjs";

test("npm audit force policy blocks framework major/minor downgrades", () => {
  const result = analyzeNpmAuditForcePlan({
    packageName: "next",
    currentVersion: "16.2.4",
    proposedVersion: "9.3.3",
    latestVersion: "16.2.4",
  });

  assert.equal(result.status, "blocked_downgrade");
  assert.equal(result.currentVersion, "16.2.4");
  assert.equal(result.proposedVersion, "9.3.3");
  assert.equal(result.latestVersion, "16.2.4");
  assert.match(formatNpmAuditForcePolicy(result), /STATUS: blocked_downgrade/);
});

test("npm audit force policy allows non-downgrade plans only with review", () => {
  const result = analyzeNpmAuditForcePlan({
    packageName: "left-pad",
    currentVersion: "1.1.0",
    proposedVersion: "1.3.0",
    latestVersion: "1.3.0",
  });

  assert.equal(result.status, "allowed_with_review");
  assert.match(result.reason, /normal dependency review/);
});
