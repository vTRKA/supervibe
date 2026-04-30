#!/usr/bin/env node
import {
  INSTALL_LIFECYCLE_REPORT_PATH,
  runInstallLifecycleAudit,
} from "./lib/supervibe-install-lifecycle-audit.mjs";

const audit = await runInstallLifecycleAudit();

console.log("SUPERVIBE_INSTALL_DOCTOR");
console.log(`Version:        ${audit.version || "unknown"}`);
console.log(`Score:          ${audit.score}/10`);
console.log(`Package audit:  ${audit.packageAudit.pass ? "pass" : "fail"} (${audit.packageAudit.score}/10)`);
console.log(`Registry:       ${audit.issues.some((issue) => issue.code === "registry-missing-after-install") ? "missing" : "present"}`);
console.log(`Stale files:    ${audit.staleFiles.length}`);

for (const [host, result] of Object.entries(audit.hostRegistrations)) {
  if (!result.required) continue;
  console.log(`${host.padEnd(14)}${result.ok ? "ok" : "needs attention"} - ${result.message}`);
}

console.log(`Report:         ${INSTALL_LIFECYCLE_REPORT_PATH}`);

if (!audit.pass) {
  console.error("\nInstall lifecycle issues:");
  for (const issue of audit.issues) {
    console.error(`- ${issue.code}: ${issue.message}`);
    if (issue.nextAction) console.error(`  next: ${issue.nextAction}`);
  }
  process.exit(1);
}
