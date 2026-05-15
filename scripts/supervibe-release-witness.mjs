#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const RELEASE_WITNESS_SCHEMA_VERSION = 1;
export const RELEASE_WITNESS_KIND = "supervibe-release-witness";

const DEFAULT_GENERATED_AT = "deterministic-local";

const EVIDENCE_INTEGRATION_ARTIFACTS = Object.freeze([
  ".supervibe/artifacts/execution/2026-05-15-boost-full-run/p5-1-release-witness-manifest.md",
  ".supervibe/artifacts/execution/2026-05-15-boost-full-run/p5-2-evidence-packet-integration.md",
]);

const PACKAGE_HASH_FILES = Object.freeze([
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
]);

const VERSION_MANIFESTS = Object.freeze([
  { id: "package", path: "package.json", field: "version" },
  { id: "packageLock", path: "package-lock.json", field: "version" },
  { id: "claude", path: ".claude-plugin/plugin.json", field: "version" },
  { id: "codex", path: ".codex-plugin/plugin.json", field: "version" },
  { id: "cursor", path: ".cursor-plugin/plugin.json", field: "version" },
  { id: "gemini", path: "gemini-extension.json", field: "version" },
  { id: "marketplace", path: ".claude-plugin/marketplace.json", field: "metadata.version" },
]);

const DEFERRED_VALIDATORS = Object.freeze([
  {
    id: "global-release-check",
    command: "npm run check",
    contract: "Global release gate",
  },
  {
    id: "strict-release-gate",
    command: "npm run validate:strict-release-gate",
    contract: "Strict release gate",
  },
  {
    id: "plugin-package-audit",
    command: "npm run audit:plugin-package",
    contract: "Package manifest and public surface audit",
  },
  {
    id: "release-security-audit",
    command: "npm run audit:release-security",
    contract: "Security and provenance audit",
  },
  {
    id: "workflow-receipts",
    command: "npm run validate:workflow-receipts",
    contract: "Workflow receipt trust gate",
  },
]);

export async function buildReleaseWitnessManifest(options = {}) {
  const rootDir = resolve(options.rootDir || process.cwd());
  const blockers = createBlockerBuckets();
  const packageJson = await readJsonForManifest(rootDir, "package.json", blockers, {
    bucket: "provenance",
    code: "package-json-unavailable",
    message: "package.json could not be read or parsed.",
  });

  const [git, versions, packageHash, tests] = await Promise.all([
    collectGitInfo(rootDir, blockers),
    collectVersionInfo(rootDir, packageJson, blockers),
    collectPackageHash(rootDir, packageJson, blockers),
    collectTestCount(rootDir, blockers),
  ]);

  const changedSurfaces = summarizeChangedSurfaces(git.changedFiles);
  const validatorSummary = buildValidatorSummary();
  const evidenceIntegration = await buildEvidenceIntegration(rootDir, validatorSummary);
  addReadOnlyBlockers(blockers, { validatorSummary });
  const residualRisk = buildResidualRisks({ git, validatorSummary });
  const rollbackNote = buildRollbackNote(git);
  const readiness = summarizeReadiness(blockers);

  return {
    schemaVersion: RELEASE_WITNESS_SCHEMA_VERSION,
    kind: RELEASE_WITNESS_KIND,
    generatedAt: options.generatedAt || DEFAULT_GENERATED_AT,
    mode: options.dryRun ? "read-only-dry-run" : "read-only",
    releaseReadiness: readiness,
    version: versions,
    commit: git,
    packageHash,
    validatorSummary,
    evidenceIntegration,
    testCount: tests,
    changedSurfaces,
    blockers,
    residualRisk,
    rollbackNote,
    deferredIntegration: {
      evidencePackets: "P5.2",
      receiptLedgerDuplication: false,
      validatorsExecutedByThisCli: false,
      testsExecutedByThisCli: false,
    },
  };
}

