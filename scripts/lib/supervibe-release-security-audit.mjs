import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";
import { auditPluginPackage } from "./supervibe-plugin-package-audit.mjs";
import {
  auditDependencyProvenance,
  auditDependencyProvenanceData,
} from "./supervibe-dependency-provenance.mjs";
import {
  auditInstallIntegrity,
  auditInstallIntegrityData,
} from "./supervibe-install-integrity.mjs";

const execFileAsync = promisify(execFile);

const RELEASE_ARTIFACT_PATHS = [
  "package.json",
  "package-lock.json",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "gemini-extension.json",
  "install.sh",
  "install.ps1",
  "update.sh",
  "update.ps1",
  "README.md",
  "CHANGELOG.md",
  "docs/release-security.md",
  "docs/third-party-licenses.md",
  "docs/install-integrity.md",
];

export async function auditReleaseSecurity({ rootDir = process.cwd(), generatedAt = "deterministic-local" } = {}) {
  const root = resolve(rootDir);
  const [dependencyProvenance, installIntegrity, pluginPackageAudit] = await Promise.all([
    auditDependencyProvenance({ rootDir: root }),
    auditInstallIntegrity({ rootDir: root }),
    auditPluginPackageWithRegistryRetry(root),
  ]);

  return auditReleaseSecurityData({
    rootDir: root,
    packageJson: await readJsonOptional(join(root, "package.json")),
    packageLock: await readJsonOptional(join(root, "package-lock.json")),
    readme: await readOptional(join(root, "README.md")),
    changelog: await readOptional(join(root, "CHANGELOG.md")),
    releaseDocs: {
      releaseSecurity: await readOptional(join(root, "docs", "release-security.md")),
      thirdPartyLicenses: await readOptional(join(root, "docs", "third-party-licenses.md")),
      installIntegrity: await readOptional(join(root, "docs", "install-integrity.md")),
    },
    dependencyProvenance,
    installIntegrity,
    pluginPackageAudit,
    commitSha: await readGitCommit(root),
    artifactChecksums: await collectArtifactChecksums(root),
  }, { generatedAt });
}

async function auditPluginPackageWithRegistryRetry(root) {
  let audit = await auditPluginPackage({ rootDir: root });
  for (let attempt = 0; attempt < 10 && registryRace(audit); attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    audit = await auditPluginPackage({ rootDir: root });
  }
  return audit;
}

function registryRace(audit) {
  return audit?.issues?.length > 0 && audit.issues.every((issue) => issue.code.startsWith("registry") || issue.code === "missing-registry");
}

export function auditReleaseSecurityData(data = {}, { generatedAt = "deterministic-local", now = new Date().toISOString() } = {}) {
  const issues = [];
  const warnings = [];
  const packageVersion = data.packageJson?.version || data.packageLock?.version || "unknown";
  const dependencyProvenance = data.dependencyProvenance || auditDependencyProvenanceData(data);
  const installIntegrity = data.installIntegrity || auditInstallIntegrityData(data);
  const pluginPackageAudit = data.pluginPackageAudit || null;

  mergeSubAuditIssues(issues, "dependency-provenance", dependencyProvenance);
  mergeSubAuditIssues(issues, "install-integrity", installIntegrity);
  if (pluginPackageAudit) mergeSubAuditIssues(issues, "plugin-package", pluginPackageAudit);

  validateReleaseDocs(data, dependencyProvenance, packageVersion, issues);
  validateVersionEvidence(data, packageVersion, issues);
  validateVulnerabilityEvidence(data, now, issues, warnings);

  const report = buildReleaseSecurityReport(data, {
    generatedAt,
    packageVersion,
    dependencyProvenance,
    installIntegrity,
    pluginPackageAudit,
    issueCount: issues.length,
  });

  return {
    pass: issues.length === 0,
    score: issues.length === 0 ? 10 : Math.max(0, Number((10 - issues.length * 0.5).toFixed(1))),
    issues,
    warnings,
    report,
    reportText: renderReleaseSecurityReport(report, { rootDir: data.rootDir }),
    dependencyProvenance,
    installIntegrity,
    pluginPackageAudit,
  };
}

