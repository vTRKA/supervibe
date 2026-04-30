import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  composeDesignRecommendation,
  formatDesignEvidence,
  inferDesignDomains,
  loadDesignIntelligenceData,
  parseCsv,
  searchDesignIntelligence,
} from "../scripts/lib/design-intelligence-search.mjs";

test("design intelligence manifest covers required domains and provenance", async () => {
  const data = await loadDesignIntelligenceData();
  assert.equal(data.manifest.sourceCommitShort, "b7e3af8");
  assert.equal(data.manifest.license, "MIT");
  assert.equal(data.manifest.runtime, "node-only");

  for (const domain of [
    "product",
    "style",
    "color",
    "typography",
    "ux",
    "charts",
    "icons",
    "google-fonts",
    "landing",
    "app-interface",
    "react-performance",
    "ui-reasoning",
  ]) {
    assert.equal(data.domains.includes(domain), true, domain);
  }
  assert.equal(data.stacks.includes("nextjs"), true);
  assert.equal(data.domains.some((domain) => domain.startsWith("slides:")), true);
  assert.equal(data.domains.some((domain) => domain.startsWith("collateral:")), true);
});

test("manifest records duplicate source divergence before import", async () => {
  const data = await loadDesignIntelligenceData();
  const appInterface = data.manifest.domains.find((domain) => domain.id === "app-interface");
  assert.ok(appInterface.duplicateSources.src);
  assert.ok(appInterface.duplicateSources.cliAssets);
  assert.notEqual(appInterface.duplicateSources.src, appInterface.duplicateSources.cliAssets);
  assert.equal(appInterface.canonicalSourceTree, "src/ui-ux-pro-max/data");
});

test("manifest row counts and checksums match imported design data", async () => {
  const data = await loadDesignIntelligenceData();
  const mismatches = [];

  for (const domain of data.manifest.domains) {
    const text = await readFile(domain.importedPath, "utf8");
    const rows = parseCsv(text).length;
    const sha256 = createHash("sha256").update(text).digest("hex");
    if (rows !== domain.rows || sha256 !== domain.sha256) {
      mismatches.push({
        id: domain.id,
        rows: { expected: domain.rows, actual: rows },
        sha256: { expected: domain.sha256, actual: sha256 },
      });
    }
  }

  assert.deepEqual(mismatches, []);
});

test("csv parser handles quoted commas and newlines", () => {
  const rows = parseCsv("id,name,notes\n1,\"A, B\",\"line one\nline two\"\n");
  assert.deepEqual(rows, [{ id: "1", name: "A, B", notes: "line one\nline two" }]);
});

test("search returns cited design rows for product, stack, and slide queries", async () => {
  const productRows = await searchDesignIntelligence({ query: "fintech dashboard trust analytics", domain: "product", maxResults: 3 });
  assert.ok(productRows.length > 0);
  assert.equal(productRows[0].domain, "product");
  assert.ok(productRows[0].id.includes("product:"));
  assert.ok(productRows[0].sourcePath);

  const stackRows = await searchDesignIntelligence({ query: "server component hydration accessibility", stack: "next.js", maxResults: 3 });
  assert.ok(stackRows.length > 0);
  assert.equal(stackRows.every((row) => row.kind === "stack" && row.stack === "nextjs"), true);

  const slideRows = await searchDesignIntelligence({ query: "investor deck narrative metrics chart", domain: "slides", maxResults: 3 });
  assert.ok(slideRows.length > 0);
  assert.equal(slideRows.every((row) => row.kind === "slides"), true);
});

test("composed recommendation validates against schema and preserves precedence", async () => {
  const resultSchema = JSON.parse(await readFile("schemas/design-intelligence-result.schema.json", "utf8"));
  const recommendationSchema = JSON.parse(await readFile("schemas/design-recommendation.schema.json", "utf8"));
  const ajv = new Ajv2020();
  ajv.addSchema(resultSchema);
  const validate = ajv.compile(recommendationSchema);

  const recommendation = await composeDesignRecommendation({
    query: "mobile analytics dashboard with charts and premium style",
    stack: "react",
  });
  assert.equal(validate(recommendation), true, JSON.stringify(validate.errors));
  assert.deepEqual(recommendation.precedence, [
    "approved design system",
    "project memory",
    "codebase patterns",
    "accessibility law",
    "external lookup",
  ]);
  assert.ok(recommendation.evidence.length > 0);
});

test("domain inference and evidence formatter are public helper APIs", async () => {
  const domains = inferDesignDomains("mobile investor deck with charts and logo");
  assert.ok(domains.includes("app-interface"));
  assert.ok(domains.includes("slides"));
  assert.ok(domains.includes("charts"));
  assert.ok(domains.includes("collateral"));

  const rows = await searchDesignIntelligence({ query: "mobile chart", maxResults: 1 });
  const formatted = formatDesignEvidence(rows);
  assert.match(formatted, /Design Intelligence Evidence:/);
  assert.match(formatted, /domain=/);
});
