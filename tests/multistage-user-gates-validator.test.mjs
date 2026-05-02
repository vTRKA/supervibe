import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateMultistageUserGates,
} from "../scripts/validate-multistage-user-gates.mjs";

test("multistage user-gate validator rejects overlay and delegated approval substitutes", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-user-gates-"));
  const files = {
    "commands/supervibe-design.md": [
      "# /supervibe-design",
      "Preference Intake Gate",
      "Feedback button",
      "Wait for explicit choice",
      "Do NOT proceed silently",
    ].join("\n"),
    "skills/brandbook/SKILL.md": [
      "# Brandbook",
      "Preference Intake Gate",
      "delegated approval markers",
      "Only the visual approval/finalize step is a chat-level gate.",
    ].join("\n"),
    "skills/prototype/SKILL.md": [
      "# Prototype",
      "Preview feedback button is mandatory.",
      "Do NOT proceed without explicit choice.",
    ].join("\n"),
    "skills/landing-page/SKILL.md": [
      "# Landing",
      "Feedback button is mandatory.",
      "Wait for explicit choice.",
    ].join("\n"),
    "skills/preview-server/SKILL.md": [
      "# Preview",
      "The feedback overlay is mandatory for design roots.",
    ].join("\n"),
    "skills/presentation-deck/SKILL.md": [
      "# Presentation Deck",
      "HTML preview, browser feedback, approval, .pptx export.",
      "Feedback prompt.",
    ].join("\n"),
    "commands/supervibe-presentation.md": [
      "# /supervibe-presentation",
      "Intermediate story and slide decisions can be recorded as delegated decisions.",
      "Prompt the user for explicit feedback choice.",
    ].join("\n"),
    "agents/_design/prototype-builder.md": [
      "# prototype-builder",
      "Feedback button in the lower-right corner lets you click any region.",
      "Wait for explicit choice. Do NOT advance silently to handoff.",
    ].join("\n"),
    "agents/_design/presentation-deck-builder.md": [
      "# presentation-deck-builder",
      "Browser feedback entries for this slug are tracked and resolved.",
      "Print the feedback prompt from supervibe:presentation-deck.",
    ].join("\n"),
    "skills/browser-feedback/SKILL.md": [
      "# Browser Feedback",
      "Trigger source: browser-feedback received.",
      "Print feedback prompt to user.",
    ].join("\n"),
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, ...relPath.split("/"));
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, "utf8");
  }

  const result = validateMultistageUserGates(root);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.file === "skills/preview-server/SKILL.md"));
  assert.ok(result.issues.some((issue) => issue.code === "overlay-substitutes-user-gate"));
  assert.ok(result.issues.some((issue) => issue.code === "delegated-substitutes-user-gate"));
});

test("current multistage workflow surfaces preserve explicit user gates", () => {
  const result = validateMultistageUserGates(process.cwd());

  assert.deepEqual(result.issues, []);
  assert.equal(result.pass, true);
});
