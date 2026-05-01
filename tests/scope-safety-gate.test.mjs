import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import matter from "gray-matter";

test("scope safety standard is a mandatory rule with current references", async () => {
  const standard = await readFile("docs/references/scope-safety-standard.md", "utf8");
  for (const phrase of [
    "Scope Safety Gate",
    "Outcome fit",
    "Cost of complexity",
    "How To Explain A No",
    "10/10 Scope Safety",
    "scrumguides.org",
    "atlassian.com/work-management/project-management/scope-creep",
  ]) {
    assert.match(standard, new RegExp(escapeRegExp(phrase), "i"));
  }

  const parsed = matter(await readFile("rules/scope-safety.md", "utf8"));
  assert.equal(parsed.data.mandatory, true);
  assert.equal(new Date(parsed.data["last-verified"]).toISOString().slice(0, 10), "2026-05-01");
  assert.match(parsed.content, /include \| defer \| reject \| spike \| ask-one-question/i);
});

test("all agents carry scope safety instructions", async () => {
  const files = await listMarkdown("agents");
  assert.equal(files.length, 89);

  const missing = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (!text.includes("## Scope Safety")) missing.push(`${file}: missing Scope Safety section`);
    if (!text.includes("docs/references/scope-safety-standard.md")) missing.push(`${file}: missing standard reference`);
    if (!/defer or reject extras/i.test(text)) missing.push(`${file}: missing defer/reject instruction`);
    if (!/concrete harm/i.test(text)) missing.push(`${file}: missing why-not explanation discipline`);
  }

  assert.deepEqual(missing, []);
});

test("workflow templates and skills require scope safety gates", async () => {
  const paths = [
    "docs/templates/intake-template.md",
    "docs/templates/brainstorm-output-template.md",
    "docs/templates/plan-template.md",
    "docs/templates/PRD-template.md",
    "skills/requirements-intake/SKILL.md",
    "skills/brainstorming/SKILL.md",
    "skills/writing-plans/SKILL.md",
    "skills/executing-plans/SKILL.md",
    "skills/subagent-driven-development/SKILL.md",
    "skills/autonomous-agent-loop/SKILL.md",
    "commands/supervibe-brainstorm.md",
    "commands/supervibe-plan.md",
    "commands/supervibe-loop.md",
  ];

  const missing = [];
  for (const path of paths) {
    const text = await readFile(path, "utf8");
    if (!text.includes("Scope Safety Gate")) missing.push(`${path}: missing Scope Safety Gate`);
    if (!/(include|defer|reject|spike)/i.test(text)) missing.push(`${path}: missing scope decision vocabulary`);
    if (!/(tradeoff|complexity cost|concrete harm|scope expansion)/i.test(text)) missing.push(`${path}: missing cost/tradeoff discipline`);
  }

  assert.deepEqual(missing, []);
});

test("validators require scope safety in specs and plans", async () => {
  const specValidator = await readFile("scripts/validate-spec-artifacts.mjs", "utf8");
  const planValidator = await readFile("scripts/validate-plan-artifacts.mjs", "utf8");

  assert.match(specValidator, /Scope Safety Gate/);
  assert.match(specValidator, /expected include\/defer\/reject\/spike decision/);
  assert.match(specValidator, /expected complexity cost or harm/);
  assert.match(planValidator, /Scope Safety Gate/);
  assert.match(planValidator, /scope safety gate: missing/);
});

async function listMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listMarkdown(path));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(path);
  }
  return out.sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