export function createReleaseSecurityGate(audit) {
  return {
    gate: "release-security",
    pass: Boolean(audit?.pass),
    score: audit?.score ?? 0,
    missing: audit?.issues?.map((issue) => `${issue.code}: ${issue.message}`) || ["release security audit was not run"],
  };
}

export function validateVulnerabilityExceptions(exceptions = [], now = new Date().toISOString()) {
  const issues = [];
  const current = new Date(now).getTime();
  for (const exception of exceptions) {
    for (const field of ["id", "severity", "rationale", "owner", "expiresAt", "mitigation"]) {
      if (!exception?.[field]) {
        addIssue(issues, "vulnerability-exception-incomplete", `vulnerability exception ${exception?.id || "unknown"} is missing ${field}`, "Complete the vulnerability exception record before release.");
      }
    }
    const expiresAt = Date.parse(exception?.expiresAt || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= current) {
      addIssue(issues, "vulnerability-exception-expired", `vulnerability exception ${exception?.id || "unknown"} is expired`, "Renew or remove the expired exception.");
    }
  }
  return issues;
}

export function renderReleaseSecurityReport(report = {}, { rootDir = "" } = {}) {
  const text = JSON.stringify(report, null, 2);
  return redactLocalPaths(redactSensitiveContent(text), rootDir);
}

function validateReleaseDocs(data, dependencyProvenance, packageVersion, issues) {
  const releaseSecurity = data.releaseDocs?.releaseSecurity || "";
  const thirdParty = data.releaseDocs?.thirdPartyLicenses || "";
  const installIntegrity = data.releaseDocs?.installIntegrity || "";

  if (!releaseSecurity) {
    addIssue(issues, "release-security-doc-missing", "docs/release-security.md is missing", "Add the release security and provenance document.");
  } else {
    requireDocText(releaseSecurity, `v${packageVersion}`, "release-security-doc-version", "release security doc must cite the package version", issues);
    requireDocText(releaseSecurity, "commit SHA", "release-security-doc-provenance", "release security doc must describe commit SHA provenance", issues);
    requireDocText(releaseSecurity, "npm run audit:release-security", "release-security-doc-command", "release security doc must list the release audit command", issues);
    requireDocText(releaseSecurity, "vulnerability exceptions", "release-security-doc-exceptions", "release security doc must define vulnerability exceptions", issues);
  }

  if (!thirdParty) {
    addIssue(issues, "license-inventory-missing", "docs/third-party-licenses.md is missing", "Generate and review the third-party license inventory.");
  } else {
    requireDocText(thirdParty, "package-lock.json", "license-inventory-source-missing", "license inventory must name package-lock.json as source", issues);
    for (const dep of dependencyProvenance.directDependencies || []) {
      if (!thirdParty.includes(`| ${dep.name} |`) || (dep.version && !thirdParty.includes(`| ${dep.version} |`))) {
        addIssue(issues, "license-inventory-stale", `license inventory is missing ${dep.name}@${dep.version || "missing"}`, "Regenerate docs/third-party-licenses.md from the lockfile.");
      }
    }
  }

  if (!installIntegrity) {
    addIssue(issues, "install-integrity-doc-missing", "docs/install-integrity.md is missing", "Add install integrity documentation.");
  } else {
    requireDocText(installIntegrity, "SUPERVIBE_EXPECTED_COMMIT", "install-doc-commit-missing", "install doc must explain expected commit verification", issues);
    requireDocText(installIntegrity, "SUPERVIBE_EXPECTED_PACKAGE_SHA256", "install-doc-checksum-missing", "install doc must explain package checksum verification", issues);
    requireDocText(installIntegrity, "path traversal", "install-doc-path-safety-missing", "install doc must explain path traversal refusal", issues);
  }
}

