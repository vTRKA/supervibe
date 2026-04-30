import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ALLOWED_LICENSES = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
]);

const INCOMPATIBLE_LICENSE_PATTERNS = [
  /\bAGPL\b/i,
  /\bGPL\b/i,
  /\bLGPL\b/i,
  /Proprietary/i,
];

const HIGH_RISK_PACKAGE_NAMES = new Set([
  "node-gyp",
  "node-gyp-build",
  "prebuild-install",
  "postinstall-postinstall",
]);

export async function auditDependencyProvenance({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir);
  return auditDependencyProvenanceData({
    packageJson: await readJsonOptional(join(root, "package.json")),
    packageLock: await readJsonOptional(join(root, "package-lock.json")),
    scripts: {
      installSh: await readOptional(join(root, "install.sh")),
      installPs1: await readOptional(join(root, "install.ps1")),
      updateSh: await readOptional(join(root, "update.sh")),
      updatePs1: await readOptional(join(root, "update.ps1")),
    },
  });
}

export function auditDependencyProvenanceData(data = {}) {
  const issues = [];
  const warnings = [];
  const directDependencies = collectDirectDependencies(data.packageJson, data.packageLock);
  const transitiveHighRiskPackages = collectHighRiskPackages(data.packageLock);
  const licenseInventory = collectLicenseInventory(data.packageLock);

  if (!data.packageJson) {
    addIssue(issues, "missing-package-json", "package.json is missing", "Restore package.json before release.");
  }
  if (!data.packageLock) {
    addIssue(issues, "missing-package-lock", "package-lock.json is missing", "Run npm install --package-lock-only and review the lockfile.");
  }

  const packageVersion = data.packageJson?.version;
  const lockRoot = data.packageLock?.packages?.[""];
  if (data.packageLock && !lockRoot) {
    addIssue(issues, "lockfile-root-missing", "package-lock.json is missing the root package entry", "Regenerate package-lock.json with npm.");
  }
  if (packageVersion && lockRoot?.version && lockRoot.version !== packageVersion) {
    addIssue(issues, "lockfile-version-drift", `lockfile root version ${lockRoot.version} does not match package ${packageVersion}`, "Regenerate package-lock.json after the version change.");
  }

  for (const scope of ["dependencies", "devDependencies"]) {
    const drift = compareDependencySpec(data.packageJson?.[scope], lockRoot?.[scope]);
    if (drift.length > 0) {
      addIssue(issues, "dependency-spec-drift", `${scope} drift: ${drift.join(", ")}`, "Run npm install --package-lock-only and review dependency changes.");
    }
  }

  const minimumNodeMajor = extractMinimumNodeMajor(data.packageJson?.engines?.node);
  for (const dep of directDependencies) {
    if (!dep.version) {
      addIssue(issues, "direct-dependency-missing-lock-entry", `${dep.name} is missing a lockfile package entry`, "Regenerate package-lock.json.");
    }
    if (dep.resolved?.startsWith("http") && !dep.integrity) {
      addIssue(issues, "dependency-integrity-missing", `${dep.name} has a registry source without integrity`, "Regenerate package-lock.json with integrity fields.");
    }
    if (!dep.license || dep.license === "UNKNOWN") {
      addIssue(issues, "dependency-license-missing", `${dep.name} has no license in package-lock.json`, "Add a reviewed license exception or update the dependency.");
    } else if (!isLicenseAllowed(dep.license)) {
      addIssue(issues, "dependency-license-incompatible", `${dep.name} license ${dep.license} is not release-approved`, "Document a security/legal exception before release.");
    }
    const depMinimumNodeMajor = extractMinimumNodeMajor(dep.engines?.node);
    if (minimumNodeMajor && depMinimumNodeMajor && depMinimumNodeMajor > minimumNodeMajor) {
      addIssue(issues, "dependency-engine-unsupported", `${dep.name} requires Node ${dep.engines.node}, above package engine ${data.packageJson.engines.node}`, "Raise package.json engines.node or replace the dependency.");
    }
  }

  for (const scriptIssue of findUnpinnedExecutableDownloadUrls(data.scripts || {})) {
    addIssue(issues, "unpinned-executable-download", scriptIssue, "Use a version tag or exact commit in executable download URLs.");
  }

  for (const highRisk of transitiveHighRiskPackages) {
    warnings.push({
      code: "high-risk-transitive-package",
      message: `${highRisk.name}@${highRisk.version || "unknown"} appears in the transitive dependency graph`,
    });
  }

  return {
    pass: issues.length === 0,
    score: issues.length === 0 ? 10 : Math.max(0, Number((10 - issues.length * 0.5).toFixed(1))),
    issues,
    warnings,
    directDependencies,
    transitiveHighRiskPackages,
    licenseInventory,
  };
}

export function collectDirectDependencies(packageJson = {}, packageLock = {}) {
  const rootLock = packageLock?.packages?.[""] || {};
  const packages = packageLock?.packages || {};
  const direct = [];
  for (const [scope, deps] of Object.entries({
    dependencies: packageJson?.dependencies || {},
    devDependencies: packageJson?.devDependencies || {},
  })) {
    for (const [name, requested] of Object.entries(deps)) {
      const lockEntry = packages[`node_modules/${name}`] || {};
      direct.push({
        name,
        scope,
        requested,
        lockedRequested: rootLock?.[scope]?.[name] || null,
        version: lockEntry.version || null,
        resolved: lockEntry.resolved || null,
        integrity: lockEntry.integrity || null,
        license: normalizeLicense(lockEntry.license || lockEntry.licenses),
        engines: lockEntry.engines || {},
      });
    }
  }
  return direct.sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
}

