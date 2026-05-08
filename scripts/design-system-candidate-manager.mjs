#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESIGN_SYSTEM_REL = ".supervibe/artifacts/prototypes/_design-system";
const CANDIDATES_REL = `${DESIGN_SYSTEM_REL}/.candidates`;
const ACTIVE_FILE = "active.json";
const ARCHIVE_DIR = "_archive";
const DEFAULT_STALE_DAYS = 14;
const META_FILES = Object.freeze([
  "candidate.json",
  "manifest.json",
  "design-flow-state.json",
]);

const APPROVED_STATUSES = new Set(["approved", "accepted", "final"]);
const REJECTED_STATUSES = new Set(["rejected", "superseded", "archived"]);

export function buildCandidateManagerStatus(rootDir = process.cwd(), options = {}) {
  const candidateRoot = join(rootDir, ...CANDIDATES_REL.split("/"));
  const nowMs = toTime(options.now, Date.now());
  const staleDays = Number.isFinite(Number(options.staleDays))
    ? Number(options.staleDays)
    : DEFAULT_STALE_DAYS;
  const issues = [];

  if (!existsSync(candidateRoot)) {
    return {
      pass: true,
      candidateRoot: normalizeRel(relative(rootDir, candidateRoot)),
      activeCandidate: null,
      candidates: [],
      archiveRecommended: 0,
      issues,
    };
  }

  const activeCandidate = readActiveCandidate(candidateRoot);
  const entries = readdirSync(candidateRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== ARCHIVE_DIR)
    .sort((a, b) => a.name.localeCompare(b.name));

  const candidates = entries.map((entry) => inspectCandidate({
    rootDir,
    candidateRoot,
    id: entry.name,
    activeCandidate,
    nowMs,
    staleDays,
  }));

  if (activeCandidate && !candidates.some((candidate) => candidate.id === activeCandidate)) {
    issues.push({
      code: "active-candidate-missing",
      message: `active candidate ${activeCandidate} is not present under ${CANDIDATES_REL}`,
    });
  }

  return {
    pass: issues.length === 0,
    candidateRoot: normalizeRel(relative(rootDir, candidateRoot)),
    activeCandidate,
    candidates,
    archiveRecommended: candidates.filter((candidate) => candidate.archiveRecommended).length,
    issues,
  };
}

export function planCandidateArchive(rootDir = process.cwd(), options = {}) {
  const status = buildCandidateManagerStatus(rootDir, options);
  const candidateRoot = join(rootDir, ...CANDIDATES_REL.split("/"));
  const archiveRoot = join(candidateRoot, ARCHIVE_DIR);
  const archivePlan = status.candidates
    .filter((candidate) => candidate.archiveRecommended)
    .map((candidate) => ({
      id: candidate.id,
      reason: candidate.archiveReason,
      from: normalizeRel(relative(rootDir, join(candidateRoot, candidate.id))),
      to: normalizeRel(relative(rootDir, uniqueArchivePath(archiveRoot, candidate.id))),
    }));

  return {
    ...status,
    archivePlan,
  };
}

export function formatCandidateManagerReport(result = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_SYSTEM_CANDIDATES",
    `PASS: ${result.pass === true}`,
    `CANDIDATES_DIR: ${result.candidateRoot || CANDIDATES_REL}`,
    `ACTIVE: ${result.activeCandidate || "none"}`,
    `CANDIDATES: ${(result.candidates || []).length}`,
    `ARCHIVE_RECOMMENDED: ${result.archiveRecommended || 0}`,
  ];

  for (const candidate of result.candidates || []) {
    lines.push(
      `CANDIDATE: ${candidate.id} status=${candidate.status} active=${candidate.isActive} stale=${candidate.stale} ageDays=${candidate.ageDays} archiveRecommended=${candidate.archiveRecommended} path=${candidate.path}`,
    );
  }

  if (Array.isArray(result.archivePlan)) {
    for (const item of result.archivePlan) {
      lines.push(`ARCHIVE: ${item.id} reason=${item.reason} from=${item.from} to=${item.to}`);
    }
  }

  lines.push(`ISSUES: ${(result.issues || []).length}`);
  for (const issue of result.issues || []) {
    lines.push(`ISSUE: ${issue.code} - ${issue.message}`);
  }
  return lines.join("\n");
}