function validateVersionEvidence(data, packageVersion, issues) {
  const readme = data.readme || "";
  const changelog = data.changelog || "";
  if (packageVersion !== "unknown" && !readme.includes(`v${packageVersion}`)) {
    addIssue(issues, "readme-version-missing", `README does not mention v${packageVersion}`, "Update README version evidence.");
  }
  if (!readme.includes("docs/release-security.md") || !readme.includes("docs/third-party-licenses.md") || !readme.includes("docs/install-integrity.md")) {
    addIssue(issues, "readme-release-links-missing", "README must link release security, license, and install integrity docs", "Add release integrity links to README.");
  }
  if (!/Release security/i.test(changelog) || !/install integrity/i.test(changelog)) {
    addIssue(issues, "changelog-release-security-missing", "CHANGELOG must mention release security and install integrity", "Add release security notes to CHANGELOG.");
  }
}

function validateVulnerabilityEvidence(data, now, issues, warnings) {
  for (const issue of validateVulnerabilityExceptions(data.vulnerabilityExceptions || [], now)) {
    issues.push(issue);
  }
  const high = data.npmAudit?.metadata?.vulnerabilities?.high || 0;
  const critical = data.npmAudit?.metadata?.vulnerabilities?.critical || 0;
  if (high + critical > 0 && (data.vulnerabilityExceptions || []).length === 0) {
    addIssue(issues, "npm-audit-high-without-exception", `npm audit reports ${high} high and ${critical} critical vulnerabilities without exceptions`, "Fix the advisory or add a reviewed expiring exception.");
  }
}

function buildReleaseSecurityReport(data, details) {
  return {
    generatedAt: details.generatedAt,
    packageVersion: details.packageVersion,
    commitSha: data.commitSha || "unknown",
    manifestPaths: [
      ".claude-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      ".cursor-plugin/plugin.json",
      "gemini-extension.json",
      ".claude-plugin/marketplace.json",
    ],
    verificationCommands: [
      "npm test -- tests/supervibe-release-security-audit.test.mjs tests/supervibe-install-integrity.test.mjs tests/supervibe-dependency-provenance.test.mjs",
      "npm run audit:release-security",
      "npm run check",
    ],
    artifactChecksums: data.artifactChecksums || {},
    gates: {
      dependencyProvenance: Boolean(details.dependencyProvenance?.pass),
      installIntegrity: Boolean(details.installIntegrity?.pass),
      pluginPackageAudit: details.pluginPackageAudit ? Boolean(details.pluginPackageAudit.pass) : null,
      issueCount: details.issueCount,
    },
  };
}

function mergeSubAuditIssues(issues, prefix, audit) {
  for (const issue of audit?.issues || []) {
    addIssue(issues, `${prefix}:${issue.code}`, issue.message, issue.nextAction || `Fix ${prefix}.`);
  }
}

function requireDocText(source, needle, code, message, issues) {
  if (!String(source).toLowerCase().includes(String(needle).toLowerCase())) {
    addIssue(issues, code, message, "Update release security documentation.");
  }
}

async function collectArtifactChecksums(root) {
  const checksums = {};
  for (const path of RELEASE_ARTIFACT_PATHS) {
    const content = await readOptional(join(root, path));
    if (content) checksums[path] = sha256(content);
  }
  return checksums;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function redactLocalPaths(text, rootDir = "") {
  if (!rootDir) return text;
  return text.split(rootDir).join("[REPO_ROOT]").replace(/[A-Z]:\\Users\\[^\\"]+/g, "[USER_PATH]");
}

async function readGitCommit(root) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

function addIssue(issues, code, message, nextAction) {
  issues.push({ code, message, nextAction });
}

async function readJsonOptional(path) {
  const content = await readOptional(path);
  if (!content) return null;
  return JSON.parse(content);
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}
