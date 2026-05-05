const DEFAULT_FRAMEWORK_PACKAGES = new Set([
  "next",
  "react",
  "react-dom",
  "vue",
  "nuxt",
  "svelte",
  "@sveltejs/kit",
  "vite",
  "@vitejs/plugin-react",
  "laravel/framework",
]);

export function analyzeNpmAuditForcePlan({
  packageName = "",
  currentVersion = "",
  proposedVersion = "",
  latestVersion = "",
  frameworkPackages = DEFAULT_FRAMEWORK_PACKAGES,
} = {}) {
  const name = String(packageName || "").trim();
  const current = parseSemver(currentVersion);
  const proposed = parseSemver(proposedVersion);
  const latest = parseSemver(latestVersion);
  const framework = frameworkPackages instanceof Set
    ? frameworkPackages.has(name)
    : new Set(frameworkPackages || []).has(name);

  const downgradesMajorOrMinor = current && proposed
    && (proposed.major < current.major || (proposed.major === current.major && proposed.minor < current.minor));
  const leavesLatestStableLine = latest && proposed
    && (proposed.major < latest.major || (proposed.major === latest.major && proposed.minor < latest.minor));

  if (framework && (downgradesMajorOrMinor || leavesLatestStableLine)) {
    return {
      status: "blocked_downgrade",
      packageName: name,
      currentVersion: normalizeVersion(currentVersion),
      proposedVersion: normalizeVersion(proposedVersion),
      latestVersion: normalizeVersion(latestVersion),
      reason: "npm audit fix --force would move a framework package to an older major/minor line.",
      safeOptions: [
        "wait for an upstream patched release on the current supported line",
        "use a supported override only with advisory and compatibility evidence",
        "document reviewed risk acceptance with owner, expiry, and mitigation",
      ],
    };
  }

  return {
    status: "allowed_with_review",
    packageName: name,
    currentVersion: normalizeVersion(currentVersion),
    proposedVersion: normalizeVersion(proposedVersion),
    latestVersion: normalizeVersion(latestVersion),
    reason: "No framework major/minor downgrade was detected; still require normal dependency review and tests.",
    safeOptions: ["run dependency review", "run lockfile diff", "run targeted build/test verification"],
  };
}

export function analyzeNpmAuditForceLockfilePlan({
  beforeLock = {},
  afterLock = {},
  latestVersions = {},
  frameworkPackages = DEFAULT_FRAMEWORK_PACKAGES,
} = {}) {
  const frameworkSet = frameworkPackages instanceof Set ? frameworkPackages : new Set(frameworkPackages || []);
  const packageNames = new Set([
    ...Object.keys(lockfilePackageVersions(beforeLock)),
    ...Object.keys(lockfilePackageVersions(afterLock)),
  ].filter((name) => frameworkSet.has(name)));
  const packageResults = [...packageNames].sort().map((packageName) => {
    const beforeVersions = lockfilePackageVersions(beforeLock);
    const afterVersions = lockfilePackageVersions(afterLock);
    return analyzeNpmAuditForcePlan({
      packageName,
      currentVersion: beforeVersions[packageName] || "",
      proposedVersion: afterVersions[packageName] || "",
      latestVersion: latestVersions[packageName] || beforeVersions[packageName] || "",
      frameworkPackages,
    });
  });
  const blocked = packageResults.filter((entry) => entry.status === "blocked_downgrade");
  return {
    status: blocked.length > 0 ? "blocked_downgrade" : "allowed_with_review",
    packageResults,
    blocked,
    reason: blocked.length > 0
      ? "npm audit fix --force changed one or more framework packages to an older major/minor line."
      : "No framework major/minor downgrade was detected in the lockfile diff; still require normal dependency review and tests.",
  };
}

export function formatNpmAuditForcePolicy(result = {}) {
  return [
    "SUPERVIBE_NPM_AUDIT_FORCE_POLICY",
    `STATUS: ${result.status || "unknown"}`,
    `PACKAGE: ${result.packageName || "unknown"}`,
    `CURRENT: ${result.currentVersion || "unknown"}`,
    `PROPOSED: ${result.proposedVersion || "unknown"}`,
    `LATEST: ${result.latestVersion || "unknown"}`,
    `REASON: ${result.reason || "not evaluated"}`,
    `SAFE_OPTIONS: ${(result.safeOptions || []).join(" | ") || "none"}`,
  ].join("\n");
}

export function formatNpmAuditForceLockfilePolicy(result = {}) {
  const lines = [
    "SUPERVIBE_NPM_AUDIT_FORCE_LOCKFILE_POLICY",
    `STATUS: ${result.status || "unknown"}`,
    `BLOCKED: ${(result.blocked || []).length}`,
    `REASON: ${result.reason || "not evaluated"}`,
  ];
  for (const entry of result.packageResults || []) {
    lines.push(`PACKAGE_RESULT: ${entry.packageName} ${entry.status} ${entry.currentVersion || "unknown"} -> ${entry.proposedVersion || "unknown"} latest=${entry.latestVersion || "unknown"}`);
  }
  return lines.join("\n");
}

function parseSemver(value) {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function normalizeVersion(value) {
  const parsed = parseSemver(value);
  return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : String(value || "");
}

function lockfilePackageVersions(lock = {}) {
  const out = {};
  const packages = lock?.packages || {};
  for (const [path, value] of Object.entries(packages)) {
    if (!path.startsWith("node_modules/") || !value?.version) continue;
    const name = path.slice("node_modules/".length);
    if (!name || name.includes("node_modules/")) continue;
    out[name] = value.version;
  }
  const deps = lock?.dependencies || {};
  for (const [name, value] of Object.entries(deps)) {
    if (value?.version && !out[name]) out[name] = value.version;
  }
  return out;
}
