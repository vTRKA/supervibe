import { getTriggerIntentCorpus } from "./supervibe-trigger-intent-corpus.mjs";
import { rankSemanticIntents } from "./supervibe-semantic-intent-router.mjs";
import { getCapabilityRouteHint } from "./supervibe-capability-registry.mjs";
import { findCommandShortcut, resolveCommandRequest, SOURCE_RAG_INDEX_COMMAND } from "./supervibe-command-catalog.mjs";
import {
  copyCommandAgentContract,
  getCommandAgentProfile,
} from "./command-agent-orchestration-contract.mjs";
import {
  buildCommandQuestionSurface,
  validateQuestionSurface,
} from "./question-surface-contract.mjs";
import { decideRetrievalPolicy } from "./supervibe-retrieval-decision-policy.mjs";

const NO_SLASH_COMMAND_PREEMPT_IDS = new Set([
  "/supervibe-adapt",
  "/supervibe-update",
]);

const ROUTES = {
  genesis_setup: {
    phase: "setup",
    command: "/supervibe-genesis",
    skill: "supervibe:genesis",
    nextQuestionRu: "Шаг 1/1: запустить host-aware genesis dry-run с сохранением существующих host instruction files?",
    nextQuestionEn: "Step 1/1: run a host-aware genesis dry-run while preserving existing host instruction files?",
    prerequisites: ["user-request"],
  },
  index_repair: {
    phase: "diagnostics",
    command: "/supervibe-status --index-health --strict-index-health",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Шаг 1/1: показать index health gate и repair command?",
    nextQuestionEn: "Step 1/1: show the index health gate and repair command?",
    prerequisites: [],
  },
  code_index_build: {
    phase: "maintenance",
    command: SOURCE_RAG_INDEX_COMMAND,
    skill: "supervibe:code-search",
    nextQuestionRu: "Шаг 1/1: запустить bounded RAG/CodeGraph indexing команду без поиска по всему проекту?",
    nextQuestionEn: "Step 1/1: run the bounded RAG/CodeGraph indexing command without searching the whole project?",
    prerequisites: [],
  },
  preview_server: {
    phase: "preview",
    command: "/supervibe-preview --daemon",
    skill: "supervibe:preview-server",
    nextQuestionRu: "Шаг 1/1: запустить silent preview daemon с pid/log evidence?",
    nextQuestionEn: "Step 1/1: start the silent preview daemon with PID and log evidence?",
    prerequisites: ["user-request"],
  },
  delivery_control: {
    phase: "delivery",
    command: "/supervibe --delivery-control",
    skill: "supervibe:executing-plans",
    nextQuestionRu: "Шаг 1/1: открыть delivery control и выбрать действие для текущего результата?",
    nextQuestionEn: "Step 1/1: open delivery control and choose an action for the current result?",
    prerequisites: ["user-request"],
  },
  brainstorm_to_plan: {
    phase: "brainstorm",
    command: "/supervibe-plan --from-brainstorm",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Шаг 1/1: написать план?",
    nextQuestionEn: "Step 1/1: write the plan?",
    prerequisites: ["brainstorm-artifact-or-summary"],
  },
  documentation_summary_gate: {
    phase: "brainstorm",
    command: "/supervibe-brainstorm --summary-gate",
    skill: "supervibe:brainstorming",
    nextQuestionRu: "Шаг 1/1: показать summary и варианты решения перед созданием документации?",
    nextQuestionEn: "Step 1/1: show the summary and decision choices before creating documentation?",
    prerequisites: ["user-request"],
  },
  plan_review: {
    phase: "plan",
    command: "/supervibe-plan --review",
    skill: "supervibe:requesting-code-review",
    nextQuestionRu: "Шаг 1/1: запустить review loop по плану?",
    nextQuestionEn: "Step 1/1: run the plan review loop?",
    prerequisites: ["plan-path-or-plan-content"],
  },
  atomize_plan: {
    phase: "plan_reviewed",
    command: "/supervibe-loop --atomize-plan <plan-path> --plan-review-passed",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Шаг 1/1: разбить план на атомарные work items и epic?",
    nextQuestionEn: "Step 1/1: split the plan into atomic work items and an epic?",
    prerequisites: ["reviewed-plan"],
  },
  create_epic: {
    phase: "plan_reviewed",
    command: "/supervibe-loop --from-plan --create-epic",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: разбить план на атомарные work items и epic?",
    nextQuestionEn: "Step 1/1: split the plan into atomic work items and an epic?",
    prerequisites: ["reviewed-plan"],
  },
  autonomous_epic_run: {
    phase: "execution",
    command: "/supervibe-loop --epic",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: запустить provider-safe preflight перед worktree/autonomous run?",
    nextQuestionEn: "Step 1/1: run provider-safe preflight before the worktree/autonomous run?",
    prerequisites: ["epic-id", "approved-scope"],
  },
  worktree_autonomous_run: {
    phase: "execution",
    command: "/supervibe-loop --epic --worktree",
    skill: "supervibe:using-git-worktrees",
    nextQuestionRu: "Шаг 1/1: запустить provider-safe preflight перед worktree/autonomous run?",
    nextQuestionEn: "Step 1/1: run provider-safe preflight before the worktree/autonomous run?",
    prerequisites: ["epic-id", "clean-or-isolated-worktree"],
  },
  execute_plan: {
    phase: "execution",
    command: "/supervibe-execute-plan",
    skill: "supervibe:executing-plans",
    nextQuestionRu: "Шаг 1/1: запустить readiness audit перед исполнением?",
    nextQuestionEn: "Step 1/1: run the readiness audit before execution?",
    prerequisites: ["plan-path-or-plan-content", "readiness-audit"],
  },
  ready_query: {
    phase: "status",
    command: "/supervibe-status --ready",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Шаг 1/1: показать ready work items?",
    nextQuestionEn: "Step 1/1: show ready work items?",
    prerequisites: [],
  },
  blocked_query: {
    phase: "status",
    command: "/supervibe-status --blocked",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Шаг 1/1: показать blockers?",
    nextQuestionEn: "Step 1/1: show blockers?",
    prerequisites: [],
  },
  task_graph_remaining: {
    phase: "status",
    command: "/supervibe-status --remaining",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Шаг 1/1: показать оставшиеся epic/task/subtask work items и следующий шаг?",
    nextQuestionEn: "Step 1/1: show remaining epic/task/subtask work items and the next action?",
    prerequisites: ["active-work-graph"],
  },
  task_graph_resume: {
    phase: "execution",
    command: "/supervibe-loop --status",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: показать активный epic/task graph и следующий шаг для продолжения?",
    nextQuestionEn: "Step 1/1: show the active epic/task graph and next action for resume?",
    prerequisites: ["active-work-graph-or-loop-state"],
  },
  task_graph_claim_ready: {
    phase: "execution",
    command: "/supervibe-loop --claim-ready",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: выбрать и claim следующую ready task из активного graph?",
    nextQuestionEn: "Step 1/1: select and claim the next ready task from the active graph?",
    prerequisites: ["active-work-graph"],
  },
  task_graph_create_from_plan: {
    phase: "execution",
    command: "/supervibe-loop --atomize-plan <plan-path> --plan-review-passed",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: создать epic, tasks и subtasks из reviewed plan?",
    nextQuestionEn: "Step 1/1: create epic, tasks, and subtasks from the reviewed plan?",
    prerequisites: ["reviewed-plan"],
  },
  task_graph_delete: {
    phase: "execution",
    command: "/supervibe-loop --delete <task-id> --preview",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: показать preview удаления task или subtask перед apply?",
    nextQuestionEn: "Step 1/1: preview task or subtask deletion before apply?",
    prerequisites: ["active-work-graph", "task-id"],
  },
  task_graph_split: {
    phase: "execution",
    command: "/supervibe-loop --split <task-id> --preview",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: показать preview split task на subtasks?",
    nextQuestionEn: "Step 1/1: preview splitting the task into subtasks?",
    prerequisites: ["active-work-graph", "task-id"],
  },
  task_graph_reparent: {
    phase: "execution",
    command: "/supervibe-loop --reparent <task-id> --preview",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: показать preview переноса task/subtask?",
    nextQuestionEn: "Step 1/1: preview moving the task or subtask?",
    prerequisites: ["active-work-graph", "task-id", "parent-id"],
  },
  task_graph_skip: {
    phase: "execution",
    command: "/supervibe-loop --skip <task-id> --preview",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: показать preview skip task с причиной?",
    nextQuestionEn: "Step 1/1: preview skipping the task with a reason?",
    prerequisites: ["active-work-graph", "task-id", "reason"],
  },
  task_graph_defer: {
    phase: "execution",
    command: "/supervibe-loop --defer <task-id> --preview",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: показать preview defer task?",
    nextQuestionEn: "Step 1/1: preview deferring the task?",
    prerequisites: ["active-work-graph", "task-id", "until-or-reason"],
  },
  task_graph_block: {
    phase: "execution",
    command: "/supervibe-loop --block <task-id> --preview",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: показать preview блокировки task с причиной?",
    nextQuestionEn: "Step 1/1: preview blocking the task with a reason?",
    prerequisites: ["active-work-graph", "task-id", "reason"],
  },
  task_graph_edit: {
    phase: "execution",
    command: "/supervibe-loop --edit <task-id> --preview",
    skill: "supervibe:autonomous-agent-loop",
    nextQuestionRu: "Шаг 1/1: показать preview изменения task или subtask перед apply?",
    nextQuestionEn: "Step 1/1: preview task or subtask edit before apply?",
    prerequisites: ["active-work-graph", "task-id"],
  },
  task_graph_validate_completion: {
    phase: "review",
    command: "/supervibe-loop --validate-completion",
    skill: "supervibe:verification",
    nextQuestionRu: "Шаг 1/1: проверить production readiness epic через completion validator?",
    nextQuestionEn: "Step 1/1: validate epic production readiness through the completion validator?",
    prerequisites: ["active-work-graph-or-epic-id"],
  },
  task_graph_stale_query: {
    phase: "status",
    command: "/supervibe-status --stale",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Шаг 1/1: показать stale task claims?",
    nextQuestionEn: "Step 1/1: show stale task claims?",
    prerequisites: ["active-work-graph"],
  },
  task_graph_orphan_query: {
    phase: "status",
    command: "/supervibe-status --orphan",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Шаг 1/1: показать orphan tasks/evidence?",
    nextQuestionEn: "Step 1/1: show orphan tasks and evidence?",
    prerequisites: ["active-work-graph"],
  },
  trigger_diagnostics: {
    phase: "diagnostics",
    command: "/supervibe --diagnose-trigger",
    skill: "supervibe:trigger-diagnostics",
    nextQuestionRu: "Шаг 1/1: показать диагностику триггера?",
    nextQuestionEn: "Step 1/1: show trigger diagnostics?",
    prerequisites: ["user-request"],
  },
  why_trigger: {
    phase: "diagnostics",
    command: "/supervibe --why-trigger",
    skill: "supervibe:trigger-diagnostics",
    nextQuestionRu: "Шаг 1/1: показать объяснение выбора skill?",
    nextQuestionEn: "Step 1/1: explain the selected skill?",
    prerequisites: ["last-route"],
  },
  readme_update: {
    phase: "documentation",
    command: "/supervibe-plan --docs-sync",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Шаг 1/1: синхронизировать README и acceptance coverage?",
    nextQuestionEn: "Step 1/1: sync README and acceptance coverage?",
    prerequisites: ["accepted-change-summary"],
  },
  security_audit: {
    phase: "audit",
    command: "/supervibe-security-audit",
    skill: "supervibe:audit",
    nextQuestionRu: "Шаг 1/1: запустить read-only security audit с приоритизацией уязвимостей?",
    nextQuestionEn: "Step 1/1: run the read-only security audit with prioritized findings?",
    prerequisites: [],
  },
  network_ops: {
    phase: "diagnostics",
    command: "/supervibe --agent network-router-engineer --read-only",
    skill: "supervibe:incident-response",
    nextQuestionRu: "Шаг 1/1: начать read-only диагностику сети/роутера без изменений конфигурации?",
    nextQuestionEn: "Step 1/1: start read-only network/router diagnostics without config changes?",
    prerequisites: ["user-request"],
  },
  prompt_ai_engineering: {
    phase: "design",
    command: "/supervibe --agent prompt-ai-engineer",
    skill: "supervibe:test-strategy",
    nextQuestionRu: "Шаг 1/1: проверить prompt/agent/router contract, evals и safety boundaries?",
    nextQuestionEn: "Step 1/1: review the prompt, agent, or router contract with evals and safety boundaries?",
    prerequisites: ["user-request"],
  },
  design_new: {
    phase: "design",
    command: "/supervibe-design",
    skill: "supervibe:brandbook",
    nextQuestionRu: "Шаг 1/1: запустить полный дизайн-пайплайн с creative direction и brandbook до прототипа?",
    nextQuestionEn: "Step 1/1: run the full design pipeline with creative direction and brandbook before prototype work?",
    prerequisites: ["design-brief"],
  },
  design_continue: {
    phase: "design",
    command: "/supervibe-design --continue",
    skill: "supervibe:brandbook",
    nextQuestionRu: "Шаг 1/1: продолжить оставшиеся этапы дизайн-пайплайна до следующего реального gate?",
    nextQuestionEn: "Step 1/1: continue the remaining design pipeline stages until the next real gate?",
    prerequisites: ["design-brief"],
  },
  design_review: {
    phase: "audit",
    command: "/supervibe-audit --design",
    skill: "supervibe:audit",
    nextQuestionRu: "Шаг 1/1: провести дизайн-аудит с evidence, token и accessibility checks?",
    nextQuestionEn: "Step 1/1: run design audit with evidence, token, and accessibility checks?",
    prerequisites: ["design-artifact"],
  },
  design_system_extension: {
    phase: "design",
    command: "/supervibe-design --extend-system",
    skill: "supervibe:brandbook",
    nextQuestionRu: "Шаг 1/1: подготовить узкое расширение дизайн-системы без ребренда?",
    nextQuestionEn: "Step 1/1: prepare a narrow design-system extension without rebrand?",
    prerequisites: ["approved-design-system", "design-brief"],
  },
  mobile_ui: {
    phase: "design",
    command: "/supervibe-design --target mobile-native",
    skill: "supervibe:prototype",
    nextQuestionRu: "Шаг 1/1: запустить мобильный UI flow с platform и touch constraints?",
    nextQuestionEn: "Step 1/1: run the mobile UI flow with platform and touch constraints?",
    prerequisites: ["design-brief"],
  },
  chart_ux: {
    phase: "design",
    command: "/supervibe-design --chart-ux",
    skill: "supervibe:prototype",
    nextQuestionRu: "Шаг 1/1: проработать chart UX с fallback и accessibility evidence?",
    nextQuestionEn: "Step 1/1: work through chart UX with fallback and accessibility evidence?",
    prerequisites: ["design-brief"],
  },
  presentation_deck: {
    phase: "design",
    command: "/supervibe-design --presentation",
    skill: "supervibe:presentation-deck",
    nextQuestionRu: "Шаг 1/1: запустить deck flow с narrative, slide и brand evidence?",
    nextQuestionEn: "Step 1/1: run deck flow with narrative, slide, and brand evidence?",
    prerequisites: ["design-brief"],
  },
  brand_collateral: {
    phase: "design",
    command: "/supervibe-design --brand-collateral",
    skill: "supervibe:brandbook",
    nextQuestionRu: "Шаг 1/1: проработать brand/collateral assets через существующий дизайн-пайплайн?",
    nextQuestionEn: "Step 1/1: work through brand/collateral assets via the existing design pipeline?",
    prerequisites: ["design-brief"],
  },
  stack_ui_guidance: {
    phase: "design",
    command: "/supervibe-design --handoff",
    skill: "supervibe:component-library-integration",
    nextQuestionRu: "Шаг 1/1: подготовить stack-aware UI handoff на базе утвержденных tokens?",
    nextQuestionEn: "Step 1/1: prepare stack-aware UI handoff from approved tokens?",
    prerequisites: ["approved-design-system", "design-artifact"],
  },
  work_control_ui: {
    phase: "status",
    command: "/supervibe-ui",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Шаг 1/1: открыть локальный UI для задач, эпиков, фаз, волн и безопасных действий?",
    nextQuestionEn: "Step 1/1: open the local UI for tasks, epics, phases, waves, and safe actions?",
    prerequisites: [],
  },
  cleanup_stale_work: {
    phase: "maintenance",
    command: "/supervibe-gc --all --dry-run",
    skill: "supervibe:project-memory",
    nextQuestionRu: "Шаг 1/1: показать dry-run очистки старых задач, эпиков и памяти без удаления?",
    nextQuestionEn: "Step 1/1: show a dry-run cleanup for stale tasks, epics, and memory without deleting anything?",
    prerequisites: [],
  },
  agent_strengthen: {
    phase: "maintenance",
    command: "/supervibe-strengthen",
    skill: "supervibe:strengthen",
    nextQuestionRu: "Шаг 1/1: проверить слабых агентов по телеметрии и предложить усиление через user gate?",
    nextQuestionEn: "Step 1/1: inspect weak agents from telemetry and propose strengthening through a user gate?",
    prerequisites: [],
  },
  supervibe_audit: {
    phase: "audit",
    command: "/supervibe-audit",
    skill: "supervibe:audit",
    nextQuestionRu: "Шаг 1/1: провести read-only аудит агентской системы, интентов, receipts, skills, RAG и CodeGraph?",
    nextQuestionEn: "Step 1/1: run a read-only audit of the agent system, intents, receipts, skills, RAG, and CodeGraph?",
    prerequisites: ["user-request"],
  },
  agent_provisioning: {
    phase: "setup",
    command: "node <resolved-supervibe-plugin-root>/scripts/provision-agents.mjs",
    skill: "supervibe:genesis",
    nextQuestionRu: "Шаг 1/1: показать dry-run установки недостающих агентов и обновления host instructions?",
    nextQuestionEn: "Step 1/1: show the dry-run for installing missing agents and refreshing host instructions?",
    prerequisites: ["user-request"],
  },
  memory_audit: {
    phase: "audit",
    command: "/supervibe-audit --memory",
    skill: "supervibe:audit",
    nextQuestionRu: "Шаг 1/1: проверить memory/RAG/codegraph/context качество, свежесть и расход токенов?",
    nextQuestionEn: "Step 1/1: audit memory/RAG/codegraph/context quality, freshness, and token cost?",
    prerequisites: [],
  },
  docs_audit: {
    phase: "audit",
    command: "/supervibe-audit --docs",
    skill: "supervibe:audit",
    nextQuestionRu: "Шаг 1/1: проверить docs на устаревшие и внутренние dev-артефакты?",
    nextQuestionEn: "Step 1/1: audit docs for stale and internal development artifacts?",
    prerequisites: [],
  },
  workflow_chain_audit: {
    phase: "audit",
    command: "/supervibe-audit --workflow-chain",
    skill: "supervibe:audit",
    nextQuestionRu: "Шаг 1/1: провести read-only аудит зрелости цепочки brainstorm -> plan -> execute-plan -> loop на кейсы, риски и feature bloat?",
    nextQuestionEn: "Step 1/1: run a read-only maturity audit of brainstorm -> plan -> execute-plan -> loop for cases, risks, and feature bloat?",
    prerequisites: ["user-request"],
  },
  source_truth_research: {
    phase: "research",
    command: "/supervibe-audit --source-of-truth",
    skill: "supervibe:audit",
    nextQuestionRu: "Шаг 1/1: выбрать источник правды, проверить конфликты и свежесть перед выводами?",
    nextQuestionEn: "Step 1/1: select the source of truth, check conflicts and freshness before findings?",
    prerequisites: ["user-request"],
  },
  visual_explanation: {
    phase: "planning",
    command: "/supervibe-plan --visual-summary",
    skill: "supervibe:writing-plans",
    nextQuestionRu: "Шаг 1/1: показать текстовую схему/таблицу с понятным summary перед планированием?",
    nextQuestionEn: "Step 1/1: show a text-first scheme/table summary before planning?",
    prerequisites: ["user-request"],
  },
  task_readiness_intake: {
    phase: "intake",
    command: "/supervibe-plan --intake",
    skill: "supervibe:requirements-intake",
    nextQuestionRu: "Шаг 1/1: довести сырую задачу до readiness gate перед передачей агентам?",
    nextQuestionEn: "Step 1/1: turn the raw task into a readiness-gated packet before assigning agents?",
    prerequisites: ["user-request"],
  },
  plugin_update_repair: {
    phase: "maintenance",
    command: "npm run supervibe:upgrade",
    skill: "supervibe:verification",
    nextQuestionRu: "Шаг 1/1: запустить управляемое обновление плагина с восстановлением tracked drift?",
    nextQuestionEn: "Step 1/1: run managed plugin update with tracked drift restore?",
    prerequisites: [],
  },
  figma_source_of_truth: {
    phase: "design",
    command: "/supervibe-design --figma-source-of-truth",
    skill: "supervibe:design-intelligence",
    nextQuestionRu: "Шаг 1/1: пройти Figma source-of-truth flow: variables/components -> tokens -> prototype -> code -> drift audit?",
    nextQuestionEn: "Step 1/1: run the Figma source-of-truth flow: variables/components -> tokens -> prototype -> code -> drift audit?",
    prerequisites: ["design-brief"],
  },
};