export function renderReleaseWitnessMarkdown(manifest) {
  const lines = [];
  lines.push("# Supervibe Release Witness Manifest");
  lines.push("");
  lines.push(`Schema version: ${manifest.schemaVersion}`);
  lines.push(`Kind: ${manifest.kind}`);
  lines.push(`Generated at: ${manifest.generatedAt}`);
  lines.push(`Mode: ${manifest.mode}`);
  lines.push(`Release readiness: ${manifest.releaseReadiness.status}`);
  lines.push(`Final release blocked: ${manifest.releaseReadiness.finalReleaseBlocked}`);
  lines.push(`Blocker count: ${manifest.releaseReadiness.blockerCount}`);
  lines.push("");
  lines.push("## Version");
  lines.push("");
  lines.push(`Package version: ${manifest.version.packageVersion}`);
  lines.push(`Version source: ${manifest.version.source}`);
  lines.push(`Version status: ${manifest.version.status}`);
  lines.push("");
  lines.push("| Surface | Path | Version | Status |");
  lines.push("| --- | --- | --- | --- |");
  for (const entry of manifest.version.manifests) {
    lines.push(`| ${entry.id} | ${entry.path} | ${entry.version} | ${entry.status} |`);
  }
  lines.push("");
  lines.push("## Commit");
  lines.push("");
  lines.push(`Commit SHA: ${manifest.commit.sha}`);
  lines.push(`Branch: ${manifest.commit.branch}`);
  lines.push(`Git available: ${manifest.commit.gitAvailable}`);
  lines.push(`Working tree dirty: ${manifest.commit.dirty}`);
  lines.push(`Changed files: ${manifest.commit.changedFileCount}`);
  lines.push("");
  lines.push("## Package Hash");
  lines.push("");
  lines.push(`Algorithm: ${manifest.packageHash.algorithm}`);
  lines.push(`Scope: ${manifest.packageHash.scope}`);
  lines.push(`Digest: ${manifest.packageHash.digest}`);
  lines.push(`Status: ${manifest.packageHash.status}`);
  lines.push(`Files hashed: ${manifest.packageHash.filesHashed}`);
  lines.push(`Missing files: ${manifest.packageHash.missingFiles.length}`);
  lines.push("");
  lines.push("| Path | Exists | Bytes | SHA256 |");
  lines.push("| --- | --- | ---: | --- |");
  for (const entry of manifest.packageHash.entries) {
    lines.push(`| ${entry.path} | ${entry.exists} | ${entry.bytes} | ${entry.sha256} |`);
  }
  lines.push("");
  lines.push("## Validator Summary");
  lines.push("");
  lines.push(`Mode: ${manifest.validatorSummary.mode}`);
  lines.push(`Total: ${manifest.validatorSummary.total}`);
  lines.push(`Passed: ${manifest.validatorSummary.passed}`);
  lines.push(`Failed: ${manifest.validatorSummary.failed}`);
  lines.push(`Deferred: ${manifest.validatorSummary.deferred}`);
  lines.push("");
  lines.push("| ID | Command | Status | Contract |");
  lines.push("| --- | --- | --- | --- |");
  for (const validator of manifest.validatorSummary.validators) {
    lines.push(`| ${validator.id} | \`${validator.command}\` | ${validator.status} | ${validator.contract} |`);
  }
  lines.push("");
  lines.push("## Evidence Integration");
  lines.push("");
  lines.push(`Status: ${manifest.evidenceIntegration.status}`);
  lines.push(`Mode: ${manifest.evidenceIntegration.mode}`);
  lines.push(`Receipt ledger duplication: ${manifest.evidenceIntegration.receiptLedgerDuplication}`);
  lines.push(`Receipt ledger mutation: ${manifest.evidenceIntegration.receiptLedgerMutation}`);
  lines.push(`Validators executed by this CLI: ${manifest.evidenceIntegration.validatorsExecutedByThisCli}`);
  lines.push(`Tests executed by this CLI: ${manifest.evidenceIntegration.testsExecutedByThisCli}`);
  lines.push("");
  lines.push("### Receipt Citations");
  lines.push("");
  lines.push(`Mode: ${manifest.evidenceIntegration.receiptCitations.mode}`);
  lines.push(`Source: ${manifest.evidenceIntegration.receiptCitations.source}`);
  lines.push(`Status: ${manifest.evidenceIntegration.receiptCitations.status}`);
  lines.push(`Count: ${manifest.evidenceIntegration.receiptCitations.count}`);
  lines.push("");
  lines.push("### Validator Citations");
  lines.push("");
  lines.push("| ID | Command | Status |");
  lines.push("| --- | --- | --- |");
  for (const validator of manifest.evidenceIntegration.validatorCitations) {
    lines.push(`| ${validator.id} | ` + "`" + `${validator.command}` + "`" + ` | ${validator.status} |`);
  }
  lines.push("");
  lines.push("### Evidence Packet Citations");
  lines.push("");
  lines.push("| Path | Exists | Status | SHA256 |");
  lines.push("| --- | --- | --- | --- |");
  for (const citation of manifest.evidenceIntegration.evidencePacketCitations) {
    lines.push(`| ${citation.path} | ${citation.exists} | ${citation.status} | ${citation.sha256} |`);
  }
  lines.push("");
  lines.push("### Source Of Truth Boundary");
  lines.push("");
  lines.push(`Receipts: ${manifest.evidenceIntegration.sourceOfTruthBoundary.receipts}`);
  lines.push(`Validators: ${manifest.evidenceIntegration.sourceOfTruthBoundary.validators}`);
  lines.push(`Witness: ${manifest.evidenceIntegration.sourceOfTruthBoundary.witness}`);
  lines.push("");
  lines.push("## Test Count");
  lines.push("");
  lines.push(`Source: ${manifest.testCount.source}`);
  lines.push(`Test files: ${manifest.testCount.testFiles}`);
  lines.push(`Executed tests: ${manifest.testCount.executedTests}`);
  lines.push(`Test cases: ${manifest.testCount.testCases}`);
  lines.push(`Status: ${manifest.testCount.status}`);
  lines.push("");
  lines.push("## Changed Surfaces");
  lines.push("");
  lines.push(`Source: ${manifest.changedSurfaces.source}`);
  lines.push(`Commands changed: ${manifest.changedSurfaces.counts.commands}`);
  lines.push(`Skills changed: ${manifest.changedSurfaces.counts.skills}`);
  lines.push(`Agents changed: ${manifest.changedSurfaces.counts.agents}`);
  lines.push("");
  lines.push("| Surface | Files |");
  lines.push("| --- | --- |");
  lines.push(`| commands | ${formatListCell(manifest.changedSurfaces.commands)} |`);
  lines.push(`| skills | ${formatListCell(manifest.changedSurfaces.skills)} |`);
  lines.push(`| agents | ${formatListCell(manifest.changedSurfaces.agents)} |`);
  lines.push("");
  lines.push("## Blockers");
  lines.push("");
  for (const bucket of ["security", "provenance", "audit"]) {
    lines.push(`### ${capitalize(bucket)}`);
    lines.push("");
    const rows = manifest.blockers[bucket] || [];
    if (rows.length === 0) {
      lines.push("none");
      lines.push("");
      continue;
    }
    lines.push("| Code | Severity | Final release blocking | Message |");
    lines.push("| --- | --- | --- | --- |");
    for (const blocker of rows) {
      lines.push(`| ${blocker.code} | ${blocker.severity} | ${blocker.finalReleaseBlocking} | ${blocker.message} |`);
    }
    lines.push("");
  }
  lines.push("## Residual Risk");
  lines.push("");
  lines.push("| Risk ID | Severity | Owner | Accepted by | Expiry | Confidence impact | Rollback | Publishable |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const risk of manifest.residualRisk) {
    lines.push(`| ${risk.riskId} | ${risk.severity} | ${risk.owner} | ${risk.acceptedBy} | ${risk.expiry} | ${risk.confidenceImpact} | ${risk.rollback} | ${risk.publishable} |`);
  }
  lines.push("");
  lines.push("## Rollback Note");
  lines.push("");
  lines.push(`Status: ${manifest.rollbackNote.status}`);
  lines.push(`Note: ${manifest.rollbackNote.note}`);
  lines.push("");
  lines.push("| Step | Command |");
  lines.push("| --- | --- |");
  for (const step of manifest.rollbackNote.steps) {
    lines.push(`| ${step.id} | \`${step.command}\` |`);
  }
  lines.push("");
  lines.push("## Deferred Integration");
  lines.push("");
  lines.push(`Evidence packets: ${manifest.deferredIntegration.evidencePackets}`);
  lines.push(`Receipt ledger duplication: ${manifest.deferredIntegration.receiptLedgerDuplication}`);
  lines.push(`Validators executed by this CLI: ${manifest.deferredIntegration.validatorsExecutedByThisCli}`);
  lines.push(`Tests executed by this CLI: ${manifest.deferredIntegration.testsExecutedByThisCli}`);
  lines.push("");
  return lines.join("\n");
}

