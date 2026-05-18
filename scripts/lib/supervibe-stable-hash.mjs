import { createHash } from "node:crypto";

export function stableHash(value, { algorithm = "sha256" } = {}) {
  return createHash(algorithm).update(stableStringify(value)).digest("hex");
}

function stableStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

export function stableNormalize(value) {
  if (Array.isArray(value)) return value.map((item) => stableNormalize(item));
  if (!value || typeof value !== "object") return normalizeScalar(value);
  if (value instanceof Date) return value.toISOString();
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => typeof nested !== "function" && typeof nested !== "symbol" && nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableNormalize(nested)]),
  );
}

function normalizeScalar(value) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}
