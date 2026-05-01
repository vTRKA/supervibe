import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("genesis separates application build failures from index verification", async () => {
  const command = await readFile("commands/supervibe-genesis.md", "utf8");
  const skill = await readFile("skills/genesis/SKILL.md", "utf8");

  for (const [name, text] of [["command", command], ["skill", skill]]) {
    assert.match(text, /Keep app(?:lication)? builds separate/i, `${name} must separate app builds from genesis verification`);
    assert.match(text, /Project verification failed after genesis/, `${name} must name the separate failure section`);
    assert.match(text, /repo-relative error paths? only/, `${name} must require relative error paths`);
    assert.match(text, /pre-genesis baseline/, `${name} must require baseline evidence before saying unrelated`);
  }
});

test("verification failure summaries avoid leaking local project identity", async () => {
  const text = await readFile("skills/verification/SKILL.md", "utf8");

  assert.match(text, /Failure Reporting Discipline/);
  assert.match(text, /Do not include absolute local paths/);
  assert.match(text, /project names/);
  assert.match(text, /commits, changelogs, memories, or release notes/);
  assert.match(text, /pre-change baseline/);
});
