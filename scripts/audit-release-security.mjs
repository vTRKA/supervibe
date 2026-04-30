#!/usr/bin/env node
import { createHash } from "node:crypto";
import { auditReleaseSecurity } from "./lib/supervibe-release-security-audit.mjs";

const args = new Set(process.argv.slice(2));
const audit = await auditReleaseSecurity({ rootDir: process.cwd() });

if (args.has("--json")) {
  console.log(JSON.stringify(audit, null, 2));
} else {
  console.log("SUPERVIBE_RELEASE_SECURITY_AUDIT");
  console.log(`PASS: ${audit.pass}`);
  console.log(`SCORE: ${audit.score}/10`);
  console.log(`ISSUES: ${audit.issues.length}`);
  for (const issue of audit.issues) {
    console.log(`- ${issue.code}: ${issue.message}`);
    if (issue.nextAction) console.log(`  next: ${issue.nextAction}`);
  }
  console.log(`WARNINGS: ${audit.warnings.length}`);
  for (const warning of audit.warnings) {
    console.log(`- ${warning.code}: ${warning.message}`);
  }
  console.log(`REPORT_SHA256: ${sha256(audit.reportText)}`);
}

process.exitCode = audit.pass ? 0 : 1;

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
