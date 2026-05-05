import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { analyzeNpmAuditForcePlan } from "./npm-audit-force-policy.mjs";

const FRAMEWORK_PACKAGES = new Set([
  "next",
  "react",
  "react-dom",
  "vue",
  "nuxt",
  "svelte",
  "@sveltejs/kit",
  "vite",
  "@vitejs/plugin-react",
]);

const DEPENDENCY_MANIFEST_FILES = [
  "package.json",
  "composer.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
];

export function analyzeDependencyHealthData(options = {}) {
  const ecosystems = [];

  if (hasNpmEvidence(options)) {
    ecosystems.push(analyzeNpmDependencyHealthData(options));
  }
  if (hasComposerEvidence(options)) {
    ecosystems.push(analyzeComposerDependencyHealthData(options));
  }
  if (hasPythonEvidence(options)) {
    ecosystems.push(analyzePythonDependencyHealthData(options));
  }
  if (hasCargoEvidence(options)) {
    ecosystems.push(analyzeCargoDependencyHealthData(options));
  }
  if (hasGoEvidence(options)) {
    ecosystems.push(analyzeGoDependencyHealthData(options));
  }
  if (hasJavaEvidence(options)) {
    ecosystems.push(analyzeJavaDependencyHealthData(options));
  }

  if (ecosystems.length === 0) {
    return {
      schemaVersion: 2,
      pass: true,
      status: "not-applicable",
      ecosystems: [],
      ecosystemFindings: [],
      issues: [],
      warnings: [{
        code: "no-supported-dependency-ecosystem",
        message: "No supported dependency manifest was detected.",
        nextAction: "Run dependency health from an app root that contains package.json, composer.json, pyproject.toml, Cargo.toml, go.mod, pom.xml, or build.gradle.",
      }],
      auditFindings: [],
      outdatedFindings: [],
      summary: emptySummary(),
    };
  }

  const issues = ecosystems.flatMap((entry) => entry.issues || []);
  const warnings = ecosystems.flatMap((entry) => entry.warnings || []);
  const npm = ecosystems.find((entry) => entry.id === "npm");
  const auditFindings = npm?.auditFindings || [];
  const outdatedFindings = npm?.outdatedFindings || [];
  const summary = ecosystems.reduce((acc, entry) => ({
    auditVulnerabilities: acc.auditVulnerabilities + (entry.summary?.auditVulnerabilities || 0),
    vulnerableTransitives: acc.vulnerableTransitives + (entry.summary?.vulnerableTransitives || 0),
    outdated: acc.outdated + (entry.summary?.outdated || 0),
    blockedForceFixes: acc.blockedForceFixes + (entry.summary?.blockedForceFixes || 0),
    ecosystems: acc.ecosystems + 1,
    actionRequiredEcosystems: acc.actionRequiredEcosystems + (entry.pass ? 0 : 1),
  }), emptySummary());

  return {
    schemaVersion: 2,
    pass: issues.length === 0,
    status: issues.length === 0 ? warnings.length > 0 ? "healthy-with-warnings" : "healthy" : "action-required",
    ecosystems,
    ecosystemFindings: ecosystems.flatMap((entry) => entry.findings || []),
    issues,
    warnings,
    auditFindings,
    outdatedFindings,
    summary,
  };
}

