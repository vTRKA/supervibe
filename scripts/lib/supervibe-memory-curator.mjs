import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import matter from "gray-matter";

import { rebuildMemory } from "./memory-store.mjs";

const MEMORY_CATEGORIES = Object.freeze(["decisions", "patterns", "incidents", "learnings", "solutions"]);

export async function curateProjectMemory({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  rebuildSqlite = false,
  useEmbeddings = false,
} = {}) {
  const memoryDir = join(rootDir, ".claude", "memory");
  await mkdir(memoryDir, { recursive: true });
  const entries = await readMarkdownMemoryEntries({ rootDir, now });
  const validation = validateMemoryEntries(entries);
  const contradictions = detectMemoryContradictions(entries);
  const lifecycle = buildMemoryLifecycle(entries, { now, contradictions });
  const tags = [...new Set(entries.flatMap((entry) => entry.tags))].sort();
  const index = {
    schemaVersion: 2,
    generatedAt: now,
    entries: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      date: entry.date,
      tags: entry.tags,
      confidence: entry.confidence,
      file: entry.file,
      freshness: lifecycle.byId[entry.id]?.freshness || "fresh",
      stale: lifecycle.byId[entry.id]?.stale || false,
      supersededBy: lifecycle.byId[entry.id]?.supersededBy || [],
      contradictions: contradictions.filter((item) => item.ids.includes(entry.id)).map((item) => item.id),
    })),
    tags,
    validation,
    lifecycle,
  };
  await writeFile(join(memoryDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  const sqlite = rebuildSqlite ? await rebuildMemory(rootDir, { useEmbeddings }) : null;
  return {
    pass: validation.errors.length === 0,
    markdownEntries: entries.length,
    sqliteEntries: sqlite?.entriesIndexed ?? null,
    indexPath: join(memoryDir, "index.json"),
    validation,
    contradictions,
    lifecycle,
    tags,
  };
}

export async function readMarkdownMemoryEntries({ rootDir = process.cwd(), now = new Date().toISOString() } = {}) {
  const memoryDir = join(rootDir, ".claude", "memory");
  const entries = [];
  for (const category of MEMORY_CATEGORIES) {
    const dir = join(memoryDir, category);
    if (!existsSync(dir)) continue;
    const dirEntries = await readdir(dir, { withFileTypes: true });
    for (const entry of dirEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name.startsWith("_")) continue;
      const absPath = join(dir, entry.name);
      const raw = await readFile(absPath, "utf8");
      const parsed = matter(raw);
      const data = parsed.data || {};
      const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
      const id = String(data.id || basename(entry.name, ".md"));
      entries.push({
        id,
        type: String(data.type || category.slice(0, -1)),
        date: normalizeDate(data.date),
        tags,
        related: normalizeArray(data.related),
        supersedes: normalizeArray(data.supersedes),
        supersededBy: normalizeArray(data.supersededBy),
        contradicts: normalizeArray(data.contradicts),
        agent: String(data.agent || "unknown"),
        confidence: Number(data.confidence || 0),
        file: relative(rootDir, absPath).split(sep).join("/"),
        category,
        summary: parsed.content.split(/\r?\n/).filter(Boolean).slice(0, 2).join(" ").slice(0, 260),
        body: parsed.content || "",
        ageDays: ageInDays(normalizeDate(data.date), now),
      });
    }
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file));
}

function validateMemoryEntries(entries = []) {
  const seen = new Set();
  const errors = [];
  const warnings = [];
  for (const entry of entries) {
    if (!entry.id) errors.push(`${entry.file}: missing id`);
    if (seen.has(entry.id)) errors.push(`${entry.file}: duplicate memory id ${entry.id}`);
    seen.add(entry.id);
    if (!entry.type) errors.push(`${entry.file}: missing type`);
    if (!entry.date) warnings.push(`${entry.file}: missing date`);
    if (!entry.tags.length) warnings.push(`${entry.file}: missing tags`);
    if (entry.confidence < 7) warnings.push(`${entry.file}: confidence below durable-memory bar`);
  }
  return { pass: errors.length === 0, errors, warnings };
}

function detectMemoryContradictions(entries = []) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const contradictions = [];
  for (const entry of entries) {
    for (const targetId of entry.contradicts) {
      if (!byId.has(targetId)) continue;
      contradictions.push({
        id: `${entry.id}->${targetId}`,
        ids: [entry.id, targetId],
        type: "declared-contradiction",
        reviewRequired: true,
        reason: `${entry.id} declares contradiction with ${targetId}`,
      });
    }
  }
  return contradictions.sort((a, b) => a.id.localeCompare(b.id));
}

function buildMemoryLifecycle(entries = [], { now = new Date().toISOString(), contradictions = [] } = {}) {
  const byId = {};
  const superseded = new Map();
  for (const entry of entries) {
    for (const older of entry.supersedes) {
      const list = superseded.get(older) || [];
      list.push(entry.id);
      superseded.set(older, list);
    }
  }
  for (const entry of entries) {
    const supersededBy = [...(entry.supersededBy || []), ...(superseded.get(entry.id) || [])].sort();
    const ageDays = entry.ageDays ?? ageInDays(entry.date, now);
    const stale = supersededBy.length > 0 || ageDays > 365;
    byId[entry.id] = {
      freshness: supersededBy.length ? "superseded" : ageDays > 365 ? "stale" : ageDays > 90 ? "aging" : "fresh",
      stale,
      ageDays,
      supersededBy,
      contradictionIds: contradictions.filter((item) => item.ids.includes(entry.id)).map((item) => item.id),
    };
  }
  return {
    byId,
    staleCount: Object.values(byId).filter((entry) => entry.stale).length,
    contradictionCount: contradictions.length,
    candidateQueues: {
      memoryReview: contradictions.map((item) => ({ id: item.id, reason: item.reason, state: "new" })),
      evalPromotion: [],
      feedbackReview: [],
    },
  };
}

export function annotateMemorySearchResults(results = [], curation = null) {
  const lifecycle = curation?.lifecycle?.byId || {};
  return results.map((result) => ({
    ...result,
    freshness: lifecycle[result.id]?.freshness || "unknown",
    stale: Boolean(lifecycle[result.id]?.stale),
    contradictionIds: lifecycle[result.id]?.contradictionIds || [],
  }));
}

export function formatMemoryCurationReport(report = {}) {
  return [
    "SUPERVIBE_MEMORY_CURATION",
    `PASS: ${Boolean(report.pass)}`,
    `MARKDOWN_ENTRIES: ${report.markdownEntries || 0}`,
    `SQLITE_ENTRIES: ${report.sqliteEntries ?? "not-rebuilt"}`,
    `STALE: ${report.lifecycle?.staleCount || 0}`,
    `CONTRADICTIONS: ${report.contradictions?.length || 0}`,
    `INDEX: ${report.indexPath || "none"}`,
    ...((report.validation?.errors || []).map((error) => `ERROR: ${error}`)),
    ...((report.validation?.warnings || []).slice(0, 8).map((warning) => `WARN: ${warning}`)),
  ].join("\n");
}

function normalizeArray(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
}

function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function ageInDays(date, now) {
  const start = Date.parse(date || "");
  const end = Date.parse(now || "");
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}
