import assert from "node:assert/strict";
import test from "node:test";
import {
  auditInstallIntegrity,
  auditInstallIntegrityData,
  createInstallIntegritySummary,
} from "../scripts/lib/supervibe-install-integrity.mjs";

test("install integrity audit passes current POSIX and Windows installers", async () => {
  const audit = await auditInstallIntegrity({ rootDir: process.cwd() });

  assert.equal(audit.pass, true);
  assert.equal(audit.score, 10);
  assert.equal(audit.expectations.commitPinEnv, "SUPERVIBE_EXPECTED_COMMIT");
  assert.equal(audit.expectations.packageChecksumEnv, "SUPERVIBE_EXPECTED_PACKAGE_SHA256");
  assert.equal(audit.expectations.defaultRef, "main");
  assert.equal(audit.expectations.liveMainDefault, true);
});

test("install integrity audit flags missing checksum, path safety, mutable refs, and stale docs", () => {
  const audit = auditInstallIntegrityData({
    scripts: {
      installSh: 'REF="${SUPERVIBE_REF:-master}"\ncurl https://raw.githubusercontent.com/other/repo/main/install.sh\nwill modify',
      installPs1: "$Ref = if ($env:SUPERVIBE_REF) { $env:SUPERVIBE_REF } else { 'HEAD' }\nwill modify",
      updateSh: "status --porcelain",
      updatePs1: "status --porcelain",
    },
    docs: { installIntegrity: "old install notes" },
  });

  assert.equal(audit.pass, false);
  assert.ok(audit.issues.some((issue) => issue.code === "install-ref-not-pinned"));
  assert.ok(audit.issues.some((issue) => issue.code === "mutable-raw-download-url"));
  assert.ok(audit.issues.some((issue) => issue.message.includes("checksum")));
  assert.ok(audit.issues.some((issue) => issue.message.includes("path safety")));
  assert.ok(audit.issues.some((issue) => issue.code === "install-integrity-doc-missing"));
});

test("install integrity summary preserves failed gate details", () => {
  const summary = createInstallIntegritySummary({
    pass: false,
    score: 8,
    issues: [{ code: "installer-integrity-missing", message: "missing guard" }],
  });

  assert.equal(summary.gate, "install-integrity");
  assert.equal(summary.pass, false);
  assert.equal(summary.issues[0].code, "installer-integrity-missing");
});
