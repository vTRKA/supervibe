import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildPreflight,
  classifyPreflight,
  createPreflightQuestionCards,
  createPreflightQuestions,
} from "../scripts/lib/autonomous-loop-preflight-intake.mjs";
import { validateAgenticQuestion } from "../scripts/lib/supervibe-dialogue-contract.mjs";

function createCodexProviderHome(maxThreads) {
  const providerHome = mkdtempSync(join(tmpdir(), "supervibe-codex-home-"));
  mkdirSync(providerHome, { recursive: true });
  writeFileSync(join(providerHome, "config.toml"), [
    "[agents]",
    `max_threads = ${maxThreads}`,
    "max_depth = 1",
    "job_max_runtime_seconds = 1800",
    "",
  ].join("\n"), "utf8");
  return providerHome;
}

test("server deploy request requires full preflight and safe access references", () => {
  assert.equal(classifyPreflight({ request: "deploy to production server" }), "full");
  const preflight = buildPreflight({ request: "deploy to production server" });
  assert.equal(preflight.environment_target, "production");
  assert.ok(preflight.missing_data.includes("server access reference"));
  assert.equal(preflight.secret_handling_policy, "references-only-no-raw-secret-logging");
  assert.equal(preflight.async_gates_supported, true);
  assert.equal(preflight.contract_policy.block_readiness_below, 9);
  assert.equal(preflight.execution_policy.mode, "guided");
  assert.equal(preflight.execution_policy.default_spawns_external_tools, false);
  assert.equal(preflight.execution_policy.provider.context_forking, "deterministic-test-packet");
  assert.equal(preflight.execution_policy.provider.permission_prompt_bridge_required, false);
  assert.equal(preflight.execution_policy.provider.spawn_receipt_required, false);
  assert.ok(preflight.tool_adapter_summary.available.includes("generic-shell-stub"));
  assert.equal(preflight.approval_lease.environment, "production");
  assert.equal(preflight.run_until, "goal-complete");
  assert.equal(preflight.max_loops, null);
  assert.equal(preflight.max_runtime_minutes, null);
  assert.equal(preflight.approval_lease.duration, "until-goal-complete");
  assert.ok(createPreflightQuestions(preflight).some((question) => question.includes("SSH host alias")));
  const cards = createPreflightQuestionCards(preflight);
  const serverAccess = cards.find((question) => question.id === "server-access-reference");
  assert.ok(serverAccess);
  assert.match(serverAccess.prompt, /production run/);
  assert.deepEqual(validateAgenticQuestion(serverAccess, { surface: "server access preflight", minChoices: 4 }), []);
});

test("preflight keeps dry-run explicit and defaults configured providers to real execution", () => {
  const dryRun = buildPreflight({ request: "validate integrations", options: { dryRun: true } });
  assert.equal(dryRun.execution_policy.mode, "dry-run");

  const codexProjectRoot = mkdtempSync(join(tmpdir(), "supervibe-preflight-codex-"));
  const codex = buildPreflight({
    request: "finish epic",
    options: {
      projectRoot: codexProjectRoot,
      tool: "codex",
      availableCommands: { codex: true },
      allowSpawn: true,
      permissionPromptBridge: true,
      providerHome: "missing-codex-provider-home",
    },
  });
  assert.equal(codex.execution_policy.mode, "fresh-context");
  assert.equal(codex.execution_policy.provider.selected_tool, "codex");
  assert.equal(codex.max_concurrent_agents, 8);
  assert.equal(codex.provider_limit_policy.providerMaxThreads, 8);
  assert.equal(codex.provider_limit_policy.effectiveMaxConcurrentAgents, 8);
  assert.equal(codex.approval_lease.budget.max_concurrent_agents, 8);
  assert.equal(codex.execution_policy.provider.provider_limits.providerMaxThreads, 8);
  assert.equal(codex.provider_permission_audit.pass, true);
});

test("preflight caps requested concurrency to provider max threads", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "supervibe-preflight-cap-"));
  const preflight = buildPreflight({
    request: "finish epic",
    options: {
      projectRoot,
      tool: "codex",
      availableCommands: { codex: true },
      maxConcurrentAgents: 10,
      allowSpawn: true,
      permissionPromptBridge: true,
      providerHome: "missing-codex-provider-home",
    },
  });

  assert.equal(preflight.max_concurrent_agents, 8);
  assert.equal(preflight.provider_limit_policy.requestedMaxConcurrentAgents, 10);
  assert.equal(preflight.provider_limit_policy.effectiveMaxConcurrentAgents, 8);
  assert.equal(preflight.provider_limit_policy.capped, true);
});