export function parseReleaseWitnessArgs(argv = []) {
  const options = {
    json: false,
    markdown: false,
    dryRun: false,
    strict: false,
    rootDir: process.cwd(),
    generatedAt: DEFAULT_GENERATED_AT,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--markdown") options.markdown = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--root") options.rootDir = readOptionValue(argv, ++index, "--root");
    else if (arg.startsWith("--root=")) options.rootDir = readInlineValue(arg, "--root");
    else if (arg === "--generated-at") options.generatedAt = readOptionValue(argv, ++index, "--generated-at");
    else if (arg.startsWith("--generated-at=")) options.generatedAt = readInlineValue(arg, "--generated-at");
    else throw new Error("Unknown argument: " + arg);
  }
  if (!options.json && !options.markdown) options.markdown = true;
  return options;
}

export function renderReleaseWitnessHelp() {
  return [
    "SUPERVIBE_RELEASE_WITNESS",
    "USAGE:",
    "  node scripts/supervibe-release-witness.mjs --json --dry-run",
    "  node scripts/supervibe-release-witness.mjs --markdown --dry-run",
    "OPTIONS:",
    "  --json             Emit the stable JSON manifest.",
    "  --markdown         Emit the human-readable manifest.",
    "  --dry-run          Mark output as read-only dry-run; no validators or tests run.",
    "  --strict           Exit 1 when final-release blockers are present.",
    "  --root <path>      Repository root. Defaults to current working directory.",
    "  --generated-at <v> Override deterministic generatedAt value.",
    "  --help             Show this help.",
  ].join("\n");
}

