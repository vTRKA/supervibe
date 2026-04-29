import { readFile, writeFile } from "node:fs/promises";

export function createAmendment({ sourceTaskId, evidence, reason, task }) {
  return {
    amendmentId: `amend-${sourceTaskId}-${Date.now()}`,
    sourceTaskId,
    evidence: evidence || [],
    reason,
    task,
    confidenceCapUntilResolved: 8.0,
    status: "open",
  };
}

export async function appendPlanAmendment(planPath, amendment) {
  const content = await readFile(planPath, "utf8");
  const section = [
    "",
    "## Loop Amendments",
    "",
    `- [ ] ${amendment.amendmentId}: ${amendment.reason}`,
    `  - Source task: ${amendment.sourceTaskId}`,
    `  - Confidence cap until resolved: ${amendment.confidenceCapUntilResolved}`,
    "",
  ].join("\n");
  const next = content.includes("## Loop Amendments")
    ? `${content.trimEnd()}\n- [ ] ${amendment.amendmentId}: ${amendment.reason}\n`
    : `${content.trimEnd()}\n${section}`;
  await writeFile(planPath, next, "utf8");
}
