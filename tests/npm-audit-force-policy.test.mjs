import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeNpmAuditForceLockfilePlan,
  analyzeNpmAuditForcePlan,
  formatNpmAuditForceLockfilePolicy,
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

test("npm audit force policy blocks lockfile framework downgrades", () => {
  const result = analyzeNpmAuditForceLockfilePlan({
    beforeLock: {
      packages: {
        "node_modules/next": { version: "16.2.4" },
        "node_modules/react": { version: "19.0.0" },
      },
    },
    afterLock: {
      packages: {
        "node_modules/next": { version: "9.3.3" },
        "node_modules/react": { version: "19.0.0" },
      },
    },
    latestVersions: { next: "16.2.4" },
  });

  assert.equal(result.status, "blocked_downgrade");
  assert.equal(result.blocked[0].packageName, "next");
  assert.match(formatNpmAuditForceLockfilePolicy(result), /PACKAGE_RESULT: next blocked_downgrade 16\.2\.4 -> 9\.3\.3/);
});