const RULES = [
  {
    intent: "genesis_setup",
    confidence: 0.93,
    test: (text) => hasAny(text, ["genesis", "supervibe-genesis", "set up", "setup", "bootstrap", "scaffold", "install", "initialize", "генезис", "разверн"]) &&
      hasAny(text, ["supervibe", "host instruction", "agents", "skills", "rules", "codex", "claude", "cursor", "gemini", "opencode", "AGENTS.md"]),
  },
  {
    intent: "index_repair",
    confidence: 0.92,
    test: (text) => hasAny(text, ["broken rag", "index health", "repair index", "stale index", "code index"]) && hasAny(text, ["repair", "health", "gate", "fix", "show"]),
  },
  {
    intent: "preview_server",
    confidence: 0.91,
    test: (text) => hasAny(text, ["preview", "preview server"]) && hasAny(text, ["silent", "daemon", "background"]),
  },
  {
    intent: "delivery_control",
    confidence: 0.9,
    test: (text) => hasAny(text, ["stop after delivery", "resume later", "save state", "post-delivery"]) && hasAny(text, ["stop", "resume", "state"]),
  },
  {
    intent: "worktree_autonomous_run",
    confidence: 0.92,
    test: (text) => hasAny(text, ["worktree", "separate workspace", "isolated session"]) && hasAny(text, ["parallel sessions", "multiple sessions", "10 sessions", "same plan", "same epic"]),
  },
  {
    intent: "worktree_autonomous_run",
    confidence: 0.94,
    test: (text) => hasAny(text, ["worktree", "отдельном worktree"]) && hasAny(text, ["автоном", "epic", "эпик", "3 часа", "3h"]),
  },
  {
    intent: "autonomous_epic_run",
    confidence: 0.91,
    test: (text) => hasAny(text, ["автоном", "autonom"]) && hasAny(text, ["эпик", "epic", "3 часа", "3h"]),
  },
  {
    intent: "create_epic",
    confidence: 0.9,
    test: (text) => hasAny(text, ["создай эпик", "создай задачи и эпик", "create epic", "epic"]) && hasAny(text, ["план", "plan", "child tasks"]),
  },
  {
    intent: "task_graph_split",
    confidence: 0.91,
    test: (text) => hasAny(text, ["разбей задачу", "разбей подзадачу", "создай подзадачи", "split task", "split into subtasks", "break task into subtasks", "create subtasks"]) &&
      hasAny(text, ["задач", "подзадач", "task", "subtask"]),
  },
  {
    intent: "atomize_plan",
    confidence: 0.9,
    test: (text) => hasAny(text, ["атомар", "атомиз", "atomic", "разбей план", "break plan"]) && hasAny(text, ["план", "plan"]),
  },
  {
    intent: "plan_review",
    confidence: 0.91,
    test: (text) => hasAny(text, ["ревью", "review", "проверь"]) && hasAny(text, ["план", "plan"]),
  },
  {
    intent: "documentation_summary_gate",
    confidence: 0.96,
    test: (text) => hasAny(text, ["summary before docs", "summary before documentation", "summarize before writing docs", "before creating documentation", "before creating docs", "decide before docs", "саммари", "сводка", "summary"]) &&
      hasAny(text, ["documentation", "docs", "spec", "документац", "доку", "док"]) &&
      hasAny(text, ["before", "approval", "decide", "create", "write", "до", "перед", "соглас", "создан"]),
  },
  {
    intent: "brainstorm_to_plan",
    confidence: 0.9,
    test: (text) => hasAny(text, ["брейншторм", "brainstorm"]) && hasAny(text, ["готов", "done", "finished", "после", "next", "дальше", "план", "plan"]),
  },
  {
    intent: "execute_plan",
    confidence: 0.87,
    test: (text) => hasAny(text, ["сделай по плану", "выполни план", "execute plan", "run plan"]),
  },
  {
    intent: "trigger_diagnostics",
    confidence: 0.9,
    test: (text) => hasAny(text, ["почему не сработал", "trigger fail", "diagnose trigger", "триггер не"]),
  },
  {
    intent: "why_trigger",
    confidence: 0.88,
    test: (text) => hasAny(text, ["почему выбрал", "why did you choose", "why this skill", "why-trigger"]),
  },
  {
    intent: "task_graph_remaining",
    confidence: 0.93,
    test: (text) => hasAny(text, ["что осталось по задачам", "какие задачи остались", "покажи оставшиеся задачи", "покажи задачи", "список задач", "remaining tasks", "what remains", "what is left"]) &&
      hasAny(text, ["задач", "task", "tasks", "work", "эпик", "epic"]),
  },
  {
    intent: "ready_query",
    confidence: 0.84,
    test: (text) => hasAny(text, ["что готово", "готовые задачи", "покажи готовые задачи", "ready work", "ready tasks"]),
  },
  {
    intent: "blocked_query",
    confidence: 0.84,
    test: (text) => hasAny(text, ["что заблокировано", "blocked", "blockers"]),
  },
  {
    intent: "task_graph_resume",
    confidence: 0.9,
    test: (text) => hasAny(text, ["продолжи loop", "продолжи работу", "вернуться к задачам", "вернуться к проекту с задачами", "вернись к проекту с задачами", "вернись к задачам", "resume loop", "resume task graph", "continue task graph"]) &&
      hasAny(text, ["эпик", "эпикам", "задач", "tasks", "epic", "graph", "loop"]),
  },
  {
    intent: "task_graph_claim_ready",
    confidence: 0.9,
    test: (text) => hasAny(text, ["claim next ready task", "claim ready task", "возьми следующую задачу", "забери следующую задачу"]) &&
      hasAny(text, ["ready", "готов", "задач", "task"]),
  },
  {
    intent: "task_graph_create_from_plan",
    confidence: 0.94,
    test: (text) => hasAny(text, ["создай задачи из плана", "создай задачи и эпик из плана", "создай эпик и задачи из плана", "создай work items из плана", "create epic tasks from plan", "create tasks from plan", "atomize reviewed plan", "create subtasks from plan", "create work items from plan"]) &&
      hasAny(text, ["план", "plan", "reviewed", "epic", "tasks", "subtasks", "work items"]),
  },
  {
    intent: "task_graph_delete",
    confidence: 0.9,
    test: (text) => hasAny(text, ["удали задачу", "удали подзадачу", "удали эпик", "delete task", "delete subtask", "delete epic"]) &&
      hasAny(text, ["задач", "task", "subtask", "подзадач", "эпик", "epic"]),
  },
  {
    intent: "task_graph_split",
    confidence: 0.89,
    test: (text) => hasAny(text, ["разбей задачу", "разбей подзадачу", "создай подзадачи", "split task", "split into subtasks", "break task into subtasks", "create subtasks"]) &&
      hasAny(text, ["задач", "подзадач", "task", "subtask"]),
  },
  {
    intent: "task_graph_reparent",
    confidence: 0.89,
    test: (text) => hasAny(text, ["перенеси задачу", "перемести задачу", "перенеси подзадачу", "move task", "reparent task", "change parent"]) &&
      hasAny(text, ["задач", "подзадач", "эпик", "task", "parent", "subtask", "epic"]),
  },
  {
    intent: "task_graph_skip",
    confidence: 0.88,
    test: (text) => hasAny(text, ["пропусти задачу", "пропусти подзадачу", "пропусти эпик", "skip task", "skip subtask", "skip epic"]) &&
      hasAny(text, ["задач", "подзадач", "эпик", "причин", "task", "reason", "subtask", "epic"]),
  },
  {
    intent: "task_graph_defer",
    confidence: 0.88,
    test: (text) => hasAny(text, ["отложи задачу", "отложи подзадачу", "defer task", "postpone task"]) &&
      hasAny(text, ["задач", "подзадач", "потом", "task", "until", "later"]),
  },
  {
    intent: "task_graph_block",
    confidence: 0.88,
    test: (text) => hasAny(text, ["заблокируй задачу", "заблокируй подзадачу", "пометь задачу заблокированной", "block task", "mark task blocked"]) &&
      hasAny(text, ["задач", "подзадач", "причин", "task", "reason", "block"]),
  },
  {
    intent: "task_graph_edit",
    confidence: 0.9,
    test: (text) => hasAny(text, ["измени задачу", "измени подзадачу", "измени эпик", "измени цель loop", "изменить цель loop", "поменяй цель loop", "edit task", "change task", "update task", "edit epic", "change epic", "update epic", "change loop goal", "update loop goal"]) &&
      hasAny(text, ["задач", "task", "subtask", "подзадач", "эпик", "epic", "цель", "goal", "loop"]),
  },
  {
    intent: "task_graph_validate_completion",
    confidence: 0.91,
    test: (text) => hasAny(text, ["проверь готовность эпика", "готовность эпика к продакшену", "validate epic completion", "validate epic readiness", "production readiness"]) &&
      hasAny(text, ["эпик", "epic", "completion", "prod", "production", "продакшен"]),
  },
  {
    intent: "task_graph_stale_query",
    confidence: 0.95,
    test: (text) => hasAny(text, ["stale claims", "stale tasks"]) &&
      hasAny(text, ["task", "claim"]) &&
      hasAny(text, ["show", "list", "status", "query", "find", "inspect"]),
  },
  {
    intent: "task_graph_orphan_query",
    confidence: 0.95,
    test: (text) => hasAny(text, ["orphan tasks", "orphan evidence", "unlinked tasks"]) &&
      hasAny(text, ["task", "evidence", "graph"]) &&
      hasAny(text, ["show", "list", "status", "query", "find", "inspect"]),
  },
  {
    intent: "readme_update",
    confidence: 0.84,
    test: (text) => hasAny(text, ["readme", "ридми"]) && hasAny(text, ["обнови", "update", "sync"]),
  },
  {
    intent: "supervibe_audit",
    confidence: 0.93,
    test: (text) => hasAny(text, ["agent system", "agents", "агентская система", "агентской системы", "агенты"]) &&
      hasAny(text, ["audit", "check", "review", "score", "maturity", "out of 10", "10 из 10", "аудит", "проверь", "оцени", "зрелость"]) &&
      hasAny(text, ["intent", "routing", "router", "receipts", "skills", "rag", "codegraph", "semantic", "интент", "роут", "маршрут", "скил", "рецепт", "семантичес"]),
  },
  {
    intent: "security_audit",
    confidence: 0.93,
    test: (text) => hasAny(text, ["security", "appsec", "vulnerability", "vulnerabilities", "owasp", "cve", "secret", "секьюрити", "безопасность", "уязвимость", "уязвимости"]) && hasAny(text, ["audit", "scan", "review", "check", "провер", "аудит"]),
  },
  {
    intent: "source_truth_research",
    confidence: 0.96,
    test: (text) => hasAny(text, ["source of truth", "source-of-truth", "truth conflict", "official source", "primary source", "external vendor", "vendor documentation", "источник правды", "источник истины"]) &&
      hasAny(text, ["research", "audit", "validate", "resolve", "compare", "check", "исслед", "аудит", "провер"]),
  },
  {
    intent: "visual_explanation",
    confidence: 0.9,
    test: (text) => hasAny(text, ["diagram", "flowchart", "mermaid", "visual", "visually", "show visually", "диаграм", "визуаль"]) &&
      hasAny(text, ["explain", "show", "logic", "system", "task", "plan", "architecture", "объясн", "покаж", "логик", "систем", "задач"]),
  },
  {
    intent: "task_readiness_intake",
    confidence: 0.91,
    test: (text) => hasAny(text, ["raw task", "vague task", "unclear task", "not ready", "requirements intake", "readiness", "сырая задача", "сырую задачу", "готовность"]) &&
      hasAny(text, ["before agents", "before assigning", "intake", "requirements", "agents start", "агент", "требован", "проработ"]),
  },
  {
    intent: "plugin_update_repair",
    confidence: 0.93,
    test: (text) => hasAny(text, ["update plugin", "upgrade plugin", "plugin update", "supervibe upgrade", "обнови плагин", "обновление плагина"]) &&
      hasAny(text, ["local drift", "local changes", "tracked drift", "replace with upstream", "upstream files", "локальн", "изменен", "замен"]),
  },
  {
    intent: "network_ops",
    confidence: 0.92,
    test: (text) => hasAny(text, ["router", "network", "wifi", "wi-fi", "vpn", "firewall", "nat", "dhcp", "dns", "роутер", "маршрутизатор", "вайфай", "сеть"]) && hasAny(text, ["diagnose", "configure", "stabilize", "fix", "setup", "не работает", "падает", "настро", "стабил"]),
  },
  {
    intent: "prompt_ai_engineering",
    confidence: 0.92,
    test: (text) => hasAny(text, ["prompt", "system prompt", "agent prompt", "instructions", "intent", "router", "промпт", "интент"]) && hasAny(text, ["engineer", "improve", "harden", "debug", "eval", "injection", "усиль", "улучши", "проверь"]),
  },
  {
    intent: "work_control_ui",
    confidence: 0.91,
    test: (text) => hasAny(text, ["kanban", "board", "канбан", "доска"]) && hasAny(text, ["task", "tasks", "epic", "epics", "agent", "agents", "задач", "эпик", "агент"]),
  },
  {
    intent: "presentation_deck",
    confidence: 0.93,
    test: (text) => hasAny(text, ["deck", "presentation", "слайд", "презентац"]) && hasAny(text, ["design", "дизайн", "make", "сделай", "build"]),
  },
  {
    intent: "brand_collateral",
    confidence: 0.9,
    test: (text) => hasAny(text, ["logo", "collateral", "cip", "brand asset", "логотип", "фирстиль"]) && hasAny(text, ["design", "дизайн", "сделай", "asset", "mockup"]),
  },
  {
    intent: "chart_ux",
    confidence: 0.92,
    test: (text) => hasAny(text, ["chart", "graph", "data viz", "график", "диаграм"]) && hasAny(text, ["ux", "design", "дизайн", "a11y", "accessibility"]),
  },
  {
    intent: "mobile_ui",
    confidence: 0.93,
    test: (text) => hasAny(text, ["mobile", "ios", "android", "touch", "мобиль"]) && hasAny(text, ["ui", "дизайн", "interface", "экран"]),
  },
  {
    intent: "design_system_extension",
    confidence: 0.88,
    test: (text) => hasAny(text, ["extend design system", "design-system extension", "расшир", "дизайн-систем"]) && hasAny(text, ["token", "component", "tokens", "компонент"]),
  },
  {
    intent: "design_continue",
    confidence: 0.89,
    test: (text) => hasAny(text, ["continue", "next stages", "remaining stages", "продолж", "дальше", "следующие этап", "оставшиеся этап"]) &&
      (hasDesignSurface(text) || hasAny(text, ["stage", "stages", "этап", "prototype", "прототип", "mockup", "макет"])),
  },
  {
    intent: "design_review",
    confidence: 0.87,
    test: (text) => hasAny(text, ["ui review", "design audit", "проверь дизайн", "аудит дизайна", "полиш", "polish"]),
  },
  {
    intent: "stack_ui_guidance",
    confidence: 0.86,
    test: (text) => hasAny(text, ["shadcn", "tailwind", "next.js", "react", "vue", "svelte"]) && hasAny(text, ["ui", "handoff", "design", "tokens", "дизайн"]),
  },
  {
    intent: "design_new",
    confidence: 0.85,
    test: (text) => hasDesignSurface(text) && hasAny(text, ["make", "build", "create", "redesign", "explore", "сделай", "создай", "создани", "нарисуй", "улучши", "изучи", "используй", "проработай", "подготовь"]),
  },
];

