#!/usr/bin/env node
// Post-edit hook: detects new dependencies in manifests OR new rule files; emits reminder.
// Reads CLAUDE_FILE_PATHS env var (comma-separated paths affected by tool use).

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const editedPaths = (process.env.CLAUDE_FILE_PATHS || '').split(',').filter(Boolean);
if (editedPaths.length === 0) process.exit(0);

const MANIFESTS = new Set(['package.json', 'composer.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'Gemfile']);

const reminders = [];

for (const path of editedPaths) {
  const name = basename(path);
  if (MANIFESTS.has(name)) {
    reminders.push(`Discovered: edit to ${name}. If a major dependency was added/upgraded, recommend /evolve-adapt to update agent context.`);
  }
  if (path.includes('/.claude/rules/') && path.endsWith('.md')) {
    reminders.push(`Discovered: edit to .claude/rules/. Recommend rules-curator review + /evolve-sync-rules if multi-project setup.`);
  }
}

if (reminders.length > 0) {
  console.log(reminders.join('\n'));
}
process.exit(0);
