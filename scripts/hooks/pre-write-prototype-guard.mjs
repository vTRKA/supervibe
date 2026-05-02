#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveSupervibeProjectRoot } from '../lib/supervibe-plugin-root.mjs';

const FRAMEWORK_PATTERNS = [
  /\bimport\s+.+\s+from\s+['"]/,
  /\brequire\s*\(/,
  /<script\s+[^>]*src=["'][^"']*(?:unpkg|cdn|jsdelivr|node_modules)/i,
  /\bfrom\s+['"](?:react|vue|svelte|next|nuxt|astro|@angular)/,
];

const PROTOTYPE_DIR_RE = /(?:^|[\\/])prototypes[\\/][^\\/]+[\\/]/;
const PROTOTYPE_SURFACE_RE = /\.(?:html|css|js|mjs)$/i;
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
  const manifestPath = resolve(projectRoot, 'prototypes', '_design-system', 'manifest.json');
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return ['candidate', 'approved', 'final'].includes(String(manifest.status || '').toLowerCase()) ||
      ['candidate', 'final'].includes(String(manifest.tokensState || '').toLowerCase()) ||
      Object.values(manifest.sections || {}).some(value => /candidate|approved|final/i.test(String(value)));
  } catch {
    return false;
  }
}

function detectDesignTokenBypass(content) {
  const text = String(content || '');
  const rawHex = text.match(RAW_HEX_RE)?.[0];
  if (rawHex) {
    return `Raw color ${rawHex} detected in prototype write while a candidate or final design system exists. Use prototypes/_design-system/tokens.css variables or request a design-system extension.`;
  }

  const magicLine = text.split(/\r?\n/).find(line => TOKENIZED_PX_PROPERTY_RE.test(line) && !line.includes('var('));
  if (magicLine) {
    return `Hardcoded layout pixel value detected in prototype write while a candidate or final design system exists: ${magicLine.trim().slice(0, 160)}. Use spacing/radius/type tokens or request a design-system extension.`;
  }

  return null;
}

const event = await readEvent();
const tool = event.tool_name;
if (tool !== 'Write' && tool !== 'Edit') emit('allow');

const path = event.tool_input?.file_path || '';
const projectRoot = resolveSupervibeProjectRoot();
const content = event.tool_input?.content || event.tool_input?.new_string || '';

if (!PROTOTYPE_DIR_RE.test(path)) {
  if (UI_SOURCE_RE.test(path) && hasActiveDesignSystem(projectRoot)) {
    const bypassReason = detectDesignTokenBypass(content);
    if (bypassReason) emit('block', bypassReason);
  }
  emit('allow');
}

if (path.includes('/handoff/') || path.includes('\\handoff\\')) emit('allow');

const slugMatch = path.match(/prototypes[\\/]([^\\/]+)/);
const slug = slugMatch ? slugMatch[1] : null;
if (!slug || slug === '_design-system' || slug === '_brandbook') emit('allow');

// Item 1 — viewport gate: config.json must exist before any prototype file write
const configPath = resolve(projectRoot, 'prototypes', slug, 'config.json');
const isWritingConfig = path.endsWith(`prototypes/${slug}/config.json`) ||
                        path.endsWith(`prototypes\\${slug}\\config.json`);
if (!existsSync(configPath) && !isWritingConfig) {
  emit('block', `prototypes/${slug}/config.json must exist before writing other files. The viewport question must be asked and config persisted FIRST. See skills/prototype/SKILL.md Step 2. To migrate existing prototypes, run: npm run migrate:prototype-configs.`);
}

// Item 6 — framework gate
for (const pat of FRAMEWORK_PATTERNS) {
  if (pat.test(content)) {
    emit('block', `Framework coupling detected in prototype write (${pat}). Prototypes must be native HTML/CSS/JS only. See skills/prototype/SKILL.md anti-pattern 'framework-coupling'.`);
  }
}

// Item 7 — approved design-system gate: once tokens/components are approved,
// prototype surfaces must consume them instead of inventing visual values.
if (PROTOTYPE_SURFACE_RE.test(path) && hasActiveDesignSystem(projectRoot)) {
  const bypassReason = detectDesignTokenBypass(content);
  if (bypassReason) emit('block', bypassReason);
}

emit('allow');
