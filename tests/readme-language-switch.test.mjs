import { test } from "node:test";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const EN = join(ROOT, "README.md");

test("README.md exists with compliance notice", () => {
  assert.ok(existsSync(EN), "README.md missing");
  const content = readFileSync(EN, "utf8");
  assert.ok(
    content.includes("Compliance notice"),
    "README.md must include compliance notice",
  );
  assert.ok(
    content.includes("Anthropic"),
    "README.md must reference Anthropic ToS",
  );
});

test("README.md has no Russian language link", () => {
  const content = readFileSync(EN, "utf8");
  assert.ok(
    !content.includes("README.ru"),
    "README.md must not reference Russian translation",
  );
});

test("README.md references the current plugin version", () => {
  const pj = JSON.parse(
    readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"),
  );
  const v = pj.version;
  assert.match(
    readFileSync(EN, "utf8"),
    new RegExp(`v?${v.replace(/\./g, "\\.")}`),
  );
});

test("English README has no AI-marketing filler words", () => {
  const src = readFileSync(EN, "utf8");
  // Words that signal marketing or filler — flag if present in EN README.
  // Allow technical "AI CLI" since the plugin must name what it integrates with;
  // disallow generic boosting adjectives.
  const banned = [
    /\bAI-powered\b/i,
    /\bAI-driven\b/i,
    /\bblazing[-\s]fast\b/i,
    /\bworld-class\b/i,
    /\bcutting[-\s]edge\b/i,
    /\bnext[-\s]gen\b/i,
    /\bsupercharge\b/i,
    /\bseamless\b/i,
    /\bgame[-\s]chang/i,
    /\brevolutionary\b/i,
  ];
  const hits = banned.filter((re) => re.test(src));
  assert.deepStrictEqual(
    hits.map((r) => r.source),
    [],
    `README contains marketing filler: ${hits.map((r) => r.source).join(", ")}`,
  );
});

test("README.md cites a plausible test count", () => {
  const findCount = (text) => {
    const m = text.match(/(\d{2,4})\s*(?:test)/i);
    return m ? parseInt(m[1], 10) : null;
  };
  const en = findCount(readFileSync(EN, "utf8"));
  assert.ok(
    en !== null && en > 100,
    `EN README must cite a test count > 100, got ${en}`,
  );
});
