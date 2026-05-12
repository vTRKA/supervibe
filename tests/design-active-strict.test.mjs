import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateBrowserEvidence,
} from "../scripts/lib/design-active-completion.mjs";
import {
  validateDesignAgentInvocationReceipts,
} from "../scripts/lib/design-agent-orchestration.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("strict active browser evidence requires feedback queue write proof", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-active-strict-browser-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_evidence/browser-verification.json", `${JSON.stringify({
      desktopViewport: true,
      desktopScreenshot: { path: ".supervibe/artifacts/prototypes/agent-chat/_evidence/desktop.png" },
      mobileViewport: true,
      mobileScreenshot: { path: ".supervibe/artifacts/prototypes/agent-chat/_evidence/mobile.png" },
      url: "http://127.0.0.1:4173/agent-chat/",
      capturedAt: "2026-05-12T00:00:00.000Z",
      selectorReady: true,
      nonblankRender: true,
      noHorizontalOverflow: true,
      feedbackButtonVisible: true,
      drawerOpenClose: true,
      focusTrap: true,
      keyboardNavigation: true,
      textOverlapScan: true,
      contrastAudit: true,
      focusVisible: true,
      feedbackOverlayNonOverlap: true,
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_evidence/desktop.png", "desktop\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_evidence/mobile.png", "mobile\n");

    const result = validateBrowserEvidence(root, { slug: "agent-chat" });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => /feedback queue write proof/.test(issue.message)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("strict active variant-only workflow requires quality-gate reviewer receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-active-strict-receipts-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variant-manifest.json", `${JSON.stringify({
      schemaVersion: 1,
      slug: "agent-chat",
      requestedVariantCount: 2,
      variants: [
        {
          id: "variant-1",
          artifactPath: ".supervibe/artifacts/prototypes/agent-chat/variants/variant-1/index.html",
          feedbackTargetId: "agent-chat:variant-1",
        },
        {
          id: "variant-2",
          artifactPath: ".supervibe/artifacts/prototypes/agent-chat/variants/variant-2/index.html",
          feedbackTargetId: "agent-chat:variant-2",
        },
      ],
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variants/variant-1/index.html", "<!doctype html>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variants/variant-2/index.html", "<!doctype html>\n");

    const result = validateDesignAgentInvocationReceipts(root, {
      active: true,
      slug: "agent-chat",
      handoffId: "agent-chat-run",
      secret: "test-secret",
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) =>
      issue.code === "missing-design-agent-receipt"
      && issue.expectedAgentId === "quality-gate-reviewer"
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
