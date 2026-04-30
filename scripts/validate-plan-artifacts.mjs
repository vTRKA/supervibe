#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { parseArgs } from 'node:util';

const PLACEHOLDER_PATTERNS = [
  /\bTBD\b/i,
  /<(?!sha\b)[^>\n]+>/i,
  /\.\.\./,
  /\bsimilar to\b/i,
  /\badd appropriate\b/i,
  /\bimplement later\b/i,
];

function hasSection(markdown, section) {
  return new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im').test(markdown);
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

function taskBlocks(markdown) {
  const re = /^##\s+Task\s+([^\n]+)$/gim;
  const matches = [...markdown.matchAll(re)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    return {
      title: match[1].trim(),
      body: markdown.slice(start, end).trim(),
      line: markdown.slice(0, match.index).split(/\r?\n/).length,
    };
  });
}

function hasVerification(body) {
  return /(verification|verify|run|test|check|expect|expected output|exit-code)/i.test(body) &&
    /```/.test(body);
}

function hasCheckboxSteps(body) {
  return /^\s*-\s+\[[ xX]\]\s+\*\*Step\s+\d+/m.test(body);
}

function hasFailingTest(body) {
  return /(failing test|verify fail|red phase|write failing test)/i.test(body);
}

function hasCommitStep(body) {
  return /(commit|no commits|commit suppressed)/i.test(body);
}

function hasRollback(body) {
  return /\*\*Rollback:\*\*/i.test(body);
}

function hasRisks(body) {
  return /\*\*Risks:\*\*/i.test(body) || /\bR\d+\s*:/i.test(body);
}

function hasFiles(body) {
  return /\*\*Files:\*\*/i.test(body) && /(Create|Modify|Test)\s*:/i.test(body);
}

function hasEstimate(body) {
  return /\*\*Estimated time:\*\*/i.test(body) && /confidence\s*:\s*(high|medium|low)/i.test(body);
}

function hasPlaceholder(markdown) {
  return PLACEHOLDER_PATTERNS.some(re => re.test(markdown));
}

export function validatePlanArtifact(markdown) {
  const issues = [];
  if (!/^#\s+.+Implementation Plan\s*$/im.test(markdown)) {
    issues.push('plan format: missing "# <Feature> Implementation Plan" heading');
  }
  for (const field of ['Goal', 'Architecture', 'Tech Stack']) {
    if (!new RegExp(`\\*\\*${field}:\\*\\*\\s+\\S`, 'i').test(markdown)) {
      issues.push(`plan format: missing **${field}:**`);
    }
  }
  if (!/\*\*(Hard constraints \(do not violate\)|Constraints):\*\*/i.test(markdown)) {
    issues.push('plan format: missing hard constraints block');
  }

  for (const section of ['AI/Data Boundary', 'File Structure', 'Critical Path', 'Self-Review', 'Execution Handoff']) {
    if (!hasSection(markdown, section)) issues.push(`missing section: ${section}`);
  }

  const aiBoundary = sectionBody(markdown, 'AI/Data Boundary');
  for (const field of ['MCP', 'Figma', 'External', 'PII', 'approval']) {
    if (!new RegExp(field, 'i').test(aiBoundary)) issues.push(`ai/data boundary: missing ${field}`);
  }

  const fileStructure = sectionBody(markdown, 'File Structure');
  if (!/(Create|Created|Modify|Modified)/i.test(fileStructure) || !/`[^`]+`/.test(fileStructure)) {
    issues.push('file structure: expected concrete create/modify paths');
  }

  const criticalPath = sectionBody(markdown, 'Critical Path');
  if (!/(T\d+|Task\s+\d+)/i.test(criticalPath) || !/(->|→)/.test(criticalPath)) {
    issues.push('critical path: expected dependency chain with task ids');
  }
  if (!/(parallel|off-path|\|\|)/i.test(criticalPath)) {
    issues.push('critical path: expected parallel/off-path candidates');
  }

  const tasks = taskBlocks(markdown);
  if (tasks.length === 0) {
    issues.push('tasks: expected at least one ## Task section');
  }
  for (const task of tasks) {
    const prefix = `task ${task.title} (line ${task.line})`;
    if (!hasFiles(task.body)) issues.push(`${prefix}: missing Files block with Create/Modify/Test path`);
    if (!hasEstimate(task.body)) issues.push(`${prefix}: missing estimate with confidence`);
    if (!hasRollback(task.body)) issues.push(`${prefix}: missing rollback`);
    if (!hasRisks(task.body)) issues.push(`${prefix}: missing risks/mitigation`);
    if (!hasCheckboxSteps(task.body)) issues.push(`${prefix}: missing bite-sized checkbox steps`);
    if (!hasFailingTest(task.body)) issues.push(`${prefix}: missing failing-test-first/red phase evidence`);
    if (!hasVerification(task.body)) issues.push(`${prefix}: missing verification command/code block`);
    if (!hasCommitStep(task.body)) issues.push(`${prefix}: missing commit/no-commit step`);
  }

  const selfReview = sectionBody(markdown, 'Self-Review');
  for (const part of ['Spec coverage', 'Placeholder scan', 'Type consistency']) {
    if (!new RegExp(part, 'i').test(selfReview)) issues.push(`self-review: missing ${part}`);
  }
  if (!/\|\s*Requirement\s*\|\s*Task\s*\|/i.test(selfReview)) {
    issues.push('self-review: missing spec coverage matrix');
  }

  const handoff = sectionBody(markdown, 'Execution Handoff');
  if (!/(Subagent-Driven|Inline).*(batch|batches)/is.test(handoff)) {
    issues.push('execution handoff: missing subagent or inline batches');
  }

  if (hasPlaceholder(markdown)) {
    issues.push('placeholders: unresolved placeholder/weak wording found');
  }
  return issues;
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
  node scripts/validate-plan-artifacts.mjs --file docs/plans/<plan>.md
  node scripts/validate-plan-artifacts.mjs --all`);
    process.exit(0);
  }

  const root = process.cwd();
  const files = values.file
    ? [values.file]
    : values.all
      ? await walkMarkdown(join(root, 'docs', 'plans'))
      : await walkMarkdown(join(root, 'docs', 'plans'));

  if (files.length === 0) {
    console.log('[validate-plan-artifacts] no docs/plans/*.md files found; skipping');
    return;
  }

  let failed = 0;
  for (const file of files) {
    const markdown = await readFile(file, 'utf8');
    const issues = validatePlanArtifact(markdown);
    const rel = relative(root, file).split(sep).join('/');
    if (issues.length === 0) {
      console.log(`OK   plan       ${rel}`);
    } else {
      failed++;
      console.error(`FAIL plan       ${rel}`);
      for (const issue of issues) console.error(`  - ${issue}`);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed}/${files.length} plan artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${files.length} plan artifact(s) passed`);
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('validate-plan-artifacts.mjs')) {
  main().catch(err => {
    console.error(err);
    process.exit(2);
  });
}
