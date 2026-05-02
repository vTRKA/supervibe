import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";
import matter from "gray-matter";

import { rebuildMemory } from "./memory-store.mjs";

const MEMORY_CATEGORIES = Object.freeze(["decisions", "patterns", "incidents", "learnings", "solutions"]);

export async function curateProjectMemory({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
  rebuildSqlite = false,
  useEmbeddings = false,
  changedFiles = [],
} = {}) {
  const memoryDir = join(rootDir, ".supervibe", "memory");
  await mkdir(memoryDir, { recursive: true });
  const entries = await readMarkdownMemoryEntries({ rootDir, now });
  const validation = validateMemoryEntries(entries);
  const contradictions = detectMemoryContradictions(entries);
  const lifecycle = buildMemoryLifecycle(entries, { now, contradictions });
  const referenceIssues = detectMemoryReferenceIssues(entries, { rootDir });
  const duplicateCandidates = detectDuplicateMemoryCandidates(entries, { lifecycle });
  const invalidationCandidates = detectMemoryInvalidationCandidates(entries, { lifecycle, changedFiles });
  const hierarchy = buildHierarchicalMemorySummary(entries, { lifecycle });
  lifecycle.candidateQueues.referenceReview = referenceIssues.map((item) => ({
    id: `${item.entryId}:${item.reference}`,
    entryId: item.entryId,
    reference: item.reference,
    reason: item.reason,
    state: "new",
  }));
  lifecycle.candidateQueues.duplicateReview = duplicateCandidates.map((item) => ({
    id: `${item.ids[0]}~${item.ids[1]}`,
    ids: item.ids,
    reason: item.reason,
    score: item.score,
    state: "new",
  }));
  lifecycle.candidateQueues.invalidationReview = invalidationCandidates.map((item) => ({
    id: `${item.entryId}:${item.changedFiles[0] || "changed"}`,
    entryId: item.entryId,
    changedFiles: item.changedFiles,
    reason: item.reason,
    state: "new",
  }));
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
    quality: {
      referenceIssues,
      duplicateCandidates,
      invalidationCandidates,
      hierarchy,
    },
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
    referenceIssues,
    duplicateCandidates,
    invalidationCandidates,
    hierarchy,
    lifecycle,
    tags,
  };
}

