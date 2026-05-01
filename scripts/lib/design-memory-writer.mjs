import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TYPE_TO_CATEGORY = {
  "accepted-decision": "decisions",
  "rejected-alternative": "decisions",
  "review-finding": "learnings",
  "learned-pattern": "patterns",
};

export function buildDesignMemoryEntry({
  type,
  title,
  summary,
  rationale = "",
  tags = [],
  evidenceLinks = [],
  artifactPaths = [],
  confidence = 8,
  agent = "design-intelligence",
  date = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!TYPE_TO_CATEGORY[type]) {
    throw new Error(`Unsupported design memory type: ${type}`);
  }
  if (!title || !summary) {
    throw new Error("Design memory entries require title and summary");
  }
  if ((type === "rejected-alternative" || type === "accepted-decision") && evidenceLinks.length === 0 && artifactPaths.length === 0) {
    throw new Error(`${type} requires at least one evidence link or artifact path`);
  }

  const normalizedTags = normalizeTags(["design", ...tags, type === "rejected-alternative" ? "rejected" : null]);
  const id = `design-${type}-${safeSlug(title)}`;
  const frontmatter = [
    "---",
    `id: ${id}`,
    `type: ${type}`,
    `date: ${date}`,
    `agent: ${agent}`,
    `confidence: ${Number(confidence)}`,
    `tags: [${normalizedTags.map((tag) => JSON.stringify(tag)).join(", ")}]`,
    "---",
  ].join("\n");
  const body = [
    `# ${title}`,
    "",
    summary,
    "",
    "## Rationale",
    rationale || "No additional rationale recorded.",
    "",
    "## Evidence",
    ...(evidenceLinks.length > 0 ? evidenceLinks.map((link) => `- ${link}`) : ["- none"]),
    "",
    "## Artifacts",
    ...(artifactPaths.length > 0 ? artifactPaths.map((path) => `- ${path}`) : ["- none"]),
    "",
  ].join("\n");

  return {
    id,
    type,
    category: TYPE_TO_CATEGORY[type],
    tags: normalizedTags,
    fileName: `${id}.md`,
    content: `${frontmatter}\n${body}`,
  };
}

export async function writeDesignMemoryEntry(entryInput, { projectRoot = ROOT } = {}) {
  const entry = typeof entryInput.content === "string" && entryInput.fileName
    ? entryInput
    : buildDesignMemoryEntry(entryInput);
  const dir = join(projectRoot, ".supervibe", "memory", entry.category);
  await mkdir(dir, { recursive: true });
  const path = join(dir, entry.fileName);
  await writeFile(path, entry.content, "utf8");
  return {
    ...entry,
    path,
  };
}

export function buildAcceptedDesignDecision(input = {}) {
  return buildDesignMemoryEntry({
    ...input,
    type: "accepted-decision",
    tags: ["accepted", ...(input.tags ?? [])],
  });
}

export function buildRejectedDesignAlternative(input = {}) {
  return buildDesignMemoryEntry({
    ...input,
    type: "rejected-alternative",
    tags: ["rejected", ...(input.tags ?? [])],
  });
}

function normalizeTags(tags) {
  return [...new Set(tags.filter(Boolean).map((tag) => String(tag).toLowerCase().trim()).filter(Boolean))];
}

function safeSlug(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9а-яё]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "entry";
}