export async function collectDependencyHealth({ rootDir = process.cwd(), env = process.env } = {}) {
  const root = resolve(rootDir);
  const options = {
    packageJson: readJsonOptional(join(root, "package.json")),
    packageLock: readJsonOptional(join(root, "package-lock.json")),
    composerJson: readJsonOptional(join(root, "composer.json")),
    composerLock: readJsonOptional(join(root, "composer.lock")),
    pyprojectToml: readTextOptional(join(root, "pyproject.toml")),
    requirementsTxt: readTextOptional(join(root, "requirements.txt")),
    pipfile: readTextOptional(join(root, "Pipfile")),
    poetryLock: readTextOptional(join(root, "poetry.lock")),
    pipfileLock: readJsonOptional(join(root, "Pipfile.lock")),
    uvLock: readTextOptional(join(root, "uv.lock")),
    pdmLock: readTextOptional(join(root, "pdm.lock")),
    cargoToml: readTextOptional(join(root, "Cargo.toml")),
    cargoLock: readTextOptional(join(root, "Cargo.lock")),
    goMod: readTextOptional(join(root, "go.mod")),
    goSum: readTextOptional(join(root, "go.sum")),
    pomXml: readTextOptional(join(root, "pom.xml")),
    gradleBuild: readFirstTextOptional([
      join(root, "build.gradle"),
      join(root, "build.gradle.kts"),
    ]),
    gradleLockfile: readFirstTextOptional([
      join(root, "gradle.lockfile"),
      join(root, "gradle", "dependency-locks", "dependencies.lock"),
    ]),
  };

  const commandResults = {};
  if (options.packageJson) {
    const audit = runNpmJson(root, ["audit", "--json"], { env, allowNonZero: true });
    const outdated = runNpmJson(root, ["outdated", "--json"], { env, allowNonZero: true });
    options.npmAudit = audit.json;
    options.npmOutdated = outdated.json;
    commandResults.npmAudit = commandSummary(audit);
    commandResults.npmOutdated = commandSummary(outdated);
    const auditPackages = extractAuditVulnerabilities(audit.json).map((entry) => entry.name);
    const registryLatest = {};
    for (const packageName of auditPackages) {
      const latest = runNpmText(root, ["view", packageName, "version"], { env, allowNonZero: true });
      if (latest.status === 0 && latest.stdout.trim()) registryLatest[packageName] = latest.stdout.trim();
    }
    options.registryLatest = registryLatest;
    commandResults.npmRegistryLatest = Object.keys(registryLatest).sort();
  }

  if (options.composerJson) {
    const audit = runJsonToolIfAvailable(root, "composer", ["audit", "--format=json"], { env, allowNonZero: true });
    const outdated = runJsonToolIfAvailable(root, "composer", ["outdated", "--format=json"], { env, allowNonZero: true });
    options.composerAudit = audit.json;
    options.composerOutdated = outdated.json;
    options.composerAuditCommand = commandAvailabilitySummary(audit);
    commandResults.composerAudit = commandAvailabilitySummary(audit);
    commandResults.composerOutdated = commandAvailabilitySummary(outdated);
  }

  if (options.pyprojectToml || options.requirementsTxt || options.pipfile) {
    const audit = runJsonToolIfAvailable(root, "pip-audit", ["-f", "json"], { env, allowNonZero: true });
    options.pipAudit = audit.json;
    options.pipAuditCommand = commandAvailabilitySummary(audit);
    commandResults.pipAudit = commandAvailabilitySummary(audit);
  }

  if (options.cargoToml) {
    const audit = runJsonToolIfAvailable(root, "cargo", ["audit", "--json"], { env, allowNonZero: true });
    options.cargoAudit = audit.json;
    options.cargoAuditCommand = commandAvailabilitySummary(audit);
    commandResults.cargoAudit = commandAvailabilitySummary(audit);
  }

  if (options.goMod) {
    const vuln = runJsonToolIfAvailable(root, "govulncheck", ["-json", "./..."], { env, allowNonZero: true });
    options.govulncheck = vuln.json || parseJsonLines(vuln.stdout);
    options.govulncheckCommand = commandAvailabilitySummary(vuln);
    commandResults.govulncheck = commandAvailabilitySummary(vuln);
  }

  const report = analyzeDependencyHealthData(options);
  return {
    ...report,
    commandResults,
  };
}

export function hasDependencyManifests(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  return DEPENDENCY_MANIFEST_FILES.some((file) => existsSync(join(root, file)));
}

export function formatDependencyHealthReport(report = {}) {
  const lines = [
    "SUPERVIBE_DEPENDENCY_HEALTH",
    `PASS: ${report.pass === true}`,
    `STATUS: ${report.status || "unknown"}`,
    `ECOSYSTEMS: ${(report.ecosystems || []).map((entry) => entry.id).join(", ") || "none"}`,
    `AUDIT_VULNERABILITIES: ${report.summary?.auditVulnerabilities ?? 0}`,
    `TRANSITIVE_VULNERABILITIES: ${report.summary?.vulnerableTransitives ?? 0}`,
    `OUTDATED: ${report.summary?.outdated ?? 0}`,
    `BLOCKED_FORCE_FIXES: ${report.summary?.blockedForceFixes ?? 0}`,
  ];

  for (const ecosystem of report.ecosystems || []) {
    lines.push(`ECOSYSTEM: ${ecosystem.id} status=${ecosystem.status || "unknown"} pass=${ecosystem.pass === true}`);
    for (const manifest of ecosystem.manifests || []) lines.push(`ECOSYSTEM_MANIFEST: ${ecosystem.id} ${manifest}`);
    for (const lockfile of ecosystem.lockfiles || []) lines.push(`ECOSYSTEM_LOCK: ${ecosystem.id} ${lockfile}`);
    for (const finding of ecosystem.findings || []) {
      lines.push(`ECOSYSTEM_FINDING: ${ecosystem.id} ${finding.code} - ${finding.message}`);
      if (finding.nextAction) lines.push(`ECOSYSTEM_NEXT_ACTION: ${finding.nextAction}`);
    }
  }

  for (const finding of report.auditFindings || []) {
    lines.push(`AUDIT_FINDING: ${finding.packageName} severity=${finding.severity} direct=${finding.direct}`);
    for (const chain of finding.okChains || []) lines.push(`OCCURRENCE_OK: ${chain}`);
    for (const chain of finding.vulnerableChains || []) lines.push(`VULNERABLE_CHAIN: ${chain}`);
    lines.push(`REMEDIATION: ${finding.remediation?.policy || "unknown"} - ${finding.remediation?.nextAction || "review required"}`);
    if (finding.remediation?.override) {
      lines.push(`OVERRIDE_OPTION: ${JSON.stringify(finding.remediation.override)}`);
    }
    if (finding.remediation?.reason) {
      lines.push(`REMEDIATION_REASON: ${finding.remediation.reason}`);
    }
    for (const command of finding.remediation?.verificationCommands || []) {
      lines.push(`REMEDIATION_VERIFY: ${command}`);
    }
    if (finding.forcePolicy?.status === "blocked_downgrade") {
      lines.push(`NPM_AUDIT_FORCE: blocked_downgrade ${finding.forcePolicy.packageName} ${finding.forcePolicy.currentVersion} -> ${finding.forcePolicy.proposedVersion} latest=${finding.forcePolicy.latestVersion || "unknown"}`);
    }
  }

  for (const outdated of report.outdatedFindings || []) {
    lines.push(`OUTDATED_PACKAGE: ${outdated.name} current=${outdated.current || "unknown"} wanted=${outdated.wanted || "unknown"} latest=${outdated.latest || "unknown"} policy=${outdated.policy?.level || "unknown"}`);
  }

  for (const entry of report.issues || []) {
    lines.push(`ISSUE: ${entry.code} - ${entry.message}`);
    lines.push(`NEXT_ACTION: ${entry.nextAction}`);
  }
  for (const entry of report.warnings || []) {
    lines.push(`WARNING: ${entry.code} - ${entry.message}`);
    if (entry.nextAction) lines.push(`WARNING_NEXT_ACTION: ${entry.nextAction}`);
  }
  return lines.join("\n");
}

