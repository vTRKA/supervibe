import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function auditInstallIntegrity({ rootDir = process.cwd() } = {}) {
  const root = resolve(rootDir);
  return auditInstallIntegrityData({
    scripts: {
      installSh: await readOptional(join(root, "install.sh")),
      installPs1: await readOptional(join(root, "install.ps1")),
      updateSh: await readOptional(join(root, "update.sh")),
      updatePs1: await readOptional(join(root, "update.ps1")),
    },
    docs: {
      installIntegrity: await readOptional(join(root, "docs", "install-integrity.md")),
    },
  });
}

export function auditInstallIntegrityData(data = {}) {
  const issues = [];
  const scripts = data.scripts || {};

  requireScript(scripts.installSh, "install.sh", issues);
  requireScript(scripts.installPs1, "install.ps1", issues);
  requireScript(scripts.updateSh, "update.sh", issues);
  requireScript(scripts.updatePs1, "update.ps1", issues);

  requirePattern(scripts.installSh, /SUPERVIBE_EXPECTED_COMMIT/, "install.sh", "missing expected commit verification", issues);
  requirePattern(scripts.installPs1, /SUPERVIBE_EXPECTED_COMMIT/, "install.ps1", "missing expected commit verification", issues);
  requirePattern(scripts.installSh, /SUPERVIBE_EXPECTED_PACKAGE_SHA256|sha256/i, "install.sh", "missing package checksum verification", issues);
  requirePattern(scripts.installPs1, /SUPERVIBE_EXPECTED_PACKAGE_SHA256|sha256/i, "install.ps1", "missing package checksum verification", issues);
  requirePattern(scripts.updateSh, /SUPERVIBE_EXPECTED_COMMIT/, "update.sh", "missing expected commit verification", issues);
  requirePattern(scripts.updatePs1, /SUPERVIBE_EXPECTED_COMMIT/, "update.ps1", "missing expected commit verification", issues);
  requirePattern(scripts.updateSh, /SUPERVIBE_EXPECTED_PACKAGE_SHA256|sha256/i, "update.sh", "missing package checksum verification", issues);
  requirePattern(scripts.updatePs1, /SUPERVIBE_EXPECTED_PACKAGE_SHA256|sha256/i, "update.ps1", "missing package checksum verification", issues);

  requirePattern(scripts.installSh, /validate_safe_path/, "install.sh", "missing path safety check", issues);
  requirePattern(scripts.installPs1, /Assert-SafePluginPath/, "install.ps1", "missing path safety check", issues);
  requirePattern(scripts.updateSh, /validate_safe_path/, "update.sh", "missing path safety check", issues);
  requirePattern(scripts.updatePs1, /Assert-SafePluginPath/, "update.ps1", "missing path safety check", issues);

  requirePattern(scripts.installSh, /git clean -ffdx/, "install.sh", "missing clean reinstall guard", issues);
  requirePattern(scripts.installPs1, /clean', '-ffdx/, "install.ps1", "missing clean reinstall guard", issues);
  requirePattern(scripts.installSh, /registry:build/, "install.sh", "missing generated registry build", issues);
  requirePattern(scripts.installPs1, /registry:build/, "install.ps1", "missing generated registry build", issues);
  requirePattern(scripts.installSh, /supervibe:install-doctor/, "install.sh", "missing install lifecycle doctor", issues);
  requirePattern(scripts.installPs1, /supervibe:install-doctor/, "install.ps1", "missing install lifecycle doctor", issues);
  requirePattern(scripts.updateSh, /tracked_dirty/, "update.sh", "must distinguish tracked edits from untracked stale files", issues);
  requirePattern(scripts.updatePs1, /\$trackedDirty/, "update.ps1", "must distinguish tracked edits from untracked stale files", issues);

  requirePattern(scripts.installSh, /will modify/i, "install.sh", "must explain modifications before writing", issues);
  requirePattern(scripts.installPs1, /will modify/i, "install.ps1", "must explain modifications before writing", issues);

  const bashRef = /REF="\$\{SUPERVIBE_REF:-([^}]+)\}"/.exec(scripts.installSh || "")?.[1];
  const psRef = /\$Ref\s*=[\s\S]*?else\s*\{\s*'([^']+)'\s*\}/.exec(scripts.installPs1 || "")?.[1];
  if (!bashRef || isUnsupportedDefaultRef(bashRef)) {
    addIssue(issues, "install-ref-not-pinned", `install.sh defaults to unsupported ref ${bashRef || "missing"}`, "Default installer ref must be main, a version tag, or an exact commit.");
  }
  if (!psRef || isUnsupportedDefaultRef(psRef)) {
    addIssue(issues, "install-ref-not-pinned", `install.ps1 defaults to unsupported ref ${psRef || "missing"}`, "Default installer ref must be main, a version tag, or an exact commit.");
  }

  for (const [name, source] of Object.entries(scripts)) {
    for (const url of mutableRawGithubUrls(source)) {
      if (!isAllowedLiveMainUrl(url)) {
        addIssue(issues, "mutable-raw-download-url", `${name} references a mutable raw.githubusercontent.com branch: ${url}`, "Use the project-owned main channel or a version tag/exact commit in install/update one-liners.");
      }
    }
  }

  if (!/SUPERVIBE_EXPECTED_COMMIT/.test(data.docs?.installIntegrity || "") || !/SUPERVIBE_EXPECTED_PACKAGE_SHA256/.test(data.docs?.installIntegrity || "")) {
    addIssue(issues, "install-integrity-doc-missing", "docs/install-integrity.md must document commit and checksum verification", "Update install integrity docs.");
  }
  if (!/live main|live-main/i.test(data.docs?.installIntegrity || "")) {
    addIssue(issues, "install-main-channel-doc-missing", "docs/install-integrity.md must document the live main install channel", "Document the main-first install workflow.");
  }
  if (!/path traversal/i.test(data.docs?.installIntegrity || "")) {
    addIssue(issues, "install-path-safety-doc-missing", "docs/install-integrity.md must document path traversal refusal", "Document installer path safety.");
  }

  return {
    pass: issues.length === 0,
    score: issues.length === 0 ? 10 : Math.max(0, Number((10 - issues.length * 0.5).toFixed(1))),
    issues,
    expectations: {
      commitPinEnv: "SUPERVIBE_EXPECTED_COMMIT",
      packageChecksumEnv: "SUPERVIBE_EXPECTED_PACKAGE_SHA256",
      pathSafety: "installer refuses empty, root, traversal, and unexpected plugin roots",
      defaultRef: bashRef || null,
      liveMainDefault: bashRef === "main" && psRef === "main",
      pinnedDefaultRef: Boolean(bashRef && psRef && !isLiveMainRef(bashRef) && !isUnsupportedDefaultRef(bashRef) && !isUnsupportedDefaultRef(psRef)),
    },
  };
}

