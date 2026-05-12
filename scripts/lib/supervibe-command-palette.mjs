import { groupWorkItemsByStatus } from "./supervibe-work-item-query.mjs";
import { listSavedViews } from "./supervibe-work-item-saved-views.mjs";
import { SOURCE_RAG_INDEX_COMMAND } from "./supervibe-command-catalog.mjs";

export const COMMAND_PALETTE_ACTION_IDS = Object.freeze([
  "view-ready-work",
  "view-blockers",
  "atomize-plan",
  "review-plan-scope",
  "create-work-item",
  "claim-next-task",
  "close-selected-task",
  "split-selected-task",
  "delete-selected-task",
  "defer-task",
  "export-dashboard",
  "run-doctor",
  "index-rag-codegraph",
  "open-review-package",
  "stop-run",
]);

export function buildCommandPalette({ index = [], state = {}, planPath = null, graphPath = ".supervibe/memory/work-items/<epic-id>/graph.json", savedViewStore = null, selectedItemId = null } = {}) {
  const grouped = groupWorkItemsByStatus(index);
  const ready = grouped.ready[0] || null;
  const blockers = grouped.blocked.length;
  const runId = state.run_id || state.runId || null;
  const stateFile = state.stateFile || (runId ? `.supervibe/memory/loops/${runId}/state.json` : ".supervibe/memory/loops/<run-id>/state.json");
  const views = savedViewStore ? listSavedViews(savedViewStore) : [];
  const actions = [
    action("view-ready-work", "View ready work", "/supervibe-status --view ready-now --file " + graphPath, { enabled: true }),
    action("view-blockers", "View blockers", "/supervibe-status --view blocked --file " + graphPath, { enabled: blockers > 0, blockedReason: blockers > 0 ? null : "no blockers in current graph" }),
    action("atomize-plan", "Atomize plan", `/supervibe-loop --atomize-plan ${planPath || ".supervibe/artifacts/plans/example.md"} --preview`, { enabled: Boolean(planPath), blockedReason: planPath ? null : "no plan path selected" }),
    action("review-plan-scope", "Review plan scope", `/supervibe-loop --atomize-plan ${planPath || ".supervibe/artifacts/plans/example.md"} --preview`, { enabled: Boolean(planPath), blockedReason: planPath ? null : "no plan path selected" }),
    action("create-work-item", "Create work item", "/supervibe-loop --create-work-item --interactive", { mutates: true, risky: false }),
    action("claim-next-task", "Claim next task", ready ? `/supervibe-loop --claim ${ready.itemId || ready.id} --file ${graphPath}` : "/supervibe-status --view ready-now", { enabled: Boolean(ready), mutates: true, blockedReason: ready ? null : "no ready task" }),
    action("close-selected-task", "Close selected task", `/supervibe-loop --close ${selectedItemId || "<item-id>"} --file ${graphPath} --reason "verified"`, { enabled: Boolean(selectedItemId), mutates: true, blockedReason: selectedItemId ? null : "select a task first" }),
    action("split-selected-task", "Split selected task", `/supervibe-loop --split ${selectedItemId || "<item-id>"} --titles "Subtask A,Subtask B" --file ${graphPath} --preview`, { enabled: Boolean(selectedItemId), mutates: true, blockedReason: selectedItemId ? null : "select a task first" }),
    action("delete-selected-task", "Delete selected task", `/supervibe-loop --delete ${selectedItemId || "<item-id>"} --file ${graphPath} --preview`, { enabled: Boolean(selectedItemId), mutates: true, risky: true, blockedReason: selectedItemId ? null : "select a task first" }),
    action("defer-task", "Defer task", `/supervibe-loop --defer ${selectedItemId || "<item-id>"} --until <timestamp> --file ${graphPath}`, { enabled: Boolean(selectedItemId), mutates: true, blockedReason: selectedItemId ? null : "select a task first" }),
    action("export-dashboard", "Export dashboard", `/supervibe-status --dashboard --file ${stateFile}`, { enabled: Boolean(runId || stateFile), mutates: false }),
    action("run-doctor", "Run doctor", `/supervibe-loop doctor --file ${stateFile}`, { enabled: Boolean(runId || stateFile), mutates: false }),
    action("index-rag-codegraph", "Index RAG + CodeGraph", SOURCE_RAG_INDEX_COMMAND, { enabled: true }),
    action("open-review-package", "Open review package", `/supervibe-status --report sla --file ${graphPath}`, { enabled: true, mutates: false }),
    action("stop-run", "Stop run", `/supervibe-loop --stop ${runId || "<run-id>"}`, { enabled: Boolean(runId), mutates: true, risky: true, blockedReason: runId ? null : "no active run selected" }),
  ];

  return {
    actions,
    savedViews: views.map((view) => ({ name: view.name, command: `/supervibe-status --view ${view.name} --file ${graphPath}` })),
    hidden: actions.filter((item) => !item.enabled),
  };
}

export function selectPaletteAction(palette = {}, actionId, { confirmed = false, yes = false } = {}) {
  const action = (palette.actions || []).find((candidate) => candidate.id === actionId);
  if (!action) throw new Error(`unknown palette action: ${actionId}`);
  if (!action.enabled) return { action, executable: false, reason: action.blockedReason || "action unavailable", command: action.command };
  if (action.risky && yes) {
    return { action, executable: false, reason: "--yes is not allowed for risky actions", command: action.command };
  }
  if (action.mutates && !confirmed && !yes) {
    return { action, executable: false, reason: "preview required before mutation", command: action.previewCommand || action.command };
  }
  if (action.mutates && !action.previewConfirmed && !action.previewAccepted && !confirmed) {
    return { action, executable: false, reason: "preview acceptance required before mutation", command: action.previewCommand || action.command };
  }
  const command = action.mutates && !(action.previewConfirmed || action.previewAccepted)
    ? (action.previewCommand || action.command)
    : action.command;
  const executable = action.mutates ? Boolean(action.previewConfirmed || action.previewAccepted) : true;
  return { action, executable, command, reason: executable ? "ready" : "preview acceptance required before mutation" };
}

export function formatCommandPalette(palette = {}) {
  return [
    "SUPERVIBE_COMMAND_PALETTE",
    ...(palette.actions || []).map((action) => {
      const status = action.enabled ? "ready" : `blocked:${action.blockedReason}`;
      return `- ${action.id}: ${status} -> ${action.command}`;
    }),
  ].join("\n");
}

function action(id, label, command, options = {}) {
  const mutates = Boolean(options.mutates);
  const previewCommand = options.previewCommand
    || (mutates && !/\s--preview\b/.test(command) ? `${command} --preview` : null);
  return {
    id,
    label,
    command,
    enabled: options.enabled !== false,
    blockedReason: options.blockedReason || null,
    mutates,
    risky: Boolean(options.risky),
    previewFirst: mutates,
    previewCommand,
  };
}