export function writeReleaseWitnessResponse(manifest, options = {}, stream = process.stdout) {
  if (options.markdown) stream.write(renderReleaseWitnessMarkdown(manifest));
  if (options.json) {
    if (options.markdown) stream.write("\n```json\n");
    stream.write(JSON.stringify(manifest, null, 2) + "\n");
    if (options.markdown) stream.write("```\n");
  }
}

function createBlockerBuckets() {
  return {
    security: [],
    provenance: [],
    audit: [],
  };
}

function addBlocker(blockers, bucket, data) {
  blockers[bucket].push({
    code: data.code,
    severity: data.severity || "medium",
    message: data.message,
    source: data.source || "release-witness",
    finalReleaseBlocking: data.finalReleaseBlocking !== false,
    dryRunBlocking: data.dryRunBlocking === true,
  });
}

async function collectGitInfo(rootDir, blockers) {
  const commit = await runGit(rootDir, ["rev-parse", "HEAD"]);
  const branch = await runGit(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = await runGit(rootDir, ["status", "--porcelain=v1"]);
  if (!commit.ok) {
    addBlocker(blockers, "provenance", {
      code: "git-commit-unknown",
      severity: "high",
      message: "Current git commit could not be resolved.",
      source: "git rev-parse HEAD",
    });
  }
  if (!status.ok) {
    addBlocker(blockers, "provenance", {
      code: "git-status-unknown",
      severity: "high",
      message: "Git working-tree status could not be resolved.",
      source: "git status --porcelain=v1",
    });
  }
  const changedFiles = status.ok ? parseGitStatusFiles(status.stdout) : [];
  if (changedFiles.length > 0) {
    addBlocker(blockers, "provenance", {
      code: "working-tree-dirty",
      severity: "medium",
      message: `Working tree has ${changedFiles.length} changed file(s); final witness must be generated from the final release state.`,
      source: "git status --porcelain=v1",
    });
  }
  return {
    sha: commit.ok ? commit.stdout.trim() : "unknown",
    branch: branch.ok ? branch.stdout.trim() : "unknown",
    gitAvailable: commit.ok && branch.ok && status.ok,
    dirty: changedFiles.length > 0,
    changedFileCount: changedFiles.length,
    changedFiles,
    statusSource: status.ok ? "git status --porcelain=v1" : "unknown",
  };
}

async function runGit(rootDir, args) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: rootDir,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout || "" };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      error: error.message,
    };
  }
}

