#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import matter from 'gray-matter';

import { selectHostAdapter } from './lib/supervibe-host-detector.mjs';

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

export async function validateArtifactLinks(root = ROOT, options = {}) {
  const issues = [];
  const warnings = [];
  const skillIds = new Set();
  const ruleNames = new Set();
  const agents = [];
  const skills = [];
  const rules = [];
  const context = resolveArtifactContext(root, options);
  const pluginRoot = context.pluginRoot || ROOT;

  for await (const path of walk(context.skillsDir)) {
    if (!path.endsWith('SKILL.md')) continue;
    const data = await readMatter(path);
    const id = data.name ? `supervibe:${data.name}` : null;
    if (id) skillIds.add(id);
    skills.push({ path, data, id });
  }

  for await (const path of walk(context.agentsDir)) {
    if (!path.endsWith('.md')) continue;
    agents.push({ path, data: await readMatter(path) });
  }

  for await (const path of walk(context.rulesDir)) {
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
    if (typeof rubric === 'string' && rubric.trim() && !(await existsAny([join(root, rubric), join(pluginRoot, rubric)]))) {
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

  if (agents.length === 0 && skills.length === 0 && rules.length === 0) {
    warnings.push({
      code: 'no-artifacts-found',
      message: `No agents, skills, or rules found under artifact root ${context.artifactRoot}`,
    });
  }

  issues.sort((a, b) => `${a.file}:${a.code}:${a.message}`.localeCompare(`${b.file}:${b.code}:${b.message}`));
  return {
    pass: issues.length === 0,
    issues,
    warnings,
    artifactRoot: context.artifactRoot,
    artifactSource: context.source,
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
  const args = parseArgs(process.argv.slice(2));
  const result = await validateArtifactLinks(args.root || process.cwd(), {
    adapterId: args.host,
    pluginRoot: args['plugin-root'] || ROOT,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.pass) process.exit(1);
    return;
  }
  if (!result.pass) {
    for (const item of result.issues) {
      console.error(`${item.file}: ${item.code}: ${item.message}`);
    }
    console.error(`\nArtifact link validation failed with ${result.issues.length} issue(s).`);
    process.exit(1);
  }
  for (const item of result.warnings) {
    console.warn(`WARN ${item.code}: ${item.message}`);
  }
  console.log(
    `Artifact link validation passed: ${result.counts.agents} agents, ${result.counts.skills} skills, ${result.counts.rules} rules (artifact root: ${result.artifactRoot}).`
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}

function resolveArtifactContext(root, { adapterId = null, pluginRoot = ROOT, env = process.env } = {}) {
  const pluginLayout = {
    source: 'plugin',
    artifactRoot: '.',
    agentsDir: join(root, 'agents'),
    skillsDir: join(root, 'skills'),
    rulesDir: join(root, 'rules'),
    pluginRoot,
  };
  const hasPluginLayout = existsSync(pluginLayout.agentsDir) || existsSync(pluginLayout.skillsDir) || existsSync(pluginLayout.rulesDir);
  const hostSelection = selectHostAdapter({
    rootDir: root,
    env: adapterId ? { ...env, SUPERVIBE_HOST: adapterId } : env,
  });
  const adapter = hostSelection.adapter;
  const hostLayout = {
    source: 'host',
    artifactRoot: adapter.modelFolder,
    agentsDir: join(root, adapter.agentsFolder),
    skillsDir: join(root, adapter.skillsFolder),
    rulesDir: join(root, adapter.rulesFolder),
    pluginRoot,
  };
  const hasHostLayout = existsSync(hostLayout.agentsDir) || existsSync(hostLayout.skillsDir) || existsSync(hostLayout.rulesDir);
  if (!hasPluginLayout && hasHostLayout) return hostLayout;
  return pluginLayout;
}

async function existsAny(paths) {
  for (const path of paths) {
    if (await exists(path)) return true;
  }
  return false;
}

function parseArgs(argv) {
  const parsed = {};
  const booleans = new Set(['json']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (booleans.has(key)) parsed[key] = true;
    else {
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}
