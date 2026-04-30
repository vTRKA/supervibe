import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  assertYesAllowed,
  createDryRunPreview,
  createNoTtyFallback,
  isInteractiveTerminal,
  requiresTypedConfirmation,
  runInteractiveCli,
  validateInteractiveConfirmation,
} from "../scripts/lib/supervibe-interactive-cli.mjs";

const execFileAsync = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test("interactive CLI falls back safely without a TTY and prints equivalent command", () => {
  const result = runInteractiveCli({ mode: "status", isTTY: false, graphPath: "graph.json" });

  assert.equal(isInteractiveTerminal({ stdin: { isTTY: true }, stdout: { isTTY: true }, env: { CI: "1" } }), false);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 2);
  assert.match(result.output, /SUPERVIBE_INTERACTIVE_FALLBACK/);
  assert.match(result.output, /\/supervibe-status --view ready-now/);
});

test("interactive previews redact data and typed confirmations protect risky actions", () => {
  const preview = createDryRunPreview({
    action: "defer",
    before: { path: "C:\\Users\\alice\\repo", token: "secret-value-that-must-redact" },
    after: { status: "deferred" },
    command: "/supervibe-loop --defer t1",
  });
  const fallback = createNoTtyFallback({ command: "/supervibe-status --interactive" });

  assert.doesNotMatch(preview.output, /secret-value-that-must-redact/);
  assert.equal(requiresTypedConfirmation({ risk: "high" }), true);
  assert.equal(validateInteractiveConfirmation({ expected: "CONFIRM", received: "no", action: { risky: true } }), false);
  assert.equal(validateInteractiveConfirmation({ expected: "CONFIRM", received: "CONFIRM", action: { risky: true } }), true);
  assert.equal(assertYesAllowed({ command: "/supervibe-loop --deploy production", risky: true }, { yes: true }).allowed, false);
  assert.match(fallback.output, /MUTATION: false/);
});

test("status and loop interactive commands return no-tty fallback without mutation", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [join(ROOT, "scripts", "supervibe-status.mjs"), "--interactive", "--no-color"], { cwd: ROOT }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stdout, /SUPERVIBE_INTERACTIVE_FALLBACK/);
      return true;
    },
  );

  await assert.rejects(
    execFileAsync(process.execPath, [join(ROOT, "scripts", "supervibe-loop.mjs"), "--create-work-item", "--interactive"], { cwd: ROOT }),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stdout, /COMMAND: \/supervibe-loop --create-work-item --interactive/);
      return true;
    },
  );
});
