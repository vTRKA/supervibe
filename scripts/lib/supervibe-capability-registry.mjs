import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { buildLocalToolMetadataContract, validateLocalToolMetadataContract } from "./supervibe-tool-metadata-contract.mjs";

const CAPABILITY_DEFINITIONS = Object.freeze([
  {
    id: "setup.genesis",
    title: "Host-aware genesis setup",
    intents: ["genesis_setup"],
    commands: ["/supervibe-genesis"],
    skills: ["supervibe:genesis"],
    agents: [],
    rules: ["operational-safety", "single-question-discipline", "agent-install-profiles"],
    verificationHooks: [
      "node --test tests/capability-registry.test.mjs",
      "node scripts/supervibe-status.mjs --capabilities",
    ],
  },
  {
    id: "maintenance.adapt",
    title: "Stack-change adaptation",
    intents: ["agent_strengthen"],
    commands: ["/supervibe-adapt"],
    skills: ["supervibe:adapt"],
    agents: ["rules-curator", "memory-curator", "repo-researcher"],
    rules: ["operational-safety", "single-question-discipline", "rule-maintenance", "agent-excellence-baseline", "agent-install-profiles"],
    verificationHooks: [
      "node scripts/validate-question-discipline.mjs",
      "node scripts/supervibe-status.mjs --capabilities",
    ],
  },
  {
    id: "maintenance.strengthen",
    title: "Artifact strengthening loop",
    intents: ["agent_strengthen"],
    commands: ["/supervibe-strengthen"],
    skills: ["supervibe:strengthen"],
    agents: ["prompt-ai-engineer"],
    rules: ["operational-safety", "confidence-discipline"],
    verificationHooks: [
      "node scripts/validate-question-discipline.mjs",
      "node scripts/supervibe-status.mjs --capabilities",
    ],
  },
  {
    id: "prompt.intent-routing",
    title: "Intent routing and prompt hardening",
    intents: ["prompt_ai_engineering", "trigger_diagnostics", "why_trigger"],
    commands: ["/supervibe", "/supervibe-security-audit"],
    skills: ["supervibe:test-strategy", "supervibe:systematic-debugging"],
    agents: ["prompt-ai-engineer"],
    rules: ["anti-hallucination", "operational-safety"],
    verificationHooks: [
      "node --test tests/intent-router-golden.test.mjs tests/supervibe-trigger-router.test.mjs",
      "node scripts/supervibe-status.mjs --intent-diagnostics",
    ],
  },
  {
    id: "diagnostics.status",
    title: "Local status and health diagnostics",
    intents: ["ready_query", "blocked_query", "memory_audit", "docs_audit"],
    commands: ["/supervibe-status"],
    skills: ["supervibe:project-memory", "supervibe:audit"],
    agents: [],
    rules: ["operational-safety", "anti-hallucination"],
    verificationHooks: [
      "node scripts/supervibe-status.mjs --no-gc-hints --no-color",
      "node scripts/supervibe-status.mjs --capabilities",
    ],
  },
  {
    id: "diagnostics.index-repair",
    title: "Index repair and health gate",
    intents: ["index_repair"],
    commands: ["/supervibe-status"],
    skills: ["supervibe:project-memory", "supervibe:verification"],
    agents: [],
    rules: ["operational-safety", "anti-hallucination"],
    verificationHooks: [
      "node scripts/supervibe-status.mjs --index-health --strict-index-health --no-gc-hints",
      "node scripts/build-code-index.mjs --root . --list-missing",
      "node scripts/build-code-index.mjs --root . --resume --source-only --max-files 200 --health",
      "node scripts/build-code-index.mjs --root . --resume --graph --max-files 200 --health",
    ],
  },
  {
    id: "preview.silent-daemon",
    title: "Silent preview daemon",
    intents: ["preview_server"],
    commands: ["/supervibe-preview"],
    skills: ["supervibe:preview-server"],
    agents: [],
    rules: ["operational-safety"],
    verificationHooks: [
      "node --test tests/silent-process-manager.test.mjs",
      "node scripts/preview-server.mjs --help",
    ],
  },
  {
    id: "delivery.command-state",
    title: "Delivery state and post-delivery controls",
    intents: ["delivery_control"],
    commands: ["/supervibe"],
    skills: ["supervibe:executing-plans"],
    agents: [],
    rules: ["single-question-discipline", "operational-safety"],
    verificationHooks: [
      "node --test tests/scenario-evals.test.mjs",
    ],
  },
  {
    id: "context.retrieval-policy",
    title: "Retrieval decision policy",
    intents: ["prompt_ai_engineering", "index_repair"],
    commands: ["/supervibe-status", "/supervibe"],
    skills: ["supervibe:project-memory", "supervibe:code-search"],
    agents: ["prompt-ai-engineer"],
    rules: ["single-question-discipline", "anti-hallucination"],
    verificationHooks: [
      "node --test tests/retrieval-decision-policy.test.mjs",
      "node scripts/audit-evidence-citations.mjs --strict",
    ],
  },
  {
    id: "ai.llm-production",
    title: "AI/LLM production engineering",
    intents: ["prompt_ai_engineering", "memory_audit", "agent_strengthen"],
    commands: ["/supervibe", "/supervibe-status", "/supervibe-loop"],
    skills: ["supervibe:project-memory", "supervibe:code-search", "supervibe:test-strategy", "supervibe:verification"],
    agents: ["llm-rag-architect", "llm-evals-engineer", "ai-agent-orchestrator", "model-ops-engineer", "prompt-ai-engineer", "ai-integration-architect"],
    rules: ["anti-hallucination", "operational-safety", "confidence-discipline"],
    verificationHooks: [
      "node --test tests/ai-llm-agent-coverage.test.mjs",
      "node scripts/supervibe-status.mjs --capabilities",
    ],
  },
]);

