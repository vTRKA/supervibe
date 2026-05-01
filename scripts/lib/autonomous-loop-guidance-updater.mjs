import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { redactSensitiveContent } from "./autonomous-loop-artifact-retention.mjs";

export const GUIDANCE_APPROVAL_TOKEN = "APPROVE_GUIDANCE_UPDATE";

const DEFAULT_TARGETS = {
  repo: null,
  codex: "AGENTS.md",
  claude: ["CLAUDE", ".md"].join(""),
  gemini: "GEMINI.md",
  command: "commands/supervibe-loop.md",
};

export async function createGuidanceUpdatePlan(candidates = [], { rootDir = process.cwd(), targets = DEFAULT_TARGETS } = {}) {
  const root = resolve(rootDir);
  const resolvedTargets = resolveGuidanceTargets(root, targets);
  const proposedByTarget = new Map();
  const duplicateCandidates = [];
  const rejectedCandidates = [];

  for (const candidate of candidates) {
    const rejection = rejectCandidate(candidate);
    if (rejection) {
      rejectedCandidates.push({ ...candidate, rejection });
      continue;
    }

    const targetPath = routeCandidate(candidate, resolvedTargets);
    const safeTarget = resolveGuidanceTarget(root, targetPath);
    const existing = await readOptional(safeTarget);
    if (existing.toLowerCase().includes(String(candidate.summary).toLowerCase())) {
      duplicateCandidates.push({ ...candidate, targetPath });
      continue;
    }

    const update = proposedByTarget.get(targetPath) || {
      targetPath,
      absolutePath: safeTarget,
      candidates: [],
      insertion: "",
    };
    update.candidates.push(candidate);
    proposedByTarget.set(targetPath, update);
  }

  const proposedUpdates = [...proposedByTarget.values()].map((update) => ({
    ...update,
    insertion: renderGuidanceBlock(update.candidates),
  }));

  return {
    schema_version: 1,
    status: proposedUpdates.length > 0 ? "pending-review" : "noop",
    requiresReview: proposedUpdates.length > 0,
    proposedUpdates,
    duplicateCandidates,
    rejectedCandidates,
  };
}

export async function applyGuidanceUpdatePlan(plan = {}, { rootDir = process.cwd(), approval = null } = {}) {
  if (!isApproved(approval)) {
    return {
      applied: false,
      status: "blocked",
      reason: "review approval required",
      changedFiles: [],
    };
  }

  const root = resolve(rootDir);
  const changedFiles = [];
  for (const update of plan.proposedUpdates || []) {
    const target = resolveGuidanceTarget(root, update.targetPath);
    await mkdir(dirname(target), { recursive: true });
    const existing = await readOptional(target);
    const linesToAdd = (update.insertion || renderGuidanceBlock(update.candidates || [])).trim();
    if (!linesToAdd || existing.includes(linesToAdd)) continue;
    const next = `${existing.replace(/\s*$/, "")}\n\n${linesToAdd}\n`;
    await writeFile(target, next, "utf8");
    changedFiles.push(relative(root, target).replace(/\\/g, "/"));
  }

  return {
    applied: changedFiles.length > 0,
    status: changedFiles.length > 0 ? "applied" : "noop",
    changedFiles,
  };
}

export async function recordRejectedLearningCandidates(candidates = [], archiveDir, { reason = "rejected by reviewer" } = {}) {
  const targetDir = resolve(archiveDir);
  await mkdir(targetDir, { recursive: true });
  const payload = {
    schema_version: 1,
    reason,
    rejected_at: new Date(0).toISOString(),
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      type: candidate.type,
      scope: candidate.scope,
      summary: redactSensitiveContent(candidate.summary || ""),
      source: candidate.source || null,
    })),
  };
  const path = resolve(targetDir, "rejected-learnings.json");
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { path, count: payload.candidates.length };
}

export function renderGuidanceBlock(candidates = []) {
  const lines = [
    "<!-- supervibe-guidance-update:start -->",
    "## Reviewed Autonomous Loop Learnings",
    ...candidates.map((candidate) => {
      const evidence = candidate.evidence?.length ? ` Evidence: ${candidate.evidence.join(", ")}.` : "";
      return `- [${candidate.scope || candidate.type}] ${redactSensitiveContent(candidate.summary)}.${evidence}`;
    }),
    "<!-- supervibe-guidance-update:end -->",
  ];
  return lines.join("\n");
}

function routeCandidate(candidate, targets) {
  if (candidate.targetPath) return candidate.targetPath;
  const text = `${candidate.scope || ""} ${candidate.type || ""}`.toLowerCase();
  if (candidate.cli === "claude") return targets.claude;
  if (candidate.cli === "codex") return targets.codex;
  if (candidate.cli === "gemini") return targets.gemini;
  if (text.includes("command")) return targets.command;
  return targets.repo;
}

function resolveGuidanceTargets(root, overrides = {}) {
  const targets = { ...DEFAULT_TARGETS, ...overrides };
  if (!targets.repo) {
    targets.repo = firstExisting(root, [
      targets.codex,
      targets.claude,
      targets.gemini,
      "opencode.json",
    ]) || targets.codex;
  }
  return targets;
}

function firstExisting(root, candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    if (existsSync(resolve(root, candidate))) return candidate;
  }
  return null;
}

function resolveGuidanceTarget(root, targetPath) {
  if (isAbsolute(targetPath)) {
    const resolved = resolve(targetPath);
    assertInsideRoot(root, resolved);
    return resolved;
  }
  const resolved = resolve(root, targetPath);
  assertInsideRoot(root, resolved);
  return resolved;
}

function assertInsideRoot(root, target) {
  const relativePath = relative(root, target);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Guidance update target escapes project root: ${target}`);
  }
}

function rejectCandidate(candidate = {}) {
  if (!candidate.summary) return "missing-summary";
  if (redactSensitiveContent(candidate.summary) !== candidate.summary) return "sensitive-content";
  if (/\b(maybe|perhaps|unresolved|speculation|raw prompt)\b/i.test(candidate.summary)) return "unsafe-guidance";
  return null;
}

function isApproved(approval) {
  if (approval === GUIDANCE_APPROVAL_TOKEN) return true;
  return Boolean(approval?.approved && approval?.token === GUIDANCE_APPROVAL_TOKEN);
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return "";
    throw err;
  }
}
