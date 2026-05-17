import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("qa-test-engineer requires scenario-rich test design", async () => {
  const body = await readFile("agents/_product/qa-test-engineer.md", "utf8");
  const normalized = body.toLowerCase();

  for (const phrase of [
    "## scenario matrix contract",
    "happy path",
    "negative path",
    "boundary/null",
    "concurrency/idempotency",
    "degraded dependency",
    "mutation question",
    "happy-path-only",
    "shallow-assertions",
  ]) {
    assert.ok(normalized.includes(phrase), phrase);
  }
});

test("tdd skill requires scenario matrix before red evidence", async () => {
  const body = await readFile("skills/tdd/SKILL.md", "utf8");
  const normalized = body.toLowerCase();

  for (const phrase of [
    "## scenario matrix before red",
    "negative",
    "boundary/null",
    "concurrency/degraded",
    "explicit n/a rationale",
    "mutation question answered",
  ]) {
    assert.ok(normalized.includes(phrase), phrase);
  }
});
