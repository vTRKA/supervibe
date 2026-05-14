import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import matter from "gray-matter";
import { getHostAdapterMatrix } from "./supervibe-host-adapters.mjs";

const CATEGORY_LABELS = Object.freeze({
  _core: "Core workflow",
  _design: "Design and UI",
  _meta: "System improvement",
  _ops: "Operations and security",
  _product: "Product planning",
  stacks: "Stack specialist",
});

export async function loadAgentRoster({ rootDir = process.cwd() } = {}) {
  const roots = agentScanRoots(rootDir);
  if (roots.length === 0) {
    return { rootDir, agents: [], count: 0, categories: [] };
  }

  const byId = new Map();
  for (const root of roots) {
    for await (const filePath of walk(root.absPath)) {
      if (!filePath.endsWith(".md")) continue;
      const raw = await readFile(filePath, "utf8");
      const agent = parseAgentFile({ rootDir, filePath, raw, host: root.host });
      mergeAgentEntry(byId, agent);
    }
  }

  const agents = [...byId.values()];
  agents.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  const categories = [...new Set(agents.map((agent) => agent.category))];
  return { rootDir, agents, count: agents.length, categories };
}

export function loadAgentRosterSync({ rootDir = process.cwd() } = {}) {
  const roots = agentScanRoots(rootDir);
  if (roots.length === 0) {
    return { rootDir, agents: [], count: 0, categories: [] };
  }

  const byId = new Map();
  for (const root of roots) {
    for (const filePath of walkSync(root.absPath)) {
      if (!filePath.endsWith(".md")) continue;
      const raw = readFileSync(filePath, "utf8");
      const agent = parseAgentFile({ rootDir, filePath, raw, host: root.host });
      mergeAgentEntry(byId, agent);
    }
  }

  const agents = [...byId.values()];
  agents.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  const categories = [...new Set(agents.map((agent) => agent.category))];
  return { rootDir, agents, count: agents.length, categories };
}

export function pickAgentRoleSummaries(agentIds = [], roster = { agents: [] }) {
  const byId = new Map((roster.agents || []).map((agent) => [agent.id, agent]));
  return agentIds.map((id) => {
    const agent = byId.get(id);
    return {
      id,
      category: agent?.category || "Unknown",
      responsibility: agent?.responsibility || fallbackResponsibility(id, "Unknown"),
      skills: agent?.skills || [],
      tools: agent?.tools || [],
      available: Boolean(agent),
    };
  });
}

export function formatAgentRoleSummaries(agentIds = [], roster = { agents: [] }, { max = 40 } = {}) {
  const summaries = pickAgentRoleSummaries(agentIds, roster);
  const visible = summaries.slice(0, max);
  const lines = visible.map((agent) => `- ${agent.id}: ${agent.responsibility}`);
  if (summaries.length > visible.length) {
    lines.push(`- ... ${summaries.length - visible.length} more selected agents hidden for brevity`);
  }
  return lines.join("\n");
}

