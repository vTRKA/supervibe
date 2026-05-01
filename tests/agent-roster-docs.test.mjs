import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatAgentRoleSummaries,
  formatAgentRosterMarkdown,
  loadAgentRoster,
  pickAgentRoleSummaries,
} from "../scripts/lib/supervibe-agent-roster.mjs";

test("agent roster exposes every installed agent with a responsibility", async () => {
  const roster = await loadAgentRoster({ rootDir: process.cwd() });

  assert.equal(roster.count, 89);
  assert.ok(roster.categories.includes("Core workflow"));
  assert.ok(roster.categories.includes("Stack: react"));

  for (const agent of roster.agents) {
    assert.ok(agent.id, `missing agent id for ${agent.path}`);
    assert.ok(agent.responsibility.length >= 20, `missing responsibility for ${agent.id}`);
    assert.ok(!/Triggers?:/i.test(agent.responsibility), `responsibility leaked trigger text for ${agent.id}`);
  }

  const summaries = pickAgentRoleSummaries(["repo-researcher", "code-reviewer"], roster);
  assert.match(summaries[0].responsibility, /READ-ONLY|map existing structure|code/i);
  assert.match(formatAgentRoleSummaries(["repo-researcher", "code-reviewer"], roster), /repo-researcher:/);
});

test("agent roster markdown stays in sync with the generated docs page", async () => {
  const roster = await loadAgentRoster({ rootDir: process.cwd() });
  const generated = formatAgentRosterMarkdown(roster);
  const committed = await readFile("docs/agent-roster.md", "utf8");

  assert.equal(committed, generated);
  assert.match(committed, /Total agents: 89/);
  assert.match(committed, /`repo-researcher`/);
  assert.match(committed, /`react-implementer`/);
});
