const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function createOfficialDocCacheEntry({
  url,
  body,
  etag = null,
  lastModified = null,
  fetchedAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: 1,
    url: String(url || ""),
    body: String(body || ""),
    etag: etag || null,
    lastModified: lastModified || null,
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
} = {}) {
  if (!entry) {
    return decision("miss", {
      canServeCached: false,
      requiresFetch: true,
      headers: {},
      debug: ["cache-entry-missing"],
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
    requiresRevalidation: true,
    headers,
    debug: [`age-ms:${Number.isFinite(ageMs) ? ageMs : "unknown"}`, "origin-revalidation-required"],
  });
}

export function applyOfficialDocCacheResponse(entry = null, {
  status,
  headers = {},
  body = "",
  now = new Date().toISOString(),
} = {}) {
  const normalizedHeaders = normalizeHeaders(headers);
  if (Number(status) === 304 && entry && (entry.etag || entry.lastModified)) {
    return decision("cache-hit", {
      canServeCached: true,
      requiresFetch: false,
      entry: { ...entry, fetchedAt: now },
      body: entry.body,
      debug: ["origin-returned-304"],
    });
  }
  if (Number(status) !== 200) {
    return decision("fetch-failed", {
      canServeCached: false,
      requiresFetch: true,
      entry: null,
      debug: [`status:${status || "unknown"}`],
    });
  }
  const etag = normalizedHeaders.etag || null;
  const lastModified = normalizedHeaders["last-modified"] || null;
  if (!etag && !lastModified) {
    return decision("uncacheable-miss", {
      canServeCached: false,
      requiresFetch: false,
      entry: null,
      body: String(body || ""),
      debug: ["response-missing-validator-headers"],
    });
  }
  return decision("refreshed", {
    canServeCached: true,
    requiresFetch: false,
    entry: createOfficialDocCacheEntry({
      url: entry?.url || "",
      body,
      etag,
      lastModified,
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
    headers: {},
    debug: [],
    ...extra,
  };
}

function normalizeHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    out[String(key).toLowerCase()] = String(value);
  }
  return out;
}
