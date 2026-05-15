import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS,
  repairableContentChangedRowsLimit,
} from "../scripts/lib/code-index-health-status.mjs";
import {
  defaultAgentLeaseRegistryPath,
  readAgentLeaseRegistry,
  readAgentLeaseRegistrySync,
  writeAgentLeaseRegistry,
  writeAgentLeaseRegistrySync,
  upsertAgentLease,
  discoverAgentLeasesFromInvocationLogSync,
  normalizeLeaseScope,
  leaseMatchesScope,
} from "../scripts/lib/supervibe-agent-lease-registry.mjs";
import {
  CLEANUP_POLICY_VERSION,
  createDefaultCleanupPolicy,
  validateCleanupPolicy,
  isOlderThanRetention,
} from "../scripts/lib/supervibe-cleanup-policy.mjs";
import {
  CLEANUP_LIFECYCLE_CLASSES,
  collectCleanupRoots,
  classifyCleanupPath,
  collectCleanupInventory,
  summarizeClassifications,
  collectCompactManifests,
} from "../scripts/lib/supervibe-cleanup-reachability.mjs";
import { classifyIntentRequest } from "../scripts/lib/supervibe-intent-arbiter.mjs";
import {
  PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_MODE,
  PLAN_GRAPH_TASK_TESTS_DEFERRED_UNTIL,
} from "../scripts/lib/supervibe-plan-to-work-items.mjs";
import {
  TRUSTED_TASK_COMPLETION_COMMANDS,
  TRUSTED_GRAPH_COMPLETION_STAGES,
  receiptTaskBinding,
  trustedReceiptScopesById,
  isGraphWideCompletionReceipt,
  receiptMatchesGraphSource,
  receiptOutputsCurrentGraph,
} from "../scripts/lib/supervibe-receipt-completion-trust.mjs";
import { defaultWorkflowReceiptIndexPath } from "../scripts/lib/supervibe-receipt-index.mjs";
import { defaultWorkflowReceiptSnapshotRoot } from "../scripts/lib/supervibe-receipt-snapshot-store.mjs";
import {
  WORKFLOW_READINESS_PROBE_ORDER,
  FINAL_ONLY_VERIFICATION_WORKFLOW_TYPES,
} from "../scripts/lib/supervibe-workflow-readiness-model.mjs";
import {
  WORKFLOW_RECEIPT_REPAIR_OPERATIONS,
  defaultGeneratedStateRecoveryLockPath,
  classifyWorkflowReceiptRepairCommand,
  assertWorkflowReceiptRepairCommandAllowed,
  classifyGeneratedStatePath,
  createGeneratedStateRecoveryPolicy,
  validateGeneratedStateRecoveryPolicy,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

test("public workflow helper exports remain intentionally reachable", () => {
  const functionExports = [
    repairableContentChangedRowsLimit,
    defaultAgentLeaseRegistryPath,
    readAgentLeaseRegistry,
    readAgentLeaseRegistrySync,
    writeAgentLeaseRegistry,
    writeAgentLeaseRegistrySync,
    upsertAgentLease,
    discoverAgentLeasesFromInvocationLogSync,
    normalizeLeaseScope,
    leaseMatchesScope,
    createDefaultCleanupPolicy,
    validateCleanupPolicy,
    isOlderThanRetention,
    collectCleanupRoots,
    classifyCleanupPath,
    collectCleanupInventory,
    summarizeClassifications,
    collectCompactManifests,
    classifyIntentRequest,
    receiptTaskBinding,
    trustedReceiptScopesById,
    isGraphWideCompletionReceipt,
    receiptMatchesGraphSource,
    receiptOutputsCurrentGraph,
    defaultWorkflowReceiptIndexPath,
    defaultWorkflowReceiptSnapshotRoot,
    defaultGeneratedStateRecoveryLockPath,
    classifyWorkflowReceiptRepairCommand,
    assertWorkflowReceiptRepairCommandAllowed,
    classifyGeneratedStatePath,
    createGeneratedStateRecoveryPolicy,
    validateGeneratedStateRecoveryPolicy,
  ];

  for (const exported of functionExports) assert.equal(typeof exported, "function");
  assert.equal(typeof DEFAULT_REPAIRABLE_CONTENT_CHANGED_ROWS, "number");
  assert.equal(typeof CLEANUP_POLICY_VERSION, "string");
  assert.ok(Array.isArray(CLEANUP_LIFECYCLE_CLASSES));
  assert.equal(typeof PLAN_GRAPH_TASK_FINAL_ONLY_VERIFICATION_MODE, "string");
  assert.equal(typeof PLAN_GRAPH_TASK_TESTS_DEFERRED_UNTIL, "string");
  assert.ok(Array.isArray(TRUSTED_TASK_COMPLETION_COMMANDS));
  assert.ok(Array.isArray(TRUSTED_GRAPH_COMPLETION_STAGES));
  assert.ok(Array.isArray(WORKFLOW_READINESS_PROBE_ORDER));
  assert.ok(Array.isArray(FINAL_ONLY_VERIFICATION_WORKFLOW_TYPES));
  assert.ok(Array.isArray(WORKFLOW_RECEIPT_REPAIR_OPERATIONS));
});
