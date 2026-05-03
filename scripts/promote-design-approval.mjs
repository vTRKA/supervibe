#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import {
  promoteDesignApprovalState,
} from "./lib/design-approval-promotion.mjs";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

export function formatDesignApprovalPromotionReport(result) {
  const lines = [
    "SUPERVIBE_DESIGN_APPROVAL_PROMOTION",
    `PASS: ${result.pass}`,
    `UPDATED_FILES: ${result.updatedFiles.length}`,
    `CREATED_FILES: ${result.createdFiles.length}`,
    `ISSUES: ${result.issues.length}`,
  ];
  for (const file of result.updatedFiles) lines.push(`UPDATED: ${file}`);
  for (const file of result.createdFiles) lines.push(`CREATED: ${file}`);
  for (const issue of result.issues) lines.push(`ISSUE: ${issue}`);
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await promoteDesignApprovalState(arg("--root", process.cwd()), {
    slug: arg("--slug", ""),
    approvedBy: arg("--approved-by", "user"),
    approvedAt: arg("--approved-at", new Date().toISOString()),
    feedbackHash: arg("--feedback-hash", "manual-approval"),
    approvalScope: arg("--approval-scope", "full"),
  });
  console.log(formatDesignApprovalPromotionReport(result));
  process.exit(result.pass ? 0 : 1);
}