function parseGitStatusFiles(stdout = "") {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const status = line.slice(0, 2).trim() || "unknown";
      const rawPath = line.length > 3 ? line.slice(3) : line.slice(2).trim();
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() : rawPath;
      return {
        status,
        path: normalizeRelPath(path),
      };
    })
    .filter((item) => item.path);
}

async function collectVersionInfo(rootDir, packageJson, blockers) {
  const packageVersion = packageJson.value?.version || "unknown";
  if (packageVersion === "unknown") {
    addBlocker(blockers, "provenance", {
      code: "package-version-unknown",
      severity: "high",
      message: "package.json version is unavailable.",
      source: "package.json",
    });
  }
  const manifests = [];
  for (const manifest of VERSION_MANIFESTS) {
    const data = manifest.id === "package"
      ? packageJson
      : await readJsonForManifest(rootDir, manifest.path, blockers, null);
    const version = getByDottedPath(data.value, manifest.field) || "unknown";
    let status = data.ok ? "present" : "unknown";
    if (data.ok && packageVersion !== "unknown" && version !== "unknown" && version !== packageVersion) {
      status = "mismatch";
      addBlocker(blockers, "audit", {
        code: "version-mismatch",
        severity: "medium",
        message: `${manifest.id} version ${version} does not match package ${packageVersion}.`,
        source: manifest.path,
      });
    }
    manifests.push({
      id: manifest.id,
      path: manifest.path,
      version,
      status,
    });
  }
  return {
    packageVersion,
    source: "package.json",
    status: packageVersion === "unknown" ? "unknown" : "present",
    manifests,
  };
}

async function collectPackageHash(rootDir, packageJson, blockers) {
  if (!packageJson.ok) {
    addBlocker(blockers, "provenance", {
      code: "package-hash-unknown",
      severity: "high",
      message: "Package hash is unknown because package.json is unavailable.",
      source: "package-hash",
    });
    return {
      algorithm: "sha256",
      scope: "release-package-inputs-v1",
      digest: "unknown",
      status: "unknown",
      filesHashed: 0,
      missingFiles: [],
      entries: [],
    };
  }

  const entries = [];
  for (const relPath of PACKAGE_HASH_FILES) {
    const absPath = resolveSafe(rootDir, relPath);
    if (!existsSync(absPath)) {
      entries.push({
        path: relPath,
        exists: false,
        bytes: 0,
        sha256: "missing",
      });
      continue;
    }
    try {
      const bytes = await readFile(absPath);
      const fileStat = await stat(absPath);
      entries.push({
        path: relPath,
        exists: true,
        bytes: fileStat.size,
        sha256: sha256(bytes),
      });
    } catch (error) {
      entries.push({
        path: relPath,
        exists: false,
        bytes: 0,
        sha256: "unknown",
        error: error.message,
      });
      addBlocker(blockers, "provenance", {
        code: "package-hash-file-unreadable",
        severity: "medium",
        message: `${relPath} could not be read for package hash.`,
        source: relPath,
      });
    }
  }
  const stableEntries = entries
    .map((entry) => ({
      path: entry.path,
      exists: entry.exists,
      bytes: entry.bytes,
      sha256: entry.sha256,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    algorithm: "sha256",
    scope: "release-package-inputs-v1",
    digest: sha256(JSON.stringify(stableEntries)),
    status: "present",
    filesHashed: stableEntries.filter((entry) => entry.exists).length,
    missingFiles: stableEntries.filter((entry) => !entry.exists).map((entry) => entry.path),
    entries: stableEntries,
  };
}

async function collectTestCount(rootDir, blockers) {
  const testsDir = join(rootDir, "tests");
  if (!existsSync(testsDir)) {
    addBlocker(blockers, "audit", {
      code: "test-count-unknown",
      severity: "medium",
      message: "tests directory is unavailable; test file count is unknown.",
      source: "tests",
    });
    return {
      source: "filesystem",
      testFiles: "unknown",
      executedTests: 0,
      testCases: "unknown",
      status: "unknown",
    };
  }
  const files = await collectFiles(testsDir);
  const testFiles = files.filter((file) => /\.test\.mjs$/i.test(file)).length;
  return {
    source: "filesystem:tests/**/*.test.mjs",
    testFiles,
    executedTests: 0,
    testCases: "unknown",
    status: "execution-deferred-final-release-gate",
  };
}

async function collectFiles(dir) {
  const out = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absPath = join(current, entry.name);
      if (entry.isDirectory()) await walk(absPath);
      else out.push(absPath);
    }
  }
  await walk(dir);
  return out;
}

