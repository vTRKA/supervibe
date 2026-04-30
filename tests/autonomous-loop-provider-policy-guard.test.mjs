import assert from "node:assert/strict";
import test from "node:test";
import {
  containsRawSecret,
  evaluateProviderSafetyPolicy,
  isProviderBypassRequest,
  isSensitivePath,
  redactSensitiveText,
  scanProviderCommand,
} from "../scripts/lib/autonomous-loop-provider-policy-guard.mjs";
import { assertSafeAdapterCommand } from "../scripts/lib/autonomous-loop-tool-adapters.mjs";
import { guardAction } from "../scripts/lib/autonomous-loop-policy-guard.mjs";

test("provider guard rejects bypass-permission defaults", () => {
  const scan = scanProviderCommand({ command: "codex", args: ["--dangerously-skip-permissions=true"] });

  assert.equal(scan.allowed, false);
  assert.equal(scan.status, "provider_permission_bypass_blocked");
  assert.throws(() => assertSafeAdapterCommand("codex", ["bypassPermissions"]), /Unsafe adapter flag blocked/);
  assert.equal(guardAction({ description: "run codex with provider bypass" }).status, "policy_stopped");
});

test("negative safety statements mentioning bypass are not treated as bypass requests", () => {
  assert.equal(isProviderBypassRequest("Never use provider bypass or all-tools mode."), false);
  assert.equal(guardAction({ description: "The loop must not use rate-limit bypass." }).status, "allowed");
});

test("dangerous flags require exact approval and a local test-only sandbox", () => {
  const denied = scanProviderCommand({
    command: "codex",
    args: ["--all-tools"],
    approvalLease: { allowProviderBypass: true, actionClass: "provider-permission-bypass" },
    safeSandbox: { declared: true, scope: "local-test-only" },
  });
  assert.equal(denied.allowed, false);

  const approved = scanProviderCommand({
    command: "codex",
    args: ["--all-tools"],
    approvalLease: {
      allowProviderBypass: true,
      actionClass: "provider-permission-bypass",
      scopes: ["provider-permission-bypass"],
    },
    safeSandbox: { declared: true, scope: "local-test-only" },
    policyProfile: { allowDangerousProviderFlags: true },
  });
  assert.equal(approved.allowed, true);
  assert.equal(approved.status, "provider_command_approved_test_sandbox");
});

test("provider safety policy blocks hidden automation, network, MCP, secrets, and unmanaged rate limits", () => {
  const policy = evaluateProviderSafetyPolicy({
    executionMode: "fresh-context",
    adapterId: "codex",
    command: "codex",
    allowSpawn: true,
    hiddenBackgroundAutomation: true,
    nonInteractive: true,
    permissionPromptBridge: false,
    network: { requested: true, targets: ["https://example.invalid"] },
    mcp: { requested: true, servers: ["filesystem"], write: true },
    readPaths: [".env"],
    rateLimit: { error429: true },
  });

  assert.equal(policy.pass, false);
  assert.ok(policy.blockers.some((blocker) => blocker.status === "hidden_background_automation_blocked"));
  assert.ok(policy.blockers.some((blocker) => blocker.status === "permission_prompt_bridge_required"));
  assert.ok(policy.blockers.some((blocker) => blocker.status === "network_approval_required"));
  assert.ok(policy.blockers.some((blocker) => blocker.status === "mcp_approval_required"));
  assert.ok(policy.blockers.some((blocker) => blocker.status === "sensitive_file_access_blocked"));
  assert.ok(policy.blockers.some((blocker) => blocker.status === "provider_backoff_required"));
});

test("managed policy deny rules cannot be weakened by project policy", () => {
  const policy = evaluateProviderSafetyPolicy({
    managedPolicy: { deny: ["shell:unsafe"] },
    projectPolicy: { allow: ["shell:unsafe"] },
  });

  assert.equal(policy.pass, false);
  assert.equal(policy.status, "managed_policy_precedence_violation");
});

test("secret helpers classify sensitive paths and redact raw values", () => {
  assert.equal(isSensitivePath(".env"), true);
  assert.equal(isSensitivePath("src/index.js"), false);
  assert.equal(containsRawSecret("OPENAI_API_KEY=sk-abc123456789012345"), true);
  assert.equal(redactSensitiveText("token=abcdefghijklmnopqrstuvwxyz"), "[REDACTED_SECRET]");
});
