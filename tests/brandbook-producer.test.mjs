import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  planBrandbookProducer,
  resolveBrandbookTemplatePath,
} from "../scripts/lib/brandbook-producer-runtime.mjs";
import {
  validateAgentProducerReceipts,
} from "../scripts/lib/agent-producer-contract.mjs";
import {
  validateWorkflowReceipts,
} from "../scripts/lib/supervibe-workflow-receipt-runtime.mjs";

const ROOT = process.cwd();

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("brandbook producer resolves target baselines from plugin root templates", () => {
  assert.equal(
    resolveBrandbookTemplatePath({ pluginRoot: ROOT, target: "tauri" }),
    "templates/brandbook-target-baselines/tauri.md",
  );
});

test("brandbook executable producer promotes scratch outputs and issues skill receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-brandbook-producer-"));
  try {
    const source = ".supervibe/artifacts/prototypes/_design-system/.scratch/run-1";
    await writeUtf8(root, ".supervibe/artifacts/prototypes/agent-chat/config.json", JSON.stringify({
      target: "tauri",
      mode: "design-system-only",
      viewports: [{ width: 1440, height: 900 }],
    }, null, 2));
    await writeUtf8(root, `${source}/tokens.css`, ":root { --color-primary-500: #123456; }\n");
    await writeUtf8(root, `${source}/manifest.json`, JSON.stringify({ version: "1.0.0", status: "candidate" }, null, 2));
    await writeUtf8(root, `${source}/design-flow-state.json`, JSON.stringify({ design_system: { status: "candidate" } }, null, 2));
    await writeUtf8(root, `${source}/styleboard.html`, "<!doctype html><html><body><main>Styleboard</main></body></html>\n");
    await writeUtf8(root, `${source}/components/button.md`, "# Button\n\n## Anatomy\n\n## States\n\n## Variants\n\n## Tokens\n");

    const output = execFileSync(process.execPath, [
      join(ROOT, "scripts", "brandbook-producer.mjs"),
      "run",
      "--root",
      root,
      "--plugin-root",
      ROOT,
      "--source",
      source,
      "--handoff",
      "agent-chat",
      "--slug",
      "agent-chat",
      "--target",
      "tauri",
      "--secret",
      "test-secret",
    ], { cwd: ROOT, encoding: "utf8" });

    assert.match(output, /SUPERVIBE_BRANDBOOK_PRODUCER_RUN/);
    assert.match(output, /PASS: true/);
    assert.equal(existsSync(join(root, ".supervibe", "artifacts", "prototypes", "_design-system", "tokens.css")), true);
    assert.equal(existsSync(join(root, ".supervibe", "artifacts", "prototypes", "_design-system", "components", "button.md")), true);

    const receiptResult = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(receiptResult.pass, true);
    assert.equal(receiptResult.receipts, 1);
    const producerResult = validateAgentProducerReceipts(root, { secret: "test-secret" });
    assert.equal(producerResult.pass, true);
    assert.equal(producerResult.skillReceipts, 1);

    const configSnapshots = await readFile(
      join(root, ".supervibe", "artifacts", "_workflow-invocations", "supervibe-design", "agent-chat", "artifact-links.json"),
      "utf8",
    );
    assert.match(configSnapshots, /tokens\.css/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("brandbook producer rerun keeps receipt ledger trusted", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-brandbook-rerun-"));
  try {
    const source = ".supervibe/artifacts/prototypes/_design-system/.scratch/run-1";
    await writeUtf8(root, `${source}/tokens.css`, ":root { --color-primary-500: #123456; }\n");
    await writeUtf8(root, `${source}/manifest.json`, JSON.stringify({ version: "1.0.0", status: "candidate" }, null, 2));
    await writeUtf8(root, `${source}/design-flow-state.json`, JSON.stringify({ design_system: { status: "candidate" } }, null, 2));
    await writeUtf8(root, `${source}/styleboard.html`, "<!doctype html><html><body><main>Styleboard</main></body></html>\n");

    for (const stamp of ["2026-05-04T00:00:00.000Z", "2026-05-04T00:01:00.000Z"]) {
      execFileSync(process.execPath, [
        join(ROOT, "scripts", "brandbook-producer.mjs"),
        "run",
        "--root",
        root,
        "--plugin-root",
        ROOT,
        "--source",
        source,
        "--handoff",
        "agent-chat",
        "--slug",
        "agent-chat",
        "--target",
        "web",
        "--run-timestamp",
        stamp,
        "--secret",
        "test-secret",
      ], { cwd: ROOT, encoding: "utf8" });
    }

    const receiptResult = validateWorkflowReceipts(root, { secret: "test-secret" });
    assert.equal(receiptResult.pass, true);
    assert.equal(receiptResult.receipts, 1);
    assert.equal(receiptResult.ledgerEntries, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("brandbook producer plan blocks incomplete source packets before durable writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-brandbook-producer-plan-"));
  try {
    const source = ".supervibe/artifacts/prototypes/_design-system/.scratch/bad";
    await writeUtf8(root, `${source}/tokens.css`, ":root { --color-primary-500: #123456; }\n");

    const plan = planBrandbookProducer({
      rootDir: root,
      pluginRoot: ROOT,
      sourceDir: source,
      target: "web",
      handoffId: "agent-chat",
    });

    assert.equal(plan.pass, false);
    assert.ok(plan.issues.some((issue) => /manifest\.json/.test(issue) || /design-flow-state\.json/.test(issue)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
