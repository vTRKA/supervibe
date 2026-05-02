import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";

export const MEMORY_GC_CATEGORIES = Object.freeze(["decisions", "patterns", "incidents", "learnings", "solutions"]);
const DEFAULT_MEMORY_GC_SCHEDULE = Object.freeze({
  intervalDays: 14,
  mode: "review",
  autoArchiveReasons: ["superseded"],
  maxAutoArchive: 20,
  lastRunAt: null,
});

export function createMemoryGcPolicy(overrides = {}) {
  return {
    incidentsDays: Number(overrides.incidentsDays || overrides.incidents || 365),
    learningsDays: Number(overrides.learningsDays || overrides.learnings || 180),
    lowConfidenceBelow: Number(overrides.lowConfidenceBelow || 7),
  };
}

function createMemoryGcSchedulePolicy(overrides = {}) {
  return {
    intervalDays: Number(overrides.intervalDays || overrides["interval-days"] || DEFAULT_MEMORY_GC_SCHEDULE.intervalDays),
    mode: String(overrides.mode || DEFAULT_MEMORY_GC_SCHEDULE.mode),
    autoArchiveReasons: normalizeList(overrides.autoArchiveReasons || overrides["auto-archive-reasons"] || DEFAULT_MEMORY_GC_SCHEDULE.autoArchiveReasons),
    maxAutoArchive: Number(overrides.maxAutoArchive || overrides["max-auto-archive"] || DEFAULT_MEMORY_GC_SCHEDULE.maxAutoArchive),
    lastRunAt: overrides.lastRunAt || overrides.last_run_at || null,
  };
}

function defaultMemoryGcSchedulePath(rootDir = process.cwd()) {
  return join(rootDir, ".supervibe", "memory", "gc-policy.json");
}

async function readMemoryGcSchedulePolicy({
  rootDir = process.cwd(),
  policyPath = defaultMemoryGcSchedulePath(rootDir),
} = {}) {
  if (!existsSync(policyPath)) {
    return {
      ...createMemoryGcSchedulePolicy(),
      source: "default",
      policyPath,
    };
  }
  const parsed = JSON.parse(await readFile(policyPath, "utf8"));
  return {
    ...createMemoryGcSchedulePolicy(parsed),
    source: "file",
    policyPath,
  };
}

export async function evaluateMemoryGcSchedule({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  scan = null,
  policyPath = defaultMemoryGcSchedulePath(rootDir),
} = {}) {
  const schedule = await readMemoryGcSchedulePolicy({ rootDir, policyPath });
  const candidates = scan?.summary?.candidates || 0;
  const lastRunAt = schedule.lastRunAt || null;
  const ageDays = lastRunAt ? ageInDays(lastRunAt, now) : null;
  const intervalDue = !lastRunAt || Number(ageDays) >= Number(schedule.intervalDays);
  const due = candidates > 0 && intervalDue;
  const nextRunAt = lastRunAt
    ? new Date(Date.parse(lastRunAt) + Number(schedule.intervalDays) * 86_400_000).toISOString()
    : now;
  const autoEligible = scan
    ? (scan.candidates || []).filter((candidate) => schedule.autoArchiveReasons.includes(candidate.reason)).slice(0, schedule.maxAutoArchive).length
    : 0;
  return {
    policyPath,
    source: schedule.source,
    mode: schedule.mode,
    intervalDays: schedule.intervalDays,
    lastRunAt,
    nextRunAt,
    ageDays,
    due,
    candidates,
    autoArchiveReasons: schedule.autoArchiveReasons,
    maxAutoArchive: schedule.maxAutoArchive,
    autoEligible,
    nextAction: due
      ? "run npm run supervibe:memory-gc -- --scheduled --dry-run"
      : candidates > 0
        ? `next scheduled review at ${nextRunAt}`
        : "no cleanup candidates",
  };
}