function inspectCandidate({ rootDir, candidateRoot, id, activeCandidate, nowMs, staleDays }) {
  const candidatePath = join(candidateRoot, id);
  const meta = readCandidateMeta(candidatePath);
  const status = normalizeStatus(
    meta.status
      ?? meta.candidate?.status
      ?? meta.design_system?.status
      ?? meta.designSystem?.status
      ?? "draft",
  );
  const updatedMs = toTime(
    meta.updatedAt ?? meta.updated_at ?? meta.generatedAt ?? meta.createdAt,
    statSync(candidatePath).mtimeMs,
  );
  const ageDays = Number(((nowMs - updatedMs) / 86_400_000).toFixed(1));
  const isActive = Boolean(activeCandidate && id === activeCandidate);
  const approved = APPROVED_STATUSES.has(status);
  const rejected = REJECTED_STATUSES.has(status);
  const stale = !isActive && !approved && ageDays > staleDays;
  const archiveRecommended = !isActive && (rejected || stale);
  const archiveReason = rejected ? status : stale ? `stale>${staleDays}d` : "none";

  return {
    id,
    status,
    path: normalizeRel(relative(rootDir, candidatePath)),
    isActive,
    ageDays,
    stale,
    archiveRecommended,
    archiveReason,
  };
}

function readActiveCandidate(candidateRoot) {
  const active = readJson(join(candidateRoot, ACTIVE_FILE), {});
  return normalizeCandidateId(active.activeCandidate ?? active.active ?? active.id ?? "");
}

function readCandidateMeta(candidatePath) {
  for (const file of META_FILES) {
    const meta = readJson(join(candidatePath, file), null);
    if (meta && typeof meta === "object") return meta;
  }
  return {};
}

function applyArchivePlan(rootDir, archivePlan) {
  const candidateRoot = resolve(rootDir, ...CANDIDATES_REL.split("/"));
  const archiveRoot = resolve(candidateRoot, ARCHIVE_DIR);
  mkdirSync(archiveRoot, { recursive: true });

  const moved = [];
  for (const item of archivePlan) {
    const from = resolve(rootDir, ...item.from.split("/"));
    const to = resolve(rootDir, ...item.to.split("/"));
    assertInside(candidateRoot, from);
    assertInside(archiveRoot, to);
    renameSync(from, to);
    moved.push({ ...item });
  }
  return moved;
}

function uniqueArchivePath(archiveRoot, id) {
  let index = 0;
  while (true) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const target = join(archiveRoot, `${id}${suffix}`);
    if (!existsSync(target)) return target;
    index += 1;
  }
}

function assertInside(base, target) {
  const rel = relative(resolve(base), resolve(target));
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Refusing path outside expected root: ${resolve(target)}`);
  }
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeCandidateId(value) {
  return String(value || "").trim().replaceAll("\\", "/").split("/").filter(Boolean).pop() || null;
}

function normalizeStatus(value) {
  return String(value || "draft").trim().toLowerCase().replaceAll("_", "-");
}

function toTime(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRel(path) {
  return String(path || "").replaceAll("\\", "/");
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rootDir = process.cwd();
  const staleDays = Number(arg("--stale-days", DEFAULT_STALE_DAYS));
  const archiveMode = process.argv.includes("--archive-stale");
  const apply = process.argv.includes("--apply");
  const json = process.argv.includes("--json");
  const result = archiveMode
    ? planCandidateArchive(rootDir, { staleDays })
    : buildCandidateManagerStatus(rootDir, { staleDays });

  if (archiveMode && apply && result.archivePlan.length > 0) {
    const moved = applyArchivePlan(rootDir, result.archivePlan);
    result.moved = moved;
  }

  console.log(json ? JSON.stringify(result, null, 2) : formatCandidateManagerReport(result));
  process.exit(result.pass ? 0 : 1);
}