export function routeTriggerRequest(input, options = {}) {
  const request = typeof input === "string" ? input : input?.request;
  const providedArtifacts = typeof input === "object" && input?.artifacts ? input.artifacts : options.artifacts ?? {};
  const requestText = String(request ?? "").trim();
  const artifacts = requestText
    ? {
        request: requestText,
        userRequest: requestText,
        ...providedArtifacts,
      }
    : providedArtifacts;
  const text = normalize(request ?? "");
  const locale = detectLocale(text);
  const corpus = options.corpus ?? getTriggerIntentCorpus();

  const resolvedCommand = resolveCommandRequest(text, commandCatalogOptions(options));
  if (resolvedCommand?.intent === "missing_slash_command") {
    return routeGenericResolvedCommand(resolvedCommand, artifacts, locale);
  }
  if (resolvedCommand?.intent === "slash_command" && resolvedCommand.doNotSearchProject === true) {
    return routeGenericResolvedCommand(resolvedCommand, artifacts, locale);
  }

  const commandMatch = matchSlashCommand(text);
  if (commandMatch) {
    const route = ROUTES[commandMatch.intent];
    const routeArtifacts = inferSlashCommandArtifacts({
      request,
      command: route.command,
      prerequisites: route.prerequisites,
      artifacts,
    });
    return withArtifactStatus(
      withRoutingEvidence({
        intent: commandMatch.intent,
        phase: route.phase,
        command: route.command,
        skill: route.skill,
        confidence: 1,
        confidenceFloor: 0.99,
        mutationRisk: mutationRiskFor(commandMatch.intent),
        prerequisites: route.prerequisites,
        requiredSafety: requiredSafetyFor(commandMatch.intent),
        nextQuestion: locale === "ru" ? route.nextQuestionRu : route.nextQuestionEn,
        alternatives: alternativesFromRoutes(commandMatch.intent),
        matchedPhrase: route.command,
        source: "exact-command",
        reason: `Exact slash command match: ${route.command}`,
      }, [{
        source: "exact-command",
        reason: `Exact slash command match: ${route.command}`,
        matchedPhrase: route.command,
      }], alternativesFromRoutes(commandMatch.intent)),
      routeArtifacts,
    );
  }

  if (resolvedCommand?.doNotSearchProject && shouldPreemptTriggerRouting(resolvedCommand, text)) {
    if (resolvedCommand.directRoute !== false && ROUTES[resolvedCommand.intent]) {
      return routeResolvedKnownCommand(resolvedCommand, artifacts, locale);
    }
    return routeGenericResolvedCommand(resolvedCommand, artifacts, locale);
  }

  const commandShortcut = findCommandShortcut(text);
  if (commandShortcut && commandShortcut.directRoute !== false && ROUTES[commandShortcut.intent]) {
    const route = ROUTES[commandShortcut.intent];
    return withArtifactStatus(
      withRoutingEvidence({
        intent: commandShortcut.intent,
        phase: route.phase,
        command: commandShortcut.command,
        followUpCommands: commandShortcut.followUpCommands || [],
        skill: route.skill,
        confidence: commandShortcut.confidence,
        confidenceFloor: 0.9,
        mutationRisk: mutationRiskFor(commandShortcut.intent),
        prerequisites: route.prerequisites,
        requiredSafety: requiredSafetyFor(commandShortcut.intent),
        nextQuestion: locale === "ru" ? route.nextQuestionRu : route.nextQuestionEn,
        alternatives: alternativesFromRoutes(commandShortcut.intent),
        matchedPhrase: commandShortcut.matchedAlias || null,
        source: "command-catalog",
        reason: commandShortcut.reason,
      }, [{
        source: "command-catalog",
        reason: commandShortcut.reason,
        matchedPhrase: commandShortcut.matchedAlias || null,
      }], alternativesFromRoutes(commandShortcut.intent)),
      artifacts,
    );
  }

  const exact = corpus.find((entry) => normalize(entry.phrase) === text);
  if (exact) {
    return withArtifactStatus(
      withRoutingEvidence({
        ...exact,
        confidence: 1,
        nextQuestion: localizeQuestion(exact, locale),
        alternatives: alternativesFor(exact.intent, corpus),
        matchedPhrase: exact.phrase,
        source: "exact-corpus",
        reason: `Exact corpus match: ${exact.id}`,
      }, [{
        source: "exact-corpus",
        reason: `Exact corpus match: ${exact.id}`,
        matchedPhrase: exact.phrase,
      }], alternativesFor(exact.intent, corpus)),
      artifacts,
    );
  }

  const keywordScored = RULES
    .filter((rule) => rule.test(text))
    .map((rule) => ({ ...rule, source: "keyword-rule", reason: `Keyword route: ${rule.intent}` }));
  const semanticScored = rankSemanticIntents(text)
    .filter((candidate) => ROUTES[candidate.intent])
    .map((candidate) => ({
      intent: candidate.intent,
      confidence: candidate.confidence,
      source: candidate.source,
      reason: candidate.reason,
      semanticEvidence: {
        matchedGroups: candidate.matchedGroups,
        painMatches: candidate.painMatches,
      },
    }));
  const scored = [...keywordScored, ...semanticScored]
    .sort((a, b) => b.confidence - a.confidence || sourcePriority(b.source) - sourcePriority(a.source));
  if (scored.length > 0) {
    const route = ROUTES[scored[0].intent];
    return withArtifactStatus(
      withRoutingEvidence({
        intent: scored[0].intent,
        phase: route.phase,
        command: route.command,
        skill: route.skill,
        confidence: scored[0].confidence,
        confidenceFloor: scored[0].confidence,
        mutationRisk: mutationRiskFor(scored[0].intent),
        prerequisites: route.prerequisites,
        requiredSafety: requiredSafetyFor(scored[0].intent),
        nextQuestion: locale === "ru" ? route.nextQuestionRu : route.nextQuestionEn,
        alternatives: scored.slice(1, 4).map((rule) => ({ intent: rule.intent, confidence: rule.confidence })),
        matchedPhrase: null,
        semanticEvidence: scored[0].semanticEvidence,
        source: scored[0].source,
        reason: scored[0].reason,
      }, evidenceFor(scored[0]), scored.slice(1, 4).map((rule) => ({
        intent: rule.intent,
        confidence: rule.confidence,
        source: rule.source,
        reason: rule.reason,
      }))),
      artifacts,
    );
  }

  if (resolvedCommand?.doNotSearchProject && resolvedCommand.semanticScriptMatch) {
    return routeGenericResolvedCommand(resolvedCommand, artifacts, locale);
  }

  return withRoutingEvidence({
    intent: "unknown",
    phase: "diagnostics",
    command: "/supervibe --diagnose-trigger",
    skill: "supervibe:trigger-diagnostics",
    confidence: 0,
    confidenceFloor: 0.8,
    mutationRisk: "none",
    prerequisites: ["user-request"],
    requiredSafety: ["confirm-before-mutation"],
    nextQuestion: locale === "ru"
      ? "Триггер не распознан. Показать диагностику и ближайшие маршруты?"
      : "Trigger was not recognized. Show diagnostics and nearest routes?",
    alternatives: [],
    missingArtifacts: [],
    safetyBlockers: [],
    matchedPhrase: null,
    reason: "No corpus or keyword match",
    clarifyingQuestion: true,
  }, [{
    source: "fallback",
    reason: "No corpus or keyword match",
  }], []);
}

