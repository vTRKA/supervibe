import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { versionEnvelope } from "./autonomous-loop-constants.mjs";

export function validateHandoff(handoff) {
  const required = [
    "sourceAgent",
    "targetAgent",
    "taskId",
    "summary",
    "decisions",
    "filesTouched",
    "openRisks",
    "verificationEvidence",
    "confidenceScore",
    "requiredNextAction",
    "blockingQuestions",
  ];
  const missing = required.filter((field) => !(field in handoff));
  if (handoff.verificationEvidence?.length === 0 && handoff.filesTouched?.length > 0) {
    missing.push("verificationEvidence(non-empty for implementation work)");
  }
  return { valid: missing.length === 0, missing };
}

export function createHandoff(fields) {
  const handoff = versionEnvelope({
    sourceAgent: fields.sourceAgent,
    targetAgent: fields.targetAgent,
    taskId: fields.taskId,
    summary: fields.summary || "",
    decisions: fields.decisions || [],
    filesTouched: fields.filesTouched || [],
    openRisks: fields.openRisks || [],
    verificationEvidence: fields.verificationEvidence || [],
    confidenceScore: Number(fields.confidenceScore ?? 0),
    requiredNextAction: fields.requiredNextAction || "evaluate",
    blockingQuestions: fields.blockingQuestions || [],
  });
  const validation = validateHandoff(handoff);
  if (!validation.valid) {
    throw new Error(`Invalid handoff: missing ${validation.missing.join(", ")}`);
  }
  return handoff;
}

export async function appendHandoff(filePath, handoff) {
  const validation = validateHandoff(handoff);
  if (!validation.valid) {
    throw new Error(`Invalid handoff: missing ${validation.missing.join(", ")}`);
  }
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(handoff)}\n`, "utf8");
}
