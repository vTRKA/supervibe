#!/usr/bin/env node
// Host-neutral hook dispatcher for provider configs. Keeps hook commands stable
// even when the Supervibe plugin root is not the active project root.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url));

const HOOKS = Object.freeze({
  'session-start': 'scripts/session-start-check.mjs',
  sessionstart: 'scripts/session-start-check.mjs',
  'post-edit': 'scripts/post-edit-stack-watch.mjs',
  postedit: 'scripts/post-edit-stack-watch.mjs',
  posttooluse: 'scripts/post-edit-stack-watch.mjs',
  'post-tool-use': 'scripts/post-edit-stack-watch.mjs',
  'post-tool-use-log': 'scripts/hooks/post-tool-use-log.mjs',
  'task-prime': 'scripts/hooks/task-tracker-prime.mjs',
  stop: 'scripts/effectiveness-tracker.mjs',
});

const args = process.argv.slice(2);
const hookName = normalizeHookName(args[0] || '');

if (!hookName || args.includes('--help') || args.includes('-h')) {
  console.log(formatHelp());
  process.exit(hookName ? 0 : 2);
}

const script = HOOKS[hookName];
if (!script) {
  console.error(formatUnknownHook(hookName));
  process.exit(2);
}

const result = spawnSync(process.execPath, [join(PLUGIN_ROOT, script), ...args.slice(1)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    SUPERVIBE_PLUGIN_ROOT: process.env.SUPERVIBE_PLUGIN_ROOT || PLUGIN_ROOT,
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`supervibe hook dispatcher failed: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`supervibe hook dispatcher stopped by signal ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 0);

function normalizeHookName(value = '') {
  return String(value || '').trim().replace(/^--?/, '').toLowerCase();
}

function formatHelp() {
  return [
    'SUPERVIBE_HOOK_DISPATCHER',
    'Usage:',
    '  supervibe hook session-start',
    '  supervibe hook post-edit',
    '  supervibe hook post-tool-use-log',
    '  supervibe hook task-prime --text --compact-context',
    '  supervibe hook stop',
  ].join('\n');
}

function formatUnknownHook(hookName) {
  return [
    'SUPERVIBE_HOOK_DISPATCHER',
    `STATUS: unknown-hook`,
    `HOOK: ${hookName || 'missing'}`,
    'KNOWN: session-start, post-edit, post-tool-use-log, task-prime, stop',
  ].join('\n');
}