export function evaluateIntentGoldenCorpus(corpus = []) {
  const results = corpus.map((entry) => {
    const route = routeTriggerRequest(entry.phrase);
    const failures = [];
    const expected = entry.expected || {};

    if (expected.intent && route.intent !== expected.intent) {
      failures.push(`expected intent ${expected.intent} but got ${route.intent}`);
    }
    if (expected.notIntent && route.intent === expected.notIntent) {
      failures.push(`expected not to route to ${expected.notIntent}`);
    }
    if (expected.command && route.command !== expected.command) {
      failures.push(`expected command ${expected.command} but got ${route.command}`);
    }
    if (typeof expected.minConfidence === "number" && route.confidence < expected.minConfidence) {
      failures.push(`expected confidence >= ${expected.minConfidence} but got ${route.confidence}`);
    }
    if (expected.clarifyingQuestion && !(route.clarifyingQuestion || route.nextQuestion)) {
      failures.push("expected clarifying question");
    }
    if (!route.routingEvidence?.length) {
      failures.push("missing routing evidence");
    }
    if (!Array.isArray(route.rejectedAlternatives)) {
      failures.push("missing rejected alternatives");
    }

    return {
      id: entry.id,
      phrase: entry.phrase,
      expected,
      pass: failures.length === 0,
      failures,
      route,
    };
  });
  const failed = results.filter((result) => !result.pass);
  return {
    pass: failed.length === 0,
    total: results.length,
    failed,
    results,
  };
}

