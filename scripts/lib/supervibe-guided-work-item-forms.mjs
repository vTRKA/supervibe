import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";
import { applyTemplateToWorkItem, getTemplateForGuidedForm } from "./supervibe-work-item-template-catalog.mjs";

export const GUIDED_WORK_ITEM_FORM_TYPES = Object.freeze([
  "epic",
  "task",
  "bug",
  "integration",
  "ui-story",
  "review-request",
  "blocker",
  "research-spike",
  "release-prep",
  "production-prep",
]);

export function createGuidedWorkItemDraft(input = {}, { now = "deterministic-local" } = {}) {
  const formType = input.formType || input.type || "task";
  const template = getTemplateForGuidedForm(formType);
  const normalized = applyTemplateToWorkItem({
    itemId: input.itemId || draftId(formType, input.title),
    type: formType === "epic" ? "epic" : formType === "review-request" ? "review" : formType === "blocker" ? "gate" : "task",
    title: String(input.title || "").trim(),
    owner: input.owner || null,
    priority: input.priority ?? 0,
    labels: normalizeList(input.labels),
    acceptanceCriteria: normalizeList(input.acceptanceCriteria),
    verificationHints: normalizeList(input.verificationHints),
    dependencies: normalizeList(input.dependencies),
    dueAt: input.dueAt || input.dueDate || null,
    risk: input.risk || input.riskLevel || template.riskLevel || "low",
    createdAt: now,
  }, template, {
    owner: input.owner || null,
    labels: normalizeList(input.labels),
    severity: input.priorityLabel || input.severity,
  });
  const validation = validateGuidedWorkItemDraft(normalized);
  return {
    schemaVersion: 1,
    formType,
    templateId: template.id,
    item: normalized,
    validation,
    preview: renderGuidedWorkItemPreview(normalized, validation),
  };
}

export function validateGuidedWorkItemDraft(item = {}) {
  const issues = [];
  if (!item.title || item.title.length < 4) issues.push({ field: "title", code: "title-too-short" });
  if (!item.templateId) issues.push({ field: "template", code: "template-required" });
  if (!["low", "medium", "high", "critical"].includes(String(item.risk || item.executionHints?.policyRiskLevel || "low").toLowerCase())) {
    issues.push({ field: "risk", code: "risk-invalid" });
  }
  if (!item.acceptanceCriteria?.length) issues.push({ field: "acceptanceCriteria", code: "acceptance-required" });
  if (!item.verificationHints?.length) issues.push({ field: "verificationHints", code: "verification-required" });
  if (item.dueAt && !Number.isFinite(Date.parse(item.dueAt))) issues.push({ field: "dueAt", code: "due-date-invalid" });
  return { valid: issues.length === 0, issues };
}

export function importGuidedWorkItemFromText(text = "") {
  const fields = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z -]+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].toLowerCase().replace(/\s+/g, "-");
    fields[key] = match[2].trim();
  }
  return createGuidedWorkItemDraft({
    formType: fields.type || fields.template || "task",
    title: fields.title,
    owner: fields.owner,
    labels: fields.labels,
    acceptanceCriteria: fields.acceptance || fields["acceptance-criteria"],
    verificationHints: fields.verification || fields["verification-hints"],
    dependencies: fields.dependencies,
    dueAt: fields.due || fields["due-at"],
    risk: fields.risk,
  });
}

export function renderGuidedWorkItemPreview(item = {}, validation = validateGuidedWorkItemDraft(item)) {
  const lines = [
    "SUPERVIBE_WORK_ITEM_FORM_PREVIEW",
    `VALID: ${validation.valid}`,
    `ITEM: ${item.itemId}`,
    `TITLE: ${item.title}`,
    `TEMPLATE: ${item.templateId}`,
    `OWNER: ${item.owner || "unowned"}`,
    `LABELS: ${(item.labels || []).join(",") || "none"}`,
    `DUE: ${item.dueAt || "none"}`,
    `RISK: ${item.risk || item.executionHints?.policyRiskLevel || "low"}`,
  ];
  if (!validation.valid) lines.push(`ISSUES: ${validation.issues.map((issue) => `${issue.field}:${issue.code}`).join(",")}`);
  return redactFormText(lines.join("\n"));
}

export async function saveGuidedWorkItemDraft(outPath, draft) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
  return { outPath, bytes: Buffer.byteLength(JSON.stringify(draft)) };
}

export function redactFormText(value = "") {
  return redactSensitiveContent(String(value))
    .replace(/[A-Z]:\\Users\\[^\\\n]+/g, "[USER_PATH]")
    .replace(/[A-Z]:\\\\Users\\\\[^"\n]+/g, "[USER_PATH]")
    .replace(/\/home\/[^/\n]+/g, "/home/[USER]")
    .replace(/("?(?:token|password|secret|apiKey)"?\s*:\s*")([^"]+)(")/gi, "$1[REDACTED]$3")
    .replace(/\b(?:token|password|secret|apiKey)=\S+/gi, "[REDACTED]")
    .replace(/raw prompt:[^\n]+/gi, "raw prompt:[REDACTED]");
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

function draftId(formType, title = "") {
  const slug = String(title || "draft").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "draft";
  return `${formType}-${slug}`;
}
