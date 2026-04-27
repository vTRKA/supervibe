import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { CodeStore } from '../scripts/lib/code-store.mjs';
import { MemoryStore } from '../scripts/lib/memory-store.mjs';

const sandbox = join(tmpdir(), `evolve-postedit-${Date.now()}`);
const fileA = join(sandbox, 'src', 'a.ts');
const fileB = join(sandbox, 'src', 'b.ts');

function runHook(env = {}) {
  return execSync(`node "${process.cwd()}/scripts/post-edit-stack-watch.mjs"`, {
    cwd: sandbox,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: sandbox,
      EVOLVE_HOOK_SILENT: '1',
      ...env,
    },
    encoding: 'utf8',
  });
}

before(async () => {
  await mkdir(join(sandbox, 'src'), { recursive: true });
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });

  await writeFile(fileA, `export function hello(name: string) { return 'hi ' + name; }\n`);
  await writeFile(fileB, `export function world() { return 42; }\n`);

  // Bootstrap code.db so the hook actually runs (it skips if no DB)
  const store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
  await store.indexFile(fileA);
  await store.indexFile(fileB);
  store.close();
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('hook: re-indexes source files listed in CLAUDE_FILE_PATHS', async () => {
  // Modify file A so its hash changes
  await writeFile(fileA, `export function hello(name: string) { return 'HELLO ' + name.toUpperCase(); }\n`);

  runHook({ CLAUDE_FILE_PATHS: fileA });

  // Open store and verify chunk text reflects new content
  const store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
  const stmt = store.db.prepare('SELECT chunk_text FROM code_chunks WHERE path = ? LIMIT 5');
  const chunks = stmt.all(store.toRel(fileA));
  store.close();
  const allText = chunks.map(c => c.chunk_text).join('\n');
  assert.match(allText, /HELLO/);
});

test('hook: ignores non-source files (e.g. random .json)', () => {
  const out = runHook({ CLAUDE_FILE_PATHS: join(sandbox, 'random.json') });
  // No throw, no reminder for non-manifest .json
  assert.strictEqual(out.trim(), '');
});

test('hook: still emits manifest reminder + skips index when EVOLVE_HOOK_NO_INDEX=1', async () => {
  await writeFile(join(sandbox, 'package.json'), '{}');
  const out = execSync(`node "${process.cwd()}/scripts/post-edit-stack-watch.mjs"`, {
    cwd: sandbox,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: sandbox,
      CLAUDE_FILE_PATHS: join(sandbox, 'package.json'),
      EVOLVE_HOOK_NO_INDEX: '1',
    },
    encoding: 'utf8',
  });
  assert.match(out, /package\.json/);
  assert.match(out, /evolve-adapt/);
});

test('hook: empty CLAUDE_FILE_PATHS is a no-op', () => {
  const out = runHook({ CLAUDE_FILE_PATHS: '' });
  assert.strictEqual(out.trim(), '');
});

test('hook: re-indexes memory entry when path under .claude/memory/', async () => {
  const memDir = join(sandbox, '.claude', 'memory', 'decisions');
  await mkdir(memDir, { recursive: true });
  const memEntry = join(memDir, 'auth.md');
  await writeFile(memEntry, `---\nid: auth-decision\ntype: decision\ndate: 2026-04-28\ntags: [auth]\n---\n\n# Auth decision\n\nUse JWT with refresh-token rotation.\n`);

  // Bootstrap memory.db so the hook actually runs (it skips if no DB)
  const mem0 = new MemoryStore(sandbox, { useEmbeddings: false });
  await mem0.init();
  await mem0.incrementalUpdate(memEntry);
  mem0.close();

  // Edit the entry — change body
  await writeFile(memEntry, `---\nid: auth-decision\ntype: decision\ndate: 2026-04-28\ntags: [auth]\n---\n\n# Auth decision\n\nSwitched to OAuth2 with PKCE flow per security audit.\n`);

  runHook({ CLAUDE_FILE_PATHS: memEntry });

  const mem = new MemoryStore(sandbox, { useEmbeddings: false });
  await mem.init();
  const rows = mem.db.prepare('SELECT content FROM entries WHERE id = ?').all('auth-decision');
  mem.close();
  const body = rows.map(r => r.content).join('\n');
  assert.match(body, /OAuth2/);
  assert.doesNotMatch(body, /JWT with refresh/);
});

test('hook: tolerates missing code.db (no first-time bootstrap)', async () => {
  // Fresh sandbox without code.db
  const fresh = join(tmpdir(), `evolve-postedit-fresh-${Date.now()}`);
  await mkdir(join(fresh, 'src'), { recursive: true });
  const f = join(fresh, 'src', 'x.ts');
  await writeFile(f, `export const x = 1;\n`);
  const out = execSync(`node "${process.cwd()}/scripts/post-edit-stack-watch.mjs"`, {
    cwd: fresh,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: fresh,
      CLAUDE_FILE_PATHS: f,
      EVOLVE_HOOK_SILENT: '1',
    },
    encoding: 'utf8',
  });
  assert.strictEqual(out.trim(), '');
  await rm(fresh, { recursive: true, force: true });
});