export function formatIntentGoldenEvaluation(evaluation) {
  const lines = [
    "SUPERVIBE_INTENT_GOLDEN_EVALUATION",
    `PASS: ${evaluation.pass}`,
    `TOTAL: ${evaluation.total}`,
    `FAILED: ${evaluation.failed.length}`,
  ];
  for (const failure of evaluation.failed) {
    lines.push(`- ${failure.id}: ${failure.failures.join("; ")}`);
    lines.push(`  route: ${failure.route.intent} -> ${failure.route.command} (${failure.route.confidence})`);
  }
  return lines.join("\n");
}

function routeResolvedKnownCommand(resolvedCommand, artifacts, locale) {
  const route = ROUTES[resolvedCommand.intent];
  return withArtifactStatus(
    withRoutingEvidence({
      intent: resolvedCommand.intent,
      phase: route.phase,
      command: resolvedCommand.command,
      followUpCommands: resolvedCommand.followUpCommands || [],
      skill: route.skill,
      confidence: resolvedCommand.confidence,
      confidenceFloor: 0.9,
      mutationRisk: mutationRiskFor(resolvedCommand.intent),
      prerequisites: route.prerequisites,
      requiredSafety: requiredSafetyFor(resolvedCommand.intent),
      nextQuestion: locale === "ru" ? route.nextQuestionRu : route.nextQuestionEn,
      alternatives: alternativesFromRoutes(resolvedCommand.intent),
      matchedPhrase: resolvedCommand.matchedAlias || resolvedCommand.requestedCommand || null,
      source: "command-catalog",
      reason: resolvedCommand.reason,
      doNotSearchProject: resolvedCommand.doNotSearchProject === true,
      hardStop: resolvedCommand.hardStop === true,
      stopCondition: resolvedCommand.hardStop ? "report-missing-command" : undefined,
    }, [{
      source: "command-catalog",
      reason: resolvedCommand.reason,
      matchedPhrase: resolvedCommand.matchedAlias || resolvedCommand.requestedCommand || null,
    }], alternativesFromRoutes(resolvedCommand.intent)),
    artifacts,
  );
}