function analyzeNpmDependencyHealthData({
  packageJson = null,
  packageLock = null,
  npmAudit = null,
  npmOutdated = null,
  registryLatest = {},
  npmAuditCommand = null,
} = {}) {
  const issues = [];
  const warnings = [];
  const auditVulnerabilities = extractAuditVulnerabilities(npmAudit);
  const outdated = normalizeOutdated(npmOutdated);

  if (!packageJson) {
    issues.push(ecosystemIssue("npm", "missing-package-json", "package.json is missing", "Restore package.json before running dependency health."));
  }
  if (!packageLock) {
    issues.push(ecosystemIssue("npm", "missing-package-lock", "package-lock.json is missing", "Run npm install --package-lock-only, then rerun dependency health."));
  }
  if (packageJson && !npmAudit) {
    const toolNote = npmAuditCommand?.available === false ? " because npm was not available" : "";
    issues.push(ecosystemIssue("npm", "npm-audit-missing", `npm audit JSON was not available${toolNote}`, "Run npm audit --json after install; do not mark the project fresh without audit evidence."));
  }
  if (packageJson && !npmOutdated) {
    warnings.push(ecosystemIssue("npm", "npm-outdated-missing", "npm outdated JSON was not available", "Run npm outdated --json to classify patch/minor/major freshness drift."));
  }

  const auditFindings = auditVulnerabilities.map((vulnerability) => {
    const packageName = vulnerability.name;
    const vulnerableNodes = vulnerableLockNodes(packageLock, vulnerability);
    const occurrences = packageOccurrences(packageLock, packageName)
      .map((occurrence) => ({
        ...occurrence,
        vulnerable: vulnerableNodes.includes(occurrence.path),
      }));
    const vulnerableOccurrences = occurrences.filter((entry) => entry.vulnerable);
    const latestVersion = registryLatest[packageName]
      || outdated[packageName]?.latest
      || null;
    const forcePolicy = analyzeAuditForcePolicy({
      packageLock,
      vulnerability,
      registryLatest,
    });
    const remediation = classifyNpmAuditRemediation({
      vulnerability,
      vulnerableOccurrences,
      latestVersion,
      forcePolicy,
    });

    const finding = {
      packageName,
      ecosystem: "npm",
      severity: vulnerability.severity || "unknown",
      range: vulnerability.range || null,
      direct: vulnerableOccurrences.some((entry) => entry.direct),
      latestVersion,
      fixAvailable: normalizeFixAvailable(vulnerability.fixAvailable),
      remediation,
      forcePolicy,
      vulnerableChains: vulnerableOccurrences.map((entry) => entry.chain),
      okChains: occurrences.filter((entry) => !entry.vulnerable).map((entry) => entry.chain),
      vulnerableNodes,
      occurrences,
    };

    issues.push(ecosystemIssue(
      "npm",
      finding.direct ? "direct-vulnerable-dependency" : "transitive-vulnerable-dependency",
      `${packageName} ${finding.severity} vulnerability via ${finding.vulnerableChains.join("; ") || "audit report"}`,
      remediation.nextAction,
      {
        packageName,
        severity: finding.severity,
        remediation: remediation.policy,
      },
    ));

    if (forcePolicy?.status === "blocked_downgrade") {
      issues.push(ecosystemIssue(
        "npm",
        "npm-audit-force-blocked-downgrade",
        `npm audit fix --force would downgrade ${forcePolicy.packageName} ${forcePolicy.currentVersion} -> ${forcePolicy.proposedVersion}`,
        "Do not run npm audit fix --force; wait upstream, apply a reviewed override, or document a time-boxed exception.",
        {
          packageName: forcePolicy.packageName,
          currentVersion: forcePolicy.currentVersion,
          proposedVersion: forcePolicy.proposedVersion,
        },
      ));
    }

    return finding;
  });

  const outdatedFindings = Object.values(outdated).map((entry) => {
    const policy = classifyOutdatedPolicy(entry);
    const record = { ...entry, ecosystem: "npm", policy };
    warnings.push({
      code: "dependency-outdated",
      ecosystem: "npm",
      message: `${entry.name} ${entry.current || "unknown"} -> ${entry.latest || "unknown"} (${policy.level})`,
      nextAction: policy.nextAction,
      packageName: entry.name,
    });
    return record;
  });

  return ecosystemReport({
    id: "npm",
    name: "Node/npm",
    manifests: packageJson ? ["package.json"] : [],
    lockfiles: packageLock ? ["package-lock.json"] : [],
    issues,
    warnings,
    findings: [...auditFindings.map((entry) => ({
      code: entry.direct ? "direct-vulnerable-dependency" : "transitive-vulnerable-dependency",
      ecosystem: "npm",
      message: `${entry.packageName} ${entry.severity} vulnerability`,
      nextAction: entry.remediation?.nextAction,
      packageName: entry.packageName,
    })), ...outdatedFindings.map((entry) => ({
      code: "dependency-outdated",
      ecosystem: "npm",
      message: `${entry.name} ${entry.current || "unknown"} -> ${entry.latest || "unknown"}`,
      nextAction: entry.policy?.nextAction,
      packageName: entry.name,
    }))],
    auditFindings,
    outdatedFindings,
    summary: {
      auditVulnerabilities: auditFindings.length,
      vulnerableTransitives: auditFindings.filter((entry) => !entry.direct).length,
      outdated: outdatedFindings.length,
      blockedForceFixes: auditFindings.filter((entry) => entry.forcePolicy?.status === "blocked_downgrade").length,
    },
  });
}

