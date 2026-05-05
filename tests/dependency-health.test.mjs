import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeDependencyHealthData,
  formatDependencyHealthReport,
} from "../scripts/lib/dependency-health.mjs";

test("dependency health classifies nested vulnerable transitive dependency and blocks audit force downgrade", () => {
  const packageJson = {
    dependencies: {
      next: "16.2.4",
      "@tailwindcss/postcss": "4.2.4",
    },
  };
  const packageLock = {
    packages: {
      "": {
        dependencies: packageJson.dependencies,
      },
      "node_modules/next": {
        version: "16.2.4",
      },
      "node_modules/next/node_modules/postcss": {
        version: "8.4.31",
      },
      "node_modules/@tailwindcss/postcss": {
        version: "4.2.4",
      },
      "node_modules/@tailwindcss/postcss/node_modules/postcss": {
        version: "8.5.14",
      },
    },
  };
  const npmAudit = {
    vulnerabilities: {
      postcss: {
        name: "postcss",
        severity: "moderate",
        range: "<8.5.10",
        nodes: ["node_modules/next/node_modules/postcss"],
        effects: ["next"],
        fixAvailable: {
          name: "next",
          version: "9.3.3",
          isSemVerMajor: true,
        },
      },
    },
    metadata: {
      vulnerabilities: { moderate: 2 },
    },
  };

  const report = analyzeDependencyHealthData({
    packageJson,
    packageLock,
    npmAudit,
    npmOutdated: {
      react: { current: "19.2.0", wanted: "19.2.1", latest: "19.2.1" },
    },
    registryLatest: {
      next: "16.2.4",
      postcss: "8.5.14",
    },
  });

  assert.equal(report.pass, false);
  assert.equal(report.summary.vulnerableTransitives, 1);
  assert.equal(report.summary.blockedForceFixes, 1);
  assert.ok(report.issues.some((issue) => issue.code === "transitive-vulnerable-dependency"));
  assert.ok(report.issues.some((issue) => issue.code === "npm-audit-force-blocked-downgrade"));

  const finding = report.auditFindings[0];
  assert.deepEqual(finding.vulnerableChains, ["next@16.2.4 -> postcss@8.4.31"]);
  assert.deepEqual(finding.okChains, ["@tailwindcss/postcss@4.2.4 -> postcss@8.5.14"]);
  assert.deepEqual(finding.remediation.override, {
    overrides: {
      postcss: "8.5.14",
    },
  });
  assert.equal(finding.remediation.overrideScope, "package-level");
  assert.equal(finding.remediation.validationStatus, "requires-local-install-validation");
  assert.equal(finding.remediation.reason, "npm audit fix --force is unsafe because it would downgrade a framework major/minor line.");
  assert.deepEqual(finding.remediation.verificationCommands, [
    "npm install",
    "npm ls postcss --all",
    "npm audit --json",
    "npm run lint",
    "npm run build",
    "node <resolved-supervibe-plugin-root>/scripts/dependency-health.mjs --root .",
  ]);
  assert.equal(report.outdatedFindings[0].policy.level, "safe-patch-update");

  const formatted = formatDependencyHealthReport(report);
  assert.match(formatted, /VULNERABLE_CHAIN: next@16\.2\.4 -> postcss@8\.4\.31/);
  assert.match(formatted, /OCCURRENCE_OK: @tailwindcss\/postcss@4\.2\.4 -> postcss@8\.5\.14/);
  assert.match(formatted, /NPM_AUDIT_FORCE: blocked_downgrade next 16\.2\.4 -> 9\.3\.3/);
  assert.match(formatted, /OVERRIDE_OPTION: \{"overrides":\{"postcss":"8\.5\.14"\}\}/);
  assert.match(formatted, /OVERRIDE_SCOPE: package-level/);
  assert.match(formatted, /REMEDIATION_VALIDATION: requires-local-install-validation/);
  assert.match(formatted, /REMEDIATION_REASON: npm audit fix --force is unsafe/);
  assert.match(formatted, /REMEDIATION_VERIFY: npm install/);
  assert.match(formatted, /REMEDIATION_VERIFY: npm ls postcss --all/);
  assert.match(formatted, /REMEDIATION_VERIFY: node <resolved-supervibe-plugin-root>\/scripts\/dependency-health\.mjs --root \./);
});

test("dependency health covers non-npm ecosystems without false green status", () => {
  const report = analyzeDependencyHealthData({
    composerJson: { require: { "laravel/framework": "^12.0" } },
    pyprojectToml: "[project]\nname = \"api\"\n",
    cargoToml: "[package]\nname = \"engine\"\nversion = \"0.1.0\"\n",
    goMod: "module example.com/app\n\ngo 1.24\n",
    pomXml: "<project><modelVersion>4.0.0</modelVersion></project>",
  });

  assert.equal(report.pass, false);
  assert.deepEqual(report.ecosystems.map((entry) => entry.id), ["composer", "python", "cargo", "go", "maven"]);
  assert.equal(report.summary.ecosystems, 5);
  assert.equal(report.summary.actionRequiredEcosystems, 5);

  const issueCodes = report.issues.map((entry) => entry.code);
  assert.ok(issueCodes.includes("missing-composer-lock"));
  assert.ok(issueCodes.includes("composer-audit-missing"));
  assert.ok(issueCodes.includes("missing-python-lock"));
  assert.ok(issueCodes.includes("python-audit-missing"));
  assert.ok(issueCodes.includes("missing-cargo-lock"));
  assert.ok(issueCodes.includes("cargo-audit-missing"));
  assert.ok(issueCodes.includes("missing-go-sum"));
  assert.ok(issueCodes.includes("govulncheck-missing"));
  assert.ok(issueCodes.includes("java-sca-evidence-missing"));

  const formatted = formatDependencyHealthReport(report);
  assert.match(formatted, /ECOSYSTEM: composer status=action-required pass=false/);
  assert.match(formatted, /ECOSYSTEM: python status=action-required pass=false/);
  assert.match(formatted, /ECOSYSTEM: cargo status=action-required pass=false/);
  assert.match(formatted, /ECOSYSTEM: go status=action-required pass=false/);
  assert.match(formatted, /ECOSYSTEM: maven status=action-required pass=false/);
  assert.match(formatted, /ISSUE: java-sca-evidence-missing/);
});
