import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildGenesisAgentRecommendation,
  discoverGenesisStackFingerprint,
} from "../scripts/lib/supervibe-agent-recommendation.mjs";
import { resolveCommandRequest } from "../scripts/lib/supervibe-command-catalog.mjs";

const ROOT = process.cwd();

async function withTempProject(fn) {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-stack-scenario-"));
  try {
    await writeFile(join(rootDir, "AGENTS.md"), "# Project instructions\n", "utf8");
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("stack scenario fixtures cover every documented stack with specialist agents", async () => {
  const fixture = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "stack-scenarios", "all-stacks.json"), "utf8"));
  assert.ok(fixture.scenarios.length >= 25);

  for (const scenario of fixture.scenarios) {
    await withTempProject(async (rootDir) => {
      const fingerprint = discoverGenesisStackFingerprint({
        rootDir,
        stackText: scenario.stackText,
      });
      const recommendation = buildGenesisAgentRecommendation({
        rootDir: ROOT,
        fingerprint,
        selectedProfile: "minimal",
        addOns: [],
      });

      for (const tag of scenario.expectedTags) {
        assert.ok(fingerprint.tags.includes(tag), `${scenario.id}: missing tag ${tag}`);
      }
      for (const agent of scenario.expectedAgents) {
        assert.ok(recommendation.selectedAgents.includes(agent), `${scenario.id}: missing agent ${agent}`);
      }
      assert.deepEqual(recommendation.missingSpecialists, [], `${scenario.id}: missing specialists`);
    });
  }
});

test("Russian regression corpus routes common operational prompts to commands", async () => {
  const fixture = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "agent-workflow-evals", "russian-regression-corpus.json"), "utf8"));
  assert.ok(fixture.cases.length >= 8);

  for (const entry of fixture.cases) {
    const match = resolveCommandRequest(entry.request, { pluginRoot: ROOT, projectRoot: ROOT });
    assert.ok(match, `${entry.id}: expected command match`);
    assert.equal(match.command, entry.expectedCommand, `${entry.id}: wrong command`);
  }
});