export function formatAgentRosterMarkdown(roster = { agents: [], count: 0, categories: [] }) {
  const lines = [
    "# Supervibe Agent Roster",
    "",
    "This file is generated from `agents/**/*.md` frontmatter. It is the human-readable map used by genesis, README onboarding, and host instruction files so users can see which specialists exist and what each one is responsible for.",
    "",
    "Authoring reference: use [Canonical Agent Anatomy](agent-anatomy.md) for required agent depth, skill block semantics, invocation boundaries, RAG/Memory and Code Graph evidence, verification expectations, and host-neutral wording. Start new or rewritten agents from [the canonical agent template](../references/templates/agent-template.md).",
    "",
    "## How To Use This Roster",
    "",
    "Use the roster as a map of specialist responsibility, not as a menu of extra",
    "work to run on every request. Pick the narrowest agent whose trigger matches the",
    "task, risk, stack, or review need.",
    "",
    "### Categories",
    "",
    "- Core workflow: process specialists for review, debugging, research, refactoring, and quality gates.",
    "- Design and UI: product experience, visual direction, accessibility, prototypes, decks, and platform UI specialists.",
    "- Operations and security: architecture, infrastructure, AI, data, security, compliance, release, and production-risk specialists.",
    "- Product planning: PM, analytics, SEO, QA strategy, lifecycle, and systems-analysis specialists.",
    "- Stack categories: implementation or architecture specialists tied to a concrete technology stack.",
    "- System improvement: Supervibe self-management agents for memory, rules, orchestration, and framework maintenance.",
    "",
    "### Direct Invocation",
    "",
    "Direct invocation is appropriate when a user asks for a named specialist, when",
    "the request clearly matches an agent trigger, or when a host can dispatch a",
    "single bounded expert without taking over a larger workflow. The agent should",
    "stay inside its declared tools, skills, write scope, and output contract. For",
    "non-trivial changes it must cite project memory, Code RAG, Code Graph, source",
    "files, validator output, or an explicit reason a source was unavailable.",
    "",
    "### Command-Owned Invocation",
    "",
    "Command-owned invocation applies when a `/supervibe-*` workflow owns routing,",
    "state transitions, artifacts, receipts, or final acceptance. In that mode the",
    "command selects the required agents, preserves scoped runtime receipts, and",
    "decides when durable work may proceed. A controller-written draft or summary is",
    "diagnostic only until the command-owned producer, worker, reviewer, validator,",
    "or external tool has produced runtime evidence.",
    "",
    "### Agent Fan-Out Boundaries",
    "",
    "Exact one-line terminal lookups, known file-path reads, and typo-only responses",
    "may stay controller-local when they do not enter a durable Supervibe workflow.",
    "Any command-owned lifecycle, plan, graph, task, agent, skill, reviewer, worker,",
    "validator, or release workflow must use real agent fan-out even when the user",
    "phrases the work as simple. Do not use a generic agent to emulate a named",
    "producer, reviewer, worker, validator, external tool, or receipt issuer when the",
    "real runtime path exists. If the task has no matching trigger, ask for one",
    "clarifying detail or route through `/supervibe` instead of guessing.",
    "",
    `Total agents: ${roster.count}`,
    "",
  ];

  for (const category of roster.categories || []) {
    lines.push(`## ${category}`, "");
    for (const agent of roster.agents.filter((entry) => entry.category === category)) {
      const stacks = agent.stacks.length ? ` Stacks: ${agent.stacks.join(", ")}.` : "";
      lines.push(`- \`${agent.id}\` - ${agent.responsibility}${stacks}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

async function* walk(dirPath) {
  let entries = [];
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const child = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      yield* walk(child);
    } else if (entry.isFile()) {
      yield child;
    }
  }
}

function walkSync(dirPath) {
  const files = [];
  let entries = [];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const child = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSync(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function compactDescription(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*Triggers?:.*$/i, "")
    .trim();
  if (!normalized) return "";
  return normalized.length > 220 ? `${normalized.slice(0, 217).trim()}...` : normalized;
}

function fallbackResponsibility(id, category) {
  return `${category} specialist for ${String(id).replace(/-/g, " ")} tasks.`;
}

function categoryFor(relPath, namespace) {
  const normalized = relPath.replace(/\\/g, "/");
  const parts = partsAfterAgents(normalized);
  if (parts[0] === "stacks" && parts[1]) {
    return `Stack: ${parts[1]}`;
  }
  return CATEGORY_LABELS[namespace] || CATEGORY_LABELS[parts[1]] || "Other";
}

function inferNamespace(relPath) {
  const parts = partsAfterAgents(relPath);
  return parts[0] || "agents";
}

function toRepoRelative(rootDir, filePath) {
  return relative(rootDir, filePath).split(sep).join("/");
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function agentScanRoots(rootDir) {
  const candidates = [
    { host: "shared", relPath: "agents" },
    ...getHostAdapterMatrix().map((adapter) => ({ host: adapter.id, relPath: adapter.agentsFolder })),
  ];
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const relPath = normalizeRel(candidate.relPath);
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    const absPath = join(rootDir, ...relPath.split("/"));
    if (existsSync(absPath)) out.push({ ...candidate, relPath, absPath });
  }
  return out;
}

function parseAgentFile({ rootDir, filePath, raw, host }) {
  const { data } = matter(raw);
  const relPath = toRepoRelative(rootDir, filePath);
  const id = String(data.name || basename(filePath, ".md"));
  const namespace = String(data.namespace || inferNamespace(relPath));
  const category = categoryFor(relPath, namespace);
  const description = compactDescription(data.description || "");
  return {
    id,
    namespace,
    category,
    path: relPath,
    locations: [relPath],
    host,
    description,
    responsibility: description || fallbackResponsibility(id, category),
    capabilities: asArray(data.capabilities).map(String),
    stacks: asArray(data.stacks).map(String),
    skills: asArray(data.skills).map(String),
    tools: asArray(data.tools).map(String),
  };
}

function mergeAgentEntry(byId, agent) {
  const existing = byId.get(agent.id);
  if (!existing) {
    byId.set(agent.id, agent);
    return;
  }
  const locations = uniquePaths([...(existing.locations || []), agent.path, ...(agent.locations || [])]);
  if (agentPriority(agent) > agentPriority(existing)) {
    byId.set(agent.id, {
      ...agent,
      locations,
    });
    return;
  }
  existing.locations = locations;
}

function agentPriority(agent = {}) {
  const hostScore = agent.host && agent.host !== "shared" ? 2 : 0;
  const directHostScore = hostScore > 0 && isDirectAgentFile(agent.path) ? 2 : 0;
  return hostScore + directHostScore;
}

function isDirectAgentFile(relPath) {
  const parts = partsAfterAgents(relPath);
  return parts.length === 1 && String(parts[0] || "").endsWith(".md");
}

function partsAfterAgents(relPath) {
  const parts = normalizeRel(relPath).split("/");
  const agentsIndex = parts.lastIndexOf("agents");
  if (agentsIndex >= 0) return parts.slice(agentsIndex + 1);
  return parts.slice(1);
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/");
}

function uniquePaths(values = []) {
  return [...new Set(values.map(normalizeRel).filter(Boolean))];
}