export async function readMarkdownMemoryEntries({ rootDir = process.cwd(), now = new Date().toISOString() } = {}) {
  const memoryDir = join(rootDir, ".supervibe", "memory");
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

function detectMemoryReferenceIssues(entries = [], { rootDir = process.cwd() } = {}) {
  const issues = [];
  for (const entry of entries) {
    for (const reference of extractLocalArtifactReferences(entry.body || "")) {
      const normalized = normalizeReferencePath(reference);
      if (!normalized) continue;
      if (!isReferenceScopeValid(normalized)) continue;
      if (!referenceExists(rootDir, normalized)) {
        issues.push({
          entryId: entry.id,
          file: entry.file,
          reference: normalized,
          reason: "missing-reference",
        });
      }
    }
  }
  return issues.sort((a, b) => `${a.entryId}:${a.reference}`.localeCompare(`${b.entryId}:${b.reference}`));
}

function detectDuplicateMemoryCandidates(entries = [], { lifecycle = null, threshold = 0.72 } = {}) {
  const lifecycleById = lifecycle?.byId || {};
  const activeEntries = entries.filter((entry) => !lifecycleById[entry.id]?.stale);
  const candidates = [];
  for (let i = 0; i < activeEntries.length; i += 1) {
    for (let j = i + 1; j < activeEntries.length; j += 1) {
      const left = activeEntries[i];
      const right = activeEntries[j];
      if (left.type !== right.type) continue;
      const tagOverlap = intersectionSize(new Set(left.tags || []), new Set(right.tags || []));
      if (tagOverlap === 0) continue;
      const score = jaccard(tokenSet(`${left.id} ${left.summary} ${left.body}`), tokenSet(`${right.id} ${right.summary} ${right.body}`));
      if (score < threshold) continue;
      candidates.push({
        ids: [left.id, right.id].sort(),
        files: [left.file, right.file].sort(),
        score: Number(score.toFixed(3)),
        tagOverlap,
        reason: "near-duplicate-active-memory",
      });
    }
  }
  return candidates
    .sort((a, b) => b.score - a.score || a.ids.join("~").localeCompare(b.ids.join("~")))
    .slice(0, 20);
}

function detectMemoryInvalidationCandidates(entries = [], { lifecycle = null, changedFiles = [] } = {}) {
  const changed = new Set((changedFiles || []).map(normalizeReferencePath).filter(Boolean));
  if (!changed.size) return [];
  const lifecycleById = lifecycle?.byId || {};
  const candidates = [];
  for (const entry of entries) {
    if (lifecycleById[entry.id]?.stale) continue;
    const refs = extractLocalArtifactReferences(entry.body || "")
      .map(normalizeReferencePath)
      .filter(Boolean);
    const affected = refs.filter((reference) => changed.has(reference));
    if (!affected.length) continue;
    candidates.push({
      entryId: entry.id,
      file: entry.file,
      changedFiles: [...new Set(affected)].sort(),
      reason: "referenced-file-changed",
    });
  }
  return candidates.sort((a, b) => a.entryId.localeCompare(b.entryId));
}

function buildHierarchicalMemorySummary(entries = [], { lifecycle = null, maxCurrent = 12 } = {}) {
  const lifecycleById = lifecycle?.byId || {};
  const active = entries.filter((entry) => !lifecycleById[entry.id]?.stale);
  const historical = entries.filter((entry) => lifecycleById[entry.id]?.stale);
  const currentTop = active
    .slice()
    .sort((a, b) => b.confidence - a.confidence || String(b.date).localeCompare(String(a.date)))
    .slice(0, maxCurrent)
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      tags: entry.tags,
      confidence: entry.confidence,
      summary: entry.summary,
    }));
  return {
    current: {
      count: active.length,
      byType: countBy(active, "type"),
      byTag: countTags(active),
      top: currentTop,
    },
    review: {
      stale: historical.length,
      contradictions: lifecycle?.contradictionCount || 0,
      queues: Object.fromEntries(Object.entries(lifecycle?.candidateQueues || {}).map(([key, value]) => [key, value.length])),
    },
    history: {
      count: historical.length,
      byType: countBy(historical, "type"),
    },
    tokenEstimate: Math.ceil(JSON.stringify(currentTop).length / 4),
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

export function filterCurrentMemoryResults(results = [], curation = null, {
  includeHistory = false,
  limit = results.length,
} = {}) {
  const annotated = annotateMemorySearchResults(results, curation);
  const filtered = includeHistory
    ? annotated
    : annotated.filter((entry) => !entry.stale && !(entry.contradictionIds || []).length);
  return filtered.slice(0, limit);
}

export function formatMemoryCurationReport(report = {}) {
  const queues = report.lifecycle?.candidateQueues || {};
  return [
    "SUPERVIBE_MEMORY_CURATION",
    `PASS: ${Boolean(report.pass)}`,
    `MARKDOWN_ENTRIES: ${report.markdownEntries || 0}`,
    `SQLITE_ENTRIES: ${report.sqliteEntries ?? "not-rebuilt"}`,
    `STALE: ${report.lifecycle?.staleCount || 0}`,
    `CONTRADICTIONS: ${report.contradictions?.length || 0}`,
    `REFERENCE_ISSUES: ${report.referenceIssues?.length || 0}`,
    `DUPLICATE_CANDIDATES: ${report.duplicateCandidates?.length || 0}`,
    `INVALIDATION_CANDIDATES: ${report.invalidationCandidates?.length || 0}`,
    `CURRENT_LAYER: ${report.hierarchy?.current?.count ?? "unknown"}`,
    `HISTORY_LAYER: ${report.hierarchy?.history?.count ?? "unknown"}`,
    `REVIEW_MEMORY: ${queues.memoryReview?.length || 0}`,
    `REVIEW_REFERENCES: ${queues.referenceReview?.length || 0}`,
    `REVIEW_DUPLICATES: ${queues.duplicateReview?.length || 0}`,
    `REVIEW_INVALIDATIONS: ${queues.invalidationReview?.length || 0}`,
    `INDEX: ${report.indexPath || "none"}`,
    ...((report.validation?.errors || []).map((error) => `ERROR: ${error}`)),
    ...((report.validation?.warnings || []).slice(0, 8).map((warning) => `WARN: ${warning}`)),
    ...((report.referenceIssues || []).slice(0, 8).map((issue) => `REF_MISSING: ${issue.entryId} -> ${issue.reference}`)),
    ...((report.duplicateCandidates || []).slice(0, 8).map((issue) => `DUPLICATE: ${issue.ids.join(" ~ ")} score=${issue.score}`)),
    ...((report.invalidationCandidates || []).slice(0, 8).map((issue) => `INVALIDATE: ${issue.entryId} -> ${issue.changedFiles.join(",")}`)),
  ].join("\n");
}

function extractLocalArtifactReferences(body = "") {
  const refs = new Set();
  const text = String(body || "");
  const codeRefPattern = /`([^`\n]+\.(?:mjs|js|ts|tsx|jsx|json|md|yaml|yml|rs|py|toml|css|html)(?::\d+)?)`/gi;
  const markdownLinkPattern = /\[[^\]]+\]\((?!https?:\/\/|mailto:)([^)#\s]+)(?::\d+)?(?:#[^)]+)?\)/gi;
  const plainPathPattern = /\b((?:scripts|tests|docs|agents|skills|rules|commands|confidence-rubrics|stack-packs|references|\.codex-plugin|\.claude-plugin|\.cursor-plugin|\.opencode)\/[A-Za-z0-9._/@:+-]+\.(?:mjs|js|ts|tsx|jsx|json|md|yaml|yml|rs|py|toml|css|html)(?::\d+)?)\b/gi;
  for (const pattern of [codeRefPattern, markdownLinkPattern, plainPathPattern]) {
    let match;
    while ((match = pattern.exec(text))) refs.add(match[1]);
  }
  return [...refs];
}

function normalizeReferencePath(reference = "") {
  let normalized = String(reference || "").trim();
  if (!normalized || /^[a-z]+:\/\//i.test(normalized) || normalized.startsWith("#")) return "";
  normalized = normalized.replace(/^<|>$/g, "");
  normalized = normalized.replace(/\\/g, "/");
  normalized = normalized.replace(/^(?:node|npx)\s+/, "");
  normalized = normalized.replace(/:\d+$/, "");
  normalized = normalized.replace(/^\.\//, "");
  if (normalized.includes("*")) return "";
  if (normalized.startsWith(".supervibe/")) return "";
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return "";
  if (normalized.includes("..")) return "";
  if (!normalized.includes("/") && !["package.json", "package-lock.json", "README.md", "CHANGELOG.md"].includes(normalized)) return "";
  return normalized;
}

function isReferenceScopeValid(reference = "") {
  const [scope] = reference.split("/");
  const ext = extname(reference).toLowerCase();
  const byScope = {
    agents: new Set([".md"]),
    commands: new Set([".md"]),
    "confidence-rubrics": new Set([".yaml", ".yml"]),
    docs: new Set([".md"]),
    references: new Set([".md", ".json"]),
    rules: new Set([".md", ".yaml", ".yml"]),
    scripts: new Set([".mjs", ".js", ".json"]),
    skills: new Set([".md"]),
    "stack-packs": new Set([".yaml", ".yml", ".json", ".md"]),
    tests: new Set([".mjs", ".js", ".json"]),
  };
  if (!reference.includes("/")) return true;
  return byScope[scope]?.has(ext) ?? false;
}

function referenceExists(rootDir, reference) {
  if (existsSync(join(rootDir, reference))) return true;
  const [scope] = reference.split("/");
  if (!["agents", "skills"].includes(scope)) return false;
  return findFileByBasename(join(rootDir, scope), basename(reference));
}

function findFileByBasename(dir, target) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name === target) return true;
    if (entry.isDirectory() && findFileByBasename(fullPath, target)) return true;
  }
  return false;
}

function tokenSet(text = "") {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "uses", "must", "should"]);
  return new Set(String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9а-яё_-]+/i)
    .filter((token) => token.length >= 4 && !stop.has(token)));
}

function jaccard(left = new Set(), right = new Set()) {
  if (!left.size || !right.size) return 0;
  const overlap = intersectionSize(left, right);
  const union = new Set([...left, ...right]).size;
  return union > 0 ? overlap / union : 0;
}

function intersectionSize(left = new Set(), right = new Set()) {
  let count = 0;
  for (const item of left) if (right.has(item)) count += 1;
  return count;
}

function countBy(entries = [], field) {
  const out = {};
  for (const entry of entries) {
    const value = entry[field] || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function countTags(entries = []) {
  const out = {};
  for (const entry of entries) {
    for (const tag of entry.tags || []) out[tag] = (out[tag] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20));
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
