#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { resolveActiveWorkItemGraph } from './lib/supervibe-work-item-registry.mjs';

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

function hasTaskMetadata(body) {
  const required = [
    ["scope ids", /\*\*Scope IDs:\*\*\s*\S/i],
    ["requirement ids", /\*\*Requirement IDs:\*\*\s*\S/i],
    ["contract rows touched", /\*\*Contract rows touched:\*\*\s*\S/i],
    ["acceptance criteria", /\*\*Acceptance Criteria:\*\*/i],
    ["stop conditions", /\*\*Stop conditions:\*\*\s*\S/i],
  ];
  return required.filter(([, re]) => !re.test(body)).map(([name]) => name);
}

function acceptanceBody(body) {
  const match = /\*\*Acceptance Criteria:\*\*([\s\S]*?)(?=\n\s*-\s+\[[ xX]\]\s+\*\*Step|\n\*\*Stop conditions:\*\*|\n\*\*Rollback:\*\*|\n\*\*Risks:\*\*|$)/i.exec(body);
  return match ? match[1].trim() : '';
}

function hasGenericAcceptance(body) {
  const acceptance = acceptanceBody(body);
  return [
    /\bworks correctly\b/i,
    /\bdone when implemented\b/i,
    /\bfully implemented\b/i,
    /\bmake it work\b/i,
    /\bshould work\b/i,
  ].some(re => re.test(acceptance));
}

function hasPlaceholder(markdown) {
  return PLACEHOLDER_PATTERNS.some(re => re.test(markdown));
}

