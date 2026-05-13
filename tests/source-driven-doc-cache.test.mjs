import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOfficialDocCacheResponse,
  buildOfficialDocRevalidationHeaders,
  createOfficialDocCacheEntry,
  planOfficialDocCacheRead,
} from "../scripts/lib/source-driven-doc-cache.mjs";

test("official doc cache uses validators and never serves without revalidation", () => {
  const entry = createOfficialDocCacheEntry({
    url: "https://docs.example.test/sdk",
    body: "cached",
    etag: "\"v1\"",
    lastModified: "Wed, 13 May 2026 00:00:00 GMT",
    fetchedAt: "2026-05-13T00:00:00.000Z",
  });

  assert.deepEqual(buildOfficialDocRevalidationHeaders(entry), {
    "If-None-Match": "\"v1\"",
    "If-Modified-Since": "Wed, 13 May 2026 00:00:00 GMT",
  });

  const plan = planOfficialDocCacheRead(entry, { now: "2026-05-13T00:10:00.000Z" });
  assert.equal(plan.status, "freshness-revalidate");
  assert.equal(plan.canServeCached, false);
  assert.equal(plan.requiresRevalidation, true);
  assert.match(plan.debug.join(","), /origin-revalidation-required/);
});

test("official doc cache hit requires origin 304", () => {
  const entry = createOfficialDocCacheEntry({
    url: "https://docs.example.test/sdk",
    body: "cached",
    etag: "\"v1\"",
    fetchedAt: "2026-05-13T00:00:00.000Z",
  });

  const result = applyOfficialDocCacheResponse(entry, {
    status: 304,
    now: "2026-05-13T00:15:00.000Z",
  });

  assert.equal(result.status, "cache-hit");
  assert.equal(result.canServeCached, true);
  assert.equal(result.body, "cached");
  assert.equal(result.entry.fetchedAt, "2026-05-13T00:15:00.000Z");
});

test("official doc cache refuses missing validator headers", () => {
  const entry = createOfficialDocCacheEntry({
    url: "https://docs.example.test/sdk",
    body: "cached",
    fetchedAt: "2026-05-13T00:00:00.000Z",
  });

  const plan = planOfficialDocCacheRead(entry);
  assert.equal(plan.status, "stale-miss");
  assert.equal(plan.requiresFetch, true);
  assert.match(plan.debug.join(","), /missing-validator-headers/);

  const response = applyOfficialDocCacheResponse(entry, {
    status: 200,
    headers: {},
    body: "fresh",
  });
  assert.equal(response.status, "uncacheable-miss");
  assert.equal(response.canServeCached, false);
  assert.match(response.debug.join(","), /response-missing-validator-headers/);
});