test("preflight uses Codex runtime max_threads and keeps non-Codex providers on fallback", () => {
  const providerHome = createCodexProviderHome(12);
  const codexProjectRoot = mkdtempSync(join(tmpdir(), "supervibe-preflight-runtime-"));
  const codex = buildPreflight({
    request: "finish epic",
    options: {
      projectRoot: codexProjectRoot,
      tool: "codex",
      availableCommands: { codex: true },
      allowSpawn: true,
      permissionPromptBridge: true,
      providerHome,
    },
  });

  assert.equal(codex.max_concurrent_agents, 12);
  assert.equal(codex.provider_limit_policy.providerMaxThreads, 12);
  assert.equal(codex.provider_limit_policy.runtimeMaxThreads, 12);
  assert.equal(codex.provider_limit_policy.providerMaxThreadsSource, "provider-runtime-config");
  assert.equal(codex.provider_limit_policy.source, "provider-runtime-config");

  const opencodeProjectRoot = mkdtempSync(join(tmpdir(), "supervibe-preflight-opencode-"));
  const opencode = buildPreflight({
    request: "finish epic",
    options: {
      projectRoot: opencodeProjectRoot,
      tool: "opencode",
    },
  });
  assert.equal(opencode.max_concurrent_agents, 12);
  assert.equal(opencode.provider_limit_policy.providerMaxThreads, null);
  assert.equal(opencode.provider_limit_policy.effectiveMaxConcurrentAgents, 12);
});

test("preflight blocks fresh-context execution when provider adapter is unavailable", () => {
  const preflight = buildPreflight({
    request: "finish epic",
    options: {
      tool: "codex",
      availableCommands: {},
      allowSpawn: true,
      permissionPromptBridge: true,
    },
  });

  assert.equal(preflight.execution_policy.mode, "fresh-context");
  assert.equal(preflight.execution_policy.provider.selected_tool, "codex");
  assert.equal(preflight.execution_policy.provider.selected_adapter, "codex");
  assert.ok(preflight.missing_data.includes("codex provider adapter unavailable"));
  assert.ok(preflight.blocked_actions.includes("provider adapter unavailable"));
  assert.equal(preflight.confidence_score, 6);
});

test("explicit loop budgets remain opt-in stop gates", () => {
  const preflight = buildPreflight({
    request: "finish epic",
    options: {
      maxLoops: 3,
      maxRuntimeMinutes: 15,
    },
  });

  assert.equal(preflight.run_until, "goal-complete-or-explicit-budget");
  assert.equal(preflight.budget_policy.defaultTimebox, false);
  assert.equal(preflight.max_loops, 3);
  assert.equal(preflight.max_runtime_minutes, 15);
  assert.equal(preflight.approval_lease.expires_after_loops, 3);
});

test("preflight degrades unsupported fresh-context providers before execution", () => {
  const preflight = buildPreflight({
    request: "finish epic",
    tasks: [{
      id: "t1",
      goal: "Implement feature",
      category: "implementation",
      acceptanceCriteria: ["done"],
      verificationCommands: ["npm test"],
      stopConditions: ["policy_stop"],
    }],
    options: {
      executionMode: "fresh-context",
      tool: "cursor",
    },
  });

  assert.equal(preflight.provider_capabilities.freshContextAdapter, false);
  assert.equal(preflight.provider_capabilities.recommendedMode, "guided");
  assert.equal(preflight.execution_policy.provider.context_forking, "manual-guided-only");
  assert.equal(preflight.execution_policy.provider.permission_prompt_bridge_required, false);
  assert.ok(preflight.missing_data.includes("cursor fresh-context adapter"));
  assert.ok(preflight.blocked_actions.includes("fresh-context execution"));
  assert.equal(preflight.confidence_score, 6);
});

test("preflight accepts explicit external fresh-context spawn with prompt bridge", () => {
  const preflight = buildPreflight({
    request: "finish epic",
    options: {
      executionMode: "fresh-context",
      tool: "codex",
      availableCommands: { codex: true },
      allowSpawn: true,
      permissionPromptBridge: true,
    },
  });

  assert.equal(preflight.provider_capabilities.freshContextAdapter, true);
  assert.equal(preflight.execution_policy.provider.context_forking, "codex-goal-task-packet");
  assert.equal(preflight.execution_policy.provider.permission_prompt_bridge_required, true);
  assert.equal(preflight.execution_policy.provider.spawn_receipt_required, true);
  assert.equal(preflight.execution_policy.provider.external_spawn_requires_allow_spawn, true);
  assert.equal(preflight.provider_permission_audit.pass, true);
  assert.equal(preflight.provider_permission_audit.status, "provider_policy_passed");
  assert.deepEqual(preflight.blocked_actions, []);
  assert.equal(preflight.confidence_score, 9);
});
