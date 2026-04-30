import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatTriggerMetadataLint,
  lintTriggerMetadata,
} from "../scripts/lib/supervibe-trigger-metadata-linter.mjs";

describe("supervibe trigger metadata linter", () => {
  it("flags weak command descriptions", () => {
    const result = lintTriggerMetadata({
      files: {
        "commands/supervibe.md": "---\ndescription: Use WHEN asked to route TO one command.\n---\n",
      },
    });

    assert.equal(result.pass, false);
    assert.equal(
      result.issues.some((issue) => issue.file === "commands/supervibe.md" && issue.code === "weak-trigger-description"),
      true,
    );
  });

  it("formats lint failures for CLI output", () => {
    const text = formatTriggerMetadataLint({
      pass: false,
      issues: [{ file: "README.md", code: "readme-missing-trigger-workflow", message: "missing workflow" }],
    });

    assert.equal(text, "README.md: readme-missing-trigger-workflow: missing workflow");
  });
});