function analyzeComposerDependencyHealthData({
  composerJson = null,
  composerLock = null,
  composerAudit = null,
  composerOutdated = null,
  composerAuditCommand = null,
} = {}) {
  const issues = [];
  const warnings = [];
  const findings = [];
  if (!composerLock) {
    issues.push(ecosystemIssue("composer", "missing-composer-lock", "composer.lock is missing", "Run composer install to create a lockfile, then run composer audit --format=json."));
  }
  if (!composerAudit) {
    const toolNote = composerAuditCommand?.available === false ? " because Composer is not available" : "";
    issues.push(ecosystemIssue("composer", "composer-audit-missing", `Composer audit JSON was not available${toolNote}`, "Run composer audit --format=json and keep the JSON result in the dependency-health evidence."));
  }
  const advisories = composerAdvisories(composerAudit);
  for (const advisory of advisories) {
    const record = ecosystemIssue("composer", "composer-vulnerable-dependency", `${advisory.packageName} ${advisory.severity || "unknown"} advisory`, "Update the affected Composer package or document a time-boxed exception after reviewing the advisory.", advisory);
    issues.push(record);
    findings.push(record);
  }
  const outdated = composerOutdatedPackages(composerOutdated);
  for (const entry of outdated) {
    warnings.push(ecosystemIssue("composer", "composer-outdated", `${entry.name} ${entry.version || "unknown"} -> ${entry.latest || "unknown"}`, "Review Composer release notes and update intentionally."));
    findings.push({ code: "composer-outdated", ecosystem: "composer", message: `${entry.name} ${entry.version || "unknown"} -> ${entry.latest || "unknown"}`, nextAction: "Review Composer release notes and update intentionally." });
  }
  return ecosystemReport({
    id: "composer",
    name: "PHP/Composer",
    manifests: composerJson ? ["composer.json"] : [],
    lockfiles: composerLock ? ["composer.lock"] : [],
    issues,
    warnings,
    findings,
    summary: {
      auditVulnerabilities: advisories.length,
      vulnerableTransitives: 0,
      outdated: outdated.length,
      blockedForceFixes: 0,
    },
  });
}

function analyzePythonDependencyHealthData({
  pyprojectToml = null,
  requirementsTxt = null,
  pipfile = null,
  poetryLock = null,
  pipfileLock = null,
  uvLock = null,
  pdmLock = null,
  pipAudit = null,
  pipAuditCommand = null,
} = {}) {
  const issues = [];
  const warnings = [];
  const findings = [];
  const manifests = [
    pyprojectToml ? "pyproject.toml" : null,
    requirementsTxt ? "requirements.txt" : null,
    pipfile ? "Pipfile" : null,
  ].filter(Boolean);
  const lockfiles = [
    poetryLock ? "poetry.lock" : null,
    pipfileLock ? "Pipfile.lock" : null,
    uvLock ? "uv.lock" : null,
    pdmLock ? "pdm.lock" : null,
    requirementsTxt && requirementsLooksPinned(requirementsTxt) ? "requirements.txt:pinned" : null,
  ].filter(Boolean);

  if (lockfiles.length === 0) {
    issues.push(ecosystemIssue("python", "missing-python-lock", "No Python lock or pinned requirements evidence was found", "Use poetry.lock, uv.lock, pdm.lock, Pipfile.lock, or fully pinned requirements.txt before claiming dependency freshness."));
  }
  if (!pipAudit) {
    const toolNote = pipAuditCommand?.available === false ? " because pip-audit is not available" : "";
    issues.push(ecosystemIssue("python", "python-audit-missing", `pip-audit JSON was not available${toolNote}`, "Run pip-audit -f json inside the project environment and store the result in dependency-health evidence."));
  }

  const vulnerabilities = pythonVulnerabilities(pipAudit);
  for (const vulnerability of vulnerabilities) {
    const record = ecosystemIssue("python", "python-vulnerable-dependency", `${vulnerability.packageName} vulnerability ${vulnerability.id || "unknown"}`, "Upgrade the pinned dependency or add a reviewed temporary exception.", vulnerability);
    issues.push(record);
    findings.push(record);
  }

  return ecosystemReport({
    id: "python",
    name: "Python",
    manifests,
    lockfiles,
    issues,
    warnings,
    findings,
    summary: {
      auditVulnerabilities: vulnerabilities.length,
      vulnerableTransitives: 0,
      outdated: 0,
      blockedForceFixes: 0,
    },
  });
}

