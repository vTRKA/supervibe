import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

import {
  validateSpecialistQuestionProposal,
} from "./specialist-question-contract.mjs";
import {
  validateWorkflowStageId,
} from "./workflow-stage-registry.mjs";

function validateReceiptOutputContracts({
  rootDir = process.cwd(),
  command = "",
  stage = "",
  subjectId = "",
  outputArtifacts = [],
} = {}) {
  const issues = [];
  const stageCheck = validateWorkflowStageId({ command, stage });
  if (!stageCheck.pass) {
    issues.push({
      code: "unknown-workflow-stage",
      file: "receipt stage",
      message: stageCheck.message,
    });
  }

  if (normalizeCommandId(command) === "/supervibe-design") {
    for (const artifact of outputArtifacts || []) {
      const relPath = normalizeInputPath(artifact, rootDir);
      if (!isDesignQuestionProposalArtifact(relPath)) continue;
      issues.push(...validateDesignQuestionProposalArtifact({
        rootDir,
        relPath,
        stage,
        subjectId,
      }));
    }
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

export function assertReceiptOutputContracts(input = {}) {
  const result = validateReceiptOutputContracts(input);
  if (result.pass) return true;
  const details = result.issues.map((issue) => `${issue.code} ${issue.file}: ${issue.message}`).join("; ");
  throw new Error(`receipt output contract validation failed: ${details}`);
}

function validateDesignQuestionProposalArtifact({
  rootDir = process.cwd(),
  relPath = "",
  stage = "",
  subjectId = "",
} = {}) {
  const issues = [];
  const absPath = join(rootDir, ...relPath.split("/"));
  if (!existsSync(absPath)) {
    return [{
      code: "missing-specialist-question-artifact",
      file: relPath,
      message: `${relPath}: output artifact must exist before receipt issue`,
    }];
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absPath, "utf8"));
  } catch (error) {
    return [{
      code: "invalid-specialist-question-json",
      file: relPath,
      message: `${relPath}: ${error.message}`,
    }];
  }

  const proposals = extractQuestionProposals(parsed);
  if (proposals.length === 0) {
    return [{
      code: "missing-specialist-question-proposal",
      file: relPath,
      message: `${relPath}: expected SpecialistQuestionContract proposal, questionProposal, proposals, or questionProposals`,
    }];
  }

  for (const [index, proposal] of proposals.entries()) {
    const label = `${relPath}#${index + 1}`;
    for (const issue of validateSpecialistQuestionProposal(proposal, {
      file: label,
      requireDecisionUnlocked: true,
    })) {
      issues.push(issue);
    }
    if (stage && proposal.stage && proposal.stage !== stage) {
      issues.push({
        code: "specialist-question-stage-mismatch",
        file: label,
        message: `${proposal.proposalId || "proposal"} stage ${proposal.stage} does not match receipt stage ${stage}`,
      });
    }
    const owner = proposal.ownerAgent || proposal.specialist;
    if (subjectId && owner && owner !== subjectId) {
      issues.push({
        code: "specialist-question-owner-mismatch",
        file: label,
        message: `${proposal.proposalId || "proposal"} owner ${owner} does not match receipt subject ${subjectId}`,
      });
    }
  }
  return issues;
}

function extractQuestionProposals(parsed) {
  if (Array.isArray(parsed)) return parsed.filter(isObject);
  if (!isObject(parsed)) return [];
  if (Array.isArray(parsed.questionProposals)) return parsed.questionProposals.filter(isObject);
  if (Array.isArray(parsed.proposals)) return parsed.proposals.filter(isObject);
  if (isObject(parsed.questionProposal)) return [parsed.questionProposal];
  if (isObject(parsed.proposal)) return [parsed.proposal];
  if (parsed.stage || parsed.specialist || parsed.question) return [parsed];
  return [];
}

function isDesignQuestionProposalArtifact(path = "") {
  return /(^|\/)question-proposals\/.+\.json$/i.test(normalizeRelPath(path));
}

function normalizeCommandId(command = "") {
  const normalized = String(command || "").trim();
  if (!normalized) return "";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeInputPath(path, rootDir) {
  const value = String(path ?? "");
  const rel = isAbsolute(value) ? relative(rootDir, value) : value;
  return normalizeRelPath(rel);
}

function normalizeRelPath(path) {
  return String(path ?? "").split(sep).join("/").replace(/^\.\//, "");
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
