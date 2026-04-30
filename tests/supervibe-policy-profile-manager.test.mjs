import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  BUILT_IN_POLICY_PROFILE_NAMES,
  applyPolicyProfileToProviderInput,
  formatPolicyProfileSummary,
  loadPolicyProfile,
  validatePolicyProfile,
} from "../scripts/lib/supervibe-policy-profile-manager.mjs";
import { evaluateProviderSafetyPolicy } from "../scripts/lib/autonomous-loop-provider-policy-guard.mjs";

test("built-in policy profiles include team and CI safe defaults", async () => {
  const profile = await loadPolicyProfile({ profileName: "CI-readonly" });

  assert.deepEqual(BUILT_IN_POLICY_PROFILE_NAMES, [
    "solo-local",
    "guided",
    "contributor",
    "maintainer",
    "CI-readonly",
    "CI-verify",
    "release-prep",
    "enterprise-restricted",
  ]);
  assert.equal(profile.name, "CI-readonly");
  assert.equal(profile.role, "CI");
  assert.equal(profile.writePolicy.mode, "read-only");
  assert.equal(profile.networkPolicy.mode, "deny");
  assert.ok(profile.deniedTools.includes("remote-mutation"));
  assert.match(formatPolicyProfileSummary(profile), /PROFILE: CI-readonly/);
});

test("local profile overrides cannot weaken built-in deny rules", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-policy-"));
  const configDir = join(rootDir, ".supervibe");
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, "policy-profile.json"), JSON.stringify({
    extends: "enterprise-restricted",
    name: "enterprise-restricted",
    allowedTools: ["shell:unsafe", "remote-mutation", "read"],
    deniedTools: ["custom-danger"],
    reviewRequirements: ["owner-review"],
  }, null, 2));

  const profile = await loadPolicyProfile({
    rootDir,
    profileName: "enterprise-restricted",
    managedPolicy: { deny: ["shell:unsafe"] },
  });

  assert.ok(profile.allowedTools.includes("read"));
  assert.equal(profile.allowedTools.includes("remote-mutation"), false);
  assert.equal(profile.allowedTools.includes("shell:unsafe"), false);
  assert.ok(profile.deniedTools.includes("custom-danger"));
  assert.ok(profile.validation.issues.some((issue) => issue.code === "deny_precedence"));
});

test("profiles reject secrets and raw token fields", () => {
  const result = validatePolicyProfile({
    name: "guided",
    allowedTools: ["read"],
    deniedTools: [],
    networkPolicy: { mode: "ask" },
    mcpPolicy: { mode: "ask" },
    writePolicy: { mode: "local-only" },
    gitPolicy: { protectedBranches: ["main"] },
    worktreePolicy: { mode: "optional" },
    approvalLeaseDurationMinutes: 30,
    maxRuntimeMinutes: 60,
    maxSpendHint: "local-only",
    reviewRequirements: [],
    evidenceRequirements: [],
    token: "sk-12345678901234567890",
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "secret_field_forbidden"));
  assert.ok(result.issues.some((issue) => issue.code === "raw_secret_value"));
});

test("provider policy applies CI-readonly profile without interactive prompts", async () => {
  const profile = await loadPolicyProfile({ profileName: "CI-readonly" });
  const input = applyPolicyProfileToProviderInput({
    policyProfile: profile,
    writePaths: ["docs/report.md"],
    remoteMutation: true,
    network: { requested: true, targets: ["https://example.invalid"] },
    nonInteractive: true,
  });
  const policy = evaluateProviderSafetyPolicy(input);

  assert.equal(policy.pass, false);
  assert.ok(policy.blockers.some((blocker) => blocker.status === "policy_profile_write_blocked"));
  assert.ok(policy.blockers.some((blocker) => blocker.status === "policy_profile_remote_mutation_blocked"));
  assert.equal(policy.promptRequiredToolClasses.includes("interactive-approval"), false);
});
