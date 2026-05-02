import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validateProjectArtifactRoot,
} from "../scripts/validate-project-artifact-root.mjs";

test("project artifact root validator rejects legacy project-root artifact paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-root-"));
  const file = "commands/example.md";
  const absPath = join(root, ...file.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, "Write the spec to docs/specs/example.md, the audit to docs/audits/security.md, and the prototype to prototypes/example/index.html\n", "utf8");

  const result = validateProjectArtifactRoot(root, [file]);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.legacy === "docs/specs/"));
  assert.ok(result.issues.some((issue) => issue.legacy === "docs/audits/"));
  assert.ok(result.issues.some((issue) => issue.legacy === "prototypes/"));
});

test("project artifact root validator rejects nested .supervibe artifact roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-artifact-root-"));
  const file = "commands/example.md";
  const absPath = join(root, ...file.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(
    absPath,
    "Write brand direction to .supervibe/artifacts/prototypes/_.supervibe/artifacts/brandbook/direction.md\n",
    "utf8",
  );

  const result = validateProjectArtifactRoot(root, [file]);

  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === "nested-supervibe-artifact-root"));
});

test("current instruction surfaces keep Supervibe artifacts under .supervibe", () => {
  const result = validateProjectArtifactRoot(process.cwd());

  assert.equal(result.pass, true);
  assert.deepEqual(result.issues, []);
});
