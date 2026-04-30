import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertPermissionAuditPass,
  createPermissionAudit,
  formatPermissionAudit,
  summarizePermissionAudit,
} from "../scripts/lib/autonomous-loop-permission-audit.mjs";
import { buildPreflight } from "../scripts/lib/autonomous-loop-preflight-intake.mjs";
import { runAutonomousLoop } from "../scripts/lib/autonomous-loop-runner.mjs";

test("permission audit passes safe dry-run stub defaults", () => {
  const audit = createPermissionAudit({ executionMode: "dry-run", adapterId: "generic-shell-stub" });

  assert.equal(audit.pass, true);
  assert.equal(audit.status, "provider_policy_passed");
  assert.equal(assertPermissionAuditPass(audit), true);
  assert.match(formatPermissionAudit(audit), /BYPASS_DISABLED: true/);
});

test("permission audit fails closed for external non-interactive execution without prompt bridge", () => {
  const audit = createPermissionAudit({
    executionMode: "fresh-context",
    adapterId: "codex",
    command: "codex",
    allowSpawn: true,
    permissionPromptBridge: false,
  });
  const summary = summarizePermissionAudit(audit);

  assert.equal(audit.pass, false);
  assert.equal(summary.permissionMode, "blocked");
  assert.ok(summary.deniedToolClasses.includes("permission_prompt_bridge_required"));
  assert.throws(() => assertPermissionAuditPass(audit), /Provider permission audit failed/);
});

test("preflight embeds provider permission audit and caps confidence on blockers", () => {
  const preflight = buildPreflight({
    request: "run codex autonomously",
    options: {
      executionMode: "fresh-context",
      adapterId: "codex",
      allowSpawn: true,
      permissionPromptBridge: false,
    },
  });

  assert.equal(preflight.provider_permission_audit.pass, false);
  assert.equal(preflight.execution_policy.permission_mode, "blocked");
  assert.ok(preflight.blocked_actions.includes("permission_prompt_bridge_required"));
  assert.equal(preflight.confidence_score, 6);
});

test("runner blocks non-dry execution before tasks when permission audit fails", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "supervibe-permission-audit-"));
  const planPath = join(rootDir, "plan.md");
  await writeFile(planPath, "# Plan\n\n- [ ] **Step 1: Update local feature**\n", "utf8");

  const result = await runAutonomousLoop({
    rootDir,
    plan: planPath,
    executionMode: "fresh-context",
    adapterId: "codex",
    allowSpawn: true,
    permissionPromptBridge: false,
  });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.state.stop_reason, "permission_prompt_bridge_required");
  assert.equal(result.state.permission_audit.pass, false);
  assert.equal(result.state.attempts.length, 0);
  assert.equal(result.state.tasks[0].status, "blocked");
});
