#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FRAMEWORK_PATTERNS = [
  /\bimport\s+.+\s+from\s+['"]/,
  /\brequire\s*\(/,
  /<script\s+[^>]*src=["'][^"']*(?:unpkg|cdn|jsdelivr|node_modules)/i,
  /\bfrom\s+['"](?:react|vue|svelte|next|nuxt|astro|@angular)/,
];

const PROTOTYPE_DIR_RE = /(?:^|[\\/])prototypes[\\/][^\\/]+[\\/]/;

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

const event = await readEvent();
const tool = event.tool_name;
if (tool !== 'Write' && tool !== 'Edit') emit('allow');

const path = event.tool_input?.file_path || '';
if (!PROTOTYPE_DIR_RE.test(path)) emit('allow');

if (path.includes('/handoff/') || path.includes('\\handoff\\')) emit('allow');

const slugMatch = path.match(/prototypes[\\/]([^\\/]+)/);
const slug = slugMatch ? slugMatch[1] : null;
if (!slug || slug === '_design-system' || slug === '_brandbook') emit('allow');

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Item 1 — viewport gate: config.json must exist before any prototype file write
const configPath = resolve(projectRoot, 'prototypes', slug, 'config.json');
const isWritingConfig = path.endsWith(`prototypes/${slug}/config.json`) ||
                        path.endsWith(`prototypes\\${slug}\\config.json`);
if (!existsSync(configPath) && !isWritingConfig) {
  emit('block', `prototypes/${slug}/config.json must exist before writing other files. The viewport question must be asked and config persisted FIRST. See skills/prototype/SKILL.md Step 2. To migrate existing prototypes, run: npm run migrate:prototype-configs.`);
}

// Item 6 — framework gate
const content = event.tool_input?.content || '';
for (const pat of FRAMEWORK_PATTERNS) {
  if (pat.test(content)) {
    emit('block', `Framework coupling detected in prototype write (${pat}). Prototypes must be native HTML/CSS/JS only. See skills/prototype/SKILL.md anti-pattern 'framework-coupling'.`);
  }
}

emit('allow');