function routeGenericResolvedCommand(resolvedCommand, artifacts, locale) {
  const alternatives = alternativesFromRoutes(resolvedCommand.intent);
  const commandRoute = routeForResolvedSlashCommand(resolvedCommand);
  return withArtifactStatus(
    withRoutingEvidence({
      intent: resolvedCommand.intent,
      phase: commandRoute?.phase || "command",
      command: resolvedCommand.command,
      followUpCommands: resolvedCommand.followUpCommands || [],
      skill: commandRoute?.skill || null,
      commandContext: resolvedCommand.commandContext || null,
      confidence: resolvedCommand.confidence,
      confidenceFloor: 0.9,
      mutationRisk: mutationRiskForResolvedCommand(resolvedCommand),
      prerequisites: [],
      requiredSafety: requiredSafetyForResolvedCommand(resolvedCommand),
      nextQuestion: nextQuestionForResolvedCommand(resolvedCommand, locale),
      alternatives,
      matchedPhrase: resolvedCommand.matchedAlias || resolvedCommand.requestedCommand || null,
      source: "command-catalog",
      reason: resolvedCommand.reason,
      doNotSearchProject: resolvedCommand.doNotSearchProject === true,
      hardStop: resolvedCommand.hardStop === true,
      stopCondition: resolvedCommand.hardStop ? "report-missing-command" : undefined,
    }, [{
      source: "command-catalog",
      reason: resolvedCommand.reason,
      matchedPhrase: resolvedCommand.matchedAlias || resolvedCommand.requestedCommand || null,
    }], alternatives),
    artifacts,
  );
}

function routeForResolvedSlashCommand(resolvedCommand = {}) {
  const commandId = resolvedCommand.commandId || slashCommandId(resolvedCommand.command || "");
  if (!commandId) return null;
  return Object.values(ROUTES).find((route) => slashCommandId(route.command) === commandId) || null;
}

function shouldPreemptTriggerRouting(resolvedCommand, text = "") {
  if (resolvedCommand.semanticScriptMatch) return false;
  if (resolvedCommand.requestedCommand) return true;
  if (resolvedCommand.intent === "code_index_build") return true;
  if (resolvedCommand.intent === "plan_then_execute") return true;
  if (resolvedCommand.command === "/supervibe-genesis") return true;
  if (NO_SLASH_COMMAND_PREEMPT_IDS.has(slashCommandId(resolvedCommand.command || ""))) {
    if (slashCommandId(resolvedCommand.command || "") === "/supervibe-update" && isPluginDriftRepairRequest(text)) {
      return false;
    }
    return true;
  }
  return ["slash_command", "missing_slash_command", "project_npm_script", "plugin_npm_script", "missing_npm_script"].includes(resolvedCommand.intent);
}

function isPluginDriftRepairRequest(text = "") {
  return hasAny(text, ["update plugin", "upgrade plugin", "plugin update", "supervibe upgrade", "обнови плагин", "обновление плагина"]) &&
    hasAny(text, ["local drift", "local changes", "tracked drift", "replace with upstream", "upstream files", "локальн", "изменен", "замен"]);
}

function commandCatalogOptions(options = {}) {
  return {
    pluginRoot: options.pluginRoot ?? options.commandCatalog?.pluginRoot ?? process.cwd(),
    projectRoot: options.projectRoot ?? options.commandCatalog?.projectRoot ?? process.cwd(),
    shortcuts: options.commandCatalog?.shortcuts,
  };
}

function withArtifactStatus(route, artifacts) {
  const missingArtifacts = route.prerequisites.filter((name) => !artifactSatisfied(name, artifacts));
  const safetyBlockers = safetyBlockersFor(route, artifacts);
  return { ...route, missingArtifacts, safetyBlockers };
}

function artifactSatisfied(name, artifacts) {
  const aliases = {
    "brainstorm-artifact-or-summary": ["brainstorm", "brainstormSummary", "spec"],
    "plan-path-or-plan-content": ["plan", "planPath", "planContent"],
    "reviewed-plan": ["planReviewPassed", "reviewedPlan", "planReview"],
    "epic-id": ["epic", "epicId"],
    "approved-scope": ["approvedScope", "approval", "approvals"],
    "clean-or-isolated-worktree": ["worktreeClean", "worktreePath"],
    "explicit-budget": ["durationBudget", "maxDuration", "maxLoops"],
    "readiness-audit": ["readinessAudit", "planReviewPassed"],
    "accepted-change-summary": ["changeSummary", "acceptedChangeSummary"],
    "design-brief": ["designBrief", "brief", "request", "userRequest"],
    "design-artifact": ["prototype", "prototypePath", "designArtifact", "screenshot", "figmaFile"],
    "approved-design-system": ["approvedDesignSystem", "designSystemApproved", "designSystem"],
    "user-request": ["request", "userRequest"],
    "last-route": ["lastRoute"],
  };
  const keys = aliases[name] ?? [name];
  return keys.some((key) => Boolean(artifacts[key]));
}