export function createInstallIntegritySummary(audit) {
  return {
    gate: "install-integrity",
    pass: Boolean(audit?.pass),
    score: audit?.score ?? 0,
    expectations: audit?.expectations || {},
    issues: audit?.issues || [{ code: "install-integrity-not-run", message: "install integrity audit was not run" }],
  };
}

function requireScript(source, label, issues) {
  if (!source) addIssue(issues, "installer-script-missing", `${label} is missing`, `Restore ${label}.`);
}

function requirePattern(source, pattern, label, message, issues) {
  if (!pattern.test(source || "")) addIssue(issues, "installer-integrity-missing", `${label}: ${message}`, `Update ${label} with the release integrity guard.`);
}

function isUnsupportedDefaultRef(ref = "") {
  return /^(master|HEAD)$/i.test(String(ref).trim());
}

function isLiveMainRef(ref = "") {
  return /^main$/i.test(String(ref).trim());
}

function mutableRawGithubUrls(source = "") {
  return String(source || "").match(/https:\/\/raw\.githubusercontent\.com\/[^\s"'`]+\/(?:main|master|HEAD)\/[^\s"'`]*/gi) || [];
}

function isAllowedLiveMainUrl(url = "") {
  return /^https:\/\/raw\.githubusercontent\.com\/vTRKA\/supervibe\/main\/(?:install|update)\.(?:sh|ps1)$/i.test(url);
}

function addIssue(issues, code, message, nextAction) {
  issues.push({ code, message, nextAction });
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}
