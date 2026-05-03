import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  diagnoseTriggerRequest,
  formatTriggerDiagnostic,
} from "../scripts/lib/supervibe-trigger-diagnostics.mjs";

describe("supervibe trigger diagnostics", () => {
  it("explains matched triggers and missing artifact context", () => {
    const report = diagnoseTriggerRequest("сделал план, проверь его");

    assert.equal(report.route.intent, "plan_review");
    assert.equal(report.pass, false);
    assert.equal(report.evidence.missingArtifacts.includes("plan-path-or-plan-content"), true);
    assert.equal(report.likelyCause, "The trigger matched, but required artifact context is missing.");
  });

  it("formats a compact diagnostic with command and next question", () => {
    const report = diagnoseTriggerRequest("я сделал брейншторм", {
      artifacts: { brainstormSummary: true },
    });
    const text = formatTriggerDiagnostic(report);

    assert.match(text, /Intent: brainstorm_to_plan/);
    assert.match(text, /Command: \/supervibe-plan/);
    assert.match(text, /Шаг 1\/1: написать план/);
  });
  it("diagnoses unpublished explicit slash commands as hard stops", async () => {
    const pluginRoot = await mkdtemp(join(tmpdir(), "supervibe-diagnostics-plugin-"));
    const commandPath = join(pluginRoot, "commands", "supervibe-status.md");
    try {
      await mkdir(dirname(commandPath), { recursive: true });
      await writeFile(commandPath, "---\ndescription: \"Status command\"\n---\n# /supervibe-status\n", "utf8");
      await writeFile(join(pluginRoot, "package.json"), JSON.stringify({ scripts: {} }, null, 2), "utf8");

      const report = diagnoseTriggerRequest("/supervibe-design create desktop design system", {
        pluginRoot,
        projectRoot: pluginRoot,
      });
      const text = formatTriggerDiagnostic(report);

      assert.equal(report.route.intent, "missing_slash_command");
      assert.equal(report.route.hardStop, true);
      assert.equal(report.pass, false);
      assert.match(report.recommendedAction, /Report the missing command and stop/);
      assert.match(text, /Hard stop: true/);
    } finally {
      await rm(pluginRoot, { recursive: true, force: true });
    }
  });

  it("treats inline slash-command design text as design brief evidence", () => {
    const report = diagnoseTriggerRequest("/supervibe-design create desktop design system for an agent chat app", {
      artifacts: { confirmedMutation: true },
    });

    assert.equal(report.route.intent, "slash_command");
    assert.equal(report.route.command, "/supervibe-design create desktop design system for an agent chat app");
    assert.equal(report.route.skill, null);
    assert.equal(report.route.agentContract.ownerAgentId, "supervibe-orchestrator");
    assert.ok(report.route.agentProfile.requiredAgentIds.includes("creative-director"));
    assert.equal(report.evidence.missingArtifacts.includes("design-brief"), false);
    assert.equal(report.pass, true);
  });
});
