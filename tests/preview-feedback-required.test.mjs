import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { injectOverlay } from "../scripts/lib/feedback-overlay-injector.mjs";
import {
  assertFeedbackAllowed,
  isFeedbackRequiredPreviewRoot,
} from "../scripts/lib/preview-feedback-policy.mjs";

test("feedback overlay injects a visible mandatory button and artifact slug", async () => {
  const html = await injectOverlay("<html><body><main>Preview</main></body></html>", {
    prototypeSlug: "checkout",
    viewport: "375",
  });

  assert.match(html, /id: 'evolve-fb-toggle'/);
  assert.match(html, /textContent: 'Feedback'/);
  assert.match(html, /pendingPayloads/);
  assert.match(html, /Feedback queued/);
  assert.match(html, /Feedback unavailable/);
  assert.match(html, /window\.__supervibePrototypeSlug="checkout"/);
  assert.match(html, /window\.__evolvePrototypeSlug="checkout"/);
});

test("design preview roots cannot disable feedback overlay", () => {
  const prototypeRoot = join("workspace", "prototypes", "checkout");
  const presentationRoot = join("workspace", "presentations", "investor");
  const mockupRoot = join("workspace", "mockups", "landing");
  const publicRoot = join("workspace", "public");

  assert.equal(isFeedbackRequiredPreviewRoot(prototypeRoot), true);
  assert.equal(isFeedbackRequiredPreviewRoot(presentationRoot), true);
  assert.equal(isFeedbackRequiredPreviewRoot(mockupRoot), true);
  assert.equal(isFeedbackRequiredPreviewRoot(publicRoot), false);

  assert.throws(
    () => assertFeedbackAllowed({ root: prototypeRoot, noFeedback: true }),
    /Feedback overlay is mandatory/,
  );
  assert.doesNotThrow(() => assertFeedbackAllowed({ root: publicRoot, noFeedback: true }));
});
