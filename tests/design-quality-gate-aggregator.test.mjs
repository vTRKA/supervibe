import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  aggregateDesignConfidence,
  evaluateDesignQualityGate,
  validatePrototypeBuilderHighConfidenceEvidence,
} from "../scripts/lib/design-quality-gate-aggregator.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("design quality gate blocks approval on blocker or high review findings", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-quality-gate-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md", "# Polish\n\nBLOCKER: trace rows overflow the viewport.\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md", "# A11y\n\n- Severity: high - palette dialog has no focus trap.\n");

    const gate = evaluateDesignQualityGate(root, { slug: "agent-chat", requireReviews: true });

    assert.equal(gate.pass, false);
    assert.equal(gate.approvalAllowed, false);
    assert.ok(gate.blockerCount >= 1);
    assert.equal(gate.issues.some((issue) => issue.code === "blocker-review-finding"), true);
    assert.equal(gate.issues.some((issue) => issue.code === "high-review-finding"), true);
    assert.equal(gate.confidence.cap, 6);
    assert.ok(gate.nextAllowedActions.includes("revise-prototype"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design quality gate blocks approval when required prototype artifacts were not started", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-quality-not-started-"));
  try {
    const gate = evaluateDesignQualityGate(root, { slug: "agent-chat", requireReviews: true });

    assert.equal(gate.pass, false);
    assert.equal(gate.approvalAllowed, false);
    assert.equal(gate.confidence.score, 0);
    assert.ok(gate.issues.some((issue) => issue.code === "prototype-not-started"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design quality gate blocks approval on invalid variant-set manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-quality-variants-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variant-manifest.json", `${JSON.stringify({
      schemaVersion: 1,
      slug: "agent-chat",
      requestedVariantCount: 2,
      feedbackOverlayRequired: true,
      variants: [
        {
          id: "variant-1",
          label: "Variant 1",
          artifactPath: ".supervibe/artifacts/prototypes/agent-chat/variants/variant-1/index.html",
          feedbackTargetId: "agent-chat:variant-1",
          fullscreen: true,
        },
      ],
    }, null, 2)}\n`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/variants/variant-1/index.html", "<main></main>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md", "# Polish\n\nBlockers: none\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md", "# A11y\n\nNo high issues\n");

    const gate = evaluateDesignQualityGate(root, { slug: "agent-chat", requireReviews: true });

    assert.equal(gate.pass, false);
    assert.equal(gate.approvalAllowed, false);
    assert.ok(gate.issues.some((issue) => issue.code === "design-variant-set-invalid"));
    assert.ok(gate.highCount > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design confidence aggregation caps high severity runs below approval confidence", () => {
  const result = aggregateDesignConfidence({
    builderConfidence: 9.6,
    polishConfidence: 9.4,
    a11yConfidence: 9.1,
    browserVerification: { pass: true },
    receiptValidation: { pass: true },
    qualityIssues: [{ severity: "high", message: "focus trap missing" }],
  });

  assert.equal(result.rawScore > 9, true);
  assert.equal(result.score, 7);
  assert.equal(result.capped, true);
});

test("design quality gate ignores explicit none/zero severity review summaries but still blocks missing provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-design-quality-negated-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/index.html", "<!doctype html>\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/polish.md", "# Polish\n\nBlockers: none\nCritical: none\nP0: none\n");
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_reviews/a11y.md", "# A11y\n\nNo high issues\nNo P1 issues\n");

    const gate = evaluateDesignQualityGate(root, { slug: "agent-chat", requireReviews: true });

    assert.equal(gate.pass, false);
    assert.equal(gate.approvalAllowed, false);
    assert.equal(gate.issues.some((issue) => issue.code === "blocker-review-finding"), false);
    assert.equal(gate.issues.some((issue) => issue.code === "design-provenance-invalid"), true);
    assert.equal(gate.highCount, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype builder confidence >= 9 requires explicit interaction and a11y preflight evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-prototype-preflight-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/_verification/prototype-builder.json", JSON.stringify({
      checks: [
        "dom-overflow",
        "focus-trap",
        "escape-behavior",
        "aria-activedescendant",
        "aria-selected",
        "native-button-semantics",
        "approval-composer-disabled",
        "visible-focus",
        "reduced-motion",
      ],
    }, null, 2));

    const pass = validatePrototypeBuilderHighConfidenceEvidence(root, {
      confidence: 9.2,
      evidencePaths: [".supervibe/artifacts/prototypes/agent-chat/_verification/prototype-builder.json"],
    });
    const fail = validatePrototypeBuilderHighConfidenceEvidence(root, {
      confidence: 9.2,
      evidencePaths: [],
    });

    assert.equal(pass.pass, true);
    assert.equal(fail.pass, false);
    assert.ok(fail.missingChecks.includes("focus-trap"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
