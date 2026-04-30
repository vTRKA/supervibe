#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';

const REQUIRED_INTAKE_SECTIONS = [
  'Request as stated',
  'Restated in our words',
  'Personas',
  'Constraints',
  'Success criteria',
  'Out of scope',
  'AI/data boundary',
  'Stakeholders',
  'Open questions',
  'Suggested next step',
];

const REQUIRED_BRAINSTORM_SECTIONS = [
  'Problem statement',
  'First-principle decomposition',
  'Options explored',
  'Non-obvious risks',
  'Kill criteria',
  'Decision matrix',
  'Recommended option',
  'Open questions',
  'Next step',
];

const PLACEHOLDER_PATTERNS = [
  /\bTBD\b/i,
  /<[^>\n]+>/,
  /\.\.\./,
  /\bto be decided\b/i,
  /\bfill (?:this )?in\b/i,
];

function sectionRegex(section) {
  return new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
}

function sectionBody(markdown, section) {
  const re = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im');
  const match = re.exec(markdown);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = /^##\s+/im.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function countMarkdownItems(body) {
  return body.split(/\r?\n/).filter(line => /^\s*[-*]\s+\S/.test(line)).length;
}

function countSubsections(body, titlePrefix) {
  const re = new RegExp(`^###\\s+${titlePrefix}`, 'gim');
  return [...body.matchAll(re)].length;
}

function hasQuantitativeThreshold(body) {
  return /\b\d+\s*(%|ms|s|min|h|day|week|users?|requests?|errors?|tasks?|points?)\b/i.test(body) ||
    /[<>]=?\s*\d+/.test(body);
}

function hasPlaceholder(markdown) {
  return PLACEHOLDER_PATTERNS.some(re => re.test(markdown));
}

export function validateIntakeSpec(markdown) {
  const issues = [];
  for (const section of REQUIRED_INTAKE_SECTIONS) {
    if (!sectionRegex(section).test(markdown)) {
      issues.push(`missing section: ${section}`);
    }
  }

  const personas = sectionBody(markdown, 'Personas');
  if (countSubsections(personas, 'Persona') < 2) {
    issues.push('personas: expected at least 2 persona subsections');
  }
  for (const field of ['Role / context', 'Top 3 pains', 'Top 3 jobs-to-be-done', 'Current workaround']) {
    if (!personas.includes(field)) issues.push(`personas: missing field "${field}"`);
  }

  const constraints = sectionBody(markdown, 'Constraints');
  for (const type of ['Time', 'Budget', 'Team', 'Compliance', 'Tech stack', 'Performance', 'Localization', 'Accessibility']) {
    if (!new RegExp(`\\b${type}\\b`, 'i').test(constraints)) issues.push(`constraints: missing ${type}`);
  }

  if (countMarkdownItems(sectionBody(markdown, 'Success criteria')) < 3) {
    issues.push('success criteria: expected at least 3 measurable items');
  }
  if (countMarkdownItems(sectionBody(markdown, 'Out of scope')) < 1) {
    issues.push('out of scope: expected at least 1 explicit boundary');
  }
  const aiBoundary = sectionBody(markdown, 'AI/data boundary');
  for (const field of ['MCP', 'Figma', 'Screenshots', 'External API', 'PII', 'Approval']) {
    if (!new RegExp(field, 'i').test(aiBoundary)) issues.push(`ai/data boundary: missing ${field}`);
  }
  if (countMarkdownItems(sectionBody(markdown, 'Open questions')) < 3) {
    issues.push('open questions: expected at least 3 questions');
  }
  if (hasPlaceholder(markdown)) {
    issues.push('placeholders: unresolved placeholder text found');
  }
  return issues;
}

export function validateBrainstormSpec(markdown) {
  const issues = [];
  for (const section of REQUIRED_BRAINSTORM_SECTIONS) {
    if (!sectionRegex(section).test(markdown)) {
      issues.push(`missing section: ${section}`);
    }
  }

  const decomposition = sectionBody(markdown, 'First-principle decomposition');
  for (const subsection of ['Constraints', 'Success criteria', 'Failure modes', 'Non-goals']) {
    if (!new RegExp(`^###\\s+${subsection}\\s*$`, 'im').test(decomposition)) {
      issues.push(`first-principle decomposition: missing ${subsection}`);
    }
  }

  const options = sectionBody(markdown, 'Options explored');
  const optionCount = [...options.matchAll(/^###\s+Option\s+[A-Z0-9]/gim)].length;
  if (optionCount < 3) issues.push('options explored: expected at least 3 options');

  if (countMarkdownItems(sectionBody(markdown, 'Non-obvious risks')) < 3) {
    issues.push('non-obvious risks: expected at least 3 risks');
  }
  const killCriteria = sectionBody(markdown, 'Kill criteria');
  if (countMarkdownItems(killCriteria) < 2) {
    issues.push('kill criteria: expected at least 2 criteria');
  }
  if (!hasQuantitativeThreshold(killCriteria)) {
    issues.push('kill criteria: expected at least 1 quantitative threshold');
  }

  const matrix = sectionBody(markdown, 'Decision matrix');
  if (!/\bweights?\s+set\s+before\s+scores?\b/i.test(matrix)) {
    issues.push('decision matrix: must state weights were set BEFORE scores');
  }
  if (!/\|\s*Dimension\s*\|\s*Weight\s*\|/i.test(matrix)) {
    issues.push('decision matrix: missing Dimension/Weight table');
  }

  if (countMarkdownItems(sectionBody(markdown, 'Open questions')) < 1) {
    issues.push('open questions: must not be empty');
  }
  if (hasPlaceholder(markdown)) {
    issues.push('placeholders: unresolved placeholder text found');
  }
  return issues;
}

export function validateSpecArtifact(markdown) {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.toLowerCase() || '';
  if (heading.includes('intake') || sectionRegex('Request as stated').test(markdown)) {
    return { kind: 'intake', issues: validateIntakeSpec(markdown) };
  }
  return { kind: 'brainstorm', issues: validateBrainstormSpec(markdown) };
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

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', short: 'f' },
      all: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-spec-artifacts.mjs --file docs/specs/<spec>.md
  node scripts/validate-spec-artifacts.mjs --all`);
    process.exit(0);
  }

  const root = process.cwd();
  const files = values.file
    ? [values.file]
    : values.all
      ? await walkMarkdown(join(root, 'docs', 'specs'))
      : await walkMarkdown(join(root, 'docs', 'specs'));

  if (files.length === 0) {
    console.log('[validate-spec-artifacts] no docs/specs/*.md files found; skipping');
    return;
  }

  let failed = 0;
  for (const file of files) {
    const markdown = await readFile(file, 'utf8');
    const result = validateSpecArtifact(markdown);
    const rel = relative(root, file).split(sep).join('/');
    if (result.issues.length === 0) {
      console.log(`OK   ${result.kind.padEnd(10)} ${rel}`);
    } else {
      failed++;
      console.error(`FAIL ${result.kind.padEnd(10)} ${rel}`);
      for (const issue of result.issues) console.error(`  - ${issue}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed}/${files.length} spec artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${files.length} spec artifact(s) passed`);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('validate-spec-artifacts.mjs')) {
  main().catch(err => {
    console.error(err);
    process.exit(2);
  });
}
