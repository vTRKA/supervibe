import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import matter from "gray-matter";

test("all agents carry the 2026 modern expert standard", async () => {
  const files = await listAgentFiles("agents");
  assert.equal(files.length, 89);

  const missing = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const parsed = matter(raw);
    const body = parsed.content;

    if (Number(parsed.data["persona-years"] || 0) < 15) missing.push(`${file}: persona-years below 15`);
    if (!body.includes("## 2026 Expert Standard")) missing.push(`${file}: missing 2026 Expert Standard section`);
    if (!body.includes("docs/references/agent-modern-expert-standard.md")) missing.push(`${file}: missing shared standard reference`);
    if (!/official docs, primary standards, and source repositories/i.test(body)) missing.push(`${file}: missing source-of-truth discipline`);
    if (!/NIST SSDF\/AI RMF, OWASP LLM\/Agentic\/Skills, SLSA, OpenTelemetry semantic\s+conventions, and WCAG 2\.2/i.test(body)) {
      missing.push(`${file}: missing 2026 standards stack`);
    }
    if (!/## Verification/i.test(body)) missing.push(`${file}: missing Verification section`);
  }

  assert.deepEqual(missing, []);
});

test("agent excellence baseline cites current primary standards", async () => {
  const rule = await readFile("rules/agent-excellence-baseline.md", "utf8");
  const reference = await readFile("docs/references/agent-modern-expert-standard.md", "utf8");
  const combined = `${rule}\n${reference}`;

  for (const phrase of [
    "NIST SSDF",
    "NIST AI RMF",
    "OWASP Top 10 for Agentic Applications 2026",
    "OWASP Agentic Skills Top 10",
    "SLSA",
    "OpenTelemetry semantic conventions",
    "WCAG 2.2",
  ]) {
    assert.match(combined, new RegExp(escapeRegExp(phrase), "i"), phrase);
  }
});

async function listAgentFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listAgentFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
  return files.sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