function safetyBlockersFor(route, artifacts) {
  const blockers = [];
  if (!["none", "writes-generated-index", "explicit-user-command", "delegates-to-command"].includes(route.mutationRisk) && artifacts.confirmedMutation !== true) {
    blockers.push("needs-explicit-user-confirmation");
  }
  if (route.requiredSafety?.includes("goal-stop-condition") && artifacts.goalStopCondition === false) {
    blockers.push("needs-goal-stop-condition");
  }
  if (route.requiredSafety?.includes("stop-command") && artifacts.stopCommandAvailable === false) {
    blockers.push("stop-command-unavailable");
  }
  if (artifacts.providerPolicyReviewed === false) {
    blockers.push("provider-policy-review-required");
  }
  return blockers;
}

function alternativesFor(intent, corpus) {
  return [...new Set(corpus.filter((entry) => entry.intent !== intent).map((entry) => entry.intent))]
    .slice(0, 3)
    .map((candidate) => ({ intent: candidate, confidence: 0.5 }));
}

function alternativesFromRoutes(intent) {
  return Object.keys(ROUTES)
    .filter((candidate) => candidate !== intent)
    .slice(0, 3)
    .map((candidate) => ({ intent: candidate, confidence: 0.5 }));
}

function localizeQuestion(entry, locale) {
  if (locale === "en") {
    const route = ROUTES[entry.intent];
    return route?.nextQuestionEn ?? entry.nextQuestionIncludes;
  }
  return entry.nextQuestionIncludes;
}

function mutationRiskFor(intent) {
  if (intent === "code_index_build") return "writes-generated-index";
  if (["autonomous_epic_run", "execute_plan"].includes(intent)) return "executes-code";
  if (intent === "worktree_autonomous_run") return "creates-worktree";
  if (["atomize_plan", "create_epic"].includes(intent)) return "writes-tracker";
  if (intent === "plugin_update_repair") return "explicit-user-command";
  if (["brainstorm_to_plan", "documentation_summary_gate", "readme_update", "design_new", "design_continue", "design_system_extension", "mobile_ui", "chart_ux", "presentation_deck", "brand_collateral", "stack_ui_guidance", "agent_strengthen", "agent_provisioning", "prompt_ai_engineering", "figma_source_of_truth"].includes(intent)) return "writes-docs";
  return "none";
}

function mutationRiskForResolvedCommand(resolvedCommand) {
  if (!resolvedCommand.command) return "none";
  if (resolvedCommand.mutationRisk === "writes-generated-index") return "writes-generated-index";
  if (resolvedCommand.mutationRisk === "delegates-to-slash-command") return "delegates-to-command";
  if (["slash_command", "plugin_npm_script"].includes(resolvedCommand.intent)) return "delegates-to-command";
  if (resolvedCommand.intent === "project_npm_script") return "explicit-user-command";
  return resolvedCommand.mutationRisk || "explicit-user-command";
}

function requiredSafetyFor(intent) {
  const base = ["no-provider-bypass", "no-hidden-background-work", "confirm-before-mutation"];
  if (intent === "code_index_build") return [...base, "bounded-index-run", "single-run-lock", "generated-state-only"];
  if (intent === "supervibe_audit") return [...base, "read-only-audit", "agent-system-coverage", "receipt-provenance-check", "semantic-route-coverage"];
  if (intent === "genesis_setup") return [...base, "dry-run-before-host-file-write", "preserve-existing-host-files"];
  if (["autonomous_epic_run", "worktree_autonomous_run"].includes(intent)) {
    return [...base, "goal-stop-condition", "stop-command", intent === "worktree_autonomous_run" ? "worktree-cleanup" : "side-effect-ledger"];
  }
  if (intent === "execute_plan") return [...base, "readiness-gate", "completion-gate"];
  if (intent === "security_audit") return [...base, "read-only-audit", "scoped-approval-before-fix"];
  if (intent === "source_truth_research") return [...base, "source-hierarchy", "freshness-check", "conflict-resolution-log"];
  if (intent === "workflow_chain_audit") return [...base, "read-only-audit", "source-hierarchy", "workflow-chain-coverage", "scope-bloat-check", "pitfall-review", "end-to-end-goal-check"];
  if (intent === "documentation_summary_gate") return [...base, "documentation-approval-before-write", "summary-before-durable-artifact", "post-documentation-summary"];
  if (intent === "visual_explanation") return [...base, "text-first-visual-summary", "optional-browser-preview-for-ui-only", "no-unverified-implementation-claims"];
  if (intent === "task_readiness_intake") return [...base, "requirements-gate", "raw-task-block", "acceptance-criteria-required"];
  if (intent === "plugin_update_repair") return [...base, "managed-checkout-drift-restore", "mirror-clean-assertion"];
  if (intent === "network_ops") return [...base, "read-only-diagnostics", "scoped-approval-before-network-mutation"];
  if (intent === "prompt_ai_engineering") return [...base, "eval-before-claim", "tool-boundary-review"];
  if (intent === "agent_provisioning") return [...base, "dry-run-before-host-file-write", "refresh-managed-instructions", "no-agent-emulation"];
  if (intent === "design_new") return [...base, "creative-direction-first", "preference-coverage-matrix", "design-system-approval-gate"];
  if (intent === "design_continue") return [...base, "resume-design-flow-state", "final-gates-cannot-be-delegated"];
  return base;
}

function requiredSafetyForResolvedCommand(resolvedCommand) {
  if (!resolvedCommand.command) return ["do-not-search-project", "report-missing-command"];
  if (resolvedCommand.intent === "slash_command") return ["do-not-search-project", "slash-command-owns-safety"];
  if (resolvedCommand.intent === "plugin_npm_script") return ["do-not-search-project", "portable-plugin-command"];
  if (resolvedCommand.intent === "project_npm_script") return ["do-not-search-project", "explicit-user-command"];
  return ["do-not-search-project", "run-resolved-command"];
}

function nextQuestionForResolvedCommand(resolvedCommand, locale) {
  if (!resolvedCommand.command) {
    return locale === "ru"
      ? "Шаг 1/1: сообщить, что команда не найдена, и не искать её по всему проекту?"
      : "Step 1/1: report the missing command and avoid a repo-wide search?";
  }
  if (resolvedCommand.intent === "slash_command") {
    return locale === "ru"
      ? "Шаг 1/1: выполнить найденную slash-команду без поиска по проекту?"
      : "Step 1/1: run the resolved slash command without searching the project?";
  }
  return locale === "ru"
    ? "Шаг 1/1: выполнить найденную команду без поиска по проекту?"
    : "Step 1/1: run the resolved command without searching the project?";
}

function sourcePriority(source) {
  if (source === "exact-command") return 4;
  if (source === "exact-corpus") return 3;
  if (source === "semantic-intent-profile") return 2;
  if (source === "keyword-rule") return 1;
  return 0;
}

function detectLocale(text) {
  return /[а-яё]/i.test(text) ? "ru" : "en";
}

function hasAny(text, phrases) {
  return phrases.some((phrase) => text.includes(normalize(phrase)));
}

function matchSlashCommand(text) {
  if (!text.startsWith("/")) return null;
  return Object.entries(ROUTES)
    .map(([intent, route]) => ({ intent, command: normalize(route.command).split(" ")[0] }))
    .sort((a, b) => b.command.length - a.command.length)
    .find((candidate) => text === candidate.command || text.startsWith(`${candidate.command} `)) || null;
}

function inferSlashCommandArtifacts({ request = "", command = "", prerequisites = [], artifacts = {} } = {}) {
  if (!prerequisites.includes("design-brief") && !prerequisites.includes("user-request")) return artifacts;
  const rest = slashCommandRest(request, command);
  if (!rest || isFlagOnlyRest(rest)) return artifacts;
  return {
    ...artifacts,
    request: artifacts.request || rest,
    userRequest: artifacts.userRequest || rest,
    ...(prerequisites.includes("design-brief") ? { designBrief: artifacts.designBrief || rest } : {}),
  };
}

function slashCommandRest(request = "", command = "") {
  const raw = String(request || "").trim();
  const firstToken = String(command || "").trim().split(/\s+/)[0];
  if (!raw.toLowerCase().startsWith(firstToken.toLowerCase())) return "";
  return raw.slice(firstToken.length).trim();
}

function isFlagOnlyRest(rest = "") {
  const tokens = String(rest || "").trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => token.startsWith("-") || /^[-\w]+=[^\s]+$/.test(token));
}

