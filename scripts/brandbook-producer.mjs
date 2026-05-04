#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import {
  planBrandbookProducer,
  runBrandbookProducer,
} from "./lib/brandbook-producer-runtime.mjs";

function parseArgs(argv) {
  const options = { operation: argv[2] || "help" };
  for (let index = 3; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      options[key] = true;
      continue;
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return `SUPERVIBE_BRANDBOOK_PRODUCER
USAGE:
  node scripts/brandbook-producer.mjs plan --source <prepared-design-system-dir> --handoff <id> [--slug <prototype-slug>] [--target web|tauri|electron|chrome-extension|mobile-native]
  node scripts/brandbook-producer.mjs run --source <prepared-design-system-dir> --handoff <id> [--slug <prototype-slug>] [--target <target>]

NOTES:
  The producer performs prepare -> write-temp -> validate -> promote -> receipt -> planner-refresh.
  Source packets are prepared in scratch; this CLI is the only path that promotes brandbook skill outputs to durable _design-system files.`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv);
  const rootDir = options.root || process.cwd();
  const pluginRoot = options["plugin-root"] || fileURLToPath(new URL("../", import.meta.url));
  if (options.help || options.h || options.operation === "help") {
    console.log(usage());
    process.exit(0);
  }

  if (options.operation === "plan") {
    const plan = planBrandbookProducer({
      rootDir,
      pluginRoot,
      sourceDir: options.source,
      target: options.target || "web",
      slug: options.slug || null,
      handoffId: options.handoff || options.slug || null,
    });
    console.log(JSON.stringify({ pass: plan.pass, plan }, null, 2));
    process.exit(plan.pass ? 0 : 1);
  }

  if (options.operation === "run") {
    const result = await runBrandbookProducer({
      rootDir,
      pluginRoot,
      sourceDir: options.source,
      target: options.target || "web",
      slug: options.slug || null,
      handoffId: options.handoff || options.slug,
      reason: options.reason || undefined,
      dryRun: options["dry-run"] === true,
      secret: options.secret || null,
    });
    console.log("SUPERVIBE_BRANDBOOK_PRODUCER_RUN");
    console.log(`PASS: ${result.pass}`);
    console.log(`DRY_RUN: ${result.dryRun === true}`);
    console.log(`TRANSACTION: ${result.transactionDir || "none"}`);
    console.log(`OUTPUTS: ${result.promoted?.length || result.plan?.outputs?.length || 0}`);
    console.log(`RECEIPT: ${result.receiptPath || "none"}`);
    console.log(`PRODUCER_OUTPUT: ${result.producerOutputPath || "none"}`);
    for (const phase of result.phases || []) {
      console.log(`PHASE: ${phase.phase} pass=${phase.pass}`);
      for (const issue of phase.issues || []) console.log(`ISSUE: ${issue}`);
    }
    process.exit(result.pass ? 0 : 1);
  }

  console.log(usage());
  process.exit(1);
}