function analyzeCargoDependencyHealthData({
  cargoToml = null,
  cargoLock = null,
  cargoAudit = null,
  cargoAuditCommand = null,
} = {}) {
  const issues = [];
  const findings = [];
  if (!cargoLock) {
    issues.push(ecosystemIssue("cargo", "missing-cargo-lock", "Cargo.lock is missing", "Commit Cargo.lock for applications and rerun cargo audit --json."));
  }
  if (!cargoAudit) {
    const toolNote = cargoAuditCommand?.available === false ? " because cargo-audit is not available" : "";
    issues.push(ecosystemIssue("cargo", "cargo-audit-missing", `cargo audit JSON was not available${toolNote}`, "Install cargo-audit and run cargo audit --json before claiming dependency freshness."));
  }
  const vulnerabilities = cargoVulnerabilities(cargoAudit);
  for (const vulnerability of vulnerabilities) {
    const record = ecosystemIssue("cargo", "cargo-vulnerable-dependency", `${vulnerability.packageName || "crate"} advisory ${vulnerability.id || "unknown"}`, "Upgrade the affected crate or document a reviewed exception.", vulnerability);
    issues.push(record);
    findings.push(record);
  }
  return ecosystemReport({
    id: "cargo",
    name: "Rust/Cargo",
    manifests: cargoToml ? ["Cargo.toml"] : [],
    lockfiles: cargoLock ? ["Cargo.lock"] : [],
    issues,
    findings,
    summary: {
      auditVulnerabilities: vulnerabilities.length,
      vulnerableTransitives: 0,
      outdated: 0,
      blockedForceFixes: 0,
    },
  });
}

function analyzeGoDependencyHealthData({
  goMod = null,
  goSum = null,
  govulncheck = null,
  govulncheckCommand = null,
} = {}) {
  const issues = [];
  const findings = [];
  if (!goSum) {
    issues.push(ecosystemIssue("go", "missing-go-sum", "go.sum is missing", "Run go mod tidy, commit go.sum, then run govulncheck -json ./..."));
  }
  if (!govulncheck) {
    const toolNote = govulncheckCommand?.available === false ? " because govulncheck is not available" : "";
    issues.push(ecosystemIssue("go", "govulncheck-missing", `govulncheck JSON was not available${toolNote}`, "Install govulncheck and run govulncheck -json ./... before claiming dependency freshness."));
  }
  const vulnerabilities = goVulnerabilities(govulncheck);
  for (const vulnerability of vulnerabilities) {
    const record = ecosystemIssue("go", "go-vulnerable-dependency", `${vulnerability.packageName || "module"} vulnerability ${vulnerability.id || "unknown"}`, "Upgrade the affected Go module or document a reviewed exception.", vulnerability);
    issues.push(record);
    findings.push(record);
  }
  return ecosystemReport({
    id: "go",
    name: "Go modules",
    manifests: goMod ? ["go.mod"] : [],
    lockfiles: goSum ? ["go.sum"] : [],
    issues,
    findings,
    summary: {
      auditVulnerabilities: vulnerabilities.length,
      vulnerableTransitives: 0,
      outdated: 0,
      blockedForceFixes: 0,
    },
  });
}

function analyzeJavaDependencyHealthData({
  pomXml = null,
  gradleBuild = null,
  gradleLockfile = null,
  javaDependencyAudit = null,
} = {}) {
  const issues = [];
  const warnings = [];
  const findings = [];
  const manifests = [
    pomXml ? "pom.xml" : null,
    gradleBuild ? "build.gradle(.kts)" : null,
  ].filter(Boolean);
  const lockfiles = gradleLockfile ? ["gradle.lockfile"] : [];
  if (gradleBuild && !gradleLockfile) {
    warnings.push(ecosystemIssue("java", "gradle-lock-missing", "Gradle dependency lockfile was not detected", "Enable Gradle dependency locking for application projects where reproducibility matters."));
  }
  if (!javaDependencyAudit) {
    issues.push(ecosystemIssue("java", "java-sca-evidence-missing", "Java SCA/audit evidence was not available", "Run OWASP Dependency-Check, Snyk, osv-scanner, or an equivalent Maven/Gradle SCA job and bind the result before claiming dependency freshness."));
  }
  const vulnerabilities = javaVulnerabilities(javaDependencyAudit);
  for (const vulnerability of vulnerabilities) {
    const record = ecosystemIssue("java", "java-vulnerable-dependency", `${vulnerability.packageName || "artifact"} vulnerability ${vulnerability.id || "unknown"}`, "Upgrade the affected Maven/Gradle artifact or document a reviewed exception.", vulnerability);
    issues.push(record);
    findings.push(record);
  }
  return ecosystemReport({
    id: pomXml ? "maven" : "gradle",
    name: pomXml ? "Java/Maven" : "Java/Gradle",
    manifests,
    lockfiles,
    issues,
    warnings,
    findings,
    summary: {
      auditVulnerabilities: vulnerabilities.length,
      vulnerableTransitives: 0,
      outdated: 0,
      blockedForceFixes: 0,
    },
  });
}