function evidenceFor(candidate) {
  return [{
    source: candidate.source,
    reason: candidate.reason,
    matchedPhrase: candidate.matchedPhrase || null,
    semanticEvidence: candidate.semanticEvidence,
  }];
}

function withRoutingEvidence(route, evidence, rejectedAlternatives) {
  const commandId = slashCommandId(route.command);
  const capability = getCapabilityRouteHint(route.intent) || getCapabilityRouteHint(commandId || route.command);
  const agentProfile = route.agentProfile || (commandId ? getCommandAgentProfile(commandId) : null);
  const locale = detectLocale(`${route.nextQuestion || ""} ${route.reason || ""}`);
  const routingEvidence = evidence.filter(Boolean);
  const questionSurface = route.questionSurface || buildCommandQuestionSurface(commandId || route.command || route.intent, route, {
    locale,
    request: route.matchedPhrase || route.reason || route.command || route.intent,
    evidence: routingEvidence.map((item) => item.reason || item.matchedPhrase || item.source).filter(Boolean),
  });
  const questionSurfaceIssues = validateQuestionSurface(questionSurface, {
    surface: `${route.intent || "route"}:${commandId || route.command || "diagnostic"}`,
  });
  const questionChoices = route.questionChoices || questionSurface.choices || buildRouteQuestionChoices(route, {
    locale,
    commandId,
    agentProfile,
    rejectedAlternatives: rejectedAlternatives || [],
  });
  return {
    ...route,
    agentContract: route.agentContract || (agentProfile ? copyCommandAgentContract() : null),
    agentProfile,
    capabilityId: capability?.capabilityId || null,
    verificationHooks: capability?.verificationHooks || [],
    toolMetadata: { required: Boolean(capability?.toolMetadataRequired), deterministicOrder: true, intentScoped: true },
    retrievalPolicy: decideRetrievalPolicy({ taskText: `${route.intent} ${route.command} ${route.reason || ""}` }),
    routingEvidence,
    rejectedAlternatives: rejectedAlternatives || [],
    questionSurface,
    questionSurfaceIssues,
    visibleQuestionPrompt: route.visibleQuestionPrompt || questionSurface.prompt,
    questionChoices,
    questionEvidence: questionSurface.evidence || routingEvidence.map((item) => item.reason || item.matchedPhrase || item.source).filter(Boolean),
    questionSpecialist: questionSurface.specialist || agentProfile?.ownerAgentId || route.skill || capability?.capabilityId || "supervibe-orchestrator",
    questionArtifactImpact: questionSurface.artifactImpact || route.questionArtifactImpact || routeArtifactImpact(route, locale),
  };
}

function buildRouteQuestionChoices(route, { locale = "en", commandId = null, agentProfile = null, rejectedAlternatives = [] } = {}) {
  const subject = routeQuestionSubject(route, locale);
  const command = visibleRouteCommand(route.command);
  const specialist = agentProfile?.ownerAgentId || route.skill || "selected Supervibe specialist";
  const hasCommand = Boolean(route.command);
  if (!hasCommand || route.hardStop) {
    return locale === "ru"
      ? [
        { id: "report-missing", label: `Сообщить, что ${subject} недоступна`, tradeoff: "Останавливает маршрут без поиска по проекту и без побочных действий.", recommended: true },
        { id: "show-nearest", label: "Показать ближайшие маршруты", tradeoff: "Даст диагностический список без запуска команд." },
        { id: "stop", label: "Остановиться без маршрутизации", tradeoff: "Сохраняет текущий контекст и не делает скрытых действий." },
      ]
      : [
        { id: "report-missing", label: `Report that ${subject} is unavailable`, tradeoff: "Stops the route without a repo-wide search or side effects.", recommended: true },
        { id: "show-nearest", label: "Show nearest routes", tradeoff: "Returns diagnostic options without running a command." },
        { id: "stop", label: "Stop without routing", tradeoff: "Keeps the current context and performs no hidden action." },
      ];
  }

  if (locale === "ru") {
    return [
      {
        id: "run-routed-action",
        label: `Запустить ${subject}`,
        tradeoff: `Использует ${command} и ${specialist}; дальше действуют safety gates и receipts.`,
        recommended: true,
      },
      {
        id: "inspect-evidence-first",
        label: `Сначала проверить evidence для ${subject}`,
        tradeoff: "Покажет prerequisites, blockers, routing evidence и не запустит мутации.",
      },
      {
        id: "compare-nearby-routes",
        label: rejectedAlternatives.length ? "Сравнить соседние маршруты" : "Показать, почему выбран этот маршрут",
        tradeoff: "Поможет сменить путь до запуска команды, если intent был понят неверно.",
      },
      {
        id: "stop",
        label: "Остановиться без запуска",
        tradeoff: "Сохраняет текущий контекст и не выполняет команду скрыто.",
      },
    ];
  }

  return [
    {
      id: "run-routed-action",
      label: `Run ${subject}`,
      tradeoff: `Uses ${command} with ${specialist}; safety gates and receipts still apply.`,
      recommended: true,
    },
    {
      id: "inspect-evidence-first",
      label: `Inspect evidence for ${subject} first`,
      tradeoff: "Shows prerequisites, blockers, and routing evidence before any mutation.",
    },
    {
      id: "compare-nearby-routes",
      label: rejectedAlternatives.length ? "Compare nearby routes" : "Show why this route was selected",
      tradeoff: "Lets you switch paths before the command runs if the intent was misunderstood.",
    },
    {
      id: "stop",
      label: "Stop without running",
      tradeoff: "Keeps the current context and does not execute the command silently.",
    },
  ];
}

function routeQuestionSubject(route, locale = "en") {
  if (route.intent === "unknown") return locale === "ru" ? "диагностика триггера" : "trigger diagnostics";
  if (route.intent === "missing_slash_command" || route.intent === "missing_npm_script") {
    return route.command || route.matchedPhrase || (locale === "ru" ? "команда" : "command");
  }
  const intent = String(route.intent || "workflow").replace(/_/g, " ");
  const phase = String(route.phase || "").replace(/_/g, " ");
  if (locale === "ru") {
    if (route.command?.startsWith("/supervibe-design")) return "дизайн-маршрут по текущему брифу";
    if (route.command?.includes("loop")) return "agent loop по текущему work item";
    if (route.command?.includes("plan")) return "плановый маршрут по текущему артефакту";
    return `${intent}${phase ? ` (${phase})` : ""}`;
  }
  if (route.command?.startsWith("/supervibe-design")) return "the design route for this brief";
  if (route.command?.includes("loop")) return "the agent loop for this work item";
  if (route.command?.includes("plan")) return "the planning route for this artifact";
  return `${intent}${phase ? ` (${phase})` : ""}`;
}

function visibleRouteCommand(command = "") {
  const value = String(command || "").trim();
  return value || "the resolved command";
}

function routeArtifactImpact(route, locale = "en") {
  const command = visibleRouteCommand(route.command);
  if (locale === "ru") {
    return `Ответ решает, запускать ли ${command}, сначала показать evidence или остановить маршрут без скрытого продолжения.`;
  }
  return `The answer decides whether ${command} runs, evidence is shown first, or the route stops without hidden continuation.`;
}

function slashCommandId(command = "") {
  const value = String(command || "").trim();
  if (!value.startsWith("/supervibe")) return null;
  return value.split(/\s+/)[0];
}

function hasDesignSurface(text) {
  const creativeVariantSurface = hasAny(text, ["creative", "креатив"]) &&
    hasAny(text, ["variant", "variants", "direction", "directions", "format", "вариант", "варианты", "направлен", "формат"]);
  const feedbackOverlaySurface = hasAny(text, ["feedback overlay", "feedback-over", "фидбек оверлей", "фидбек overlay", "оверлей", "overlay"]) &&
    hasAny(text, ["variant", "variants", "prototype", "mockup", "plugin", "вариант", "варианты", "прототип", "макет", "плагин"]);
  const referencePrototypeSurface = hasAny(text, ["old prototype", "old prototypes", "screen-chat", "screen chat", "старые прототипы", "старых прототипов", "экраны чата", "агентское приложение"]) &&
    hasAny(text, ["new format", "creative", "variant", "prototype", "chat", "новый формат", "креатив", "вариант", "прототип", "чат"]);

  return hasAny(text, ["design", "mockup", "prototype", "user interface", "design variant", "creative variant", "feedback overlay", "app screen", "chat screen", "дизайн", "макет", "мокап", "прототип", "вариант дизайна", "креативный вариант", "фидбек оверлей", "экран чата"]) ||
    creativeVariantSurface ||
    feedbackOverlaySurface ||
    referencePrototypeSurface ||
    /(^| )ui( |$)/.test(text) ||
    /(^| )(look|looks|visual|screen|layout|polish|professional)( |$)/.test(text);
}

function normalize(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}
