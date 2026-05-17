import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { CodeStore } from '../scripts/lib/code-store.mjs';
import { MemoryStore } from '../scripts/lib/memory-store.mjs';

const sandbox = join(tmpdir(), `supervibe-postedit-${Date.now()}`);
const hookScript = join(process.cwd(), 'scripts', 'post-edit-stack-watch.mjs');
const fileA = join(sandbox, 'src', 'a.ts');
const fileB = join(sandbox, 'src', 'b.ts');
const legacyProjectDirEnv = ["CLAUDE", "PROJECT_DIR"].join("_");
const legacyFilePathsEnv = ["CLAUDE", "FILE_PATHS"].join("_");

function cleanEnv(env) {
  const childEnv = {
    ...process.env,
    SUPERVIBE_PROJECT_DIR: sandbox,
    SUPERVIBE_HOOK_SILENT: '1',
    ...env,
  };
  for (const [key, value] of Object.entries(childEnv)) {
    if (value === undefined) delete childEnv[key];
  }
  return childEnv;
}

function runHook(env = {}) {
  return execSync(`node "${hookScript}"`, {
    cwd: sandbox,
    env: cleanEnv(env),
    encoding: 'utf8',
  });
}

function runHookWithInput(input, env = {}) {
  const result = spawnSync(process.execPath, [hookScript], {
    cwd: sandbox,
    env: cleanEnv(env),
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`hook exited ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function readChunks(projectRoot, file) {
  const store = new CodeStore(projectRoot, { useEmbeddings: false });
  await store.init();
  const rows = store.db.prepare('SELECT chunk_text FROM code_chunks WHERE path = ? LIMIT 10').all(store.toRel(file));
  store.close();
  return rows.map((row) => row.chunk_text).join('\n');
}

before(async () => {
  await mkdir(join(sandbox, 'src'), { recursive: true });
  await mkdir(join(sandbox, '.supervibe', 'memory'), { recursive: true });

  await writeFile(fileA, `export function hello(name: string) { return 'hi ' + name; }\n`);
  await writeFile(fileB, `export function world() { return 42; }\n`);

  const store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
  await store.indexFile(fileA);
  await store.indexFile(fileB);
  store.close();
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('hook: re-indexes source files listed in SUPERVIBE_FILE_PATHS', async () => {
  await writeFile(fileA, `export function hello(name: string) { return 'HELLO ' + name.toUpperCase(); }\n`);

  runHook({ SUPERVIBE_FILE_PATHS: fileA });

  const allText = await readChunks(sandbox, fileA);
  assert.match(allText, /HELLO/);
});

test('hook: ignores non-source files (e.g. random .json)', () => {
  const out = runHook({ SUPERVIBE_FILE_PATHS: join(sandbox, 'random.json') });
  assert.strictEqual(out.trim(), '');
});

test('hook: still emits manifest reminder + skips index when SUPERVIBE_HOOK_NO_INDEX=1', async () => {
  await writeFile(join(sandbox, 'package.json'), '{}');
  const out = execSync(`node "${hookScript}"`, {
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

  const mem0 = new MemoryStore(sandbox, { useEmbeddings: false });
  await mem0.init();
  await mem0.incrementalUpdate(memEntry);
  mem0.close();

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

test('hook: bootstraps missing code.db on first touched source file', async () => {
  const fresh = join(tmpdir(), `supervibe-postedit-fresh-${Date.now()}`);
  await mkdir(join(fresh, 'src'), { recursive: true });
  const f = join(fresh, 'src', 'x.ts');
  await writeFile(f, `export const x = 1;\n`);
  const out = execSync(`node "${hookScript}"`, {
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
  const allText = await readChunks(fresh, f);
  assert.match(allText, /export const x/);
  await rm(fresh, { recursive: true, force: true });
});

test('hook: reads Codex apply_patch stdin and re-indexes touched source files', async () => {
  const codexFile = join(sandbox, 'src', 'codex-hook.ts');
  await writeFile(codexFile, `export const codexHook = 'before';\n`);
  const store0 = new CodeStore(sandbox, { useEmbeddings: false });
  await store0.init();
  await store0.indexFile(codexFile);
  store0.close();

  await writeFile(codexFile, `export const codexHook = 'after';\n`);
  runHookWithInput({
    tool_name: 'apply_patch',
    tool_input: {
      command: [
        '*** Begin Patch',
        '*** Update File: src/codex-hook.ts',
        '@@',
        "-export const codexHook = 'before';",
        "+export const codexHook = 'after';",
        '*** End Patch',
      ].join('\n'),
    },
  }, { SUPERVIBE_FILE_PATHS: '' });

  const allText = await readChunks(sandbox, codexFile);
  assert.match(allText, /after/);
  assert.doesNotMatch(allText, /before/);
});

test('hook: scans mtime changes after Bash without explicit paths', async () => {
  const bashFile = join(sandbox, 'src', 'bash-format.ts');
  await writeFile(bashFile, `export const bashFormat = 'before';\n`);
  const store0 = new CodeStore(sandbox, { useEmbeddings: false });
  await store0.init();
  await store0.indexFile(bashFile);
  store0.close();

  await writeFile(bashFile, `export const bashFormat = 'after';\n`);
  runHookWithInput({
    tool_name: 'Bash',
    tool_input: { command: 'npm run format' },
  }, { SUPERVIBE_FILE_PATHS: '' });

  const allText = await readChunks(sandbox, bashFile);
  assert.match(allText, /after/);
  assert.doesNotMatch(allText, /before/);
});

test('hook: skips Bash fallback for read-only shell commands without explicit paths', async () => {
  const readOnlyFile = join(sandbox, 'src', 'read-only-command.ts');
  await writeFile(readOnlyFile, `export const readOnlyCommand = 'before';\n`);
  const store0 = new CodeStore(sandbox, { useEmbeddings: false });
  await store0.init();
  await store0.indexFile(readOnlyFile);
  store0.close();

  await writeFile(readOnlyFile, `export const readOnlyCommand = 'after';\n`);
  runHookWithInput({
    tool_name: 'Bash',
    tool_input: { command: 'git status --short' },
  }, { SUPERVIBE_FILE_PATHS: '' });

  const allText = await readChunks(sandbox, readOnlyFile);
  assert.match(allText, /before/);
  assert.doesNotMatch(allText, /after/);
});

test('hook: Bash fallback does not create memory.db when memory index is absent', async () => {
  const fresh = join(tmpdir(), `supervibe-postedit-no-memory-${Date.now()}`);
  try {
    await mkdir(join(fresh, 'src'), { recursive: true });
    const file = join(fresh, 'src', 'format.ts');
    await writeFile(file, `export const formatted = 'before';\n`);
    const store0 = new CodeStore(fresh, { useEmbeddings: false });
    await store0.init();
    await store0.indexFile(file);
    store0.close();

    const memDbPath = join(fresh, '.supervibe', 'memory', 'memory.db');
    assert.equal(existsSync(memDbPath), false);

    const result = spawnSync(process.execPath, [hookScript], {
      cwd: fresh,
      env: {
        ...process.env,
        SUPERVIBE_PROJECT_DIR: fresh,
        SUPERVIBE_FILE_PATHS: '',
        SUPERVIBE_HOOK_SILENT: '1',
      },
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'npm run format' },
      }),
      encoding: 'utf8',
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(existsSync(memDbPath), false);
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }
});

test('hook: removes deleted source rows from code.db', async () => {
  const deletedFile = join(sandbox, 'src', 'deleted.ts');
  await writeFile(deletedFile, `export const deleted = true;\n`);
  const store0 = new CodeStore(sandbox, { useEmbeddings: false });
  await store0.init();
  await store0.indexFile(deletedFile);
  store0.close();

  await rm(deletedFile, { force: true });
  runHook({ SUPERVIBE_FILE_PATHS: deletedFile });

  const store = new CodeStore(sandbox, { useEmbeddings: false });
  await store.init();
  const rows = store.db.prepare('SELECT path FROM code_files WHERE path = ?').all(store.toRel(deletedFile));
  store.close();
  assert.deepStrictEqual(rows, []);
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

  const allText = await readChunks(sandbox, legacyFile);
  assert.match(allText, /after/);
});