function ecosystemReport({
  id,
  name,
  manifests = [],
  lockfiles = [],
  issues = [],
  warnings = [],
  findings = [],
  auditFindings = [],
  outdatedFindings = [],
  summary = {},
}) {
  return {
    id,
    name,
    pass: issues.length === 0,
    status: issues.length === 0 ? warnings.length > 0 ? "healthy-with-warnings" : "healthy" : "action-required",
    manifests,
    lockfiles,
    issues,
    warnings,
    findings,
    auditFindings,
    outdatedFindings,
    summary: {
      ...emptySummary(),
      ...summary,
    },
  };
}

function emptySummary() {
  return {
    auditVulnerabilities: 0,
    vulnerableTransitives: 0,
    outdated: 0,
    blockedForceFixes: 0,
    ecosystems: 0,
    actionRequiredEcosystems: 0,
  };
}

function hasNpmEvidence(options = {}) {
  return Boolean(options.packageJson || options.packageLock || options.npmAudit || options.npmOutdated);
}

function hasComposerEvidence(options = {}) {
  return Boolean(options.composerJson || options.composerLock || options.composerAudit || options.composerOutdated);
}

function hasPythonEvidence(options = {}) {
  return Boolean(options.pyprojectToml || options.requirementsTxt || options.pipfile || options.poetryLock || options.pipfileLock || options.uvLock || options.pdmLock || options.pipAudit);
}

function hasCargoEvidence(options = {}) {
  return Boolean(options.cargoToml || options.cargoLock || options.cargoAudit);
}

function hasGoEvidence(options = {}) {
  return Boolean(options.goMod || options.goSum || options.govulncheck);
}

function hasJavaEvidence(options = {}) {
  return Boolean(options.pomXml || options.gradleBuild || options.gradleLockfile || options.javaDependencyAudit);
}