export async function writeMemoryGcScheduleRun({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  policyPath = defaultMemoryGcSchedulePath(rootDir),
  schedule = null,
} = {}) {
  const current = schedule || await readMemoryGcSchedulePolicy({ rootDir, policyPath });
  const next = {
    intervalDays: current.intervalDays,
    mode: current.mode,
    autoArchiveReasons: current.autoArchiveReasons,
    maxAutoArchive: current.maxAutoArchive,
    lastRunAt: now,
  };
  await mkdir(join(rootDir, ".supervibe", "memory"), { recursive: true });
  await writeFile(policyPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { policyPath, schedule: next };
}

export function filterMemoryGcAutoCandidates(scan, scheduleState = {}) {
  const reasons = new Set(scheduleState.autoArchiveReasons || DEFAULT_MEMORY_GC_SCHEDULE.autoArchiveReasons);
  const max = Number(scheduleState.maxAutoArchive || DEFAULT_MEMORY_GC_SCHEDULE.maxAutoArchive);
  const candidates = (scan.candidates || [])
    .filter((candidate) => reasons.has(candidate.reason))
    .slice(0, max);
  return {
    ...scan,
    candidates,
    summary: {
      ...scan.summary,
      candidates: candidates.length,
      active: scan.summary?.scanned ? scan.summary.scanned - candidates.length : scan.summary?.active || 0,
    },
    autoPolicy: {
      reasons: [...reasons],
      maxAutoArchive: max,
    },
  };
}

export async function scanMemoryGc({
  rootDir = process.cwd(),
  category = "all",
  policy = createMemoryGcPolicy(),
  now = new Date().toISOString(),
} = {}) {
  const memoryDir = join(rootDir, ".supervibe", "memory");
  const categories = category === "all" ? [...MEMORY_GC_CATEGORIES] : [category];
  const entries = [];
  const idIndex = new Map();

  for (const cat of categories) {
    for (const entry of await readMemoryCategory(memoryDir, cat)) {
      entries.push(entry);
      if (entry.id) idIndex.set(entry.id, entry);
    }
  }
  if (category !== "all") {
    for (const cat of MEMORY_GC_CATEGORIES) {
      for (const entry of await readMemoryCategory(memoryDir, cat)) {
        if (entry.id && !idIndex.has(entry.id)) idIndex.set(entry.id, entry);
      }
    }
  }

  const candidates = entries
    .map((entry) => classifyMemoryEntry(entry, { rootDir, policy, now, idIndex }))
    .filter((entry) => entry.archiveCandidate);
  const active = entries.length - candidates.length;
  return {
    rootDir,
    memoryDir,
    policy,
    now,
    category,
    candidates,
    summary: {
      scanned: entries.length,
      candidates: candidates.length,
      active,
    },
  };
}

export function classifyMemoryEntry(entry, { rootDir = process.cwd(), policy = createMemoryGcPolicy(), now = new Date().toISOString(), idIndex = new Map() } = {}) {
  const category = entry.category;
  const data = entry.data || {};
  const supersededBy = data["superseded-by"] || data.supersededBy;
  const ageDays = ageInDays(data.date || entry.mtime, now);
  const confidence = Number(data.confidence ?? 10);
  let archiveCandidate = false;
  let reason = "active";

  if (["decisions", "solutions"].includes(category)) {
    archiveCandidate = Boolean(supersededBy && idIndex.has(String(supersededBy)));
    reason = archiveCandidate ? "superseded" : reason;
  } else if (category === "patterns") {
    const appliesDeleted = appliesToDeleted(data["applies-to"] || data.appliesTo, rootDir);
    archiveCandidate = Boolean((supersededBy && idIndex.has(String(supersededBy))) || appliesDeleted);
    reason = supersededBy && idIndex.has(String(supersededBy)) ? "superseded" : appliesDeleted ? "applies-to-deleted" : reason;
  } else if (category === "incidents") {
    archiveCandidate = ageDays >= policy.incidentsDays;
    reason = archiveCandidate ? "age-retention" : reason;
  } else if (category === "learnings") {
    archiveCandidate = ageDays >= policy.learningsDays && confidence < policy.lowConfidenceBelow;
    reason = archiveCandidate ? "low-confidence-age-retention" : reason;
  }

  return {
    ...entry,
    archiveCandidate,
    reason,
    ageDays,
    confidence,
    supersededBy: supersededBy || null,
  };
}

export async function archiveMemoryGcCandidates(scan, {
  dryRun = true,
  archiveRoot = join(scan.memoryDir, ".archive"),
  now = scan.now || new Date().toISOString(),
} = {}) {
  const results = [];
  for (const candidate of scan.candidates || []) {
    results.push(await archiveMemoryEntry(candidate, { archiveRoot, dryRun, now }));
  }
  return {
    dryRun,
    archiveRoot,
    archived: results.filter((result) => result.status === "archived").length,
    previewed: results.filter((result) => result.status === "preview").length,
    results,
  };
}

export async function archiveMemoryEntry(candidate, { archiveRoot, dryRun = true, now = new Date().toISOString() } = {}) {
  const archiveDir = join(archiveRoot, candidate.category);
  const archivePath = join(archiveDir, basename(candidate.filePath));
  const result = {
    id: candidate.id,
    category: candidate.category,
    filePath: candidate.filePath,
    archivePath,
    reason: candidate.reason,
    status: dryRun ? "preview" : "archived",
    dryRun,
  };
  if (dryRun) return result;

  await mkdir(archiveDir, { recursive: true });
  const parsed = matter(await readFile(candidate.filePath, "utf8"));
  parsed.data.archivedAt = now;
  parsed.data.archiveReason = candidate.reason;
  await writeFile(candidate.filePath, matter.stringify(parsed.content, parsed.data), "utf8");
  await rename(candidate.filePath, archivePath);
  await appendArchiveLog(archiveRoot, {
    type: "memory-entry",
    id: candidate.id,
    category: candidate.category,
    archivedAt: now,
    reason: candidate.reason,
    originalPath: candidate.filePath,
    archivePath,
  });
  return result;
}

export async function restoreMemoryEntry({ rootDir = process.cwd(), id }) {
  if (!id) throw new Error("restore requires id");
  const archiveRoot = join(rootDir, ".supervibe", "memory", ".archive");
  for (const category of MEMORY_GC_CATEGORIES) {
    const dir = join(archiveRoot, category);
    if (!existsSync(dir)) continue;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const archivePath = join(dir, entry.name);
      const parsed = matter(await readFile(archivePath, "utf8"));
      if (String(parsed.data.id || "") !== String(id)) continue;
      delete parsed.data.archivedAt;
      delete parsed.data.archiveReason;
      const restoreDir = join(rootDir, ".supervibe", "memory", category);
      const restorePath = join(restoreDir, entry.name);
      await mkdir(restoreDir, { recursive: true });
      await writeFile(archivePath, matter.stringify(parsed.content, parsed.data), "utf8");
      await rename(archivePath, restorePath);
      await appendArchiveLog(archiveRoot, {
        type: "memory-entry-restore",
        id,
        category,
        restoredAt: new Date().toISOString(),
        archivePath,
        restorePath,
      });
      return { id, category, archivePath, restorePath, restored: true };
    }
  }
  throw new Error(`archived memory entry not found: ${id}`);
}

