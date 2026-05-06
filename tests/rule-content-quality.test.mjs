import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  validateRuleContentQuality,
} from "../scripts/validate-rule-content-quality.mjs";

test("rule content quality passes for distinct rule-specific sections", async () => {
  const root = await createTempRulesRoot();
  try {
    await writeRule(root, "alpha.md", "Alpha rule protects command receipts with concrete repair steps.");
    await writeRule(root, "beta.md", "Beta rule protects design evidence with regulated-domain examples.");

    const report = validateRuleContentQuality(root);

    assert.equal(report.pass, true);
    assert.equal(report.issues.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rule content quality blocks mandatory rules without concrete examples", async () => {
  const root = await createTempRulesRoot();
  try {
    await writeRule(root, "thin.md", `---
name: thin-rule
mandatory: true
---

# Thin Rule

## Why

This explains a risk.

## Scope

This applies to a real surface.

## Enforcement

Run a validator.

## Related

- another-rule
`);

    const report = validateRuleContentQuality(root);

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "missing-rule-examples"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rule content quality blocks known filler sections", async () => {
  const root = await createTempRulesRoot();
  try {
    await writeRule(root, "filler.md", "## Operational Depth Checklist\n\nCopied generic checklist.");

    const report = validateRuleContentQuality(root);

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "generic-operational-depth-checklist"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rule content quality blocks large duplicated sections across rules", async () => {
  const root = await createTempRulesRoot();
  const duplicated = `## Shared Large Section

This section is intentionally long and duplicated. It tells every rule to read
project memory, check Code RAG, check Code Graph, validate receipts, ask for
approval, rerun tests, update docs, update registries, record memory, cite
evidence, report risk, and re-run the same command. It is generic enough that it
does not teach the specific rule. `.repeat(3);

  try {
    await writeRule(root, "one.md", duplicated);
    await writeRule(root, "two.md", duplicated);
    await writeRule(root, "three.md", duplicated);

    const report = validateRuleContentQuality(root);

    assert.equal(report.pass, false);
    assert.ok(report.issues.some((issue) => issue.code === "duplicated-large-rule-section"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rule content quality does not flag same example headings with distinct code evidence", async () => {
  const root = await createTempRulesRoot();
  const sharedProse = `These examples use the same Bad/Good headings, but the rule-specific evidence
is carried by different command surfaces and should not force artificial
heading rewrites when the actual examples are distinct. `;
  const example = (symbol) => `## Examples

${sharedProse.repeat(5)}

### Bad

\`\`\`js
${symbol}.unsafeCall("manual-state");
\`\`\`

### Good

\`\`\`js
${symbol}.verifiedCall("runtime-receipt");
\`\`\`
`;

  try {
    await writeRule(root, "alpha.md", example("alphaCommand"));
    await writeRule(root, "beta.md", example("betaCommand"));
    await writeRule(root, "gamma.md", example("gammaCommand"));

    const report = validateRuleContentQuality(root);

    assert.equal(report.pass, true, JSON.stringify(report.issues, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


async function createTempRulesRoot() {
  const root = await mkdtemp(join(tmpdir(), "supervibe-rule-quality-"));
  await mkdir(join(root, "rules"));
  return root;
}

async function writeRule(root, fileName, body) {
  await writeFile(join(root, "rules", fileName), `${body}\n`, "utf8");
}
