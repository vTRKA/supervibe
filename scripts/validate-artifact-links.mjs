#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import matter from 'gray-matter';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INTERNAL_ROUTE_SENTINELS = new Set(['supervibe:workflow-router']);
const ROUTE_REFERENCE_FILES = [
  'scripts/lib/supervibe-trigger-intent-corpus.mjs',
  'scripts/lib/supervibe-trigger-router.mjs',
  'scripts/lib/supervibe-workflow-router.mjs',
  'scripts/lib/supervibe-skill-chain.mjs',
  'scripts/lib/supervibe-chain-handoff-enforcer.mjs',
];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function* walk(dirPath) {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const childPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      yield* walk(childPath);
    } else {
      yield childPath;
    }
  }
}

function normalize(path) {
  return path.split(sep).join('/');
}

function rel(root, path) {
  return normalize(relative(root, path));
}

async function readMatter(path) {
  const content = await readFile(path, 'utf8');
  return matter(content).data || {};
}

function issue(file, code, message) {
  return { file, code, message };
}

export async function validateArtifactLinks(root = ROOT) {
  const issues = [];
  const skillIds = new Set();
  const ruleNames = new Set();
  const agents = [];
  const skills = [];
  const rules = [];

  for await (const path of walk(join(root, 'skills'))) {
    if (!path.endsWith('SKILL.md')) continue;
    const data = await readMatter(path);
    const id = data.name ? `supervibe:${data.name}` : null;
    if (id) skillIds.add(id);
    skills.push({ path, data, id });
  }

  for await (const path of walk(join(root, 'agents'))) {
    if (!path.endsWith('.md')) continue;
    agents.push({ path, data: await readMatter(path) });
  }

  for await (const path of walk(join(root, 'rules'))) {
    if (!path.endsWith('.md')) continue;
    const data = await readMatter(path);
    if (data.name) ruleNames.add(String(data.name));
    rules.push({ path, data });
  }

  for (const agent of agents) {
    for (const skillId of agent.data.skills || []) {
      if (typeof skillId !== 'string' || !skillId.startsWith('supervibe:')) continue;
      if (!skillIds.has(skillId)) {
        issues.push(issue(rel(root, agent.path), 'missing-agent-skill', `Agent references missing skill ${skillId}`));
      }
    }
  }

  for (const skill of skills) {
    const rubric = skill.data['confidence-rubric'];
    if (typeof rubric === 'string' && rubric.trim() && !(await exists(join(root, rubric)))) {
      issues.push(issue(rel(root, skill.path), 'missing-skill-rubric', `Skill references missing confidence rubric ${rubric}`));
    }
  }

  for (const rule of rules) {
    for (const related of rule.data['related-rules'] || []) {
      if (typeof related !== 'string' || !related.trim()) continue;
      if (!ruleNames.has(related)) {
        issues.push(issue(rel(root, rule.path), 'missing-related-rule', `Rule references missing related rule ${related}`));
      }
    }
  }

  for (const routeRelPath of ROUTE_REFERENCE_FILES) {
    const path = join(root, routeRelPath);
    if (!(await exists(path))) continue;
    const content = await readFile(path, 'utf8');
    const seen = new Set();
    for (const match of content.matchAll(/["'](supervibe:[a-z0-9-]+)["']/gi)) {
      const skillId = match[1];
      if (seen.has(skillId) || INTERNAL_ROUTE_SENTINELS.has(skillId)) continue;
      seen.add(skillId);
      if (!skillIds.has(skillId)) {
        issues.push(issue(routeRelPath, 'missing-routed-skill', `Route references missing skill ${skillId}`));
      }
    }
  }

  issues.sort((a, b) => `${a.file}:${a.code}:${a.message}`.localeCompare(`${b.file}:${b.code}:${b.message}`));
  return {
    pass: issues.length === 0,
    issues,
    counts: {
      agents: agents.length,
      skills: skills.length,
      rules: rules.length,
      skillIds: skillIds.size,
      ruleNames: ruleNames.size,
    },
  };
}

async function main() {
  const result = await validateArtifactLinks(process.cwd());
  if (!result.pass) {
    for (const item of result.issues) {
      console.error(`${item.file}: ${item.code}: ${item.message}`);
    }
    console.error(`\nArtifact link validation failed with ${result.issues.length} issue(s).`);
    process.exit(1);
  }
  console.log(
    `Artifact link validation passed: ${result.counts.agents} agents, ${result.counts.skills} skills, ${result.counts.rules} rules.`
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
