import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCapabilityRegistry,
  formatCapabilityRegistryReport,
  validateCapabilityRegistry,
} from "../scripts/lib/supervibe-capability-registry.mjs";
import { routeTriggerRequest } from "../scripts/lib/supervibe-trigger-router.mjs";

test("capability registry links commands, skills, rules, agents, and verification hooks", () => {
  const registry = buildCapabilityRegistry({ rootDir: process.cwd() });
  const validation = validateCapabilityRegistry(registry);

  assert.equal(validation.pass, true, formatCapabilityRegistryReport(registry, validation));

  const genesis = registry.capabilities.find((entry) => entry.id === "setup.genesis");
  assert.ok(genesis, "setup.genesis capability missing");
  assert.ok(genesis.commands.includes("/supervibe-genesis"));
  assert.ok(genesis.skills.includes("supervibe:genesis"));
  assert.ok(genesis.rules.includes("operational-safety"));
  assert.ok(genesis.verificationHooks.some((hook) => hook.includes("capability-registry.test.mjs")));
});

test("capability registry catches missing verification hooks and broken links", () => {
  const registry = buildCapabilityRegistry({ rootDir: process.cwd() });
  const broken = {
    ...registry,
    capabilities: [
      ...registry.capabilities,
      {
        id: "broken.synthetic",
        commands: ["/missing-command"],
        skills: ["supervibe:missing-skill"],
        agents: ["missing-agent"],
        rules: ["missing-rule"],
        verificationHooks: [],
      },
    ],
  };

  const validation = validateCapabilityRegistry(broken);
  const messages = validation.issues.map((issue) => issue.message).join("\n");

  assert.equal(validation.pass, false);
  assert.match(messages, /capability references no verification hook/);
  assert.match(messages, /command file missing/);
  assert.match(messages, /agent file missing/);
  assert.match(messages, /skill file missing/);
  assert.match(messages, /rule file missing/);
});

test("intent router exposes capability metadata for routed commands", () => {
  const route = routeTriggerRequest("/supervibe-genesis --host codex");

  assert.equal(route.intent, "slash_command");
  assert.equal(route.agentContract.ownerAgentId, "supervibe-orchestrator");
  assert.equal(route.capabilityId, "setup.genesis");
  assert.ok(route.verificationHooks.some((hook) => hook.includes("capability-registry.test.mjs")));
});