function extractAuditVulnerabilities(npmAudit = null) {
  const vulnerabilities = npmAudit?.vulnerabilities || {};
  return Object.entries(vulnerabilities)
    .map(([name, value]) => ({ name, ...value }))
    .filter((entry) => entry.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function vulnerableLockNodes(packageLock, vulnerability = {}) {
  const nodes = Array.isArray(vulnerability.nodes) ? vulnerability.nodes : [];
  const packageName = vulnerability.name;
  if (nodes.length > 0) return nodes.filter((node) => lockPathPackageName(node) === packageName);
  return packageOccurrences(packageLock, packageName).map((entry) => entry.path);
}

function packageOccurrences(packageLock = {}, packageName = "") {
  const packages = packageLock?.packages || {};
  return Object.entries(packages)
    .filter(([path]) => path && lockPathPackageName(path) === packageName)
    .map(([path, entry]) => {
      const chainEntries = lockPathChain(path, packageLock);
      return {
        path,
        version: entry?.version || null,
        direct: path === `node_modules/${packageName}`,
        chain: chainEntries.map((item) => `${item.name}@${item.version || "unknown"}`).join(" -> "),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function lockPathChain(path = "", packageLock = {}) {
  const packages = packageLock?.packages || {};
  const normalized = String(path || "").replace(/\\/g, "/");
  const matches = [...normalized.matchAll(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/g)];
  return matches.map((match) => {
    const packagePath = normalized.slice(0, match.index + match[0].length);
    const name = match[1];
    return {
      name,
      version: packages[packagePath]?.version || null,
      path: packagePath,
    };
  });
}

function lockPathPackageName(path = "") {
  const chain = lockPathChain(path);
  return chain.at(-1)?.name || "";
}

function normalizeOutdated(npmOutdated = null) {
  const out = {};
  for (const [name, value] of Object.entries(npmOutdated || {})) {
    out[name] = {
      name,
      current: value.current || null,
      wanted: value.wanted || null,
      latest: value.latest || null,
      dependent: value.dependent || null,
      location: value.location || null,
    };
  }
  return out;
}

function classifyNpmAuditRemediation({ vulnerability, vulnerableOccurrences = [], latestVersion = null, forcePolicy = null }) {
  const packageName = vulnerability.name;
  const direct = vulnerableOccurrences.some((entry) => entry.direct);
  const parent = firstParentPackage(vulnerableOccurrences);
  if (forcePolicy?.status === "blocked_downgrade") {
    const override = !direct && parent && latestVersion
      ? {
          overrides: {
            [parent.name]: {
              [packageName]: latestVersion,
            },
          },
        }
      : null;
    return {
      policy: "breaking-fix-blocked",
      reason: "npm audit fix --force is unsafe because it would downgrade a framework major/minor line.",
      nextAction: override
        ? `Do not use npm audit fix --force because it downgrades a framework major/minor line; wait for ${parent.name} to update ${packageName}, or test the controlled override with npm install, lint, build, and npm audit.`
        : "Do not use npm audit fix --force because it downgrades a framework major/minor line.",
      verificationCommands: npmRemediationVerificationCommands(),
      ...(override ? { override } : {}),
    };
  }
  if (!direct && parent && latestVersion) {
    return {
      policy: "wait-upstream-or-controlled-override",
      reason: "Nested vulnerable dependency can be remediated only after compatibility review of the parent package chain.",
      nextAction: `Wait for ${parent.name} to update ${packageName}, or test a controlled override followed by npm install, lint, build, and npm audit.`,
      verificationCommands: npmRemediationVerificationCommands(),
      override: {
        overrides: {
          [parent.name]: {
            [packageName]: latestVersion,
          },
        },
      },
    };
  }
  if (!direct) {
    return {
      policy: "wait-upstream-or-manual-action",
      reason: "Transitive vulnerable dependency has no safe compatible override target in current evidence.",
      nextAction: `Wait for the parent package to update ${packageName}, or document an explicit exception with owner and expiry.`,
      verificationCommands: npmRemediationVerificationCommands(),
    };
  }
  return {
    policy: "manual-action",
    reason: "Direct vulnerable dependency requires an explicit package update and lockfile review.",
    nextAction: latestVersion
      ? `Update ${packageName} to ${latestVersion}, then run npm install, lint, build, and npm audit.`
      : `Update ${packageName} to a fixed version, then run npm install, lint, build, and npm audit.`,
    verificationCommands: npmRemediationVerificationCommands(),
  };
}

function npmRemediationVerificationCommands() {
  return [
    "npm install",
    "npm audit --json",
    "npm run lint",
    "npm run build",
    "node <resolved-supervibe-plugin-root>/scripts/dependency-health.mjs --root .",
  ];
}

function firstParentPackage(vulnerableOccurrences = []) {
  for (const occurrence of vulnerableOccurrences) {
    const parts = String(occurrence.chain || "").split(" -> ");
    if (parts.length < 2) continue;
    const name = parts.at(-2)?.replace(/@[^@]+$/, "");
    const version = parts.at(-2)?.slice(name.length + 1) || null;
    if (name) return { name, version };
  }
  return null;
}

function analyzeAuditForcePolicy({ packageLock = {}, vulnerability = {}, registryLatest = {} }) {
  const fix = normalizeFixAvailable(vulnerability.fixAvailable);
  if (!fix?.name || !fix?.version || !FRAMEWORK_PACKAGES.has(fix.name)) return null;
  const currentVersion = packageOccurrences(packageLock, fix.name)[0]?.version || "";
  return analyzeNpmAuditForcePlan({
    packageName: fix.name,
    currentVersion,
    proposedVersion: fix.version,
    latestVersion: registryLatest[fix.name] || currentVersion,
  });
}

function normalizeFixAvailable(value) {
  if (!value || value === false) return null;
  if (value === true) return { available: true };
  if (typeof value === "object") {
    return {
      available: true,
      name: value.name || null,
      version: value.version || null,
      isSemVerMajor: value.isSemVerMajor === true,
    };
  }
  return null;
}

function classifyOutdatedPolicy(entry = {}) {
  const current = parseSemver(entry.current);
  const latest = parseSemver(entry.latest);
  if (!current || !latest) {
    return {
      level: "manual-action",
      nextAction: "Review the outdated package manually because npm did not provide comparable semver data.",
    };
  }
  if (latest.major > current.major) {
    return {
      level: "manual-action-breaking",
      nextAction: "Treat as a breaking upgrade; read release notes and run full verification before updating.",
    };
  }
  if (latest.minor > current.minor) {
    return {
      level: "manual-action",
      nextAction: "Review minor release notes, update intentionally, and run targeted tests.",
    };
  }
  if (latest.patch > current.patch) {
    return {
      level: "safe-patch-update",
      nextAction: "Patch update is usually safe; update and run lint/build/tests.",
    };
  }
  return {
    level: "safe-to-ignore",
    nextAction: "No newer semver release was detected.",
  };
}

function composerAdvisories(composerAudit = null) {
  const advisories = composerAudit?.advisories || {};
  const out = [];
  for (const [packageName, entries] of Object.entries(advisories)) {
    for (const entry of Array.isArray(entries) ? entries : [entries]) {
      out.push({
        packageName,
        severity: entry?.severity || entry?.cve || "unknown",
        id: entry?.advisoryId || entry?.cve || entry?.title || null,
        title: entry?.title || null,
      });
    }
  }
  return out;
}

function composerOutdatedPackages(composerOutdated = null) {
  const installed = composerOutdated?.installed || [];
  if (!Array.isArray(installed)) return [];
  return installed.map((entry) => ({
    name: entry.name,
    version: entry.version,
    latest: entry.latest,
  })).filter((entry) => entry.name);
}

function requirementsLooksPinned(value = "") {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("-r "));
  return lines.length > 0 && lines.every((line) => /^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?\s*(?:==|===)\s*[^;#\s]+/.test(line));
}

function pythonVulnerabilities(pipAudit = null) {
  const dependencies = Array.isArray(pipAudit?.dependencies) ? pipAudit.dependencies : Array.isArray(pipAudit) ? pipAudit : [];
  const out = [];
  for (const dependency of dependencies) {
    for (const vulnerability of dependency.vulns || dependency.vulnerabilities || []) {
      out.push({
        packageName: dependency.name || dependency.package || vulnerability.name || null,
        id: vulnerability.id || vulnerability.vuln || vulnerability.cve || null,
        fixVersions: vulnerability.fix_versions || vulnerability.fixVersions || [],
      });
    }
  }
  return out;
}

function cargoVulnerabilities(cargoAudit = null) {
  const vulnerabilities = cargoAudit?.vulnerabilities?.list || cargoAudit?.vulnerabilities || [];
  if (!Array.isArray(vulnerabilities)) return [];
  return vulnerabilities.map((entry) => ({
    packageName: entry.package?.name || entry.packageName || null,
    id: entry.advisory?.id || entry.id || null,
    title: entry.advisory?.title || entry.title || null,
  }));
}

function goVulnerabilities(govulncheck = null) {
  const entries = Array.isArray(govulncheck) ? govulncheck : govulncheck ? [govulncheck] : [];
  return entries
    .filter((entry) => entry.finding || entry.osv || entry.vulnerability)
    .map((entry) => {
      const finding = entry.finding || {};
      const osv = entry.osv || entry.vulnerability || {};
      return {
        packageName: finding.trace?.[0]?.module || finding.module || osv.module || null,
        id: osv.id || finding.osv || entry.id || null,
      };
    });
}

function javaVulnerabilities(javaDependencyAudit = null) {
  const vulnerabilities = javaDependencyAudit?.vulnerabilities || javaDependencyAudit?.findings || [];
  if (!Array.isArray(vulnerabilities)) return [];
  return vulnerabilities.map((entry) => ({
    packageName: entry.packageName || entry.artifact || entry.dependency || null,
    id: entry.id || entry.cve || entry.vulnerabilityId || null,
  }));
}

function parseSemver(value = "") {
  const match = String(value || "").match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function ecosystemIssue(ecosystem, code, message, nextAction, details = {}) {
  return { ecosystem, code, message, nextAction, ...details };
}

function runNpmJson(cwd, args, { env = process.env, allowNonZero = false } = {}) {
  const result = runNpmText(cwd, args, { env, allowNonZero });
  return {
    ...result,
    json: parseJsonOutput(result.stdout) || parseJsonOutput(result.stderr) || null,
  };
}

function runNpmText(cwd, args, { env = process.env, allowNonZero = false } = {}) {
  const executable = executableForPlatform("npm");
  let result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
  });
  if (result.error?.code === "EINVAL") {
    result = spawnSync(shellCommandLine(executable, args), [], {
      cwd,
      env,
      encoding: "utf8",
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 10,
    });
  }
  const status = result.status ?? (result.error ? 1 : 0);
  return {
    status,
    ok: status === 0 || allowNonZero,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
  };
}

function runJsonToolIfAvailable(cwd, command, args, { env = process.env, allowNonZero = false } = {}) {
  const result = runToolText(cwd, command, args, { env, allowNonZero });
  return {
    ...result,
    json: parseJsonOutput(result.stdout) || parseJsonOutput(result.stderr) || null,
  };
}

function runToolText(cwd, command, args, { env = process.env, allowNonZero = false } = {}) {
  const result = process.platform === "win32"
    ? spawnSync(shellCommandLine(command, args), [], {
        cwd,
        env,
        encoding: "utf8",
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10,
      })
    : spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 10,
      });
  const status = result.status ?? (result.error ? 1 : 0);
  return {
    available: result.error?.code !== "ENOENT",
    status,
    ok: status === 0 || allowNonZero,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error?.message || null,
  };
}

function commandSummary(result = {}) {
  return {
    status: result.status,
    ok: result.ok === true,
    error: result.error || null,
  };
}

function commandAvailabilitySummary(result = {}) {
  return {
    available: result.available !== false,
    status: result.status,
    ok: result.ok === true,
    error: result.error || null,
  };
}

function parseJsonOutput(text = "") {
  const value = String(text || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseJsonLines(text = "") {
  const values = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const parsed = parseJsonOutput(line);
    if (parsed) values.push(parsed);
  }
  return values.length > 0 ? values : null;
}

function readJsonOptional(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readTextOptional(path) {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readFirstTextOptional(paths = []) {
  for (const path of paths) {
    const value = readTextOptional(path);
    if (value !== null) return value;
  }
  return null;
}

function executableForPlatform(name) {
  if (process.platform === "win32" && /^(npm|npx)$/.test(name)) return `${name}.cmd`;
  return name;
}

function shellCommandLine(executable, args = []) {
  return [executable, ...args].map(shellQuote).join(" ");
}

function shellQuote(value = "") {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}
