#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import matter from 'gray-matter';

const COMMAND_GATE_MAP = {
  'supervibe.md': { rubric: null },
  'supervibe-adapt.md': { rubric: 'agent-delivery' },
  'supervibe-audit.md': { rubric: null },
  'supervibe-brainstorm.md': { rubric: 'requirements' },
  'supervibe-design.md': { rubric: ['prototype', 'brandbook'] },
  'supervibe-doctor.md': { rubric: null },
  'supervibe-execute-plan.md': { rubric: 'execute-plan' },
  'supervibe-gc.md': { rubric: null },
  'supervibe-genesis.md': { rubric: 'scaffold' },
  'supervibe-loop.md': { rubric: 'autonomous-loop' },
  'supervibe-plan.md': { rubric: 'plan' },
  'supervibe-presentation.md': { rubric: 'prototype' },
  'supervibe-preview.md': { rubric: null },
  'supervibe-score.md': { rubric: 'dynamic' },
  'supervibe-status.md': { rubric: null },
  'supervibe-strengthen.md': { rubric: 'agent-quality' },
  'supervibe-ui.md': { rubric: null },
  'supervibe-update.md': { rubric: null },
};

const ROOT = process.cwd();

export async function validateConfidenceGates({ rootDir = ROOT } = {}) {
  const issues = [];
  const rubricsDir = join(rootDir, 'confidence-rubrics');
  const rubricFiles = (await readdir(rubricsDir))
    .filter(file => (file.endsWith('.yaml') || file.endsWith('.yml')) && !file.startsWith('_'));
  const rubricIds = new Set(rubricFiles.map(file => file.replace(/\.(yaml|yml)$/, '')));

  for (const file of rubricFiles) {
    const data = parseYaml(await readFile(join(rubricsDir, file), 'utf8'));
    const gates = data?.gates || {};
    const block = gates['block-below'];
    const warn = gates['warn-below'];
    const max = data?.['max-score'];

    if (!Number.isFinite(block)) issues.push(`${file}: gates.block-below must be a number`);
    if (!Number.isFinite(warn)) issues.push(`${file}: gates.warn-below must be a number`);
    if (Number.isFinite(block) && Number.isFinite(warn) && warn <= block) {
      issues.push(`${file}: gates.warn-below must be greater than block-below`);
    }
    if (Number.isFinite(warn) && Number.isFinite(max) && warn > max) {
      issues.push(`${file}: gates.warn-below must not exceed max-score`);
    }
    if (Number.isFinite(block) && block < 9 && !data['loose-gate-rationale']) {
      issues.push(`${file}: block-below < 9 requires loose-gate-rationale`);
    }
  }

  const commandsDir = join(rootDir, 'commands');
  const commandFiles = (await readdir(commandsDir)).filter(file => file.endsWith('.md'));
  for (const file of commandFiles) {
    const mapping = COMMAND_GATE_MAP[file];
    if (!mapping) {
      issues.push(`${file}: missing command gate mapping in validate-confidence-gates.mjs`);
      continue;
    }
    for (const rubric of normalizeRubrics(mapping.rubric)) {
      if (rubric === 'dynamic') continue;
      if (!rubricIds.has(rubric)) issues.push(`${file}: references missing rubric ${rubric}.yaml`);
    }
  }
  for (const file of Object.keys(COMMAND_GATE_MAP)) {
    if (!commandFiles.includes(file)) issues.push(`${file}: command gate mapping references missing command file`);
  }

  const skillFiles = await walkMarkdown(join(rootDir, 'skills'));
  for (const file of skillFiles.filter(file => file.endsWith('SKILL.md'))) {
    const parsed = matter(await readFile(file, 'utf8'));
    if (parsed.data['gate-on-exit'] !== true) continue;
    const rubricPath = parsed.data['confidence-rubric'];
    if (!rubricPath) {
      issues.push(`${relativePath(rootDir, file)}: gate-on-exit true requires confidence-rubric`);
      continue;
    }
    const rubricFile = rubricPath.split(/[\\/]/).pop();
    const rubricId = rubricFile?.replace(/\.(yaml|yml)$/, '');
    if (!rubricId || !rubricIds.has(rubricId)) {
      issues.push(`${relativePath(rootDir, file)}: references missing rubric ${rubricPath}`);
    }
  }

  const spec = await readFile(join(rootDir, 'docs', 'confidence-gates-spec.md'), 'utf8');
  if (/TODO/i.test(spec)) issues.push('docs/confidence-gates-spec.md: contains TODO language');

  return { pass: issues.length === 0, issues };
}

function normalizeRubrics(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function walkMarkdown(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkMarkdown(path));
    else if (entry.name.endsWith('.md')) out.push(path);
  }
  return out;
}

function relativePath(rootDir, file) {
  return file.replace(rootDir, '').replace(/^[/\\]/, '').split('\\').join('/');
}

async function main() {
  const result = await validateConfidenceGates({ rootDir: ROOT });
  if (result.pass) {
    console.log('Confidence gate validation passed.');
    return;
  }
  console.error('Confidence gate validation failed:');
  for (const issue of result.issues) console.error(`- ${issue}`);
  process.exit(1);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('validate-confidence-gates.mjs')) {
  main().catch(err => {
    console.error(err);
    process.exit(2);
  });
}
