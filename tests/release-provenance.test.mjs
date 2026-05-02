import assert from "node:assert/strict";
import test from "node:test";

import { auditReleaseSecurityData } from "../scripts/lib/supervibe-release-security-audit.mjs";

test("release security report includes provenance and rollback manifest status", () => {
  const audit = auditReleaseSecurityData({
    packageJson: { version: "2.0.43" },
    packageLock: { version: "2.0.43" },
    readme: "v2.0.43 docs/release-security.md docs/third-party-licenses.md docs/install-integrity.md",
    changelog: "Release security and install integrity updates.",
    releaseDocs: {
      releaseSecurity: "v2.0.43 commit SHA npm run audit:release-security vulnerability exceptions",
      thirdPartyLicenses: "package-lock.json",
      installIntegrity: "SUPERVIBE_EXPECTED_COMMIT SUPERVIBE_EXPECTED_PACKAGE_SHA256 path traversal",
    },
    dependencyProvenance: { pass: true, issues: [], directDependencies: [] },
    installIntegrity: { pass: true, issues: [] },
    pluginPackageAudit: { pass: true, issues: [] },
    contextThreatModel: { pass: true, failed: [], total: 1 },
    commitSha: "abc123",
    artifactChecksums: { "package.json": "checksum" },
    releaseManifest: { status: "local-dev", packageVersion: "2.0.43" },
    rollbackManifest: { commands: ["git revert abc123"] },
  });

  assert.equal(audit.pass, true);
  assert.equal(audit.score, 10);
  assert.equal(audit.report.releaseManifest.status, "local-dev");
  assert.equal(audit.report.rollbackManifest.available, true);
  assert.equal(audit.report.artifactChecksums["package.json"], "checksum");
});
