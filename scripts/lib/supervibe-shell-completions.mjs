const COMMON_FLAGS = [
  "--request",
  "--plan",
  "--from-prd",
  "--atomize-plan",
  "--status",
  "--resume",
  "--stop",
  "--worktree",
  "--watch",
  "--quickstart",
  "--onboard",
  "--completion",
  "--import-tasks",
  "--priority",
  "--tracker-sync-push",
  "--tracker-sync-pull",
  "--tracker-doctor",
  "--dry-run",
  "--interactive",
  "--preview",
  "--yes",
  "--view",
  "--query",
  "--save-view",
  "--report",
  "--defer",
  "--create-work-item",
  "--policy-profile",
  "--approval-receipts",
  "--policy-doctor",
  "--fix-derived",
  "--policy",
  "--role",
  "--anchors",
  "--anchor-doctor",
  "--summarize-changes",
];

export function generateShellCompletions({ shell = "bash", runIds = [], epics = [], worktrees = [], statuses = [] } = {}) {
  const words = [...COMMON_FLAGS, ...runIds, ...epics, ...worktrees, ...statuses].filter(Boolean);
  if (shell === "powershell") {
    return [
      "Register-ArgumentCompleter -CommandName supervibe-loop -ScriptBlock {",
      "  param($commandName, $wordToComplete)",
      `  @(${words.map((word) => `'${escapePs(word)}'`).join(", ")}) | Where-Object { $_ -like "$wordToComplete*" }`,
      "}",
    ].join("\n");
  }
  const list = words.map((word) => word.replace(/"/g, '\\"')).join(" ");
  if (shell === "zsh") {
    return `#compdef supervibe-loop\n_arguments '*: :(${list})'\n`;
  }
  return `complete -W "${list}" supervibe-loop\n`;
}

export function createQuickstartPlan({ rootDir = process.cwd() } = {}) {
  return {
    rootDir,
    directories: [
      ".supervibe/memory/loops",
      ".supervibe/memory/work-items",
      ".supervibe/memory/bundles",
    ],
    safeDefaults: {
      executionMode: "dry-run",
      providerBypass: false,
      watchMode: "opt-in-read-only",
    },
    nextAction: "/supervibe-loop --onboard",
  };
}

export function createOnboardingReport({ rootDir = process.cwd(), hasWorkItems = false, hasLoopState = false, hasTrackerMapping = false } = {}) {
  const missing = [];
  if (!hasWorkItems) missing.push("atomized work items");
  if (!hasLoopState) missing.push("loop state");
  if (!hasTrackerMapping) missing.push("optional tracker mapping");
  return {
    rootDir,
    readiness: missing.length === 0 ? "ready" : "partial",
    missing,
    safestFirstRun: "/supervibe-loop --request \"validate integrations\" --dry-run",
  };
}

export function formatQuickstart(plan = createQuickstartPlan()) {
  return [
    "SUPERVIBE_LOOP_QUICKSTART",
    `ROOT: ${plan.rootDir}`,
    `DIRECTORIES: ${plan.directories.join(", ")}`,
    `DEFAULT_MODE: ${plan.safeDefaults.executionMode}`,
    `WATCH: ${plan.safeDefaults.watchMode}`,
    `NEXT_ACTION: ${plan.nextAction}`,
  ].join("\n");
}

export function formatOnboarding(report = createOnboardingReport()) {
  return [
    "SUPERVIBE_LOOP_ONBOARD",
    `READINESS: ${report.readiness}`,
    `MISSING: ${report.missing.join(", ") || "none"}`,
    `SAFEST_FIRST_RUN: ${report.safestFirstRun}`,
  ].join("\n");
}

function escapePs(value) {
  return String(value).replace(/'/g, "''");
}
