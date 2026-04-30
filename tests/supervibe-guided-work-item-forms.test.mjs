import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createGuidedWorkItemDraft,
  GUIDED_WORK_ITEM_FORM_TYPES,
  importGuidedWorkItemFromText,
  redactFormText,
  renderGuidedWorkItemPreview,
  saveGuidedWorkItemDraft,
  validateGuidedWorkItemDraft,
} from "../scripts/lib/supervibe-guided-work-item-forms.mjs";
import { getTemplateForGuidedForm, GUIDED_FORM_TEMPLATE_MAP } from "../scripts/lib/supervibe-work-item-template-catalog.mjs";

test("guided forms validate normalized work items and preview before writes", () => {
  const draft = createGuidedWorkItemDraft({
    formType: "integration",
    title: "Connect tracker API token=secret-value-that-must-redact",
    owner: "worker-1",
    labels: "integration,tracker",
    acceptanceCriteria: "Sync works",
    verificationHints: "integration dry run",
    dueAt: "2026-05-01T09:00:00.000Z",
    risk: "medium",
  });

  assert.ok(GUIDED_WORK_ITEM_FORM_TYPES.includes("production-prep"));
  assert.equal(GUIDED_FORM_TEMPLATE_MAP.integration, "integration");
  assert.equal(getTemplateForGuidedForm("bug").id, "bugfix");
  assert.equal(draft.validation.valid, true);
  assert.doesNotMatch(draft.preview, /secret-value-that-must-redact/);
  assert.match(renderGuidedWorkItemPreview(draft.item), /SUPERVIBE_WORK_ITEM_FORM_PREVIEW/);
});

test("guided forms import text, reject incomplete drafts, and save drafts without creating tasks", async () => {
  const imported = importGuidedWorkItemFromText(`Type: bug
Title: Broken checkout
Owner: worker-1
Labels: bug,checkout
Acceptance: Checkout failure is fixed
Verification: Regression test
Risk: medium`);
  const invalid = createGuidedWorkItemDraft({ title: "No" });
  const dir = await mkdtemp(join(tmpdir(), "supervibe-form-"));
  const outPath = join(dir, "draft.json");
  await saveGuidedWorkItemDraft(outPath, imported);

  assert.equal(imported.templateId, "bugfix");
  assert.equal(validateGuidedWorkItemDraft(invalid.item).valid, false);
  assert.match(await readFile(outPath, "utf8"), /Broken checkout/);
  assert.match(redactFormText("C:\\Users\\alice\\repo raw prompt: secret-value"), /\[USER_PATH\]/);
});
