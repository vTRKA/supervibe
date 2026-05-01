import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import matter from "gray-matter";

const CATEGORY_LABELS = Object.freeze({
  _core: "Core workflow",
  _design: "Design and UI",
  _meta: "System improvement",
  _ops: "Operations and security",
  _product: "Product planning",
  stacks: "Stack specialist",
});

export async function loadAgentRoster({ rootDir = process.cwd() } = {}) {
  const agentsDir = join(rootDir, "agents");
  if (!existsSync(agentsDir)) {
    return { rootDir, agents: [], count: 0, categories: [] };
  }

  const agents = [];
  for await (const filePath of walk(agentsDir)) {
    if (!filePath.endsWith(".md")) continue;
    const raw = await readFile(filePath, "utf8");
    const { data } = matter(raw);
    const relPath = toRepoRelative(rootDir, filePath);
    const id = String(data.name || basename(filePath, ".md"));
    const namespace = String(data.namespace || inferNamespace(relPath));
    const category = categoryFor(relPath, namespace);
    const description = compactDescription(data.description || "");
    agents.push({
      id,
      namespace,
      category,
      path: relPath,
      description,
      responsibility: description || fallbackResponsibility(id, category),
      capabilities: asArray(data.capabilities).map(String),
      stacks: asArray(data.stacks).map(String),
      skills: asArray(data.skills).map(String),
      tools: asArray(data.tools).map(String),
    });
  }

  agents.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
  const categories = [...new Set(agents.map((agent) => agent.category))];
  return { rootDir, agents, count: agents.length, categories };
}

export function loadAgentRosterSync({ rootDir = process.cwd() } = {}) {
  const agentsDir = join(rootDir, "agents");
  if (!existsSync(agentsDir)) {
    return { rootDir, agents: [], count: 0, categories: [] };
  }

  const agents = [];
  for (const filePath of walkSync(agentsDir)) {
    if (!filePath.endsWith(".md")) continue;
    const raw = readFileSync(filePath, "utf8");
    const { data } = matter(raw);
    const relPath = toRepoRelative(rootDir, filePath);
    const id = String(data.name || basename(filePath, ".md"));
    const namespace = String(data.namespace || inferNamespace(relPath));
    const category = categoryFor(relPath, namespace);
    const description = compactDescription(data.description || "");
    agents.push({
      id,
      namespace,
      category,
      path: relPath,
      description,
      responsibility: description || fallbackResponsibility(id, category),
      capabilities: asArray(data.capabilities).map(String),
      stacks: asArray(data.stacks).map(String),
      skills: asArray(data.skills).map(String),
      tools: asArray(data.tools).map(String),
    });
  }

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

export async function writeAgentRosterMarkdown({
  rootDir = process.cwd(),
  outPath = join(rootDir, "docs", "agent-roster.md"),
} = {}) {
  const roster = await loadAgentRoster({ rootDir });
  const markdown = formatAgentRosterMarkdown(roster);
  await writeFile(outPath, markdown, "utf8");
  return { outPath, roster, markdown };
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
  const parts = normalized.split("/");
  if (parts[1] === "stacks" && parts[2]) {
    return `Stack: ${parts[2]}`;
  }
  return CATEGORY_LABELS[namespace] || CATEGORY_LABELS[parts[1]] || "Other";
}

function inferNamespace(relPath) {
  const parts = relPath.replace(/\\/g, "/").split("/");
  return parts[1] || "agents";
}

function toRepoRelative(rootDir, filePath) {
  return relative(rootDir, filePath).split(sep).join("/");
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}
