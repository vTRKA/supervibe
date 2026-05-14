import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_AGENT_ALIASES = Object.freeze({
  "stack-developer": [
    "react-implementer",
    "nextjs-developer",
    "express-developer",
    "nestjs-developer",
    "fastify-developer",
    "django-developer",
    "fastapi-developer",
    "rails-developer",
    "laravel-developer",
    "spring-developer",
    "go-service-developer",
  ],
});

export function buildAgentKnowledgeContexts({ agentIds = [], projectRoot, pluginRoot, hostAgentsFolder } = {}) {
  const contexts = new Map();
  for (const agentId of agentIds || []) {
    contexts.set(agentId, buildAgentKnowledgeContext({ agentId, projectRoot, pluginRoot, hostAgentsFolder }));
  }
  return contexts;
}

export function buildAgentKnowledgeContext({ agentId, projectRoot, pluginRoot, hostAgentsFolder } = {}) {
  const resolution = resolveAgentKnowledgeSource({
    agentId,
    projectRoot,
    pluginRoot,
    hostAgentsFolder,
  });
  const agentInstructionPaths = resolution.agentInstructionPaths;
  const sourceText = readFirstExistingText(resolution.sourcePriorityPaths);
  const declaredSkills = parseFrontmatterList(sourceText, "skills");
  const skillPaths = declaredSkills
    .map((skillId) => ({ skillId, path: resolveSkillPath(skillId, { projectRoot, pluginRoot }) }))
    .filter((entry) => entry.path);
  const missing = [];
  if (agentInstructionPaths.length === 0) missing.push("agent-instructions");
  if (declaredSkills.length === 0) missing.push("declared-skills");
  if (declaredSkills.length > 0 && skillPaths.length < declaredSkills.length) missing.push("declared-skill-files");
  return {
    agentId,
    resolvedAgentId: resolution.resolvedAgentId,
    aliasResolved: resolution.resolvedAgentId !== agentId,
    status: missing.length === 0 ? "ready" : "partial",
    agentInstructionPaths: agentInstructionPaths.map(normalizePathForPayload),
    declaredSkills,
    skillPaths: skillPaths.map((entry) => ({ ...entry, path: normalizePathForPayload(entry.path) })),
    missing,
  };
}

export function appendKnowledgeBootstrap(message, context = {}) {
  const agentPaths = (context.agentInstructionPaths || []).join(", ") || "missing-agent-instructions";
  const skillRefs = (context.skillPaths || [])
    .map((entry) => entry.skillId + "=" + entry.path)
    .join(", ") || "none";
  const declaredSkills = (context.declaredSkills || []).join(", ") || "none";
  const missing = (context.missing || []).join(", ") || "none";
  const resolved = context.aliasResolved
    ? " Requested agent id: " + context.agentId + ". Resolved physical agent instructions: " + context.resolvedAgentId + "."
    : "";
  return [
    message,
    "Knowledge bootstrap:" + resolved + " Before task-specific work, read agent instruction file(s): " + agentPaths + ". Declared skills: " + declaredSkills + ". Skill instruction file(s): " + skillRefs + ". If missing context is not \"none\" (" + missing + "), report it as a blocker instead of acting as a generic agent.",
  ].filter(Boolean).join(" ");
}

function resolveAgentKnowledgeSource({ agentId, projectRoot, pluginRoot, hostAgentsFolder } = {}) {
  const candidateIds = [agentId, ...(DEFAULT_AGENT_ALIASES[agentId] || [])].filter(Boolean);
  const roots = {
    host: hostAgentsFolder ? join(projectRoot, ...String(hostAgentsFolder).split("/")) : null,
    project: projectRoot ? join(projectRoot, "agents") : null,
    plugin: join(pluginRoot || projectRoot, "agents"),
  };
  for (const candidateId of candidateIds) {
    const hostAgentPath = roots.host ? findMarkdownById(roots.host, candidateId) : null;
    const projectAgentPath = roots.project ? findMarkdownById(roots.project, candidateId) : null;
    const pluginAgentPath = roots.plugin ? findMarkdownById(roots.plugin, candidateId) : null;
    const agentInstructionPaths = uniquePaths([hostAgentPath, projectAgentPath, pluginAgentPath]);
    if (agentInstructionPaths.length > 0) {
      return {
        resolvedAgentId: candidateId,
        agentInstructionPaths,
        sourcePriorityPaths: [projectAgentPath, pluginAgentPath, hostAgentPath],
      };
    }
  }
  return {
    resolvedAgentId: agentId,
    agentInstructionPaths: [],
    sourcePriorityPaths: [],
  };
}

function findMarkdownById(dir, agentId) {
  if (!dir || !existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      const found = findMarkdownById(path, agentId);
      if (found) return found;
    } else if (entry === String(agentId) + ".md") {
      return path;
    }
  }
  return null;
}

function readFirstExistingText(paths = []) {
  for (const path of paths) {
    if (path && existsSync(path)) return readFileSync(path, "utf8");
  }
  return "";
}

function parseFrontmatterList(text = "", key = "") {
  const match = String(text || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return [];
  const lines = match[1].split(/\r?\n/);
  const values = [];
  let inList = false;
  for (const line of lines) {
    if (line.trim() === key + ":") {
      inList = true;
      continue;
    }
    if (inList && /^\S/.test(line)) break;
    if (!inList) continue;
    const item = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
    if (item) values.push(item[1].trim());
  }
  return values;
}

function resolveSkillPath(skillId, { projectRoot, pluginRoot } = {}) {
  const slug = String(skillId || "").split(":").pop();
  if (!slug) return null;
  const candidates = [
    projectRoot ? join(projectRoot, "skills", slug, "SKILL.md") : null,
    pluginRoot ? join(pluginRoot, "skills", slug, "SKILL.md") : null,
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function uniquePaths(paths = []) {
  return [...new Set(paths.filter(Boolean))];
}

function normalizePathForPayload(path = "") {
  return String(path || "").replace(/\\/g, "/");
}