export function collectLicenseInventory(packageLock = {}) {
  const packages = packageLock?.packages || {};
  return Object.entries(packages)
    .filter(([path]) => path)
    .map(([path, entry]) => ({
      name: packageNameFromLockPath(path),
      version: entry.version || "unknown",
      license: normalizeLicense(entry.license || entry.licenses),
      dev: Boolean(entry.dev),
      path,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

export function renderThirdPartyLicenseInventory(audit, { packageName = "supervibe-framework", packageVersion = "" } = {}) {
  const directRows = (audit.directDependencies || []).map((dep) =>
    `| ${dep.name} | ${dep.scope} | ${dep.version || "missing"} | ${dep.license || "UNKNOWN"} | ${dep.integrity ? "yes" : "missing"} |`
  );
  const licenseCounts = countLicenses(audit.licenseInventory || {});
  const countRows = Object.entries(licenseCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([license, count]) => `| ${license} | ${count} |`);

  return [
    "# Third-Party Licenses",
    "",
    `Package: ${packageName}${packageVersion ? ` v${packageVersion}` : ""}`,
    "Source: package-lock.json",
    "Scope: direct runtime and development dependencies plus lockfile license counts.",
    "",
    "## Direct Dependency Inventory",
    "",
    "| Package | Scope | Locked version | License | Integrity |",
    "| --- | --- | --- | --- | --- |",
    ...directRows,
    "",
    "## Lockfile License Counts",
    "",
    "| License | Packages |",
    "| --- | ---: |",
    ...countRows,
    "",
    "## Release Rule",
    "",
    "Unknown, missing, GPL-family, AGPL-family, LGPL-family, or proprietary licenses block release unless a reviewed exception with owner, expiry, rationale, and mitigation is recorded in the release-security evidence.",
    "",
  ].join("\n");
}

export function findUnpinnedExecutableDownloadUrls(scripts = {}) {
  const issues = [];
  for (const [name, source] of Object.entries(scripts)) {
    const text = String(source || "");
    for (const url of mutableRawGithubUrls(text)) {
      if (!isAllowedSupervibeMainInstallerUrl(url)) {
        issues.push(`${name} references a mutable raw.githubusercontent.com branch`);
      }
    }
    if (/SUPERVIBE_REF:-(?:master|HEAD)/.test(text) || /\$Ref\s*=.*else\s*\{\s*'(?:master|HEAD)'\s*\}/i.test(text)) {
      issues.push(`${name} defaults to a mutable branch ref`);
    }
  }
  return issues;
}

function mutableRawGithubUrls(source = "") {
  return String(source || "").match(/https:\/\/raw\.githubusercontent\.com\/[^\s"'`]+\/(?:main|master|HEAD)\/[^\s"'`]*/gi) || [];
}

function isAllowedSupervibeMainInstallerUrl(url = "") {
  return /^https:\/\/raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/(?:install|update)\.(?:sh|ps1)$/i.test(url);
}

function collectHighRiskPackages(packageLock = {}) {
  return Object.entries(packageLock?.packages || {})
    .filter(([path]) => HIGH_RISK_PACKAGE_NAMES.has(packageNameFromLockPath(path)))
    .map(([path, entry]) => ({ name: packageNameFromLockPath(path), version: entry.version || null, path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function compareDependencySpec(packageDeps = {}, lockDeps = {}) {
  const names = new Set([...Object.keys(packageDeps || {}), ...Object.keys(lockDeps || {})]);
  const drift = [];
  for (const name of names) {
    if ((packageDeps || {})[name] !== (lockDeps || {})[name]) {
      drift.push(name);
    }
  }
  return drift.sort();
}

function countLicenses(entries = []) {
  if (!Array.isArray(entries)) return {};
  return entries.reduce((acc, entry) => {
    const license = entry.license || "UNKNOWN";
    acc[license] = (acc[license] || 0) + 1;
    return acc;
  }, {});
}

function isLicenseAllowed(license) {
  if (!license) return false;
  if (ALLOWED_LICENSES.has(license)) return true;
  return !INCOMPATIBLE_LICENSE_PATTERNS.some((pattern) => pattern.test(license));
}

function normalizeLicense(value) {
  if (!value) return "UNKNOWN";
  if (Array.isArray(value)) return value.map(normalizeLicense).join(" OR ");
  if (typeof value === "object") return normalizeLicense(value.type || value.license || value.name);
  return String(value).trim() || "UNKNOWN";
}

function packageNameFromLockPath(path) {
  const parts = String(path || "").split("node_modules/").filter(Boolean);
  const clean = parts[parts.length - 1] || "";
  if (!clean) return "";
  if (clean.startsWith("@")) {
    const [scope, name] = clean.split("/");
    return `${scope}/${name}`;
  }
  return clean.split("/")[0];
}

function extractMinimumNodeMajor(range = "") {
  const match = String(range || "").match(/>=\s*v?(\d+)/);
  return match ? Number(match[1]) : null;
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
