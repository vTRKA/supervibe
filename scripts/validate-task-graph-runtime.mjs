#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const CASES = Object.freeze({
  "full-flow": ["tests/task-graph-full-flow.test.mjs"],
  loop: ["tests/supervibe-loop-work-items.test.mjs"],
  atomize: ["tests/supervibe-plan-to-work-items.test.mjs"],
  actions: ["tests/supervibe-work-item-actions.test.mjs"],
  ui: ["tests/supervibe-ui-server.test.mjs"],
  sync: ["tests/supervibe-task-tracker-sync.test.mjs"],
  worktree: ["tests/supervibe-worktree-session-manager.test.mjs"],
  completion: ["tests/supervibe-epic-completion-validator.test.mjs"],
});

export function buildTaskGraphRuntimePlan({ selectedCase = "all" } = {}) {
  const names = selectedCase === "all"
    ? Object.keys(CASES)
    : [selectedCase];
  const unknown = names.filter((name) => !CASES[name]);
  if (unknown.length) {
    return {
      pass: false,
      cases: names,
      files: [],
      issues: unknown.map((name) => `unknown case: ${name}`),
    };
  }
  return {
    pass: true,
    cases: names,
    files: [...new Set(names.flatMap((name) => CASES[name]))],
    issues: [],
  };
}

export function formatTaskGraphRuntimeReport(report = {}) {
  const lines = [
    "SUPERVIBE_TASK_GRAPH_RUNTIME",
    `PASS: ${report.pass === true}`,
    `CASES: ${(report.cases || []).join(",") || "none"}`,
    `TEST_FILES: ${(report.files || []).length}`,
  ];
  for (const file of report.files || []) lines.push(`FILE: ${file}`);
  for (const issue of report.issues || []) lines.push(`ISSUE: ${issue}`);
  if (report.command) lines.push(`COMMAND: ${report.command}`);
  if (report.outputSummary) lines.push(`OUTPUT: ${report.outputSummary}`);
  return lines.join("\n");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { case: "all" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") args.help = true;
    else if (item === "--json") args.json = true;
    else if (item === "--case") args.case = argv[++index] || "all";
  }
  return args;
}

function usage() {
  return [
    "SUPERVIBE_TASK_GRAPH_RUNTIME_HELP",
    "USAGE:",
    "  node scripts/validate-task-graph-runtime.mjs",
    "  node scripts/validate-task-graph-runtime.mjs --case full-flow",
    `CASES: all, ${Object.keys(CASES).join(", ")}`,
  ].join("\n");
}

if (process.argv[1]?.endsWith("validate-task-graph-runtime.mjs")) {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const plan = buildTaskGraphRuntimePlan({ selectedCase: args.case });
  if (!plan.pass) {
    console.log(args.json ? JSON.stringify(plan, null, 2) : formatTaskGraphRuntimeReport(plan));
    process.exit(2);
  }
  const command = `${process.execPath} --test ${plan.files.join(" ")}`;
  try {
    const output = execFileSync(process.execPath, ["--test", ...plan.files], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
    const report = {
      ...plan,
      command,
      outputSummary: output.split(/\r?\n/).filter((line) => /tests|pass|fail|duration/i.test(line)).slice(-8).join(" | "),
    };
    console.log(args.json ? JSON.stringify(report, null, 2) : formatTaskGraphRuntimeReport(report));
  } catch (error) {
    const report = {
      ...plan,
      pass: false,
      command,
      issues: [
        `runtime tests failed with exit code ${error.status ?? 1}`,
        String(error.stdout || error.stderr || error.message).slice(0, 2000),
      ],
    };
    console.log(args.json ? JSON.stringify(report, null, 2) : formatTaskGraphRuntimeReport(report));
    process.exit(error.status || 1);
  }
}
