#!/usr/bin/env node
import { auditPluginPackage } from "./lib/supervibe-plugin-package-audit.mjs";

const args = new Set(process.argv.slice(2));
const audit = await auditPluginPackage({ rootDir: process.cwd() });

if (args.has("--json")) {
  console.log(JSON.stringify(audit, null, 2));
} else {
  console.log("SUPERVIBE_PLUGIN_PACKAGE_AUDIT");
  console.log(`PASS: ${audit.pass}`);
  console.log(`SCORE: ${audit.score}/10`);
  console.log(`ISSUES: ${audit.issues.length}`);
  for (const issue of audit.issues) {
    console.log(`- ${issue.code}: ${issue.message}`);
    console.log(`  NEXT_ACTION: ${issue.nextAction}`);
  }
  if (audit.warnings.length > 0) {
    console.log(`WARNINGS: ${audit.warnings.length}`);
    for (const warning of audit.warnings) console.log(`- ${warning.code}: ${warning.message}`);
  }
}

if (!audit.pass) process.exit(1);
