import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import matter from "gray-matter";

export const FOUNDATIONAL_AGENT_SKILLS = Object.freeze(new Set([
  "supervibe:project-memory",
  "supervibe:code-search",
  "supervibe:verification",
  "supervibe:code-review",
  "supervibe:confidence-scoring",
  "supervibe:tdd",
]));

export const CRITICAL_AGENT_IDS = Object.freeze([
  "supervibe-orchestrator",
  "repo-researcher",
  "code-reviewer",
  "quality-gate-reviewer",
  "root-cause-debugger",
  "security-auditor",
  "ai-agent-orchestrator",
  "systems-analyst",
  "fastify-developer",
]);

export const REQUIRED_STACK_SCENARIO_COUNT = 25;

export function loadAgentEmpiricalRecords(rootDir = process.cwd()) {
  const agentFiles = walkMarkdown(join(rootDir, "agents"));
  const skillIds = readSkillIds(rootDir);
  const records = agentFiles.map((file) => {
    const raw = readFileSync(file, "utf8");
    const parsed = matter(raw);
    const id = String(parsed.data.name || basename(file, ".md"));
    const skills = asArray(parsed.data.skills).map(String);
    const tools = asArray(parsed.data.tools).map(String);
    const foundationalSkills = skills.filter((skill) => FOUNDATIONAL_AGENT_SKILLS.has(skill));
    const specialistSkills = skills.filter((skill) => !FOUNDATIONAL_AGENT_SKILLS.has(skill));
    const relPath = toPosix(relative(rootDir, file));
    return {
      id,
      path: relPath,
      namespace: parsed.data.namespace || relPath.split("/").slice(0, -1).join("/"),
      stacks: asArray(parsed.data.stacks).map(String),
      capabilities: asArray(parsed.data.capabilities).map(String),
      tools,
      skills,
      foundationalSkills,
      specialistSkills,
      personaYears: Number(parsed.data["persona-years"] || 0),
      lastVerified: parsed.data["last-verified"] ? new Date(parsed.data["last-verified"]) : null,
      isStackAgent: relPath.startsWith("agents/stacks/"),
      isCritical: CRITICAL_AGENT_IDS.includes(id),
      body: parsed.content,
      frontmatter: parsed.data,
    };
  });
  return {
    agents: records,
    skills: skillIds,
  };
}

export function buildPerAgentEvalPacks({ rootDir = process.cwd(), minCasesPerAgent = 3 } = {}) {
  const { agents } = loadAgentEmpiricalRecords(rootDir);
  return agents.map((agent) => {
    const specialistSkill = agent.specialistSkills[0] || agent.skills[0] || "supervibe:verification";
    const evidenceSkill = agent.skills.includes("supervibe:project-memory")
      ? "supervibe:project-memory"
      : agent.skills[0] || "supervibe:verification";
    const cases = [
      {
        id: `${agent.id}-role-fit`,
        kind: "agent-role-fit",
        prompt: `Use ${agent.id} for a task matching ${agent.namespace}.`,
        expectedAgent: agent.id,
        expectedSkills: [specialistSkill],
        expectedTools: agent.tools.includes("Read") ? ["Read"] : agent.tools.slice(0, 1),
        minimumScore: 9,
      },
      {
        id: `${agent.id}-evidence-discipline`,
        kind: "agent-evidence-discipline",
        prompt: `Before ${agent.id} changes or reviews work, cite retrieval and verification evidence.`,
        expectedAgent: agent.id,
        expectedSkills: [evidenceSkill],
        expectedOutputIncludes: ["Confidence", "Override", "Rubric"],
        minimumScore: 9,
      },
      {
        id: `${agent.id}-tool-scope`,
        kind: "agent-tool-scope",
        prompt: `Confirm ${agent.id} uses only role-appropriate tools and reports blockers.`,
        expectedAgent: agent.id,
        expectedTools: agent.tools.slice(0, Math.min(2, agent.tools.length)),
        expectedOutputIncludes: ["Verification", "Out of scope"],
        minimumScore: 9,
      },
    ];
    return {
      agentId: agent.id,
      path: agent.path,
      cases: cases.slice(0, Math.max(minCasesPerAgent, 3)),
    };
  });
}