function hasVisualEvidence(body) {
  const text = String(body || '');
  const fallback = /\b(text\s+fallback|fallback)\b/i.test(text);
  const textFirst = /\b(text-first|text first|summary-first|human-readable summary|stage map|ASCII\s+(?:map|diagram)|improvised\s+(?:scheme|diagram)|compact\s+(?:table|stage))\b/i.test(text)
    && (/\|.+\|/.test(text) || /(?:->|=>|\bthen\b|\bstep\s+\d+)/i.test(text));
  const browserFirst = /\b(browser-first|preview|visual\s+packet|table-only)\b/i.test(text) && fallback;
  const mermaidFallback = /\bMermaid\b/i.test(text) && /accTitle/i.test(text) && /accDescr/i.test(text) && fallback;
  return textFirst || browserFirst || mermaidFallback;
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

  for (const section of ['AI/Data Boundary', 'Retrieval, CodeGraph, And Visual Evidence', 'Development Contract Map', 'File Structure', 'Critical Path', 'Scope Safety Gate', 'Delivery Strategy', 'Production Readiness', 'Final 10/10 Acceptance Gate', 'Self-Review', 'Execution Handoff']) {
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

  const retrievalVisual = sectionBody(markdown, 'Retrieval, CodeGraph, And Visual Evidence');
  for (const term of ['memory', 'RAG', 'CodeGraph']) {
    if (!new RegExp(term, 'i').test(retrievalVisual)) issues.push(`retrieval/codegraph/visual evidence: missing ${term}`);
  }
  if (!hasVisualEvidence(retrievalVisual)) {
    issues.push('retrieval/codegraph/visual evidence: missing text-first visual summary, browser preview, or accessible Mermaid fallback');
  }

  const contractMap = sectionBody(markdown, 'Development Contract Map');
  for (const term of ['Behavior', 'Architecture', 'Data', 'API', 'UI', 'Security', 'Performance', 'Observability', 'Rollout', 'Documentation', 'Owner', 'Verification']) {
    if (!new RegExp(term, 'i').test(contractMap)) issues.push(`development contract map: missing ${term}`);
  }

  const criticalPath = sectionBody(markdown, 'Critical Path');
  if (!/(T\d+|Task\s+\d+)/i.test(criticalPath) || !/(->|→)/.test(criticalPath)) {
    issues.push('critical path: expected dependency chain with task ids');
  }
  if (!/(parallel|off-path|\|\|)/i.test(criticalPath)) {
    issues.push('critical path: expected parallel/off-path candidates');
  }

  const scopeSafety = sectionBody(markdown, 'Scope Safety Gate');
  for (const term of ['approved', 'deferred', 'rejected', 'tradeoff']) {
    if (!new RegExp(term, 'i').test(scopeSafety)) issues.push(`scope safety gate: missing ${term}`);
  }

  const deliveryStrategy = sectionBody(markdown, 'Delivery Strategy');
  for (const term of ['MVP', 'phase', 'production', 'value', 'anti-bloat']) {
    if (!new RegExp(term, 'i').test(deliveryStrategy)) issues.push(`delivery strategy: missing ${term}`);
  }

  const productionReadiness = sectionBody(markdown, 'Production Readiness');
  for (const term of ['test', 'security', 'performance', 'observability', 'rollback', 'release', 'docs', 'support']) {
    if (!new RegExp(term, 'i').test(productionReadiness)) issues.push(`production readiness: missing ${term}`);
  }

  const finalGate = sectionBody(markdown, 'Final 10/10 Acceptance Gate');
  for (const term of ['10/10', 'acceptance', 'verification', 'no open blockers', 'contract coverage', 'production readiness']) {
    if (!new RegExp(term.replace('/', '\\/'), 'i').test(finalGate)) issues.push(`final 10/10 acceptance gate: missing ${term}`);
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
    const missingMetadata = hasTaskMetadata(task.body);
    for (const item of missingMetadata) issues.push(`${prefix}: missing ${item}`);
    if (!hasCheckboxSteps(task.body)) issues.push(`${prefix}: missing bite-sized checkbox steps`);
    if (!hasFailingTest(task.body)) issues.push(`${prefix}: missing failing-test-first/red phase evidence`);
    if (!hasVerification(task.body)) issues.push(`${prefix}: missing verification command/code block`);
    if (!hasCommitStep(task.body)) issues.push(`${prefix}: missing commit/no-commit step`);
    if (hasGenericAcceptance(task.body)) issues.push(`${prefix}: generic acceptance criteria are not allowed`);
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

export async function inspectActivePlanSource({ rootDir = process.cwd() } = {}) {
  const active = await resolveActiveWorkItemGraph({ rootDir });
  if (active.status !== 'active') {
    return {
      status: active.status === 'none' ? 'no-active-graph' : active.status,
      warnings: [],
      issues: [],
      active,
    };
  }

  const graph = JSON.parse(await readFile(active.graphPath, 'utf8'));
  const sourcePath = graph.source?.path || graph.metadata?.sourcePlanSnapshot?.path || graph.planPath || null;
  const snapshotPath = graph.source?.snapshotPath || graph.metadata?.sourcePlanSnapshot?.storedPath || null;
  if (!sourcePath) {
    return {
      status: 'missing-source-reference',
      active,
      graphPath: active.graphPath,
      warnings: [],
      issues: [`active graph ${toRel(rootDir, active.graphPath)} has no source plan reference`],
    };
  }

  const originalPath = resolve(rootDir, sourcePath);
  if (existsSync(originalPath)) {
    return {
      status: 'original',
      active,
      graphPath: active.graphPath,
      sourcePath: originalPath,
      warnings: [],
      issues: [],
    };
  }

  const resolvedSnapshotPath = snapshotPath ? resolve(dirname(active.graphPath), snapshotPath) : null;
  if (resolvedSnapshotPath && existsSync(resolvedSnapshotPath)) {
    return {
      status: 'snapshot',
      active,
      graphPath: active.graphPath,
      sourcePath: originalPath,
      snapshotPath: resolvedSnapshotPath,
      warnings: [`active graph source missing, using snapshot fallback: ${toRel(rootDir, resolvedSnapshotPath)}`],
      issues: [],
    };
  }

  return {
    status: 'missing-source',
    active,
    graphPath: active.graphPath,
    sourcePath: originalPath,
    snapshotPath: resolvedSnapshotPath,
    warnings: [],
    issues: [`active graph source is missing and no snapshot fallback exists: ${toRel(rootDir, originalPath)}`],
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', short: 'f' },
      all: { type: 'boolean', default: false },
      'require-active-source': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node scripts/validate-plan-artifacts.mjs --file .supervibe/artifacts/plans/<plan>.md
  node scripts/validate-plan-artifacts.mjs --all
  node scripts/validate-plan-artifacts.mjs --all --require-active-source`);
    process.exit(0);
  }

  const root = process.cwd();
  const files = values.file
    ? [values.file]
    : values.all
      ? await walkMarkdown(join(root, '.supervibe', 'artifacts', 'plans'))
      : await walkMarkdown(join(root, '.supervibe', 'artifacts', 'plans'));

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

  const activeSource = await inspectActivePlanSource({ rootDir: root });
  if (activeSource.status === 'original') {
    console.log(`OK   active-source ${toRel(root, activeSource.sourcePath)}`);
  } else if (activeSource.status === 'snapshot') {
    if (values['require-active-source']) failed++;
    const write = values['require-active-source'] ? console.error : console.warn;
    for (const warning of activeSource.warnings) write(`${values['require-active-source'] ? 'FAIL' : 'WARN'} active-source ${warning}`);
  } else if (activeSource.issues?.length) {
    if (values['require-active-source']) failed++;
    const write = values['require-active-source'] ? console.error : console.warn;
    write(`${values['require-active-source'] ? 'FAIL' : 'WARN'} active-source ${toRel(root, activeSource.graphPath)}`);
    for (const issue of activeSource.issues) write(`  - ${issue}`);
  } else if (files.length === 0) {
    console.log('[validate-plan-artifacts] no .supervibe/artifacts/plans/*.md files found and no active work graph source to inspect; skipping');
  }

  if (failed > 0) {
    console.error(`\n${failed}/${Math.max(files.length, 1)} plan/source artifact(s) failed`);
    process.exit(1);
  }
  console.log(`\nAll ${files.length} plan artifact(s) passed`);
}

function toRel(root, filePath) {
  if (!filePath) return 'unknown';
  return relative(root, filePath).split(sep).join('/');
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`;
if (isMain || process.argv[1]?.endsWith('validate-plan-artifacts.mjs')) {
  main().catch(err => {
    console.error(err);
    process.exit(2);
  });
}
