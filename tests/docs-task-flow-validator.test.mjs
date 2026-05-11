import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";

import { validateDocsTaskFlow } from "../scripts/validate-docs-task-flow.mjs";

test("docs task flow validator accepts canonical graph-first docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-doc-flow-"));
  await writeDoc(root, "README.md", canonicalReadme());
  await writeDoc(root, "README.ru.md", canonicalReadme());
  await writeDoc(root, "commands/supervibe-brainstorm.md", "text-first summary policy");
  await writeDoc(root, "commands/supervibe-plan.md", "text-first summary policy");
  await writeDoc(root, "commands/supervibe-loop.md", "text-first summary policy. direct plan execution is legacy diagnostic-only.");

  const report = validateDocsTaskFlow(root);

  assert.equal(report.pass, true);
});

test("docs task flow validator rejects browser-first requirement", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-doc-flow-fail-"));
  await writeDoc(root, "README.md", canonicalReadme());
  await writeDoc(root, "README.ru.md", canonicalReadme());
  await writeDoc(root, "commands/supervibe-brainstorm.md", "browser-first visual packet");
  await writeDoc(root, "commands/supervibe-plan.md", "text-first summary policy");
  await writeDoc(root, "commands/supervibe-loop.md", "direct plan execution is legacy diagnostic-only.");

  const report = validateDocsTaskFlow(root);

  assert.equal(report.pass, false);
  assert.ok(report.issues.some((issue) => /browser-first visual packet/i.test(issue)));
});

function canonicalReadme() {
  return [
    "/supervibe-plan --review .supervibe/artifacts/plans/example.md",
    "/supervibe-loop --atomize-plan .supervibe/artifacts/plans/example.md --plan-review-passed",
    "/supervibe-ui",
  ].join("\n");
}

async function writeDoc(root, file, text) {
  const path = join(root, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${text}\n`, "utf8");
}
