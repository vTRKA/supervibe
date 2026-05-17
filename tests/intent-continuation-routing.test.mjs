import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function withTempProject(fn) {
  const root = mkdtempSync(join(tmpdir(), "supervibe-continuation-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeActiveState(root, overrides = {}) {
  const dir = join(root, ".supervibe", "memory");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "active-workflow.json"), JSON.stringify({
    schemaVersion: 1,
    command: "/supervibe-plan",
    stage: "plan-review",
    question: null,
    choices: [],
    acceptedAnswer: null,
    artifacts: [
      { id: "plan", path: ".supervibe/artifacts/plans/example.md" },
    ],
    receipts: [
      { id: "receipt-1", path: ".supervibe/artifacts/_workflow-invocations/example.json" },
    ],
    ...overrides,
  }, null, 2), "utf8");
}

function matchCommand(request, projectRoot) {
  return execFileSync(process.execPath, [
    join(ROOT, "scripts", "supervibe-commands.mjs"),
    "--project",
    projectRoot,
    "--match",
    request,
  ], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

test("bare continuation phrases route to safe workflow resume dispatch without active state", () => {
  withTempProject((root) => {
    for (const request of ["Продолжи", "продолжи", "давай дальше", "ок продолжай", "go on", "continue"]) {
      const output = matchCommand(request, root);

      assert.match(output, /MATCH: workflow-continuation-fallback/);
      assert.match(output, /INTENT: task_graph_resume/);
      assert.match(output, /COMMAND: \/supervibe-loop --resume-dispatch/);
      assert.match(output, /SELECTED_BECAUSE: bare-continuation-no-active-state/);
    }
  });
});

test("active plan continuation follows an explicit review next command", () => {
  withTempProject((root) => {
    writeActiveState(root, {
      stage: "plan-review",
      nextCommand: "/supervibe-plan --review",
      nextAction: "run active plan review",
    });

    const output = matchCommand("Продолжи", root);

    assert.match(output, /MATCH: active-workflow-continuation/);
    assert.match(output, /INTENT: plan_review/);
    assert.match(output, /COMMAND: \/supervibe-plan --review/);
    assert.match(output, /SELECTED_BECAUSE: bare-continuation-active-workflow/);
  });
});

test("active reviewed plan continuation routes to atomization", () => {
  withTempProject((root) => {
    writeActiveState(root, {
      stage: "plan-review-passed",
      nextCommand: undefined,
      nextAction: undefined,
    });

    const output = matchCommand("continue", root);

    assert.match(output, /MATCH: active-workflow-continuation/);
    assert.match(output, /INTENT: atomize_plan/);
    assert.match(output, /COMMAND: \/supervibe-loop --atomize-plan \.supervibe\/artifacts\/plans\/example\.md --user-approved-plan/);
  });
});

test("active atomization continuation routes to Supervibe UI before execution", () => {
  withTempProject((root) => {
    writeActiveState(root, {
      command: "/supervibe-loop",
      stage: "work-item-atomization",
      nextCommand: undefined,
      nextAction: undefined,
    });

    const output = matchCommand("go on", root);

    assert.match(output, /MATCH: active-workflow-continuation/);
    assert.match(output, /INTENT: workflow_ui/);
    assert.match(output, /COMMAND: \/supervibe-ui/);
    assert.match(output, /NEXT: Resume active workflow: open active epic\/task UI before execution\./);
  });
});

test("continuation diagnostics report close command-catalog candidates", () => {
  withTempProject((root) => {
    writeActiveState(root, {
      command: "/supervibe-loop",
      stage: "executing",
      nextCommand: "/supervibe-loop --resume-dispatch",
      nextAction: "continue active execution",
    });

    const output = matchCommand("продолжай работу и добавь исправление чтобы агенты не зависали", root);

    assert.match(output, /MATCH: active-workflow-continuation/);
    assert.match(output, /COMMAND: \/supervibe-loop --resume-dispatch/);
    assert.match(output, /CLOSE_CANDIDATE: semantic-trigger:agent_provisioning intent=agent_provisioning/);
  });
});
