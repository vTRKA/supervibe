#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_AXES = Object.freeze([
  ["visual_direction_tone", "visual direction and tone"],
  ["audience_trust_posture", "audience and trust/risk posture"],
  ["information_density", "information density"],
  ["typography_personality", "typography personality"],
  ["palette_mood", "palette mood"],
  ["motion_intensity", "motion intensity"],
  ["component_feel", "component feel"],
  ["reference_borrow_avoid", "reference borrow/avoid"],
]);

const ALLOWED_PREFERENCE_SOURCES = new Set(["user", "explicit-default"]);

const PROTECTED_RELATIVE_PATHS = Object.freeze([
  ".supervibe/artifacts/brandbook/direction.md",
  ".supervibe/artifacts/prototypes/_design-system/tokens.css",
  ".supervibe/artifacts/prototypes/_design-system/manifest.json",
  ".supervibe/artifacts/prototypes/_design-system/design-flow-state.json",
]);

export function validateDesignArtifactWriteGates(rootDir = process.cwd()) {
  const issues = [];
  const protectedFiles = existingProtectedFiles(rootDir);
  const approvalFiles = existingApprovalFiles(rootDir);
  const preferencesPath = join(rootDir, ".supervibe", "artifacts", "brandbook", "preferences.json");
  const preferences = readJson(preferencesPath);
  const preferenceEvidence = validatePreferenceEvidence(preferences);

  if ((protectedFiles.length > 0 || approvalFiles.length > 0) && !preferenceEvidence.pass) {
    for (const message of preferenceEvidence.messages) {
      issues.push({
        file: ".supervibe/artifacts/brandbook/preferences.json",
        code: "missing-first-user-design-gate",
        message,
      });
    }
  }

  for (const file of approvalFiles) {
    const approval = readJson(join(rootDir, ...file.split("/")));
    const approvalEvidence = validateApprovalEvidence(approval);
    if (!preferenceEvidence.pass && !approvalEvidence.pass) {
      issues.push({
        file,
        code: "approval-without-user-evidence",
        message: `${file}: approval marker exists without preference evidence or explicit user approval evidence`,
      });
    }
    if (approval?.status === "approved" && !approvalEvidence.pass) {
      for (const message of approvalEvidence.messages) {
        issues.push({
          file,
          code: "approved-marker-missing-evidence",
          message,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    checked: protectedFiles.length + approvalFiles.length,
    protectedFiles,
    approvalFiles,
    issues,
  };
}

export function formatDesignArtifactWriteGatesReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_ARTIFACT_WRITE_GATES",
    `PASS: ${result.pass}`,
    `CHECKED: ${result.checked}`,
    `PROTECTED_FILES: ${result.protectedFiles.length}`,
    `APPROVAL_FILES: ${result.approvalFiles.length}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const issue of result.issues) {
    lines.push(`ISSUE: ${issue.code} ${issue.file} - ${issue.message}`);
  }
  return lines.join("\n");
}

function existingProtectedFiles(rootDir) {
  return PROTECTED_RELATIVE_PATHS.filter((relPath) => existsSync(join(rootDir, ...relPath.split("/"))));
}

function existingApprovalFiles(rootDir) {
  const root = join(rootDir, ".supervibe", "artifacts");
  if (!existsSync(root)) return [];
  const files = [];
  walk(root, files, rootDir);
  return files
    .map((file) => normalizeRelPath(relative(rootDir, file)))
    .filter((file) => /\/\.approvals\/[^/]+\.json$/i.test(file) || /\/\.approval\.json$/i.test(file))
    .sort();
}

function walk(dir, files, rootDir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files, rootDir);
      continue;
    }
    if (!entry.isFile()) continue;
    if (statSync(full).size > 1_000_000) continue;
    files.push(full);
  }
}

function validatePreferenceEvidence(preferences) {
  const messages = [];
  if (!preferences) {
    return {
      pass: false,
      messages: ["preferences.json is required before long-lived design artifacts are written"],
    };
  }

  const ack = preferences.first_user_design_gate_ack === true
    || preferences.firstUserDesignGateAck === true
    || preferences.gates?.first_user_design_gate_ack === true;
  if (!ack) {
    messages.push("preferences.json must include first_user_design_gate_ack=true");
  }

  const entries = preferenceEntries(preferences);
  for (const [axis, label] of REQUIRED_AXES) {
    const entry = entries.get(normalizeAxis(axis)) || entries.get(normalizeAxis(label));
    if (!entry) {
      messages.push(`preferences.json missing axis: ${label}`);
      continue;
    }
    const source = String(entry.source ?? "").trim();
    if (!ALLOWED_PREFERENCE_SOURCES.has(source)) {
      messages.push(`preferences.json axis "${label}" must use source=user or source=explicit-default`);
    }
    if (!String(entry.prompt ?? "").trim()) {
      messages.push(`preferences.json axis "${label}" must record the prompt`);
    }
    if (!String(entry.answer ?? entry.default ?? "").trim()) {
      messages.push(`preferences.json axis "${label}" must record the answer/default`);
    }
    if (!String(entry.timestamp ?? entry.answeredAt ?? "").trim()) {
      messages.push(`preferences.json axis "${label}" must record timestamp/answeredAt`);
    }
    if (!String(entry.decision_unlocked ?? entry.decisionUnlocked ?? "").trim()) {
      messages.push(`preferences.json axis "${label}" must record decision_unlocked`);
    }
  }

  return { pass: messages.length === 0, messages };
}

function preferenceEntries(preferences) {
  const matrix = preferences.matrix ?? preferences.preferenceMatrix ?? preferences.axes ?? {};
  const entries = new Map();
  if (Array.isArray(matrix)) {
    for (const entry of matrix) {
      const key = normalizeAxis(entry?.axis ?? entry?.id ?? entry?.name);
      if (key) entries.set(key, entry);
    }
    return entries;
  }
  for (const [key, value] of Object.entries(matrix)) {
    entries.set(normalizeAxis(key), value);
  }
  return entries;
}

function validateApprovalEvidence(approval) {
  const messages = [];
  if (!approval) return { pass: false, messages: ["approval marker is not valid JSON"] };
  if (!String(approval.approved_by ?? approval.approvedBy ?? "").trim()) {
    messages.push("approved marker must record approved_by/approvedBy");
  }
  if (!String(approval.approved_at ?? approval.approvedAt ?? "").trim()) {
    messages.push("approved marker must record approved_at/approvedAt");
  }
  if (!String(approval.feedback_hash ?? approval.feedbackHash ?? approval.user_message_hash ?? approval.evidence ?? "").trim()) {
    messages.push("approved marker must record feedback_hash/user_message_hash/evidence");
  }
  return { pass: messages.length === 0, messages };
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function normalizeAxis(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeRelPath(path) {
  return String(path).split(sep).join("/");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateDesignArtifactWriteGates(process.cwd());
  console.log(formatDesignArtifactWriteGatesReport(result));
  process.exit(result.pass ? 0 : 1);
}
