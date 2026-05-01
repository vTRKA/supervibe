import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Re-implement extractor from post-tool-use-log.mjs for unit testing
// (the hook script reads stdin and exits; not directly importable as ESM module)
const SUBTOOL_PATTERNS = {
  memory: [
    /\bsupervibe:project-memory\b/i,
    /\bsearch-memory\.mjs\b/i,
    /\bmemory:preflight\b/i,
    /\.supervibe\/memory\/(decisions|patterns|incidents|learnings|solutions)\b/i,
  ],
  "code-search": [
    /\bsupervibe:code-search\b/i,
    /\bsearch-code\.mjs\b.*--query/i,
  ],
  "code-graph": [
    /\bsearch-code\.mjs\b.*--callers/i,
    /\bsearch-code\.mjs\b.*--callees/i,
    /\bsearch-code\.mjs\b.*--neighbors/i,
    /\bsearch-code\.mjs\b.*--top-symbols/i,
  ],
};

function extractSubtoolUsage(text) {
  if (!text) return { memory: 0, "code-search": 0, "code-graph": 0 };
  const counts = { memory: 0, "code-search": 0, "code-graph": 0 };
  for (const [tool, patterns] of Object.entries(SUBTOOL_PATTERNS)) {
    for (const pat of patterns) {
      const matches = text.match(new RegExp(pat.source, pat.flags + "g"));
      if (matches) counts[tool] += matches.length;
    }
  }
  return counts;
}

test("detects memory references", () => {
  const out = extractSubtoolUsage(
    'I called supervibe:project-memory --query "auth"',
  );
  assert.equal(out.memory, 1);
});

test("detects code-search references", () => {
  const out = extractSubtoolUsage(
    'Run scripts/search-code.mjs --query "payment idempotency"',
  );
  assert.equal(out["code-search"], 1);
});

test("detects code-graph callers", () => {
  const out = extractSubtoolUsage(
    'Verified blast: scripts/search-code.mjs --callers "processPayment"',
  );
  assert.equal(out["code-graph"], 1);
});

test("counts multiple invocations", () => {
  const out = extractSubtoolUsage(`
    Step 1: supervibe:project-memory --query "auth"
    Step 2: supervibe:code-search --query "JWT validation"
    Step 3: search-code.mjs --callers "validateJWT"
  `);
  assert.equal(out.memory, 1);
  assert.equal(out["code-search"], 1);
  assert.equal(out["code-graph"], 1);
});

test("detects memory file path references", () => {
  const out = extractSubtoolUsage(
    "Read .supervibe/memory/decisions/2026-04-foo.md",
  );
  assert.equal(out.memory, 1);
});

test("zero on agent that did not use any tool", () => {
  const out = extractSubtoolUsage(
    "I implemented the feature without searching anything.",
  );
  assert.equal(out.memory, 0);
  assert.equal(out["code-search"], 0);
  assert.equal(out["code-graph"], 0);
});

test("empty text returns all zeros", () => {
  const out = extractSubtoolUsage("");
  assert.deepEqual(out, { memory: 0, "code-search": 0, "code-graph": 0 });
});
