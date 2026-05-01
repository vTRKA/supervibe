import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_NAMES,
  evaluateGovernedAction,
  formatGovernanceStatus,
  resolveTeamGovernance,
} from "../scripts/lib/supervibe-team-governance.mjs";
import { workItemStorageMode } from "../scripts/lib/supervibe-work-item-query.mjs";
import { createNoTtyFallback } from "../scripts/lib/supervibe-interactive-cli.mjs";

test("team roles expose storage, branch, sync, review, and metadata defaults", () => {
  const governance = resolveTeamGovernance({ role: "contributor", branch: "main" });

  assert.ok(ROLE_NAMES.includes("owner"));
  assert.equal(governance.role, "contributor");
  assert.equal(governance.storage.location, ".supervibe/memory/work-items");
  assert.equal(governance.branchPolicy.protected, true);
  assert.equal(governance.allowedSync.includes("metadata-branch"), true);
  assert.equal(governance.review.required, true);
  assert.equal(governance.metadataVisibility, "limited");
  assert.match(formatGovernanceStatus(governance), /ROLE: contributor/);
});

test("governed actions explain allow/block decisions without no-tty prompts", () => {
  const blocked = evaluateGovernedAction({
    role: "contributor",
    branch: "main",
    action: "write",
    target: "src/app.js",
    noTty: true,
  });
  const allowed = evaluateGovernedAction({
    role: "maintainer",
    branch: "feature/policy",
    action: "write",
    target: "src/app.js",
    noTty: true,
  });

  assert.equal(blocked.allowed, false);
  assert.equal(blocked.promptEmitted, false);
  assert.match(blocked.reason, /protected branch/);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.promptEmitted, false);
  assert.equal(createNoTtyFallback({ command: "/supervibe-status --role", reason: blocked.reason }).ok, false);
});

test("work item storage mode reuses governance layer", () => {
  const mode = workItemStorageMode({ branch: "main", role: "read-only observer" });

  assert.equal(mode.mode, "role-read-only-observer");
  assert.equal(mode.safeSyncAction, "read-only-status");
  assert.equal(mode.role, "read-only observer");
});
