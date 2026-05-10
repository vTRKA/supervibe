#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { resolveSupervibeProjectRoot } from '../lib/supervibe-plugin-root.mjs';
import {
  artifactRoot,
  formatArtifactRootBlockReason,
  legacyProjectArtifactMatch,
} from '../lib/supervibe-artifact-roots.mjs';
import { evaluatePrototypeTransition } from '../lib/design-flow-state.mjs';
import {
  readWorkflowReceipts,
  validateWorkflowReceiptTrust,
} from '../lib/supervibe-workflow-receipt-runtime.mjs';

const FRAMEWORK_PATTERNS = [
  /\bimport\s+.+\s+from\s+['"](?!(?:\.{0,2}\/|\/|#))/,
  /\brequire\s*\(/,
  /<script\s+[^>]*src=["'][^"']*(?:unpkg|cdn|jsdelivr|node_modules)/i,
  /\bfrom\s+['"](?:react|vue|svelte|next|nuxt|astro|@angular)/,
];
const ADVANCED_VISUAL_PATTERNS = [
  /\b<canvas\b/i,
  /\bgetContext\s*\(\s*['"](?:2d|webgl2?|bitmaprenderer)['"]\s*\)/i,
  /\bWebGLRenderingContext\b/i,
  /\bthree(?:\.module)?\.js\b/i,
  /\bTHREE\./,
  /\b(?:lottie|rive|pixi|matter|maplibre|echarts|d3)\b/i,
];

const PROTOTYPE_DIR_RE = /(?:^|[\\/])\.supervibe[\\/]artifacts[\\/]prototypes[\\/][^\\/]+[\\/]/;
const PROTOTYPE_SURFACE_RE = /\.(?:html|css|js|mjs)$/i;
const PROTOTYPE_BUILDER_OUTPUT_RE = /(?:^|[\\/])(?:index\.html|variants[\\/][^\\/]+[\\/]index\.html)$/i;
const UI_SOURCE_RE = /(?:^|[\\/])(?:src|app|pages|components|styles|assets)[\\/].*\.(?:css|scss|sass|less|html|jsx|tsx|vue|svelte|astro)$/i;
const RAW_HEX_RE = /(?<![A-Za-z0-9_-])#[0-9a-fA-F]{3,8}\b/;
const TOKENIZED_PX_PROPERTY_RE = /\b(?:margin|padding|gap|inset|top|right|bottom|left|width|height|min-width|max-width|min-height|max-height|border-radius|font-size|line-height|letter-spacing)\s*:\s*[^;]*\b(?!0px\b|1px\b)\d+(?:\.\d+)?px\b/i;

function readEvent() {
  let raw = '';
  process.stdin.on('data', chunk => raw += chunk);
  return new Promise(r => process.stdin.on('end', () => {
    try { r(raw ? JSON.parse(raw) : {}); } catch { r({}); }
  }));
}

function emit(decision, reason) {
  const payload = reason ? { decision, reason } : { decision };
  console.log(JSON.stringify(payload));
  process.exit(decision === 'block' ? 2 : 0);
}

function hasActiveDesignSystem(projectRoot) {
  const manifestPaths = [
    resolve(artifactRoot(projectRoot, 'prototypes'), '_design-system', 'manifest.json'),
    resolve(projectRoot, 'prototypes', '_design-system', 'manifest.json'),
  ];
  for (const manifestPath of manifestPaths) {
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      return ['candidate', 'approved', 'final'].includes(String(manifest.status || '').toLowerCase()) ||
        ['candidate', 'final'].includes(String(manifest.tokensState || '').toLowerCase()) ||
        Object.values(manifest.sections || {}).some(value => /candidate|approved|final/i.test(String(value)));
    } catch {
      continue;
    }
  }
  return false;
}

function detectDesignTokenBypass(content) {
  const text = String(content || '');
  const rawHex = text.match(RAW_HEX_RE)?.[0];
  if (rawHex) {
    return `Raw color ${rawHex} detected in prototype write while a candidate or final design system exists. Use .supervibe/artifacts/prototypes/_design-system/tokens.css variables or request a design-system extension.`;
  }

  const magicLine = text.split(/\r?\n/).find(line => TOKENIZED_PX_PROPERTY_RE.test(line) && !line.includes('var('));
  if (magicLine) {
    return `Hardcoded layout pixel value detected in prototype write while a candidate or final design system exists: ${magicLine.trim().slice(0, 160)}. Use spacing/radius/type tokens or request a design-system extension.`;
  }

  return null;
}

function hasApprovedPrototypeCapabilityPlan(projectRoot, slug) {
  const planPath = resolve(artifactRoot(projectRoot, 'prototypes'), slug, 'decisions', 'prototype-capability-plan.md');
  if (!existsSync(planPath)) return false;
  const text = readFileSync(planPath, 'utf8');
  return /Prototype Capability Plan/i.test(text) &&
    /Mode:\s*(bundled-dependency|framework-sandbox|handoff-only)/i.test(text) &&
    /Libraries \/ APIs/i.test(text) &&
    /Rejected Native Alternative/i.test(text) &&
    /License \/ Security/i.test(text) &&
    /Bundle \/ Performance/i.test(text) &&
    /Accessibility Fallback/i.test(text) &&
    /Reduced-Motion Fallback/i.test(text) &&
    /Verification Commands/i.test(text);
}

function normalizeRelPath(value = '') {
  return String(value || '').split(sep).join('/').replace(/\\/g, '/').replace(/^\.\//, '');
}

function prototypeArtifactRelPath(projectRoot, filePath) {
  const rel = normalizeRelPath(relative(projectRoot, filePath));
  if (!rel.startsWith('..')) return rel;
  const match = normalizeRelPath(filePath).match(/\.supervibe\/artifacts\/prototypes\/.+$/);
  return match ? match[0] : rel;
}

function sameArtifact(left = '', right = '') {
  const a = normalizeRelPath(left);
  const b = normalizeRelPath(right);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function hasActivePrototypeBuilderTransaction(projectRoot, slug) {
  const transactionPath = resolve(artifactRoot(projectRoot, 'prototypes'), slug, '.prototype-builder-transaction.json');
  if (!existsSync(transactionPath)) return false;
  try {
    const transaction = JSON.parse(readFileSync(transactionPath, 'utf8'));
    return String(transaction.status || '').toLowerCase() === 'active' &&
      String(transaction.subjectId || transaction.agentId || '') === 'prototype-builder' &&
      String(transaction.stage || transaction.stageId || '') === 'stage-5-prototype-build';
  } catch {
    return false;
  }
}

function hasTrustedPrototypeBuilderReceipt(projectRoot, artifactRelPath) {
  return readWorkflowReceipts(projectRoot).some((receipt) => {
    if (receipt.__invalidJson || receipt.command !== '/supervibe-design') return false;
    const subjectId = receipt.subjectId ?? receipt.agentId ?? receipt.workerId;
    if (subjectId !== 'prototype-builder') return false;
    if (receipt.stage !== 'stage-5-prototype-build') return false;
    if (receipt.status !== 'completed') return false;
    if (receipt.recovery || receipt.runtime?.recovery) return false;
    const outputs = Array.isArray(receipt.outputArtifacts) ? receipt.outputArtifacts : [];
    if (!outputs.some((output) => sameArtifact(output, artifactRelPath))) return false;
    return validateWorkflowReceiptTrust(projectRoot, receipt).pass === true;
  });
}

function prototypeBuilderGateReason(projectRoot, slug, filePath) {
  if (!PROTOTYPE_BUILDER_OUTPUT_RE.test(filePath)) return null;
  const artifactRelPath = prototypeArtifactRelPath(projectRoot, filePath);
  if (hasActivePrototypeBuilderTransaction(projectRoot, slug)) return null;
  if (hasTrustedPrototypeBuilderReceipt(projectRoot, artifactRelPath)) return null;
  return `${artifactRelPath}: prototype index writes require an active prototype-builder transaction at .supervibe/artifacts/prototypes/${slug}/.prototype-builder-transaction.json or a trusted stage-5-prototype-build receipt before the controller may edit durable prototype output.`;
}

const event = await readEvent();
const tool = event.tool_name;
if (tool !== 'Write' && tool !== 'Edit') emit('allow');

const path = event.tool_input?.file_path || '';
const projectRoot = resolveSupervibeProjectRoot();
const content = event.tool_input?.content || event.tool_input?.new_string || '';

const legacyArtifact = legacyProjectArtifactMatch(path, projectRoot);
if (legacyArtifact) emit('block', formatArtifactRootBlockReason(legacyArtifact));

if (!PROTOTYPE_DIR_RE.test(path)) {
  if (UI_SOURCE_RE.test(path) && hasActiveDesignSystem(projectRoot)) {
    const bypassReason = detectDesignTokenBypass(content);
    if (bypassReason) emit('block', bypassReason);
  }
  emit('allow');
}

if (path.includes('/handoff/') || path.includes('\\handoff\\')) emit('allow');

const slugMatch = path.match(/\.supervibe[\\/]artifacts[\\/]prototypes[\\/]([^\\/]+)/);
const slug = slugMatch ? slugMatch[1] : null;
if (!slug || slug === '_design-system' || slug === '_brandbook') emit('allow');

// Item 1 — viewport gate: config.json must exist before any prototype file write
const configPath = resolve(artifactRoot(projectRoot, 'prototypes'), slug, 'config.json');
const isWritingConfig = path.endsWith(`.supervibe/artifacts/prototypes/${slug}/config.json`) ||
                        path.endsWith(`.supervibe\\artifacts\\prototypes\\${slug}\\config.json`);
if (!existsSync(configPath) && !isWritingConfig) {
  emit('block', `.supervibe/artifacts/prototypes/${slug}/config.json must exist before writing other files. The viewport question must be asked and config persisted FIRST. See skills/prototype/SKILL.md Step 2. To migrate existing prototypes, run: npm run migrate:prototype-configs.`);
}

// Item 6 - dependency boundary gate
for (const pat of FRAMEWORK_PATTERNS) {
  if (pat.test(content)) {
    if (hasApprovedPrototypeCapabilityPlan(projectRoot, slug)) continue;
    emit('block', `Unapproved dependency coupling detected in prototype write (${pat}). Add .supervibe/artifacts/prototypes/${slug}/decisions/prototype-capability-plan.md with mode, libraries, rejected native alternative, license/security, bundle/performance, accessibility fallback, reduced-motion fallback, and verification commands before using dependency imports. See skills/prototype/SKILL.md anti-pattern 'unapproved-dependency-coupling'.`);
  }
}

for (const pat of ADVANCED_VISUAL_PATTERNS) {
  if (pat.test(content)) {
    if (hasApprovedPrototypeCapabilityPlan(projectRoot, slug)) continue;
    emit('block', `Advanced visual/canvas/3D capability detected in prototype write (${pat}). Add .supervibe/artifacts/prototypes/${slug}/decisions/prototype-capability-plan.md before HTML/CSS/JS writes, including screenshot or canvas-pixel verification and reduced-motion fallback evidence.`);
  }
}

// Item 7 — approved design-system gate: once tokens/components are approved,
// prototype surfaces must consume them instead of inventing visual values.
if (PROTOTYPE_SURFACE_RE.test(path)) {
  const transition = evaluatePrototypeTransition(projectRoot);
  if (!transition.allowed) {
    emit('block', `${transition.reason} Missing sections: ${(transition.missingSections || []).join(', ') || 'N/A'}.`);
  }
}

if (PROTOTYPE_SURFACE_RE.test(path)) {
  const builderGateReason = prototypeBuilderGateReason(projectRoot, slug, path);
  if (builderGateReason) emit('block', builderGateReason);
}

if (PROTOTYPE_SURFACE_RE.test(path) && hasActiveDesignSystem(projectRoot)) {
  const bypassReason = detectDesignTokenBypass(content);
  if (bypassReason) emit('block', bypassReason);
}

emit('allow');