function summarizeChangedSurfaces(changedFiles = []) {
  const paths = changedFiles.map((item) => item.path).sort();
  const commands = paths.filter((path) => path.startsWith("commands/"));
  const skills = paths.filter((path) => path.startsWith("skills/"));
  const agents = paths.filter((path) => path.startsWith("agents/"));
  return {
    source: "git status --porcelain=v1",
    counts: {
      commands: commands.length,
      skills: skills.length,
      agents: agents.length,
    },
    commands,
    skills,
    agents,
  };
}

function buildValidatorSummary() {
  const validators = DEFERRED_VALIDATORS.map((validator) => ({
    ...validator,
    status: "deferred-final-release-gate",
  }));
  return {
    mode: "read-only-no-execution",
    total: validators.length,
    passed: 0,
    failed: 0,
    deferred: validators.length,
    validators,
  };
}

async function buildEvidenceIntegration(rootDir, validatorSummary) {
  const evidencePacketCitations = [];
  for (const relPath of EVIDENCE_INTEGRATION_ARTIFACTS) {
    const absPath = resolveSafe(rootDir, relPath);
    if (!existsSync(absPath)) {
      evidencePacketCitations.push({
        path: relPath,
        exists: false,
        status: "missing-at-generation-time",
        sha256: "missing",
      });
      continue;
    }
    try {
      const bytes = await readFile(absPath);
      evidencePacketCitations.push({
        path: relPath,
        exists: true,
        status: "present",
        sha256: sha256(bytes),
      });
    } catch {
      evidencePacketCitations.push({
        path: relPath,
        exists: true,
        status: "unreadable-at-generation-time",
        sha256: "unknown",
      });
    }
  }

  return {
    status: "citation-only",
    mode: "local-read-only",
    receiptLedgerDuplication: false,
    receiptLedgerMutation: false,
    validatorsExecutedByThisCli: false,
    testsExecutedByThisCli: false,
    receiptCitations: {
      mode: "citation-only",
      source: "workflow-receipt tooling",
      status: "not-inspected-by-release-witness",
      count: 0,
    },
    validatorCitations: (validatorSummary.validators || []).map((validator) => ({
      id: validator.id,
      command: validator.command,
      status: validator.status,
    })),
    evidencePacketCitations,
    sourceOfTruthBoundary: {
      receipts: "Receipts are owned by scripts/workflow-receipt.mjs and the workflow receipt ledger; this witness only cites receipt ownership and does not duplicate or mutate receipt state.",
      validators: "Validators are owned by the final release gate; this CLI cites deferred validator rows and does not execute tests or validators.",
      witness: "The release witness is a local read-only citation packet over release metadata, evidence artifacts, receipt ownership, and validator references.",
    },
  };
}

function addReadOnlyBlockers(blockers, { validatorSummary }) {
  addBlocker(blockers, "security", {
    code: "release-security-audit-not-run",
    severity: "medium",
    message: "Release security audit is deferred; this CLI does not run validators or tests.",
    source: "npm run audit:release-security",
  });
  if (validatorSummary.deferred > 0) {
    addBlocker(blockers, "audit", {
      code: "final-validators-deferred",
      severity: "medium",
      message: `${validatorSummary.deferred} release validator(s) are deferred to final release gate.`,
      source: "release-witness read-only mode",
    });
  }
}

function buildResidualRisks({ git, validatorSummary }) {
  const risks = [
    {
      riskId: "RW-001",
      severity: "medium",
      owner: "release-owner",
      acceptedBy: "pending-final-release-gate",
      expiry: "release-handoff",
      confidenceImpact: `caps release confidence until ${validatorSummary.deferred} deferred validator(s) run`,
      rollback: "regenerate witness after final validators complete",
      publishable: "no",
    },
    {
      riskId: "RW-002",
      severity: "medium",
      owner: "release-owner",
      acceptedBy: "pending-final-release-approval",
      expiry: "final package and commit state",
      confidenceImpact: "local read-only witness only; not a publishable release proof",
      rollback: "supersede this witness with a final-state witness",
      publishable: "no",
    },
  ];
  if (git.dirty) {
    risks.push({
      riskId: "RW-003",
      severity: "high",
      owner: "release-owner",
      acceptedBy: "pending-clean-release-state",
      expiry: "before final witness generation",
      confidenceImpact: "blocks final release witness until working tree is clean or intentionally captured",
      rollback: "revert or complete changed files, then regenerate witness",
      publishable: "no",
    });
  }
  return risks;
}

