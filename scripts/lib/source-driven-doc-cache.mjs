const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CACHE_KIND = "source-driven-official-doc";

export function createOfficialDocCacheEntry({
  url,
  body,
  etag = null,
  lastModified = null,
  productVersion = null,
  validatorCommand = null,
  fetchedAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: 2,
    cacheKind: CACHE_KIND,
    url: String(url || ""),
    body: String(body || ""),
    etag: nullableString(etag),
    lastModified: nullableString(lastModified),
    productVersion: nullableString(productVersion),
    validatorCommand: nullableString(validatorCommand),
    fetchedAt,
  };
}

export function buildOfficialDocRevalidationHeaders(entry = {}) {
  const headers = {};
  if (entry.etag) headers["If-None-Match"] = entry.etag;
  if (entry.lastModified) headers["If-Modified-Since"] = entry.lastModified;
  return headers;
}

export function planOfficialDocCacheRead(entry = null, {
  now = new Date().toISOString(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  expectedProductVersion = null,
} = {}) {
  if (!entry) {
    return decision("miss", {
      canServeCached: false,
      requiresFetch: true,
      headers: {},
      debug: ["cache-entry-missing"],
    });
  }
  if (!entry.url) {
    return decision("stale-miss", {
      canServeCached: false,
      requiresFetch: true,
      headers: {},
      debug: ["missing-origin-url"],
    });
  }
  if (expectedProductVersion && entry.productVersion && entry.productVersion !== expectedProductVersion) {
    return decision("version-mismatch-miss", {
      canServeCached: false,
      requiresFetch: true,
      headers: {},
      debug: [
        `expected-version:${expectedProductVersion}`,
        `cached-version:${entry.productVersion}`,
      ],
    });
  }
  const headers = buildOfficialDocRevalidationHeaders(entry);
  if (Object.keys(headers).length === 0) {
    return decision("stale-miss", {
      canServeCached: false,
      requiresFetch: true,
      headers: {},
      debug: ["missing-validator-headers"],
    });
  }
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(entry.fetchedAt || 0));
  return decision(ageMs > maxAgeMs ? "stale-revalidate" : "freshness-revalidate", {
    canServeCached: false,
    requiresFetch: false,
    requiresOriginRequest: true,
    requiresRevalidation: true,
    headers,
    debug: [
      `age-ms:${Number.isFinite(ageMs) ? ageMs : "unknown"}`,
      "origin-revalidation-required",
      "cached-doc-not-final-proof",
    ],
  });
}

export function applyOfficialDocCacheResponse(entry = null, {
  status,
  headers = {},
  revalidationHeaders = null,
  url = "",
  body = "",
  productVersion = null,
  validatorCommand = null,
  now = new Date().toISOString(),
} = {}) {
  const normalizedHeaders = normalizeHeaders(headers);
  const normalizedRevalidationHeaders = revalidationHeaders ? normalizeHeaders(revalidationHeaders) : null;
  if (Number(status) === 304 && entry && (entry.etag || entry.lastModified)) {
    if (normalizedRevalidationHeaders && !hasRevalidationProof(entry, normalizedRevalidationHeaders)) {
      return decision("revalidation-proof-missing", {
        canServeCached: false,
        requiresFetch: true,
        entry: null,
        debug: ["origin-returned-304", "request-missing-validator-headers"],
      });
    }
    return decision("cache-hit", {
      canServeCached: true,
      requiresFetch: false,
      canUseAsFinalProof: true,
      proofStatus: "origin-revalidated",
      entry: { ...entry, fetchedAt: now, lastRevalidatedAt: now },
      body: entry.body,
      debug: ["origin-returned-304", "cached-doc-origin-revalidated"],
    });
  }
  if (Number(status) !== 200) {
    return decision("fetch-failed", {
      canServeCached: false,
      requiresFetch: true,
      entry: null,
      debug: [`status:${status || "unknown"}`, "origin-response-failed", "cached-doc-not-served"],
    });
  }
  const etag = normalizedHeaders.etag || null;
  const lastModified = normalizedHeaders["last-modified"] || null;
  if (!etag && !lastModified) {
    return decision("uncacheable-miss", {
      canServeCached: false,
      canUseAsFinalProof: true,
      proofStatus: "origin-fetched-uncacheable",
      requiresFetch: false,
      entry: null,
      body: String(body || ""),
      debug: ["response-missing-validator-headers"],
    });
  }
  return decision("refreshed", {
    canServeCached: true,
    requiresFetch: false,
    canUseAsFinalProof: true,
    proofStatus: "origin-fetched",
    entry: createOfficialDocCacheEntry({
      url: entry?.url || url,
      body,
      etag,
      lastModified,
      productVersion: productVersion || entry?.productVersion || null,
      validatorCommand: validatorCommand || entry?.validatorCommand || null,
      fetchedAt: now,
    }),
    body: String(body || ""),
    debug: ["origin-returned-200-with-validators"],
  });
}

function decision(status, extra = {}) {
  return {
    status,
    canServeCached: false,
    requiresFetch: false,
    requiresRevalidation: false,
    requiresOriginRequest: false,
    canUseAsFinalProof: false,
    proofStatus: "unproven",
    headers: {},
    debug: [],
    ...extra,
  };
}

function hasRevalidationProof(entry = {}, headers = {}) {
  return Boolean(
    (entry.etag && headers["if-none-match"] === entry.etag) ||
    (entry.lastModified && headers["if-modified-since"] === entry.lastModified),
  );
}

function normalizeHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    out[String(key).toLowerCase()] = String(value);
  }
  return out;
}

function nullableString(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}
