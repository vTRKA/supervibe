import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTemplateQualityReport,
  validateTemplateQuality,
} from "../scripts/validate-template-quality.mjs";

test("template quality validator accepts current core templates", () => {
  const report = validateTemplateQuality();

  assert.equal(report.pass, true, formatTemplateQualityReport(report));
});

test("template quality validator reports missing retrieval and visual contracts", () => {
  const report = validateTemplateQuality({
    rootDir: process.cwd(),
    rules: [{
      file: "docs/templates/brainstorm-output-template.md",
      label: "fixture",
      requiredSections: ["Missing Retrieval Section"],
      requiredTerms: ["definitely-not-present-template-term"],
      rejectedTerms: ["Problem statement"],
      minimumWordCount: 100000,
    }],
  });

  assert.equal(report.pass, false);
  assert.match(formatTemplateQualityReport(report), /missing section: Missing Retrieval Section/);
  assert.match(formatTemplateQualityReport(report), /missing term: definitely-not-present-template-term/);
  assert.match(formatTemplateQualityReport(report), /rejected generic prompt term: Problem statement/);
  assert.match(formatTemplateQualityReport(report), /template too thin/);
});