export function buildCapabilityRegistry({ rootDir = process.cwd() } = {}) {
  const commands = readCommandArtifacts(rootDir);
  const skills = readSkillArtifacts(rootDir);
  const agents = readAgentArtifacts(rootDir);
  const rules = readRuleArtifacts(rootDir);
  const capabilities = CAPABILITY_DEFINITIONS.map((definition) => ({
    ...definition,
    commands: [...definition.commands],
    skills: [...definition.skills],
    agents: [...definition.agents],
    rules: [...definition.rules],
    verificationHooks: [...definition.verificationHooks],
  }));
  const packageJson = readPackageJson(rootDir);
  const toolMetadata = buildLocalToolMetadataContract({
    registry: { commands, skills, agents, rules, capabilities },
    packageJson,
  });

  return {
    schemaVersion: 1,
    rootDir,
    generatedAt: "deterministic-local",
    commands,
    skills,
    agents,
    rules,
    capabilities,
    links: buildLinks(capabilities),
    toolMetadata,
  };
}

export function validateCapabilityRegistry(registry = buildCapabilityRegistry()) {
  const issues = [];
  const commandIds = new Set((registry.commands || []).map((item) => item.id));
  const skillIds = new Set((registry.skills || []).map((item) => item.id));
  const agentIds = new Set((registry.agents || []).map((item) => item.id));
  const ruleIds = new Set((registry.rules || []).map((item) => item.id));
  const agentById = new Map((registry.agents || []).map((item) => [item.id, item]));
  const toolMetadataValidation = validateLocalToolMetadataContract(registry.toolMetadata || {});
  issues.push(...toolMetadataValidation.issues.map((item) => issue(item.id, item.code, item.message)));

  for (const capability of registry.capabilities || []) {
    if (!capability.verificationHooks?.length) {
      issues.push(issue(capability.id, "missing-verification-hook", "capability references no verification hook"));
    }
    for (const command of capability.commands || []) {
      if (!commandIds.has(command)) issues.push(issue(capability.id, "missing-command", `command file missing: ${command}`));
    }
    for (const skill of capability.skills || []) {
      if (!skillIds.has(skill)) issues.push(issue(capability.id, "missing-skill", `skill file missing: ${skill}`));
    }
    for (const agent of capability.agents || []) {
      if (!agentIds.has(agent)) {
        issues.push(issue(capability.id, "missing-agent", `agent file missing: ${agent}`));
        continue;
      }
      for (const skill of agentById.get(agent)?.skills || []) {
        if (!skillIds.has(skill)) {
          issues.push(issue(capability.id, "agent-missing-skill", `agent references missing skill: ${agent} -> ${skill}`));
        }
      }
    }
    for (const rule of capability.rules || []) {
      if (!ruleIds.has(rule)) issues.push(issue(capability.id, "missing-rule", `rule file missing: ${rule}`));
    }
  }

  return {
    pass: issues.length === 0,
    issues,
    checkedCapabilities: registry.capabilities?.length || 0,
    checkedToolMetadata: toolMetadataValidation.total,
  };
}

