import assert from "node:assert/strict";
import test from "node:test";
import { designContextPreflight, scanCodebaseForDesignContext } from "../scripts/lib/design-context-preflight.mjs";

test("design context preflight combines memory, code, lookup, conflicts, and next queries", async () => {
  const result = await designContextPreflight({
    query: "design a mobile chart dashboard with approved design system",
    limit: 3,
    domains: ["app-interface", "charts", "style"],
  });

  assert.equal(result.query.includes("mobile chart"), true);
  assert.equal(Array.isArray(result.memory), true);
  assert.equal(Array.isArray(result.code), true);
  assert.equal(Array.isArray(result.designLookup), true);
  assert.equal(Array.isArray(result.conflicts), true);
  assert.equal(Array.isArray(result.missingSources), true);
  assert.equal(Array.isArray(result.recommendedNextQueries), true);
  assert.ok(result.designLookup.length > 0);
});

test("code scan returns design context without reading generated data directories", async () => {
  const matches = await scanCodebaseForDesignContext({
    query: "design system tokens prototype",
    limit: 5,
  });
  assert.ok(matches.length > 0);
  assert.equal(matches.some((match) => match.path.includes("skills/design-intelligence/data")), false);
});
