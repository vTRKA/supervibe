#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import matter from 'gray-matter';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { loadRubrics } from './lib/load-rubrics.mjs';

const ROOT_PATH = fileURLToPath(new URL('../', import.meta.url));
const OUT_PATH = join(ROOT_PATH, 'registry.yaml');
const DEFAULT_GENERATED_AT = 'deterministic-local';
const args = parseArgs(process.argv.slice(2));

function toRepoRelative(absPath) {
  return relative(ROOT_PATH, absPath).split(sep).join('/');
}

async function* walk(dirPath) {
  let entries;
  try {
    entries = (await readdir(dirPath, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
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

async function loadAgents() {
  const agents = {};
  const agentsDir = join(ROOT_PATH, 'agents');
  for await (const filePath of walk(agentsDir)) {
    if (!filePath.endsWith('.md')) continue;
    const content = await readFile(filePath, 'utf8');
    const { data } = matter(content);
    if (!data.name || !data.namespace) continue;
    const id = `supervibe:${data.namespace}:${data.name}`;
    agents[id] = {
      file: toRepoRelative(filePath),
      capabilities: data.capabilities || [],
      stacks: data.stacks || ['any'],
      requires: data['requires-stacks'] || [],
      version: data.version,
      'last-verified': data['last-verified']
    };
  }
  return agents;
}

async function loadSkills() {
  const skills = {};
  const skillsDir = join(ROOT_PATH, 'skills');
  for await (const filePath of walk(skillsDir)) {
    if (!filePath.endsWith('SKILL.md')) continue;
    const content = await readFile(filePath, 'utf8');
    const { data } = matter(content);
    if (!data.name) continue;
    const id = `supervibe:${data.name}`;
    skills[id] = {
      file: toRepoRelative(filePath),
      phase: data.phase,
      'emits-artifact': data['emits-artifact'],
      'confidence-rubric': data['confidence-rubric'],
      'gate-on-exit': data['gate-on-exit'],
      version: data.version
    };
  }
  return skills;
}

async function loadRules() {
  const rules = {};
  const rulesDir = join(ROOT_PATH, 'rules');
  for await (const filePath of walk(rulesDir)) {
    if (!filePath.endsWith('.md')) continue;
    const content = await readFile(filePath, 'utf8');
    const { data } = matter(content);
    if (!data.name) continue;
    rules[data.name] = {
      file: toRepoRelative(filePath),
      'applies-to': data['applies-to'] || ['any'],
      mandatory: data.mandatory || false,
      version: data.version,
      'last-verified': data['last-verified']
    };
  }
  return rules;
}

async function loadStackPacks() {
  const packs = {};
  const packsDir = join(ROOT_PATH, 'stack-packs');
  let entries;
  try {
    entries = (await readdir(packsDir, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    if (err.code === 'ENOENT') return packs;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;
    const manifestPath = await resolveStackPackManifestPath(join(packsDir, entry.name));
    try {
      const content = await readFile(manifestPath, 'utf8');
      const data = parseYaml(content);
      const profileNames = Object.keys(data.profiles || data['agent-profiles'] || {});
      packs[data.id || entry.name] = {
        manifest: toRepoRelative(manifestPath),
        stacks: Object.values(data.matches?.required || {}).flat(),
        architectures: data.matches?.optional?.architecture || [],
        profiles: profileNames,
        'agent-profiles': profileNames
      };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return packs;
}

async function resolveStackPackManifestPath(packDir) {
  const candidates = ['manifest.yaml', 'pack.yaml'];
  for (const file of candidates) {
    const path = join(packDir, file);
    try {
      await readFile(path, 'utf8');
      return path;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return join(packDir, 'manifest.yaml');
}

async function main() {
  const rubricsDirPath = join(ROOT_PATH, 'confidence-rubrics');

  const registry = {
    version: '1.0.0',
    'generated-at': args.generatedAt || process.env.SUPERVIBE_REGISTRY_GENERATED_AT || DEFAULT_GENERATED_AT,
    agents: await loadAgents(),
    skills: await loadSkills(),
    rules: await loadRules(),
    'stack-packs': await loadStackPacks(),
    'confidence-rubrics': await loadRubrics(rubricsDirPath, toRepoRelative)
  };

  const output = stringifyYaml(registry);
  const previous = await readOptional(OUT_PATH);
  const changed = previous !== output;
  if (changed) await writeFile(OUT_PATH, output, 'utf8');
  const counts = {
    agents: Object.keys(registry.agents).length,
    skills: Object.keys(registry.skills).length,
    rules: Object.keys(registry.rules).length,
    'stack-packs': Object.keys(registry['stack-packs']).length,
    'confidence-rubrics': Object.keys(registry['confidence-rubrics']).length
  };
  console.log(changed ? `Registry written to ${OUT_PATH}` : `Registry already up to date at ${OUT_PATH}`);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function parseArgs(argv = []) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--generated-at') parsed.generatedAt = readOptionValue(argv, ++index, arg);
    else if (arg.startsWith('--generated-at=')) parsed.generatedAt = arg.slice('--generated-at='.length);
    else if (arg === '--now-generated-at') parsed.generatedAt = new Date().toISOString();
  }
  return parsed;
}

function readOptionValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}