export function formatCapabilityRegistryReport(registry = buildCapabilityRegistry(), validation = validateCapabilityRegistry(registry)) {
  const lines = [
    "SUPERVIBE_CAPABILITY_REGISTRY",
    `PASS: ${validation.pass}`,
    `CAPABILITIES: ${registry.capabilities?.length || 0}`,
    `COMMANDS: ${registry.commands?.length || 0}`,
    `AGENTS: ${registry.agents?.length || 0}`,
    `SKILLS: ${registry.skills?.length || 0}`,
    `RULES: ${registry.rules?.length || 0}`,
    `LINKS: ${registry.links?.length || 0}`,
    `TOOL_METADATA: ${registry.toolMetadata?.items?.length || 0}`,
    `ISSUES: ${validation.issues?.length || 0}`,
  ];
  for (const item of validation.issues || []) {
    lines.push(`- ${item.id} ${item.code}: ${item.message}`);
  }
  return lines.join("\n");
}

function readPackageJson(rootDir) {
  const path = join(rootDir, "package.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function getCapabilityRouteHint(intent) {
  const capability = CAPABILITY_DEFINITIONS.find((entry) => entry.intents.includes(intent));
  if (!capability) return null;
  return {
    capabilityId: capability.id,
    verificationHooks: [...capability.verificationHooks],
    toolMetadataRequired: true,
  };
}

function getCapabilityDefinitions() {
  return CAPABILITY_DEFINITIONS.map((entry) => ({
    ...entry,
    intents: [...entry.intents],
    commands: [...entry.commands],
    skills: [...entry.skills],
    agents: [...entry.agents],
    rules: [...entry.rules],
    verificationHooks: [...entry.verificationHooks],
  }));
}

function readCommandArtifacts(rootDir) {
  return readMarkdownFiles(join(rootDir, "commands"), { recursive: false })
    .map(({ path, raw }) => {
      const id = `/${basename(path, ".md")}`;
      const metadata = parseFrontmatter(raw);
      return {
        id,
        type: "command",
        path: toRepoPath(rootDir, path),
        description: metadata.description || "",
        linkedSkills: unique([...extractSkillIds(raw), inferredSkillForCommand(id)]).filter(Boolean),
      };
    })
    .sort(byId);
}

function readSkillArtifacts(rootDir) {
  return readMarkdownFiles(join(rootDir, "skills"), { recursive: true, fileName: "SKILL.md" })
    .map(({ path, raw }) => {
      const metadata = parseFrontmatter(raw);
      const name = metadata.name || basename(join(path, ".."));
      return {
        id: `supervibe:${name}`,
        type: "skill",
        path: toRepoPath(rootDir, path),
        namespace: metadata.namespace || "",
        description: metadata.description || "",
        linkedSkills: unique(extractSkillIds(raw).filter((id) => id !== `supervibe:${name}`)),
        verificationHooks: extractVerificationHooks(raw),
      };
    })
    .sort(byId);
}

function readAgentArtifacts(rootDir) {
  return readMarkdownFiles(join(rootDir, "agents"), { recursive: true })
    .map(({ path, raw }) => {
      const metadata = parseFrontmatter(raw);
      const id = metadata.name || basename(path, ".md");
      return {
        id,
        type: "agent",
        path: toRepoPath(rootDir, path),
        namespace: metadata.namespace || "",
        capabilities: asArray(metadata.capabilities),
        skills: asArray(metadata.skills),
        verificationHooks: asArray(metadata.verification),
      };
    })
    .sort(byId);
}

function readRuleArtifacts(rootDir) {
  return readMarkdownFiles(join(rootDir, "rules"), { recursive: false })
    .map(({ path, raw }) => {
      const metadata = parseFrontmatter(raw);
      return {
        id: metadata.name || basename(path, ".md"),
        type: "rule",
        path: toRepoPath(rootDir, path),
        description: metadata.description || "",
        mandatory: Boolean(metadata.mandatory),
      };
    })
    .sort(byId);
}

function buildLinks(capabilities) {
  const links = [];
  for (const capability of capabilities) {
    for (const command of capability.commands || []) links.push(link(capability.id, "command", command));
    for (const skill of capability.skills || []) links.push(link(capability.id, "skill", skill));
    for (const agent of capability.agents || []) links.push(link(capability.id, "agent", agent));
    for (const rule of capability.rules || []) links.push(link(capability.id, "rule", rule));
  }
  return links;
}

function readMarkdownFiles(dir, { recursive = true, fileName = null } = {}) {
  if (!existsSync(dir)) return [];
  const entries = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (recursive) entries.push(...readMarkdownFiles(path, { recursive, fileName }));
      continue;
    }
    if (fileName && name !== fileName) continue;
    if (!fileName && !name.endsWith(".md")) continue;
    entries.push({ path, raw: readFileSync(path, "utf8") });
  }
  return entries;
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return {};
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = raw.slice(3, end).replace(/\r\n/g, "\n");
  const metadata = {};
  let currentKey = null;
  for (const line of block.split("\n")) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();
      if (value === "") metadata[currentKey] = [];
      else if (value === ">-" || value === "|") metadata[currentKey] = "";
      else metadata[currentKey] = parseScalar(value);
      continue;
    }
    const listMatch = line.match(/^\s*-\s*(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(metadata[currentKey])) metadata[currentKey] = [];
      metadata[currentKey].push(parseScalar(listMatch[1].trim()));
      continue;
    }
    if (currentKey && typeof metadata[currentKey] === "string" && line.trim()) {
      metadata[currentKey] = `${metadata[currentKey]} ${line.trim()}`.trim();
    }
  }
  return metadata;
}

function parseScalar(value) {
  const trimmed = String(value).trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).split(",").map((item) => stripQuotes(item.trim())).filter(Boolean);
  }
  return stripQuotes(trimmed);
}

function stripQuotes(value) {
  return String(value).replace(/^['"]|['"]$/g, "");
}

function extractSkillIds(raw) {
  return unique([...String(raw).matchAll(/supervibe:[A-Za-z0-9_-]+/g)].map((match) => match[0]));
}

function extractVerificationHooks(raw) {
  return unique([...String(raw).matchAll(/(?:node|npm)\s+[^\n`]+/g)].map((match) => match[0].trim()));
}

function inferredSkillForCommand(commandId) {
  const name = commandId.replace(/^\/supervibe-?/, "");
  if (!name || name === "status" || name === "ui" || name === "preview") return null;
  return `supervibe:${name}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function link(capabilityId, targetType, targetId) {
  return { capabilityId, targetType, targetId };
}

function issue(id, code, message) {
  return { id, code, message };
}

function byId(a, b) {
  return a.id.localeCompare(b.id);
}

function toRepoPath(rootDir, path) {
  return relative(rootDir, path).replace(/\\/g, "/");
}
