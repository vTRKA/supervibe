import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateDecisionBrief } from "../scripts/validate-decision-briefs.mjs";

const FIXTURE = "tests/fixtures/artifacts/decision-briefs/agent-readiness-decision-brief.md";

test("validateDecisionBrief accepts complete nontechnical decision brief", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  assert.deepEqual(validateDecisionBrief(markdown), []);
});

test("validateDecisionBrief requires accessible visual fallback and next actions", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const issues = validateDecisionBrief(
    markdown
      .replace("accDescr: The user reviews evidence, compares options, and chooses continue, revise, defer, or stop.", "")
      .replace("Text fallback: verify evidence first, compare options and risks, then choose the next action.", "")
      .replace("- [ ] Stop and archive the current artifact.", "")
  );

  assert.ok(issues.some((issue) => issue.includes("accDescr")));
  assert.ok(issues.some((issue) => issue.includes("Text fallback")));
  assert.ok(issues.some((issue) => issue.includes("at least 4 checkbox choices")));
});

test("validateDecisionBrief requires user-facing implementation snapshot", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const issues = validateDecisionBrief(markdown.replace("- API contract impact: API contract template and validator are added.", ""));
  assert.ok(issues.some((issue) => issue.includes("API contract impact")));
});

test("validate-decision-briefs CLI validates fixture directory", () => {
  const stdout = execFileSync(process.execPath, [
    "scripts/validate-decision-briefs.mjs",
    "--fixture-dir",
    "tests/fixtures/artifacts/decision-briefs",
  ], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(stdout, /All 1 decision brief artifact\(s\) passed/);
});

test("validate-decision-briefs CLI fails bad file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "decision-brief-validator-"));
  const file = join(dir, "bad.md");
  await writeFile(file, "# Decision Brief: Bad\n\n## Executive Summary\nToo thin.");
  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-decision-briefs.mjs", "--file", file], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }));
});

