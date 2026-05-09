import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateApiContract } from "../scripts/validate-api-contracts.mjs";

const FIXTURE = "tests/fixtures/artifacts/api-contracts/agent-readiness-api-contract.md";

test("validateApiContract accepts complete contract fixture", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  assert.deepEqual(validateApiContract(markdown), []);
});

test("validateApiContract requires error envelope and retry semantics", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const issues = validateApiContract(
    markdown
      .replace("## Error Envelope", "## Errors")
      .replace("- Idempotency key: command input path and current workspace state.", "")
  );

  assert.ok(issues.some((issue) => issue.includes("Error Envelope")));
  assert.ok(issues.some((issue) => issue.includes("Idempotency key")));
});

test("validateApiContract requires frontend integration states", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const issues = validateApiContract(markdown.replace("- Error state: dashboard shows failing check evidence.", ""));
  assert.ok(issues.some((issue) => issue.includes("Error state")));
});

test("validateApiContract requires mock scenarios and verification", async () => {
  const markdown = await readFile(FIXTURE, "utf8");
  const issues = validateApiContract(
    markdown
      .replace("- Retry or timeout scenario: rerun after fixing artifacts.", "")
      .replace("- Contract lint command: `npm run validate:api-contracts`.", "")
  );
  assert.ok(issues.some((issue) => issue.includes("Retry or timeout")));
  assert.ok(issues.some((issue) => issue.includes("Contract lint command")));
});

test("validate-api-contracts CLI validates fixture directory", () => {
  const stdout = execFileSync(process.execPath, [
    "scripts/validate-api-contracts.mjs",
    "--fixture-dir",
    "tests/fixtures/artifacts/api-contracts",
  ], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
  });
  assert.match(stdout, /All 1 API contract artifact\(s\) passed/);
});

test("validate-api-contracts CLI fails bad file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "api-contract-validator-"));
  const file = join(dir, "bad.md");
  await writeFile(file, "# API Contract: Bad\n\n## Contract Overview\nToo thin.");
  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-api-contracts.mjs", "--file", file], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8",
    stdio: "pipe",
  }));
});

