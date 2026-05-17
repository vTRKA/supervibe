import { WORKFLOW_EVIDENCE_MODES } from "./supervibe-plan-to-work-items.mjs";

export function parseLoopCliArgs(argv) {
  const args = { _: [] };
  const booleanArgs = new Set([
    "dry-run",
    "guided",
    "manual",
    "fresh-context",
    "status",
    "epic-status",
    "details",
    "release-details",
    "final-details",
    "verify-details",
    "readiness",
    "ready-list",
    "json",
    "commit-per-task",
    "graph",
    "doctor",
    "prime",
    "archive",
    "export",
    "import",
    "fix",
    "help",
    "atomize",
    "create-epic",
    "plan-review-passed",
    "user-approved-plan",
    "approved-plan",
    "approved",
    "reviewed",
    "worktree",
    "worktree-status",
    "watch",
    "quickstart",
    "onboard",
    "priority",
    "inbox",
    "tracker-sync-push",
    "tracker-sync-pull",
    "tracker-doctor",
    "tracker-prime",
    "interactive",
    "preview",
    "write-preview",
    "write-source-plan",
    "write-backup",
    "backup",
    "discover",
    "yes",
    "force",
    "create-work-item",
    "claim-ready",
    "dispatch-wave",
    "resume-dispatch",
    "start",
    "dispatch",
    "fast-session",
    "release-proof",
    "upgrade-release-proof",
    "status-only-fallback",
    "eval",
    "eval-live",
    "approval-receipts",
    "policy-doctor",
    "fix-derived",
    "approve-mcp-tracker",
    "anchors",
    "anchor-doctor",
    "summarize-changes",
    "speculative",
    "assign-ready",
    "explain",
    "setup-worker-presets",
    "allow-session-conflict",
    "happy-path",
    "checkpoint-status",
    "repair-checkpoints",
    "provider-matrix",
    "require-user-acceptance",
    "accept-goals",
    "reject-goals",
    "fork-checkpoint",
    "allow-spawn",
    "permission-prompt-bridge",
    "network-approved",
    "mcp-approved",
    "allow-flat-plan",
    "no-tracker-sync",
    "validate-completion",
    "completion-status",
    "close-eligible",
    "adopt-completed",
    "reconcile-receipts",
    "allow-unbound-receipts",
    "require-release-full-check",
    "allow-missing-release-full-check",
    "allow-dry-run-evidence",
    "require-trusted-evidence",
    "disallow-legacy-evidence",
    "allow-legacy-evidence",
    "allow-open-epic",
    "no-evidence-required",
    "stall-check",
    "non-production",
    "indefinite",
    "auto-ui",
    "auto-ui-dry-run",
    "no-auto-ui",
    "allow-unverified-plan-review",
    "pre-loop-summary",
    "final-review-sweep",
    "final-review-status",
    "write-final-review-sweep",
    "allow-untrusted-final-review",
    "apply",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key === "from-plan") {
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        args[key] = argv[i + 1];
        i += 1;
      } else {
        args[key] = true;
      }
    } else if (booleanArgs.has(key)) {
      args[key] = true;
    } else {
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return normalizeFastStartArgs(args);
}

function normalizeFastStartArgs(args = {}) {
  if (args.start && typeof args["from-plan"] === "string" && !args["atomize-plan"]) {
    args["atomize-plan"] = args["from-plan"];
    args["user-approved-plan"] = true;
    if (!args["release-proof"]) args["fast-session"] = true;
  }
  return args;
}

export function resolveWorkflowEvidenceModeFromArgs(args = {}, _context = {}) {
  const requested = String(
    args.workflowEvidenceMode
      || args["workflow-evidence-mode"]
      || args.evidenceMode
      || args["evidence-mode"]
      || args.receiptMode
      || args["receipt-mode"]
      || "",
  ).trim().toLowerCase();
  if (requested === WORKFLOW_EVIDENCE_MODES.RELEASE_PROOF) return WORKFLOW_EVIDENCE_MODES.RELEASE_PROOF;
  if (requested === WORKFLOW_EVIDENCE_MODES.FAST_SESSION) return WORKFLOW_EVIDENCE_MODES.FAST_SESSION;
  if (args["release-proof"]) return WORKFLOW_EVIDENCE_MODES.RELEASE_PROOF;
  return WORKFLOW_EVIDENCE_MODES.FAST_SESSION;
}
