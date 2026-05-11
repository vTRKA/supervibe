import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateVisualExplanationArtifact,
} from "../scripts/validate-visual-explanation-artifacts.mjs";

const GOOD_HTML = `<!doctype html>
<html>
<head>
  <title>Documentation Approval Path</title>
</head>
<body data-visual-mode="browser-first">
  <h1>Documentation Approval Path</h1>
  <section>
    <h2>Audience summary</h2>
    <p>Beginner users see summary, approval choice, artifact, and next action cards.</p>
  </section>
  <section>
    <h2>Text fallback</h2>
    <p>Show summary, ask for documentation approval, write only after approval, then show next actions.</p>
  </section>
  <section>
    <h2>Stop condition</h2>
    <p>No durable documentation is written when the user chooses revise, preview, research, or stop.</p>
  </section>
  <p>No color-only status is used.</p>
</body>
</html>`;

const GOOD_MARKDOWN = `# Documentation Approval Path

Visual mode: table-only approved.

| Step | Meaning | Stop condition |
|------|---------|----------------|
| Summary | User reviews the outcome | user rejects summary |
| Approval | User chooses whether to create docs | no durable write |

Audience summary: beginner users can choose create, revise, preview, research, or stop.
Text fallback: summary comes first, documentation write happens only after approval, and next actions are shown after validation.
Stop condition: stop before file creation when approval is missing.
No color-only status is used.

\`\`\`mermaid
flowchart TD
  %% accTitle: Documentation approval path
  %% accDescr: Summary appears before durable documentation and every branch has a stop condition.
  A[Summary] --> B{Approval}
\`\`\`
`;

test("validateVisualExplanationArtifact accepts browser-first HTML", () => {
  assert.deepEqual(validateVisualExplanationArtifact(GOOD_HTML), []);
});

test("validateVisualExplanationArtifact accepts table-only Markdown with Mermaid fallback", () => {
  assert.deepEqual(validateVisualExplanationArtifact(GOOD_MARKDOWN), []);
});

test("validateVisualExplanationArtifact rejects weak visual artifacts", () => {
  const issues = validateVisualExplanationArtifact("# Weak\n\nA diagram goes here.");
  assert.ok(issues.some((issue) => issue.includes("visual mode")));
  assert.ok(issues.some((issue) => issue.includes("Text fallback")));
});

test("validate-visual-explanation-artifacts CLI validates explicit file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "visual-explanation-validator-"));
  const file = join(dir, "index.html");
  await writeFile(file, GOOD_HTML, "utf8");
  const stdout = execFileSync(process.execPath, [
    "scripts/validate-visual-explanation-artifacts.mjs",
    "--file",
    file,
  ], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(stdout, /All 1 visual explanation artifact\(s\) passed/);
});

test("validate-visual-explanation-artifacts CLI fails missing artifacts when output was claimed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "visual-explanation-claimed-missing-"));
  const scriptPath = fileURLToPath(new URL("../scripts/validate-visual-explanation-artifacts.mjs", import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [
    scriptPath,
    "--all",
    "--require-claimed",
  ], {
    cwd: dir,
    encoding: "utf8",
    stdio: "pipe",
  }), /claimed visual explanation artifacts are required/);
});
