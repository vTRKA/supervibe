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
    productVersion: "sdk@1.2.3",
    validatorCommand: "node scripts/source-doc-fetch.mjs --url https://docs.example.test/sdk",
    fetchedAt: "2026-05-13T00:00:00.000Z",
  });

  assert.equal(entry.schemaVersion, 2);
  assert.equal(entry.cacheKind, "source-driven-official-doc");
  assert.equal(entry.productVersion, "sdk@1.2.3");
  assert.equal(entry.validatorCommand, "node scripts/source-doc-fetch.mjs --url https://docs.example.test/sdk");
  assert.deepEqual(buildOfficialDocRevalidationHeaders(entry), {
    "If-None-Match": "\"v1\"",
    "If-Modified-Since": "Wed, 13 May 2026 00:00:00 GMT",
  });

  const plan = planOfficialDocCacheRead(entry, { now: "2026-05-13T00:10:00.000Z" });
  assert.equal(plan.status, "freshness-revalidate");
  assert.equal(plan.canServeCached, false);
  assert.equal(plan.canUseAsFinalProof, false);
  assert.equal(plan.requiresOriginRequest, true);
  assert.equal(plan.requiresRevalidation, true);
  assert.match(plan.debug.join(","), /origin-revalidation-required/);
  assert.match(plan.debug.join(","), /cached-doc-not-final-proof/);
});

test("official doc cache hit requires origin 304", () => {
  const entry = createOfficialDocCacheEntry({
    url: "https://docs.example.test/sdk",
    body: "cached",
    etag: "\"v1\"",
    fetchedAt: "2026-05-13T00:00:00.000Z",
  });
  const plan = planOfficialDocCacheRead(entry, { now: "2026-05-13T00:05:00.000Z" });

  const result = applyOfficialDocCacheResponse(entry, {
    status: 304,
    revalidationHeaders: plan.headers,
    now: "2026-05-13T00:15:00.000Z",
  });

  assert.equal(result.status, "cache-hit");
  assert.equal(result.canServeCached, true);
  assert.equal(result.canUseAsFinalProof, true);
  assert.equal(result.proofStatus, "origin-revalidated");
  assert.equal(result.body, "cached");
  assert.equal(result.entry.fetchedAt, "2026-05-13T00:15:00.000Z");
  assert.equal(result.entry.lastRevalidatedAt, "2026-05-13T00:15:00.000Z");
  assert.match(result.debug.join(","), /cached-doc-origin-revalidated/);
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

test("official doc cache treats stale entries as revalidation only", () => {
  const entry = createOfficialDocCacheEntry({
    url: "https://docs.example.test/sdk",
    body: "cached",
    etag: "\"v1\"",
    fetchedAt: "2026-05-12T00:00:00.000Z",
  });

  const plan = planOfficialDocCacheRead(entry, {
    now: "2026-05-13T00:00:00.000Z",
    maxAgeMs: 1,
  });

  assert.equal(plan.status, "stale-revalidate");
  assert.equal(plan.canServeCached, false);
  assert.equal(plan.canUseAsFinalProof, false);
  assert.equal(plan.requiresRevalidation, true);
  assert.match(plan.debug.join(","), /cached-doc-not-final-proof/);
});

test("official doc cache never falls back to cache after origin failure", () => {
  const entry = createOfficialDocCacheEntry({
    url: "https://docs.example.test/sdk",
    body: "cached",
    etag: "\"v1\"",
    fetchedAt: "2026-05-13T00:00:00.000Z",
  });

  const result = applyOfficialDocCacheResponse(entry, {
    status: 503,
  });

  assert.equal(result.status, "fetch-failed");
  assert.equal(result.canServeCached, false);
  assert.equal(result.canUseAsFinalProof, false);
  assert.equal(result.requiresFetch, true);
  assert.equal(result.entry, null);
  assert.equal(result.body, undefined);
  assert.match(result.debug.join(","), /origin-response-failed/);
  assert.match(result.debug.join(","), /cached-doc-not-served/);
});

test("official doc cache rejects 304 without matching revalidation proof", () => {
  const entry = createOfficialDocCacheEntry({
    url: "https://docs.example.test/sdk",
    body: "cached",
    etag: "\"v1\"",
    fetchedAt: "2026-05-13T00:00:00.000Z",
  });

  const result = applyOfficialDocCacheResponse(entry, {
    status: 304,
    revalidationHeaders: { "If-None-Match": "\"other\"" },
  });

  assert.equal(result.status, "revalidation-proof-missing");
  assert.equal(result.canServeCached, false);
  assert.equal(result.requiresFetch, true);
  assert.match(result.debug.join(","), /request-missing-validator-headers/);
});
