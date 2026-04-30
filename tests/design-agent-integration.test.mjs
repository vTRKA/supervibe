import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("design intelligence skill defines support-only evidence contract", async () => {
  const body = await readFile("skills/design-intelligence/SKILL.md", "utf8");
  assert.match(body, /Internal lookup and synthesis support/);
  assert.match(body, /Design Intelligence Evidence/);
  assert.match(body, /approved design system/i);
  assert.match(body, /Never add a new slash command/);
});

test("design-facing agents include design intelligence and evidence contract", async () => {
  const files = (await readdir("agents/_design")).filter((file) => file.endsWith(".md"));
  for (const file of files) {
    const body = await readFile(join("agents/_design", file), "utf8");
    assert.match(body, /supervibe:design-intelligence/, file);
    assert.match(body, /Design Intelligence Evidence/, file);
    assert.match(body, /approved design system > project memory > codebase patterns > accessibility law > external lookup/, file);
  }
});

test("existing design commands expose internal lookup without a new workflow surface", async () => {
  for (const file of ["supervibe-design.md", "supervibe-audit.md", "supervibe-strengthen.md", "supervibe.md"]) {
    const body = await readFile(join("commands", file), "utf8");
    assert.match(body, /design intelligence/i, file);
  }
  const router = await readFile("commands/supervibe.md", "utf8");
  assert.match(router, /internal design intelligence lookup never appears as its own slash command/i);
});
