import assert from "node:assert/strict";
import test from "node:test";
import {
  auditBrandAsset,
  auditBrandToTokenSync,
  comparePalettes,
  normalizeHex,
} from "../scripts/lib/design-brand-asset-auditor.mjs";

test("brand asset auditor catches format, naming, size, and palette drift", () => {
  const result = auditBrandAsset({
    fileName: "hero-logo.gif",
    sizeBytes: 2_000_000,
    requiredNameParts: ["brand"],
    candidatePalette: ["#fff", "#ff0000"],
    approvedPalette: ["#ffffff", "#111111"],
  });
  assert.equal(result.pass, false);
  assert.equal(result.issues.some((issue) => issue.code === "unsupported-extension"), true);
  assert.equal(result.issues.some((issue) => issue.code === "asset-too-large"), true);
  assert.equal(result.issues.some((issue) => issue.code === "asset-name-missing-part"), true);
  assert.equal(result.issues.some((issue) => issue.code === "palette-drift"), true);
});

test("palette comparison normalizes shorthand colors", () => {
  assert.equal(normalizeHex("#fff"), "#ffffff");
  const result = comparePalettes(["#fff", "#123456"], ["#ffffff"]);
  assert.deepEqual(result.matchedCandidateColors, ["#ffffff"]);
  assert.deepEqual(result.unmatchedCandidateColors, ["#123456"]);
});

test("brand-to-token sync detects missing and drifting roles", () => {
  const result = auditBrandToTokenSync({
    brandPalette: { primary: "#111111", accent: "#ff0000" },
    tokenPalette: { primary: "#111111" },
  });
  assert.equal(result.pass, false);
  assert.equal(result.issues.some((issue) => issue.code === "missing-token-role"), true);
});