function buildRollbackNote(git) {
  const revertCommand = git.sha === "unknown" ? "unknown" : `git revert ${git.sha}`;
  return {
    status: "local-only",
    note: "No release automation, publishing, package upload, hosted dashboard, or receipt-ledger mutation is performed by this CLI.",
    steps: [
      {
        id: "source-revert",
        command: revertCommand,
      },
      {
        id: "witness-supersede",
        command: "node scripts/supervibe-release-witness.mjs --markdown --dry-run",
      },
      {
        id: "final-gate-rerun",
        command: "npm run check",
      },
    ],
  };
}

function summarizeReadiness(blockers) {
  const all = Object.values(blockers).flat();
  const finalReleaseBlocked = all.some((blocker) => blocker.finalReleaseBlocking);
  return {
    status: finalReleaseBlocked ? "blocked" : "ready",
    finalReleaseBlocked,
    blockerCount: all.length,
    blockerCounts: {
      security: blockers.security.length,
      provenance: blockers.provenance.length,
      audit: blockers.audit.length,
    },
  };
}

async function readJsonForManifest(rootDir, relPath, blockers, blockerTemplate) {
  const absPath = resolveSafe(rootDir, relPath);
  try {
    const text = await readFile(absPath, "utf8");
    return {
      ok: true,
      path: relPath,
      value: JSON.parse(text),
    };
  } catch (error) {
    if (blockerTemplate) {
      addBlocker(blockers, blockerTemplate.bucket, {
        code: blockerTemplate.code,
        severity: "high",
        message: `${blockerTemplate.message} ${error.message}`,
        source: relPath,
      });
    }
    return {
      ok: false,
      path: relPath,
      value: null,
      error: error.message,
    };
  }
}

function getByDottedPath(source, path) {
  if (!source || !path) return undefined;
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function resolveSafe(rootDir, relPath) {
  const absPath = resolve(rootDir, normalizeRelPath(relPath));
  if (absPath !== rootDir && !absPath.startsWith(`${rootDir}${sep}`)) {
    throw new Error(`path escapes workspace: ${relPath}`);
  }
  return absPath;
}

function normalizeRelPath(value = "") {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^"\s*/, "")
    .replace(/\s*"$/, "")
    .replace(/^\.\//, "");
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function readOptionValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(flag + " requires a value.");
  return value;
}

function readInlineValue(arg, flag) {
  const value = arg.slice((flag + "=").length);
  if (!value) throw new Error(flag + " requires a value.");
  return value;
}

function formatListCell(values) {
  return values.length > 0 ? values.join("<br>") : "none";
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

async function main() {
  let options;
  try {
    options = parseReleaseWitnessArgs(process.argv.slice(2));
    if (options.help) {
      console.log(renderReleaseWitnessHelp());
      return;
    }
    const manifest = await buildReleaseWitnessManifest(options);
    writeReleaseWitnessResponse(manifest, options);
    process.exitCode = options.strict && manifest.releaseReadiness.finalReleaseBlocked ? 1 : 0;
  } catch (error) {
    const failure = {
      schemaVersion: RELEASE_WITNESS_SCHEMA_VERSION,
      kind: RELEASE_WITNESS_KIND,
      generatedAt: options?.generatedAt || DEFAULT_GENERATED_AT,
      mode: options?.dryRun ? "read-only-dry-run" : "read-only",
      releaseReadiness: {
        status: "error",
        finalReleaseBlocked: true,
        blockerCount: 1,
      },
      error: {
        code: "release-witness-cli-error",
        message: error.message,
      },
    };
    if (options?.json) console.log(JSON.stringify(failure, null, 2));
    else {
      console.error("SUPERVIBE_RELEASE_WITNESS_ERROR");
      console.error(`ERROR: ${error.message}`);
    }
    process.exitCode = 2;
  }
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isMain) main();