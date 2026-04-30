import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import matter from "gray-matter";

test("all agents keep RAG, code graph, and memory pre-flight discipline", async () => {
  const files = await listAgentFiles("agents");
  assert.equal(files.length, 83);

  const missing = [];
  for (const file of files) {
    const body = await readFile(file, "utf8");
    const parsed = matter(body);
    if (Number(parsed.data["persona-years"] || 0) < 15) missing.push(`${file}: persona-years below 15`);
    if (!Array.isArray(parsed.data["anti-patterns"]) || parsed.data["anti-patterns"].length === 0) missing.push(`${file}: missing anti-patterns`);
    if (!Array.isArray(parsed.data.verification) || parsed.data.verification.length === 0) missing.push(`${file}: missing verification checks`);
    if (!body.includes("supervibe:project-memory")) missing.push(`${file}: missing project memory skill`);
    if (!body.includes("supervibe:code-search")) missing.push(`${file}: missing code search skill`);
    if (!/RAG \+ Memory pre-flight/i.test(body)) missing.push(`${file}: missing RAG pre-flight section`);
    if (!/code graph|--callers|callers|callee|callees/i.test(body)) missing.push(`${file}: missing code graph/blast-radius instruction`);
  }

  assert.deepEqual(missing, []);
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