export function buildAgentCapabilityHeatmap({ rootDir = process.cwd(), now = new Date() } = {}) {
  const { agents } = loadAgentEmpiricalRecords(rootDir);
  return agents.map((agent) => {
    const freshness = evaluateAgentFreshness(agent, { now });
    const score = scoreAgentEmpiricalQuality(agent, { freshness });
    return {
      agentId: agent.id,
      namespace: agent.namespace,
      path: agent.path,
      stacks: agent.stacks,
      capabilities: agent.capabilities,
      skills: agent.skills.length,
      tools: agent.tools.length,
      foundationalSkills: agent.foundationalSkills.length,
      specialistSkills: agent.specialistSkills.length,
      writeEnabled: agent.tools.some((tool) => tool === "Write" || tool === "Edit"),
      mcpEnabled: agent.tools.some((tool) => tool.startsWith("mcp__") || tool === "WebFetch" || tool === "WebSearch"),
      currentDocsReady: freshness.currentDocsReady,
      freshnessStatus: freshness.status,
      score,
      grade: score >= 9.7 ? "excellent" : score >= 9 ? "ready" : "needs-work",
      critical: agent.isCritical,
      risks: freshness.issues,
    };
  });
}

export function scoreAgentEmpiricalQuality(agent, { freshness = evaluateAgentFreshness(agent) } = {}) {
  let score = 10;
  if (agent.personaYears < 15) score -= 1.5;
  if (agent.skills.length < 4) score -= 1.5;
  if (agent.foundationalSkills.length < 2) score -= 1;
  if (agent.specialistSkills.length < 1) score -= 1;
  if (!agent.tools.includes("Read")) score -= 1;
  if (agent.tools.length < 3) score -= 0.75;
  if (!/^## Skills\b/im.test(agent.body)) score -= 1;
  if (!/^## Verification\b/im.test(agent.body)) score -= 1;
  if (!/^## Output contract\b/im.test(agent.body)) score -= 1;
  if (!/^## Anti-patterns\b/im.test(agent.body)) score -= 0.5;
  if (!freshness.pass) score -= Math.min(1.5, freshness.issues.length * 0.5);
  return Number(Math.max(0, score).toFixed(1));
}

export function evaluateAgentFreshness(agent, { now = new Date(), maxAgeDays = 120 } = {}) {
  const issues = [];
  const lastVerified = agent.lastVerified instanceof Date && !Number.isNaN(agent.lastVerified.valueOf())
    ? agent.lastVerified
    : null;
  if (!lastVerified) {
    issues.push("missing-last-verified");
  } else {
    const ageDays = Math.floor((now.valueOf() - lastVerified.valueOf()) / 86400000);
    if (ageDays > maxAgeDays) issues.push(`stale-last-verified:${ageDays}d`);
  }

  const body = String(agent.body || "");
  const hasModernStandard = /## 2026 Expert Standard\b/i.test(body)
    || /Agent Modern Expert Standard/i.test(body);
  const hasPrimarySourcePolicy = /official docs|primary standards|source repositories|context7/i.test(body);
  const currentDocsReady = !agent.isStackAgent || (hasModernStandard && hasPrimarySourcePolicy);
  if (agent.isStackAgent && !hasModernStandard) issues.push("stack-agent-missing-2026-standard");
  if (agent.isStackAgent && !hasPrimarySourcePolicy) issues.push("stack-agent-missing-primary-source-policy");

  return {
    pass: issues.length === 0,
    status: issues.length === 0 ? "fresh" : "needs-refresh",
    currentDocsReady,
    issues,
  };
}

export function validateAgentEmpiricalHardening({ rootDir = process.cwd(), now = new Date() } = {}) {
  const issues = [];
  const { agents, skills } = loadAgentEmpiricalRecords(rootDir);
  const evalPacks = buildPerAgentEvalPacks({ rootDir });
  const heatmap = buildAgentCapabilityHeatmap({ rootDir, now });
  const playbookDoc = readOptional(join(rootDir, "docs", "critical-agent-playbooks.md"));
  const stackScenarios = readJsonOptional(join(rootDir, "tests", "fixtures", "stack-scenarios", "all-stacks.json"));
  const russianCorpus = readJsonOptional(join(rootDir, "tests", "fixtures", "agent-workflow-evals", "russian-regression-corpus.json"));

  const evalByAgent = new Map(evalPacks.map((pack) => [pack.agentId, pack]));
  for (const agent of agents) {
    const pack = evalByAgent.get(agent.id);
    if (!pack || pack.cases.length < 3) {
      issues.push(issue(agent.path, "missing-per-agent-eval-pack", `${agent.id} must have at least 3 generated eval cases.`));
    }
    const heatmapRow = heatmap.find((row) => row.agentId === agent.id);
    if (!heatmapRow) issues.push(issue(agent.path, "missing-heatmap-row", `${agent.id} missing from capability heatmap.`));
    if (heatmapRow && heatmapRow.score < 9) {
      issues.push(issue(agent.path, "low-agent-quality-score", `${agent.id} score ${heatmapRow.score} is below 9.`));
    }
    const freshness = evaluateAgentFreshness(agent, { now });
    if (!freshness.pass) {
      issues.push(issue(agent.path, "best-practices-freshness-gap", `${agent.id}: ${freshness.issues.join(",")}`));
    }
  }

  for (const agentId of CRITICAL_AGENT_IDS) {
    if (!agents.some((agent) => agent.id === agentId)) {
      issues.push(issue(agentId, "missing-critical-agent", `${agentId} is required in the critical playbook set.`));
    }
    if (!playbookDoc.includes(`### ${agentId}`)) {
      issues.push(issue("docs/critical-agent-playbooks.md", "missing-critical-agent-playbook", `${agentId} playbook is missing.`));
    }
  }

  const scenarios = Array.isArray(stackScenarios?.scenarios) ? stackScenarios.scenarios : [];
  if (scenarios.length < REQUIRED_STACK_SCENARIO_COUNT) {
    issues.push(issue("tests/fixtures/stack-scenarios/all-stacks.json", "weak-stack-scenario-fixtures", `Expected at least ${REQUIRED_STACK_SCENARIO_COUNT} stack scenarios, got ${scenarios.length}.`));
  }
  for (const scenario of scenarios) {
    if (!scenario.id || !scenario.stackText || !Array.isArray(scenario.expectedAgents) || scenario.expectedAgents.length === 0) {
      issues.push(issue("tests/fixtures/stack-scenarios/all-stacks.json", "invalid-stack-scenario", `Scenario ${scenario.id || "<missing>"} must declare stackText and expectedAgents.`));
    }
  }

  const ruCases = Array.isArray(russianCorpus?.cases) ? russianCorpus.cases : [];
  if (ruCases.length < 8) {
    issues.push(issue("tests/fixtures/agent-workflow-evals/russian-regression-corpus.json", "weak-russian-regression-corpus", `Expected at least 8 Russian regression cases, got ${ruCases.length}.`));
  }

  return {
    pass: issues.length === 0,
    checkedAgents: agents.length,
    checkedSkills: skills.length,
    evalPacks: evalPacks.length,
    evalCases: evalPacks.reduce((sum, pack) => sum + pack.cases.length, 0),
    heatmapRows: heatmap.length,
    stackScenarios: scenarios.length,
    russianCases: ruCases.length,
    minimumScore: heatmap.length ? Math.min(...heatmap.map((row) => row.score)) : 0,
    averageScore: heatmap.length
      ? Number((heatmap.reduce((sum, row) => sum + row.score, 0) / heatmap.length).toFixed(2))
      : 0,
    issues,
  };
}

export function formatAgentEmpiricalHardeningReport(report = {}) {
  const lines = [
    "SUPERVIBE_AGENT_EMPIRICAL_HARDENING",
    `PASS: ${report.pass === true}`,
    `CHECKED_AGENTS: ${report.checkedAgents || 0}`,
    `CHECKED_SKILLS: ${report.checkedSkills || 0}`,
    `EVAL_PACKS: ${report.evalPacks || 0}`,
    `EVAL_CASES: ${report.evalCases || 0}`,
    `HEATMAP_ROWS: ${report.heatmapRows || 0}`,
    `STACK_SCENARIOS: ${report.stackScenarios || 0}`,
    `RUSSIAN_CASES: ${report.russianCases || 0}`,
    `MIN_SCORE: ${report.minimumScore || 0}`,
    `AVG_SCORE: ${report.averageScore || 0}`,
    `ISSUES: ${report.issues?.length || 0}`,
  ];
  for (const item of report.issues || []) lines.push(`ISSUE: ${item.code} ${item.file} - ${item.message}`);
  return lines.join("\n");
}

export function formatCapabilityHeatmapMarkdown(rows = []) {
  const lines = [
    "# Agent Capability Heatmap",
    "",
    "Generated from agent frontmatter and body contracts.",
    "",
    "| Agent | Namespace | Skills | Tools | Foundational | Specialist | Score | Grade | Freshness | Write |",
    "|---|---:|---:|---:|---:|---:|---:|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(`| ${row.agentId} | ${row.namespace} | ${row.skills} | ${row.tools} | ${row.foundationalSkills} | ${row.specialistSkills} | ${row.score} | ${row.grade} | ${row.freshnessStatus} | ${row.writeEnabled ? "yes" : "no"} |`);
  }
  return `${lines.join("\n")}\n`;
}

function readSkillIds(rootDir) {
  const skillsDir = join(rootDir, "skills");
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `supervibe:${entry.name}`)
    .sort();
}

function walkMarkdown(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function readJsonOptional(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "");
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function issue(file, code, message) {
  return { file, code, message };
}
