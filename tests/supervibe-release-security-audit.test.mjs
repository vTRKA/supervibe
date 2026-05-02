import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFinalAcceptance } from "../scripts/lib/autonomous-loop-final-acceptance.mjs";
import {
  auditReleaseSecurity,
  auditReleaseSecurityData,
  createReleaseSecurityGate,
  renderReleaseSecurityReport,
  validateVulnerabilityExceptions,
} from "../scripts/lib/supervibe-release-security-audit.mjs";

test("release security audit passes current repo and produces redacted provenance report", async () => {
  const audit = await auditReleaseSecurity({ rootDir: process.cwd(), generatedAt: "2026-04-30T00:00:00.000Z" });

  assert.equal(audit.pass, true);
  assert.equal(audit.score, 10);
  assert.deepEqual(audit.warnings, []);
  assert.equal(audit.report.packageVersion, "2.0.35");
  assert.ok(audit.report.verificationCommands.includes("npm run audit:release-security"));
  assert.doesNotMatch(audit.reportText, new RegExp(["D:", "private workspace", "legacy-app"].join("\\\\")));
});

test("release security audit catches stale docs, stale license inventory, and vulnerability exceptions", () => {
  const packageJson = { version: "1.0.0", engines: { node: ">=22" }, dependencies: { a: "^1.0.0" } };
  const packageLock = {
    version: "1.0.0",
    packages: {
      "": { version: "1.0.0", dependencies: { a: "^1.0.0" } },
      "node_modules/a": { version: "1.0.1", integrity: "sha512-a", license: "MIT" },
    },
  };
  const audit = auditReleaseSecurityData({
    rootDir: "C:\\Users\\person\\repo",
    packageJson,
    packageLock,
    readme: "README v1.0.0",
    changelog: "# Changelog",
    releaseDocs: {
      releaseSecurity: "Supervibe v0.9.0",
      thirdPartyLicenses: "Source: package-lock.json",
      installIntegrity: "SUPERVIBE_EXPECTED_COMMIT",
    },
    scripts: {
      installSh: 'REF="${SUPERVIBE_REF:-main}"',
      installPs1: "$Ref = if ($env:SUPERVIBE_REF) { $env:SUPERVIBE_REF } else { 'main' }",
      updateSh: "",
      updatePs1: "",
    },
    vulnerabilityExceptions: [{ id: "CVE-1", severity: "high", rationale: "temporary", owner: "sec", expiresAt: "2020-01-01", mitigation: "pin" }],
  }, { now: "2026-04-30T00:00:00.000Z" });

  assert.equal(audit.pass, false);
  assert.ok(audit.issues.some((issue) => issue.code === "release-security-doc-version"));
  assert.ok(audit.issues.some((issue) => issue.code === "license-inventory-stale"));
  assert.ok(audit.issues.some((issue) => issue.code === "vulnerability-exception-expired"));
  assert.ok(audit.issues.some((issue) => issue.code.startsWith("install-integrity:")));
});

test("release security gate integrates with final acceptance", () => {
  const gate = createReleaseSecurityGate({
    pass: false,
    score: 8,
    issues: [{ code: "license-inventory-stale", message: "missing dependency" }],
  });
  const result = evaluateFinalAcceptance({
    state: {
      schema_version: 1,
      command_version: 1,
      rubric_version: 1,
      plugin_version: "1.8.1",
      release_gate: { release_security_required: true },
    },
    releaseSecurityAudit: gate,
  });

  assert.equal(result.pass, false);
  assert.ok(result.missing.some((item) => item.includes("release security audit")));
});

test("vulnerability exception validator requires complete future-dated records", () => {
  assert.equal(validateVulnerabilityExceptions([
    { id: "CVE-1", severity: "high", rationale: "accepted", owner: "sec", expiresAt: "2026-12-31", mitigation: "pinned" },
  ], "2026-04-30T00:00:00.000Z").length, 0);
  assert.ok(validateVulnerabilityExceptions([{ id: "CVE-2", expiresAt: "2020-01-01" }], "2026-04-30T00:00:00.000Z").length > 0);
});

test("release security report redacts local paths and secrets", () => {
  const text = renderReleaseSecurityReport({
    root: "C:\\Users\\person\\repo",
    token: "token=secret-value",
    artifactChecksums: { "package.json": "abc" },
  }, { rootDir: "C:\\Users\\person\\repo" });

  assert.doesNotMatch(text, /C:\\Users\\person\\repo/);
  assert.match(text, /\[REDACTED\]/);
});
