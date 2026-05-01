import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { CodeStore } from '../scripts/lib/code-store.mjs';
import { MemoryStore } from '../scripts/lib/memory-store.mjs';

const sandbox = join(tmpdir(), `supervibe-postedit-${Date.now()}`);
const fileA = join(sandbox, 'src', 'a.ts');
const fileB = join(sandbox, 'src', 'b.ts');
const legacyProjectDirEnv = ["CLAUDE", "PROJECT_DIR"].join("_");
const legacyFilePathsEnv = ["CLAUDE", "FILE_PATHS"].join("_");

function runHook(env = {}) {
  const childEnv = {
    ...process.env,
    SUPERVIBE_PROJECT_DIR: sandbox,
    SUPERVIBE_HOOK_SILENT: '1',
    ...env,
  };
  for (const [key, value] of Object.entries(childEnv)) {
    if (value === undefined) delete childEnv[key];
  }
  return execSync(`node "${process.cwd()}/scripts/post-edit-stack-watch.mjs"`, {
    cwd: sandbox,
    env: childEnv,
    encoding: 'utf8',
  });
}

before(async () => {
  await mkdir(join(sandbox, 'src'), { recursive: true });
  await mkdir(join(sandbox, '.supervibe', 'memory'), { recursive: true });

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

test('hook: re-indexes source files listed in SUPERVIBE_FILE_PATHS', async () => {
  // Modify file A so its hash changes
  await writeFile(fileA, `export function hello(name: string) { return 'HELLO ' + name.toUpperCase(); }\n`);

  runHook({ SUPERVIBE_FILE_PATHS: fileA });

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
  const out = runHook({ SUPERVIBE_FILE_PATHS: join(sandbox, 'random.json') });
  // No throw, no reminder for non-manifest .json
  assert.strictEqual(out.trim(), '');
});

test('hook: still emits manifest reminder + skips index when SUPERVIBE_HOOK_NO_INDEX=1', async () => {
  await writeFile(join(sandbox, 'package.json'), '{}');
  const out = execSync(`node "${process.cwd()}/scripts/post-edit-stack-watch.mjs"`, {
    cwd: sandbox,
    env: {
      ...process.env,
      SUPERVIBE_PROJECT_DIR: sandbox,
      SUPERVIBE_FILE_PATHS: join(sandbox, 'package.json'),
      SUPERVIBE_HOOK_NO_INDEX: '1',
    },
    encoding: 'utf8',
  });
  assert.match(out, /package\.json/);
  assert.match(out, /supervibe-adapt/);
});

test('hook: empty SUPERVIBE_FILE_PATHS is a no-op', () => {
  const out = runHook({ SUPERVIBE_FILE_PATHS: '' });
  assert.strictEqual(out.trim(), '');
});

test('hook: re-indexes memory entry when path under .supervibe/memory/', async () => {
  const memDir = join(sandbox, '.supervibe', 'memory', 'decisions');
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

  runHook({ SUPERVIBE_FILE_PATHS: memEntry });

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
  const fresh = join(tmpdir(), `supervibe-postedit-fresh-${Date.now()}`);
  await mkdir(join(fresh, 'src'), { recursive: true });
  const f = join(fresh, 'src', 'x.ts');
  await writeFile(f, `export const x = 1;\n`);
  const out = execSync(`node "${process.cwd()}/scripts/post-edit-stack-watch.mjs"`, {
    cwd: fresh,
    env: {
      ...process.env,
      SUPERVIBE_PROJECT_DIR: fresh,
      SUPERVIBE_FILE_PATHS: f,
      SUPERVIBE_HOOK_SILENT: '1',
    },
    encoding: 'utf8',
  });
  assert.strictEqual(out.trim(), '');
  await rm(fresh, { recursive: true, force: true });
});

test('hook: legacy host env remains supported through compatibility fallback', async () => {
  const legacyFile = join(sandbox, 'src', 'legacy.ts');
  await writeFile(legacyFile, `export function legacy() { return 'before'; }\n`);
  const store0 = new CodeStore(sandbox, { useEmbeddings: false });
  await store0.init();
  await store0.indexFile(legacyFile);
  store0.close();

  await writeFile(legacyFile, `export function legacy() { return 'after'; }\n`);
  runHook({
    SUPERVIBE_PROJECT_DIR: undefined,
    [legacyProjectDirEnv]: sandbox,
    [legacyFilePathsEnv]: legacyFile,
  });

  const store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
  const stmt = store.db.prepare('SELECT chunk_text FROM code_chunks WHERE path = ? LIMIT 5');
  const chunks = stmt.all(store.toRel(legacyFile));
  store.close();
  assert.match(chunks.map(c => c.chunk_text).join('\n'), /after/);
});
