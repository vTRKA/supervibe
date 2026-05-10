import assert from "node:assert/strict";
import test from "node:test";

import {
  compareLayoutFingerprints,
  extractDesignLayoutFingerprint,
} from "../scripts/lib/design-layout-fingerprint.mjs";
import {
  validateFeedbackPayloadBinding,
} from "../scripts/lib/design-feedback-payload-validator.mjs";

test("layout fingerprint groups identical shells even when text differs", () => {
  const first = extractDesignLayoutFingerprint(`
    <main><header class="topbar">A</header><section class="chat-center"></section><aside class="context-drawer"></aside><footer class="bottom-composer"></footer></main>
  `, { file: "first.html" });
  const second = extractDesignLayoutFingerprint(`
    <main><header class="topbar">B</header><section class="chat-center"></section><aside class="context-drawer"></aside><footer class="bottom-composer"></footer></main>
  `, { file: "second.html" });

  const comparison = compareLayoutFingerprints([first, second]);

  assert.equal(comparison.allSameShell, true);
  assert.equal(comparison.uniqueShellCount, 1);
  assert.equal(comparison.duplicateShellGroups.length, 1);
});

test("layout fingerprint separates different navigation and composer structures", () => {
  const commandCanvas = extractDesignLayoutFingerprint(`
    <main><nav class="hidden-nav"></nav><section class="workspace-flow"></section><form class="command-composer"></form></main>
  `);
  const timeline = extractDesignLayoutFingerprint(`
    <main><section class="activity-timeline"></section><aside class="approval-inspector"></aside><footer class="prompt-dock"></footer></main>
  `);

  const comparison = compareLayoutFingerprints([commandCanvas, timeline]);

  assert.equal(comparison.allSameShell, false);
  assert.equal(comparison.uniqueShellCount, 2);
});

test("feedback payload validator rejects marker-only overlays", () => {
  const result = validateFeedbackPayloadBinding(
    '<main data-feedback-overlay data-supervibe-feedback-target="agent-chat:variant-1"></main>',
    { feedbackTargetId: "agent-chat:variant-1" },
  );

  assert.equal(result.pass, false);
  assert.equal(result.markerPresent, true);
  assert.equal(result.targetPresent, true);
  assert.equal(result.payloadBindsTarget, false);
});

test("feedback payload validator accepts dispatchable payload binding", () => {
  const result = validateFeedbackPayloadBinding(`
    <main data-feedback-overlay data-supervibe-feedback-target="agent-chat:variant-1"></main>
    <script>
      const feedbackPayload = { feedbackTargetId: "agent-chat:variant-1" };
      function sendFeedback(note) {
        navigator.sendBeacon("/feedback", JSON.stringify({ ...feedbackPayload, note }));
      }
    </script>
  `, { feedbackTargetId: "agent-chat:variant-1" });

  assert.equal(result.pass, true);
});