export async function memoryGcStats({ rootDir = process.cwd() } = {}) {
  const memoryDir = join(rootDir, ".supervibe", "memory");
  const stats = {};
  for (const category of MEMORY_GC_CATEGORIES) {
    stats[category] = (await readMemoryCategory(memoryDir, category)).length;
    stats[`.archive/${category}`] = (await readMemoryCategory(join(memoryDir, ".archive"), category)).length;
  }
  return stats;
}

export function formatMemoryGcReport(scan, archiveResult = null) {
  const lines = [
    "SUPERVIBE_MEMORY_GC",
    `CATEGORY: ${scan.category}`,
    `SCANNED: ${scan.summary?.scanned || 0}`,
    `CANDIDATES: ${scan.summary?.candidates || 0}`,
    `ACTIVE: ${scan.summary?.active || 0}`,
  ];
  for (const candidate of scan.candidates || []) {
    lines.push(`- ${candidate.id}: ${candidate.category}/${basename(candidate.filePath)} reason=${candidate.reason} age=${candidate.ageDays}d confidence=${candidate.confidence}`);
  }
  if (archiveResult) {
    lines.push(`APPLY: ${archiveResult.dryRun ? "dry-run" : "written"}`);
    for (const result of archiveResult.results || []) {
      lines.push(`  ${result.status}: ${result.id} -> ${result.archivePath}`);
    }
  } else {
    lines.push("NEXT: re-run with --apply to archive candidates.");
  }
  return lines.join("\n");
}

export function formatMemoryGcSchedule(schedule = {}) {
  return [
    "SUPERVIBE_MEMORY_GC_POLICY",
    `DUE: ${Boolean(schedule.due)}`,
    `MODE: ${schedule.mode || "review"}`,
    `SOURCE: ${schedule.source || "default"}`,
    `INTERVAL_DAYS: ${schedule.intervalDays ?? DEFAULT_MEMORY_GC_SCHEDULE.intervalDays}`,
    `LAST_RUN_AT: ${schedule.lastRunAt || "never"}`,
    `NEXT_RUN_AT: ${schedule.nextRunAt || "unknown"}`,
    `CANDIDATES: ${schedule.candidates || 0}`,
    `AUTO_ELIGIBLE: ${schedule.autoEligible || 0}`,
    `AUTO_REASONS: ${(schedule.autoArchiveReasons || []).join(",") || "none"}`,
    `NEXT_ACTION: ${schedule.nextAction || "inspect memory gc"}`,
  ].join("\n");
}

async function readMemoryCategory(memoryDir, category) {
  const dir = join(memoryDir, category);
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name.startsWith("_")) continue;
    const filePath = join(dir, entry.name);
    const parsed = matter(await readFile(filePath, "utf8"));
    const fileStat = await stat(filePath);
    out.push({
      id: parsed.data.id || entry.name.replace(/\.md$/, ""),
      category,
      filePath,
      data: parsed.data,
      content: parsed.content,
      mtime: fileStat.mtime.toISOString(),
    });
  }
  return out;
}

function appliesToDeleted(appliesTo, rootDir) {
  const list = Array.isArray(appliesTo) ? appliesTo : appliesTo ? [appliesTo] : [];
  if (!list.length) return false;
  return list.every((item) => !existsSync(join(rootDir, String(item))));
}

function ageInDays(date, now) {
  const start = Date.parse(date || "");
  const end = Date.parse(now || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

async function appendArchiveLog(archiveRoot, entry) {
  await mkdir(archiveRoot, { recursive: true });
  const logPath = join(archiveRoot, "_archive-log.jsonl");
  const previous = existsSync(logPath) ? await readFile(logPath, "utf8") : "";
  await writeFile(logPath, `${previous}${JSON.stringify(entry)}\n`, "utf8");
}
