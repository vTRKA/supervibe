# Code RAG + Incremental Memory + Agent Strengthen Pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add semantic code-search RAG (transparent to user; agents use it before any non-trivial code task), make memory cleanup automatic via file-watcher hash-detection, and strengthen 42 remaining agents from compact form (60-130 lines) to spec-compliant 250+ lines.

**Architecture:**
- **Code RAG**: separate SQLite DB at `.claude/memory/code.db`, indexes source files (`.py`/`.ts`/`.tsx`/`.js`/`.jsx`/`.php`/`.rs`/`.go`/`.java`/`.rb`/`.vue`/`.svelte`), function-level chunking via tree-sitter-like brace matching, per-chunk embeddings via existing `embed()` from `embeddings.mjs`, hybrid BM25+semantic search via `MemoryStore`-like class. File-watcher (`chokidar`) auto-reindexes on save; `git pre-commit` hook re-checks before commits.
- **Memory cleanup**: extend `MemoryStore` with `incrementalUpdate(filePath)`, hash-based change detection (SHA-256 stored in DB), file-watcher on `.claude/memory/`, on delete → CASCADE removes chunks (already in schema).
- **Agent strengthen**: template-driven expansion. Each compact agent gets: full Persona (priorities, mental model, blast-radius mindset), expanded Decision tree, Output contract template, Common workflows section, expanded Anti-patterns. Use code-reviewer (244 lines) and root-cause-debugger (238 lines) as references.

**Tech Stack:** Node 22+ (`node:sqlite`, built-in), `@huggingface/transformers` (already installed), `chokidar` (new dev dep, ~30KB), `crypto` (built-in for SHA-256). No Python, no external services.

---

## File Structure

### Created (new files)

```
evolve/
├── scripts/
│   ├── lib/
│   │   ├── code-store.mjs              # NEW — SQLite + hybrid search for code (mirror of memory-store)
│   │   ├── code-chunker.mjs            # NEW — function/class/block-aware chunker for source code
│   │   ├── code-watcher.mjs            # NEW — chokidar watcher with debouncing + hash-check
│   │   └── file-hash.mjs               # NEW — SHA-256 helper for change detection
│   ├── build-code-index.mjs            # NEW — full index from filesystem
│   ├── search-code.mjs                 # NEW — CLI for supervibe:code-search skill
│   └── watch-memory.mjs                # NEW — daemon that auto-reindexes memory + code on changes
│
├── skills/
│   └── code-search/
│       └── SKILL.md                    # NEW — supervibe:code-search skill (agent-facing)
│
├── tests/
│   ├── code-chunker.test.mjs           # NEW — chunker handles JS/TS/Python/PHP/Rust/Go
│   ├── code-store.test.mjs             # NEW — index+search functional tests
│   ├── file-hash.test.mjs              # NEW — hash stability + change detection
│   └── memory-incremental.test.mjs     # NEW — memory watcher / hash-based cleanup
│
└── (no new agents — strengthen pass modifies existing agents in agents/)
```

### Modified

- `scripts/lib/memory-store.mjs` — add `incrementalUpdate(filePath)`, `removeEntry(id)`, `hashContent()` helper
- `package.json` — add `chokidar` devDep, add `code:index`, `code:search`, `memory:watch` scripts
- `knip.json` — add new entry scripts to allowlist
- 42 agent files in `agents/_core/`, `agents/_design/`, `agents/_meta/`, `agents/_ops/`, `agents/_product/`, `agents/stacks/**/` — strengthened to 250+ lines each
- `.claude-plugin/plugin.json` — bump version to 1.5.0
- `package.json` — bump version to 1.5.0
- `CHANGELOG.md` — v1.5.0 entry
- `README.md` — status line update
- `docs/getting-started.md` — add Code RAG section + memory watcher

### Untouched

- `models/Xenova/multilingual-e5-small/` — same embedding model
- `confidence-rubrics/` — schema unchanged
- All existing tests continue to pass

---

## Phase A — Code RAG Indexer (Tasks A1–A8)

### Task A1: file-hash helper + tests (TDD)

**Files:**
- Create: `scripts/lib/file-hash.mjs`
- Create: `tests/file-hash.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/file-hash.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashFile, hashContent } from '../scripts/lib/file-hash.mjs';

const sandbox = join(tmpdir(), `evolve-hash-test-${Date.now()}`);

test('hashContent: deterministic for same input', () => {
  const a = hashContent('hello world');
  const b = hashContent('hello world');
  assert.strictEqual(a, b);
  assert.strictEqual(a.length, 64); // SHA-256 hex = 64 chars
});

test('hashContent: different for different input', () => {
  const a = hashContent('hello');
  const b = hashContent('world');
  assert.notStrictEqual(a, b);
});

test('hashFile: reads + hashes file content', async () => {
  await mkdir(sandbox, { recursive: true });
  const f = join(sandbox, 'test.txt');
  await writeFile(f, 'sample content');
  const hash = await hashFile(f);
  assert.strictEqual(hash, hashContent('sample content'));
  await rm(sandbox, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --no-warnings --test tests/file-hash.test.mjs`
Expected: FAIL — "Cannot find module '../scripts/lib/file-hash.mjs'"

- [ ] **Step 3: Write the helper**

Create `scripts/lib/file-hash.mjs`:

```javascript
// SHA-256 content hash for change detection.
// Used by code-store and memory-store to skip unchanged files during incremental updates.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** SHA-256 of a string, returned as hex (64 chars). */
export function hashContent(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** SHA-256 of a file's content. */
export async function hashFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  return hashContent(content);
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `node --no-warnings --test tests/file-hash.test.mjs`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/file-hash.mjs tests/file-hash.test.mjs
git commit -m "feat(rag): add SHA-256 file-hash helper for change detection"
```

---

### Task A2: code-chunker (TDD)

**Files:**
- Create: `scripts/lib/code-chunker.mjs`
- Create: `tests/code-chunker.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/code-chunker.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { chunkCode, detectLanguage } from '../scripts/lib/code-chunker.mjs';

test('detectLanguage by extension', () => {
  assert.strictEqual(detectLanguage('foo.ts'), 'typescript');
  assert.strictEqual(detectLanguage('foo.tsx'), 'typescript');
  assert.strictEqual(detectLanguage('foo.js'), 'javascript');
  assert.strictEqual(detectLanguage('foo.jsx'), 'javascript');
  assert.strictEqual(detectLanguage('foo.py'), 'python');
  assert.strictEqual(detectLanguage('foo.php'), 'php');
  assert.strictEqual(detectLanguage('foo.rs'), 'rust');
  assert.strictEqual(detectLanguage('foo.go'), 'go');
  assert.strictEqual(detectLanguage('foo.java'), 'java');
  assert.strictEqual(detectLanguage('foo.rb'), 'ruby');
  assert.strictEqual(detectLanguage('foo.vue'), 'vue');
  assert.strictEqual(detectLanguage('foo.svelte'), 'svelte');
  assert.strictEqual(detectLanguage('foo.unknown'), null);
});

test('chunkCode: short file returns single chunk', async () => {
  const code = 'function add(a, b) { return a + b; }';
  const chunks = await chunkCode(code, 'foo.js');
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].text, code);
  assert.strictEqual(chunks[0].kind, 'whole-file');
});

test('chunkCode: splits long file by top-level functions (JS)', async () => {
  const code = `
function alpha() {
  ${'// long content\n'.repeat(80)}
  return 1;
}

function beta() {
  ${'// long content\n'.repeat(80)}
  return 2;
}

function gamma() {
  ${'// long content\n'.repeat(80)}
  return 3;
}
`;
  const chunks = await chunkCode(code, 'foo.js', { targetTokens: 200, overlapTokens: 16 });
  assert.ok(chunks.length >= 3, `expected ≥3 chunks (one per function), got ${chunks.length}`);
  for (const c of chunks) {
    assert.ok(c.text.length > 0);
    assert.ok(typeof c.startLine === 'number');
    assert.ok(typeof c.endLine === 'number');
    assert.ok(c.endLine >= c.startLine);
  }
});

test('chunkCode: includes line range metadata for navigation', async () => {
  const code = 'line1\nline2\nline3\nline4';
  const chunks = await chunkCode(code, 'foo.js');
  assert.strictEqual(chunks[0].startLine, 1);
  assert.strictEqual(chunks[0].endLine, 4);
});

test('chunkCode: Python class indentation respected', async () => {
  const code = `
class Foo:
    def method_a(self):
        ${'# long\n        '.repeat(50)}
        return 1

    def method_b(self):
        ${'# long\n        '.repeat(50)}
        return 2
`;
  const chunks = await chunkCode(code, 'foo.py', { targetTokens: 150, overlapTokens: 10 });
  assert.ok(chunks.length >= 1);
  // Each chunk must include valid Python (no half-class)
  for (const c of chunks) {
    assert.ok(c.text.trim().length > 0);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --no-warnings --test tests/code-chunker.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement chunker**

Create `scripts/lib/code-chunker.mjs`:

```javascript
// Code-aware chunker. NOT a real AST parser (would require tree-sitter).
// Uses regex-based block detection (top-level functions, classes, methods)
// with brace/indentation matching for the supported language family.
//
// Strategy:
//   1. Try language-specific block split (function/class boundaries).
//   2. Fall back to text chunker if no blocks recognized OR file too short.
//   3. Each chunk gets {text, startLine, endLine, kind, name?}.
//
// kind values: 'whole-file' | 'function' | 'class' | 'method' | 'block' | 'leftover'

import { chunkText, countTokens } from './chunker.mjs';

const EXTENSION_MAP = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python',
  '.php': 'php',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.vue': 'vue',
  '.svelte': 'svelte'
};

export function detectLanguage(filePath) {
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const ext = filePath.slice(dotIdx).toLowerCase();
  return EXTENSION_MAP[ext] || null;
}

// Top-level block patterns per language. Each matches the START of a block.
// Pairs with brace counter or indentation tracker to find END.
const BLOCK_PATTERNS = {
  javascript: /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(?[^=]*\)?\s*=>)/gm,
  typescript: /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+)|interface\s+(\w+)|type\s+(\w+)|const\s+(\w+)\s*[:=]|enum\s+(\w+))/gm,
  python: /^(?:async\s+)?def\s+(\w+)|^class\s+(\w+)/gm,
  php: /^(?:abstract\s+|final\s+)?(?:class\s+(\w+)|trait\s+(\w+)|interface\s+(\w+))|^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?function\s+(\w+)/gm,
  rust: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)|^(?:pub\s+)?struct\s+(\w+)|^(?:pub\s+)?enum\s+(\w+)|^(?:pub\s+)?trait\s+(\w+)|^(?:pub\s+)?impl\b/gm,
  go: /^func\s+(?:\([^)]+\)\s+)?(\w+)|^type\s+(\w+)\s+(?:struct|interface)/gm,
  java: /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:class\s+(\w+)|interface\s+(\w+))/gm,
  ruby: /^class\s+(\w+)|^module\s+(\w+)|^def\s+(\w+)/gm,
  vue: /^<script[^>]*>|^<template>|^<style[^>]*>/gm,
  svelte: /^<script[^>]*>|^<style[^>]*>/gm
};

// Find block boundaries by tracking braces (curly-brace languages) or indentation (Python/Ruby).
function findBlockEnd(lines, startIdx, lang) {
  if (lang === 'python' || lang === 'ruby') {
    // Indentation-based
    const startLine = lines[startIdx];
    const startIndent = startLine.match(/^(\s*)/)[1].length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') continue;
      const indent = line.match(/^(\s*)/)[1].length;
      if (indent <= startIndent) return i - 1;
    }
    return lines.length - 1;
  }

  // Brace-based (JS, TS, Java, Go, Rust, C-like)
  let depth = 0;
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    // Strip strings/comments roughly to avoid false brace counts
    const stripped = line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""').replace(/\/\/.*$/, '');
    for (const ch of stripped) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') {
        depth--;
        if (started && depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

/**
 * Chunk source code into semantically-meaningful blocks.
 * @returns {Promise<Array<{text, startLine, endLine, kind, name?, tokens}>>}
 */
export async function chunkCode(code, filePath, opts = {}) {
  const { targetTokens = 250, overlapTokens = 16 } = opts;
  const lang = detectLanguage(filePath);
  const lines = code.split('\n');

  // Quick path: short file → single chunk
  const totalTokens = await countTokens(code);
  if (totalTokens <= targetTokens) {
    return [{
      text: code,
      startLine: 1,
      endLine: lines.length,
      kind: 'whole-file',
      tokens: totalTokens
    }];
  }

  // No language detected → fall back to text chunker
  if (!lang || !BLOCK_PATTERNS[lang]) {
    const textChunks = await chunkText(code, { targetTokens, overlapTokens });
    return textChunks.map((text, idx) => ({
      text,
      startLine: 1,
      endLine: lines.length,
      kind: 'block',
      tokens: 0
    }));
  }

  // Language-aware: find top-level blocks
  const pattern = BLOCK_PATTERNS[lang];
  const blocks = [];
  const matches = [...code.matchAll(pattern)];

  let lastEndLine = 0;
  for (const m of matches) {
    const charIdx = m.index;
    // Convert char index to line number
    const before = code.slice(0, charIdx);
    const startLine = before.split('\n').length - 1; // 0-indexed
    const endLine = findBlockEnd(lines, startLine, lang);

    // Capture leading whitespace/imports between blocks as "leftover"
    if (startLine > lastEndLine) {
      const leftoverText = lines.slice(lastEndLine, startLine).join('\n').trim();
      if (leftoverText.length > 0) {
        const tokens = await countTokens(leftoverText);
        if (tokens >= 8) { // skip trivial leftovers
          blocks.push({
            text: leftoverText,
            startLine: lastEndLine + 1,
            endLine: startLine,
            kind: 'leftover',
            tokens
          });
        }
      }
    }

    const blockText = lines.slice(startLine, endLine + 1).join('\n');
    const blockName = m.slice(1).find(g => g) || null;
    const blockTokens = await countTokens(blockText);

    // If block exceeds target, split via text chunker
    if (blockTokens > targetTokens * 1.5) {
      const subChunks = await chunkText(blockText, { targetTokens, overlapTokens });
      for (const text of subChunks) {
        blocks.push({
          text,
          startLine: startLine + 1,
          endLine: endLine + 1,
          kind: 'block',
          name: blockName,
          tokens: await countTokens(text)
        });
      }
    } else {
      blocks.push({
        text: blockText,
        startLine: startLine + 1,
        endLine: endLine + 1,
        kind: lang === 'python' || lang === 'java' || lang === 'php' || lang === 'ruby' ? 'class-or-method' : 'function-or-class',
        name: blockName,
        tokens: blockTokens
      });
    }

    lastEndLine = endLine + 1;
  }

  // Trailing content after last block
  if (lastEndLine < lines.length) {
    const trailingText = lines.slice(lastEndLine).join('\n').trim();
    if (trailingText.length > 0) {
      const tokens = await countTokens(trailingText);
      if (tokens >= 8) {
        blocks.push({
          text: trailingText,
          startLine: lastEndLine + 1,
          endLine: lines.length,
          kind: 'leftover',
          tokens
        });
      }
    }
  }

  // If no blocks found (e.g., only top-level constants), fall back to text chunker
  if (blocks.length === 0) {
    const textChunks = await chunkText(code, { targetTokens, overlapTokens });
    return textChunks.map(text => ({
      text,
      startLine: 1,
      endLine: lines.length,
      kind: 'block',
      tokens: 0
    }));
  }

  return blocks;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --no-warnings --test tests/code-chunker.test.mjs`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/code-chunker.mjs tests/code-chunker.test.mjs
git commit -m "feat(rag): add language-aware code chunker (JS/TS/Python/PHP/Rust/Go/Java/Ruby/Vue/Svelte)"
```

---

### Task A3: code-store (SQLite + hybrid search) — schema + index

**Files:**
- Create: `scripts/lib/code-store.mjs`
- Create: `tests/code-store.test.mjs`

- [ ] **Step 1: Write failing tests (index path)**

Create `tests/code-store.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CodeStore } from '../scripts/lib/code-store.mjs';

const sandbox = join(tmpdir(), `evolve-code-store-test-${Date.now()}`);
let store;

before(async () => {
  await mkdir(join(sandbox, 'src'), { recursive: true });

  await writeFile(join(sandbox, 'src', 'auth.ts'), `
export function login(email: string, password: string) {
  validateCredentials(email, password);
  const token = generateToken(email);
  return { token, expiresAt: Date.now() + 3600000 };
}

export function logout(token: string) {
  invalidateToken(token);
}
`);

  await writeFile(join(sandbox, 'src', 'billing.ts'), `
export async function processPayment(amount: number, cardId: string) {
  const idempotencyKey = await acquireRedisLock(cardId, 300);
  try {
    return await stripeCharge(amount, cardId, idempotencyKey);
  } finally {
    await releaseRedisLock(idempotencyKey);
  }
}
`);

  store = new CodeStore(sandbox, { useEmbeddings: false }); // fast tests
  await store.init();
});

after(async () => {
  store.close();
  await rm(sandbox, { recursive: true, force: true });
});

test('CodeStore.indexFile: stores file with chunks', async () => {
  await store.indexFile(join(sandbox, 'src', 'auth.ts'));
  const stats = store.stats();
  assert.strictEqual(stats.totalFiles, 1);
  assert.ok(stats.totalChunks >= 1);
});

test('CodeStore.indexFile: skips unchanged file (hash check)', async () => {
  // Re-index same file → no-op
  const before = store.stats();
  await store.indexFile(join(sandbox, 'src', 'auth.ts'));
  const after = store.stats();
  assert.strictEqual(after.totalChunks, before.totalChunks);
});

test('CodeStore.indexAll: walks directory and indexes supported files', async () => {
  await store.indexAll(sandbox);
  const stats = store.stats();
  assert.strictEqual(stats.totalFiles, 2); // auth.ts + billing.ts
});

test('CodeStore.searchKeyword: finds files by FTS5 keyword', async () => {
  const results = await store.search({ query: 'login email password', semantic: false });
  assert.ok(results.length >= 1);
  assert.ok(results[0].file.includes('auth.ts'));
});

test('CodeStore.removeFile: deletes entry + chunks (CASCADE)', async () => {
  await store.removeFile(join(sandbox, 'src', 'auth.ts'));
  const stats = store.stats();
  assert.strictEqual(stats.totalFiles, 1);
});

test('CodeStore.search returns file:line metadata for navigation', async () => {
  await store.indexFile(join(sandbox, 'src', 'auth.ts')); // re-add
  const results = await store.search({ query: 'login', semantic: false });
  for (const r of results) {
    assert.ok(typeof r.file === 'string');
    assert.ok(typeof r.startLine === 'number');
    assert.ok(typeof r.endLine === 'number');
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --no-warnings --test tests/code-store.test.mjs`
Expected: FAIL — `CodeStore` not found

- [ ] **Step 3: Implement code-store**

Create `scripts/lib/code-store.mjs`:

```javascript
// SQLite-backed code RAG with hybrid (FTS5 + semantic) search.
// Mirrors MemoryStore but for source code: per-file rows + per-chunk embeddings.
// Hash-based change detection skips unchanged files on re-index.

import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hashFile } from './file-hash.mjs';
import { chunkCode, detectLanguage } from './code-chunker.mjs';
import { embed, cosineSimilarity, vectorToBuffer, bufferToVector } from './embeddings.mjs';

const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.mjs', '.cjs',
  '.py',
  '.php',
  '.rs',
  '.go',
  '.java',
  '.rb',
  '.vue', '.svelte'
]);

// Skip noise dirs/files during walk
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '.turbo', 'vendor', '__pycache__', 'target', 'venv', '.venv']);
const SKIP_FILE_PATTERNS = [/\.min\.(js|css)$/, /\.bundle\./, /\.test\./, /\.spec\./, /\.d\.ts$/];

export class CodeStore {
  constructor(projectRoot, opts = {}) {
    this.projectRoot = projectRoot;
    this.dbDir = join(projectRoot, '.claude', 'memory');
    this.dbPath = join(this.dbDir, 'code.db');
    this.db = null;
    this.useEmbeddings = opts.useEmbeddings !== false;
  }

  async init() {
    if (!existsSync(this.dbDir)) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(this.dbDir, { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS code_files (
        path TEXT PRIMARY KEY,
        language TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        indexed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_code_files_lang ON code_files(language);

      CREATE TABLE IF NOT EXISTS code_chunks (
        path TEXT NOT NULL,
        chunk_idx INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        token_count INTEGER NOT NULL,
        embedding BLOB,
        PRIMARY KEY(path, chunk_idx),
        FOREIGN KEY(path) REFERENCES code_files(path) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_code_chunks_path ON code_chunks(path);
      CREATE INDEX IF NOT EXISTS idx_code_chunks_kind ON code_chunks(kind);

      CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(
        path UNINDEXED,
        chunk_idx UNINDEXED,
        chunk_text,
        name,
        tokenize='unicode61'
      );
    `);
    return this;
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
  }

  toRel(absPath) {
    return relative(this.projectRoot, absPath).split(sep).join('/');
  }

  /** Index a single file. Skips if hash unchanged (idempotent). */
  async indexFile(absPath) {
    const lang = detectLanguage(absPath);
    if (!lang) return { skipped: 'unsupported-language' };

    const relPath = this.toRel(absPath);
    let content;
    try { content = await readFile(absPath, 'utf8'); }
    catch (err) {
      if (err.code === 'ENOENT') {
        await this.removeFile(absPath);
        return { skipped: 'file-deleted' };
      }
      throw err;
    }

    const hash = await hashFile(absPath);
    const existing = this.db.prepare('SELECT content_hash FROM code_files WHERE path = ?').get(relPath);
    if (existing && existing.content_hash === hash) {
      return { skipped: 'unchanged' };
    }

    // Remove old chunks for this file (CASCADE handles via FK; but FTS not linked)
    this.db.prepare('DELETE FROM code_chunks WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);

    const chunks = await chunkCode(content, absPath);
    const lines = content.split('\n').length;

    this.db.prepare(`
      INSERT OR REPLACE INTO code_files (path, language, content_hash, line_count, indexed_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).run(relPath, lang, hash, lines);

    const insertChunk = this.db.prepare(`
      INSERT INTO code_chunks (path, chunk_idx, chunk_text, kind, name, start_line, end_line, token_count, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFTS = this.db.prepare(`
      INSERT INTO code_chunks_fts (path, chunk_idx, chunk_text, name) VALUES (?, ?, ?, ?)
    `);

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      let embeddingBuf = null;
      if (this.useEmbeddings) {
        try {
          const vec = await embed(c.text, 'passage');
          embeddingBuf = vectorToBuffer(vec);
        } catch {} // graceful: index without embedding
      }
      insertChunk.run(relPath, i, c.text, c.kind, c.name || null, c.startLine, c.endLine, c.tokens || 0, embeddingBuf);
      insertFTS.run(relPath, i, c.text, c.name || '');
    }

    return { indexed: true, chunks: chunks.length };
  }

  /** Walk project directory, index all supported files. */
  async indexAll(rootDir) {
    const counts = { indexed: 0, skipped: 0, errors: 0 };
    const queue = [rootDir];
    while (queue.length > 0) {
      const dir = queue.shift();
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); }
      catch { continue; }
      for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.') continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (SKIP_DIRS.has(e.name)) continue;
          queue.push(full);
        } else if (e.isFile()) {
          const dotIdx = e.name.lastIndexOf('.');
          if (dotIdx < 0) continue;
          const ext = e.name.slice(dotIdx).toLowerCase();
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
          if (SKIP_FILE_PATTERNS.some(p => p.test(e.name))) continue;
          try {
            const result = await this.indexFile(full);
            if (result.indexed) counts.indexed++;
            else counts.skipped++;
          } catch (err) {
            counts.errors++;
          }
        }
      }
    }
    return counts;
  }

  async removeFile(absPath) {
    const relPath = this.toRel(absPath);
    this.db.prepare('DELETE FROM code_chunks_fts WHERE path = ?').run(relPath);
    this.db.prepare('DELETE FROM code_files WHERE path = ?').run(relPath);
  }

  stats() {
    const totalFiles = this.db.prepare('SELECT COUNT(*) AS n FROM code_files').get().n;
    const totalChunks = this.db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get().n;
    const byLang = this.db.prepare('SELECT language, COUNT(*) AS n FROM code_files GROUP BY language ORDER BY n DESC').all();
    return { totalFiles, totalChunks, byLang };
  }

  /** Hybrid search: FTS5 keyword + semantic cosine (max-over-chunks per file) → RRF. */
  async search({ query, language = null, kind = null, limit = 10, semantic = true } = {}) {
    if (!query || !query.trim()) return [];

    // FTS5 keyword path
    const escapedQuery = query.trim().split(/\s+/).map(t => '"' + t.replace(/"/g, '""') + '"').join(' ');
    let sql = `
      SELECT cf.path AS path, cf.language AS language, cf.line_count AS line_count,
             cc.chunk_idx AS chunk_idx, cc.chunk_text AS chunk_text, cc.kind AS kind, cc.name AS name,
             cc.start_line AS start_line, cc.end_line AS end_line, cc.embedding AS embedding,
             bm25(code_chunks_fts) AS bm25
      FROM code_chunks_fts
      JOIN code_chunks cc ON cc.path = code_chunks_fts.path AND cc.chunk_idx = code_chunks_fts.chunk_idx
      JOIN code_files cf ON cf.path = cc.path
      WHERE code_chunks_fts MATCH ?
    `;
    const params = [escapedQuery];
    if (language) { sql += ' AND cf.language = ?'; params.push(language); }
    if (kind) { sql += ' AND cc.kind = ?'; params.push(kind); }
    sql += ' ORDER BY bm25 LIMIT ?';
    params.push(limit * 3);

    let rows;
    try { rows = this.db.prepare(sql).all(...params); }
    catch { rows = []; }

    if (!semantic || !this.useEmbeddings || rows.length === 0) {
      return this._aggregateByFile(rows, limit);
    }

    // Semantic rerank
    let queryVec;
    try { queryVec = await embed(query, 'query'); }
    catch { return this._aggregateByFile(rows, limit); }

    for (const r of rows) {
      r.semanticScore = r.embedding ? cosineSimilarity(queryVec, bufferToVector(r.embedding)) : 0;
    }

    // RRF over BM25-rank and semantic-rank
    const k = 60;
    const bm25Sorted = [...rows].sort((a, b) => Math.abs(a.bm25) - Math.abs(b.bm25));
    const semSorted = [...rows].sort((a, b) => b.semanticScore - a.semanticScore);
    const bm25Ranks = new Map(bm25Sorted.map((r, i) => [`${r.path}#${r.chunk_idx}`, i + 1]));
    const semRanks = new Map(semSorted.map((r, i) => [`${r.path}#${r.chunk_idx}`, i + 1]));

    for (const r of rows) {
      const key = `${r.path}#${r.chunk_idx}`;
      r.score = 1 / (k + (bm25Ranks.get(key) || 1000)) + 1 / (k + (semRanks.get(key) || 1000));
    }
    rows.sort((a, b) => b.score - a.score);
    return this._aggregateByFile(rows, limit);
  }

  _aggregateByFile(rows, limit) {
    // Group by file, take best chunk per file
    const byFile = new Map();
    for (const r of rows) {
      if (!byFile.has(r.path) || (r.score || -r.bm25) > (byFile.get(r.path).score || -byFile.get(r.path).bm25)) {
        byFile.set(r.path, r);
      }
    }
    return [...byFile.values()].slice(0, limit).map(r => ({
      file: r.path,
      language: r.language,
      lineCount: r.line_count,
      kind: r.kind,
      name: r.name,
      startLine: r.start_line,
      endLine: r.end_line,
      snippet: r.chunk_text.slice(0, 400),
      score: r.score || 0,
      semantic: r.semanticScore || 0,
      bm25: Math.abs(r.bm25 || 0)
    }));
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --no-warnings --test tests/code-store.test.mjs`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/code-store.mjs tests/code-store.test.mjs
git commit -m "feat(rag): add CodeStore with FTS5 + hybrid semantic search and hash-based dedup"
```

---

### Task A4: build-code-index CLI

**Files:**
- Create: `scripts/build-code-index.mjs`
- Modify: `package.json`
- Modify: `knip.json`

- [ ] **Step 1: Implement CLI**

Create `scripts/build-code-index.mjs`:

```javascript
#!/usr/bin/env node
// Code RAG indexer: walks project, indexes supported source files into .claude/memory/code.db
// Idempotent: hash-based change detection skips unchanged files.

import { CodeStore } from './lib/code-store.mjs';

const PROJECT_ROOT = process.cwd();

async function main() {
  const args = process.argv.slice(2);
  const noEmbeddings = args.includes('--no-embeddings');

  console.log(`Indexing code in ${PROJECT_ROOT}${noEmbeddings ? ' (BM25 only, embeddings disabled)' : ''}...`);
  const t0 = Date.now();

  const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: !noEmbeddings });
  await store.init();
  const counts = await store.indexAll(PROJECT_ROOT);
  const stats = store.stats();
  store.close();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
  console.log(`  Files indexed: ${counts.indexed}`);
  console.log(`  Files skipped (unchanged/unsupported): ${counts.skipped}`);
  console.log(`  Errors: ${counts.errors}`);
  console.log(`\nTotal in DB: ${stats.totalFiles} files, ${stats.totalChunks} chunks`);
  if (stats.byLang.length > 0) {
    console.log(`By language:`);
    for (const lg of stats.byLang) console.log(`  ${lg.language}: ${lg.n}`);
  }
}

main().catch(err => { console.error('build-code-index error:', err); process.exit(1); });
```

- [ ] **Step 2: Add npm scripts**

Modify `package.json` — add to `scripts` block:

```json
    "code:index": "node scripts/build-code-index.mjs",
    "code:search": "node scripts/search-code.mjs",
    "memory:watch": "node scripts/watch-memory.mjs",
```

- [ ] **Step 3: Add to knip allowlist**

Modify `knip.json` — extend `entry` array:

```json
    "scripts/build-code-index.mjs",
    "scripts/search-code.mjs",
    "scripts/watch-memory.mjs",
```

- [ ] **Step 4: Run end-to-end**

Run: `npm run code:index -- --no-embeddings`
Expected: indexes the plugin's own scripts/ + tests/ as test corpus; reports counts; exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-code-index.mjs package.json knip.json
git commit -m "feat(rag): add build-code-index CLI + npm scripts"
```

---

### Task A5: search-code CLI

**Files:**
- Create: `scripts/search-code.mjs`

- [ ] **Step 1: Implement CLI**

Create `scripts/search-code.mjs`:

```javascript
#!/usr/bin/env node
// Code RAG search CLI. Used by supervibe:code-search skill.
// Usage: node scripts/search-code.mjs --query "where is auth handled" [--lang typescript] [--kind function-or-class] [--limit 10]

import { CodeStore } from './lib/code-store.mjs';
import { parseArgs } from 'node:util';

const PROJECT_ROOT = process.cwd();
const { values } = parseArgs({
  options: {
    query: { type: 'string', short: 'q', default: '' },
    lang: { type: 'string', default: '' },
    kind: { type: 'string', default: '' },
    limit: { type: 'string', short: 'n', default: '10' },
    'no-semantic': { type: 'boolean', default: false }
  },
  strict: false
});

if (!values.query) {
  console.error('Usage: search-code.mjs --query "<text>" [--lang <name>] [--kind <kind>] [--limit N]');
  process.exit(1);
}

const store = new CodeStore(PROJECT_ROOT, { useEmbeddings: !values['no-semantic'] });
await store.init();

const results = await store.search({
  query: values.query,
  language: values.lang || null,
  kind: values.kind || null,
  limit: parseInt(values.limit, 10),
  semantic: !values['no-semantic']
});

store.close();

if (results.length === 0) {
  console.log('No code matches.');
  console.log('(query was: "' + values.query + '")');
  process.exit(0);
}

console.log(`Found ${results.length} code matches:\n`);
for (const [i, r] of results.entries()) {
  console.log(`${i + 1}. ${r.file}:${r.startLine}-${r.endLine}  [${r.kind}${r.name ? ': ' + r.name : ''}, ${r.language}]`);
  console.log(`   score=${r.score.toFixed(3)} bm25=${r.bm25.toFixed(2)} semantic=${r.semantic.toFixed(3)}`);
  console.log(`   ${r.snippet.split('\n').slice(0, 4).join('\n   ')}`);
  console.log('');
}
```

- [ ] **Step 2: Test it manually**

Run (from plugin dir, after A4 indexing): `node scripts/search-code.mjs --query "embedding cosine similarity" --no-semantic --limit 3`
Expected: returns ≥1 hit pointing to `scripts/lib/embeddings.mjs` or `memory-store.mjs`.

- [ ] **Step 3: Commit**

```bash
git add scripts/search-code.mjs
git commit -m "feat(rag): add search-code CLI for supervibe:code-search skill"
```

---

### Task A6: supervibe:code-search skill

**Files:**
- Create: `skills/code-search/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skills/code-search/SKILL.md`:

```markdown
---
name: code-search
namespace: process
description: "Use BEFORE making non-trivial changes to source code to find relevant existing code, similar patterns, and callers via hybrid keyword+semantic search"
allowed-tools: [Read, Grep, Glob, Bash]
phase: brainstorm
prerequisites: []
emits-artifact: agent-output
confidence-rubric: confidence-rubrics/agent-delivery.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
---

# Code Search

## When to invoke

BEFORE any non-trivial code change. Specifically:
- "How does X work in this codebase?" — agent searches semantically before reading
- "Where is X handled?" — find call sites + implementation
- "Are there similar patterns to Y?" — find reuse candidates
- "What depends on Z?" — find callers/usages
- BEFORE invoking any stack-developer agent on a new task

This skill replaces blind grep. It surfaces conceptually-related code even when keywords don't overlap.

## Step 0 — Read source of truth (MANDATORY)

1. Verify code index exists: `.claude/memory/code.db`
2. If missing → run `node $CLAUDE_PLUGIN_ROOT/scripts/build-code-index.mjs` first
3. If memory watcher is running, file changes are auto-indexed; otherwise re-run after edits

## Decision tree

```
What's the search intent?
  Concept-level ("auth flow", "error handling pattern")
    → semantic-heavy: invoke without --lang/--kind, let semantic match
  Specific symbol/name (e.g., "loginHandler")
    → use --kind function-or-class --query "loginHandler"
  Language-specific feature ("Eloquent scope", "React hook")
    → --lang <language> + --query "<concept>"
  Just need callers of known symbol
    → use Grep tool directly (faster for exact-name lookups)
```

## Procedure

1. Verify index exists (Step 0)
2. Run: `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<topic>" [--lang <name>] [--limit 10]`
3. For each top hit (top 3-5):
   - Read the file at returned line range to get full context
   - Note kind (function/class/leftover) and name
4. If hits are stale (file changed since index): re-run `npm run code:index` then re-search
5. Synthesize for caller: list relevant file:line references + 1-line summary per

## Output contract

Returns:
- List of ≤10 file:line references with kind/name
- Top 1-3 read in full for context
- Summary: "Relevant code for <query>: <files>"

## Guard rails

- DO NOT: skip code-search and rely on agent's pretrained knowledge — that's hallucination risk
- DO NOT: trust stale index (always check `git status` for uncommitted changes that might not be indexed)
- DO NOT: return more than 10 hits (signal-to-noise drops)
- ALWAYS: cite file:line in output so user can navigate
- ALWAYS: prefer semantic search for concept queries; Grep tool for known exact names

## Verification

- search-code.mjs returns >0 results OR explicit "no matches"
- Top hits read for context before claiming complete

## Related

- `supervibe:project-memory` — search past decisions/patterns (different corpus: markdown notes, not code)
- `supervibe:_core:repo-researcher` — uses this skill as primary tool
- All stack-developer agents — invoke this BEFORE non-trivial implementation
```

- [ ] **Step 2: Validate skill**

Run: `npm run lint:descriptions && npm run validate:frontmatter`
Expected: OK on `skills/code-search/SKILL.md`.

- [ ] **Step 3: Commit**

```bash
git add skills/code-search/SKILL.md
git commit -m "feat(rag): add supervibe:code-search skill for agent-side semantic code lookup"
```

---

### Task A7: Wire stack-developer agents to use code-search

**Files:**
- Modify: `agents/stacks/laravel/laravel-developer.md`
- Modify: `agents/stacks/nextjs/nextjs-developer.md`
- Modify: `agents/stacks/fastapi/fastapi-developer.md`
- Modify: `agents/stacks/react/react-implementer.md`

- [ ] **Step 1: Add supervibe:code-search to laravel-developer skills + Procedure**

Read `agents/stacks/laravel/laravel-developer.md`, then modify:

In `skills:` array, append `supervibe:code-search`. Result frontmatter line:
```yaml
skills: [supervibe:tdd, supervibe:verification, supervibe:code-review, supervibe:confidence-scoring, supervibe:project-memory, supervibe:code-search]
```

In `## Procedure` section, the existing Step 1 is:
> 1. **Pre-task: invoke `supervibe:project-memory`** — search prior decisions/patterns/solutions for this domain

Insert new Step 2 directly after it:
> 2. **Pre-task: invoke `supervibe:code-search`** — find existing similar code, callers, related patterns in this codebase. Run `node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "<task topic>" --lang php --limit 5`. Read top 3 hits for context before writing code.

Renumber subsequent steps.

- [ ] **Step 2: Repeat for nextjs-developer**

Read `agents/stacks/nextjs/nextjs-developer.md`, apply same pattern with `--lang typescript`.

- [ ] **Step 3: Repeat for fastapi-developer**

Read `agents/stacks/fastapi/fastapi-developer.md`, apply same pattern with `--lang python`.

- [ ] **Step 4: Repeat for react-implementer**

Read `agents/stacks/react/react-implementer.md`, apply same pattern with `--lang typescript`.

- [ ] **Step 5: Validate frontmatter still OK**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add agents/stacks/laravel/laravel-developer.md agents/stacks/nextjs/nextjs-developer.md agents/stacks/fastapi/fastapi-developer.md agents/stacks/react/react-implementer.md
git commit -m "feat(agents): wire stack-developer agents to supervibe:code-search before implementation"
```

---

### Task A8: Add Code RAG section to getting-started.md

**Files:**
- Modify: `docs/getting-started.md`

- [ ] **Step 1: Read current getting-started.md to find insert point**

Read the file. Find the "## Memory system" section (existing).

- [ ] **Step 2: Add Code Search section directly after Memory section**

Insert after `## Memory system (SQLite FTS5)` block:

```markdown
## Code Search (RAG over your source code)

Beyond markdown memory, Supervibe indexes your source code for semantic search. This runs transparently — agents use it under the hood; you don't manage it directly.

```bash
# One-time full index (after install or major refactor)
node $CLAUDE_PLUGIN_ROOT/scripts/build-code-index.mjs

# Manual semantic search (optional — agents auto-invoke this)
node $CLAUDE_PLUGIN_ROOT/scripts/search-code.mjs --query "where authentication is handled"
```

**What gets indexed:** `.ts/.tsx/.js/.jsx/.py/.php/.rs/.go/.java/.rb/.vue/.svelte`. Skips `node_modules/`, `dist/`, `.next/`, `__pycache__/`, etc.

**Why this matters:** Agents (laravel-developer, nextjs-developer, fastapi-developer, react-implementer, repo-researcher) auto-search code before non-trivial tasks. Result: less hallucination, more reuse of existing patterns, faster orientation in unfamiliar parts of the codebase.

**Auto-index on changes:** Run `npm run memory:watch` once to start the file-watcher daemon. It re-indexes changed files on save (~50ms per file). Without watcher: re-run `code:index` after major changes.

**Storage:** `.claude/memory/code.db` (SQLite, gitignored). Hash-based dedup means re-indexing is fast.
```

- [ ] **Step 3: Verify markdown still valid**

Run: `node -e "const m = require('gray-matter'); console.log('OK')"`

- [ ] **Step 4: Commit**

```bash
git add docs/getting-started.md
git commit -m "docs: add Code RAG section to getting-started"
```

---

## Phase B — Incremental Memory Updates (Tasks B1–B4)

### Task B1: memory-store hash + incrementalUpdate (TDD)

**Files:**
- Modify: `scripts/lib/memory-store.mjs`
- Create: `tests/memory-incremental.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/memory-incremental.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../scripts/lib/memory-store.mjs';

const sandbox = join(tmpdir(), `evolve-memory-incr-${Date.now()}`);
let store;

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory', 'decisions'), { recursive: true });
  store = new MemoryStore(sandbox, { useEmbeddings: false });
  await store.init();
});

after(async () => {
  store.close();
  await rm(sandbox, { recursive: true, force: true });
});

test('incrementalUpdate: indexes new file', async () => {
  const f = join(sandbox, '.claude', 'memory', 'decisions', '2026-01-01-foo.md');
  await writeFile(f, `---\nid: foo\ntype: decision\ndate: 2026-01-01\ntags: [test]\nagent: test\nconfidence: 9\n---\n\nBody about foo.`);
  await store.incrementalUpdate(f);
  const entry = store.db.prepare('SELECT * FROM entries WHERE id = ?').get('foo');
  assert.ok(entry, 'entry should exist');
  assert.ok(entry.content_hash, 'hash should be stored');
});

test('incrementalUpdate: skips unchanged file', async () => {
  const f = join(sandbox, '.claude', 'memory', 'decisions', '2026-01-01-foo.md');
  const before = store.db.prepare('SELECT indexed_at FROM entries WHERE id = ?').get('foo');
  await new Promise(r => setTimeout(r, 1100)); // ensure indexed_at would change if reindexed
  const result = await store.incrementalUpdate(f);
  assert.strictEqual(result.skipped, 'unchanged');
  const after = store.db.prepare('SELECT indexed_at FROM entries WHERE id = ?').get('foo');
  assert.strictEqual(before.indexed_at, after.indexed_at);
});

test('incrementalUpdate: re-indexes changed file', async () => {
  const f = join(sandbox, '.claude', 'memory', 'decisions', '2026-01-01-foo.md');
  await writeFile(f, `---\nid: foo\ntype: decision\ndate: 2026-01-01\ntags: [test, updated]\nagent: test\nconfidence: 10\n---\n\nUpdated body.`);
  const result = await store.incrementalUpdate(f);
  assert.strictEqual(result.indexed, true);
  const entry = store.db.prepare('SELECT * FROM entries WHERE id = ?').get('foo');
  assert.strictEqual(entry.confidence, 10);
});

test('removeEntryByPath: deletes entry on file delete', async () => {
  const f = join(sandbox, '.claude', 'memory', 'decisions', '2026-01-01-foo.md');
  await unlink(f);
  await store.removeEntryByPath(f);
  const entry = store.db.prepare('SELECT * FROM entries WHERE id = ?').get('foo');
  assert.strictEqual(entry, undefined, 'entry should be removed');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --no-warnings --test tests/memory-incremental.test.mjs`
Expected: FAIL — `incrementalUpdate is not a function`

- [ ] **Step 3: Add `content_hash` column to entries table**

In `scripts/lib/memory-store.mjs`, modify the `entries` CREATE TABLE statement:

Replace:
```javascript
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        date TEXT,
        tags_csv TEXT,
        agent TEXT,
        confidence INTEGER,
        file TEXT NOT NULL,
        summary TEXT,
        content TEXT,
        embedding BLOB,
        indexed_at TEXT
      );
```

With:
```javascript
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        date TEXT,
        tags_csv TEXT,
        agent TEXT,
        confidence INTEGER,
        file TEXT NOT NULL,
        summary TEXT,
        content TEXT,
        content_hash TEXT,
        embedding BLOB,
        indexed_at TEXT
      );
```

Add migration for existing DBs (run after CREATE):
```javascript
      // Migration: add content_hash column if missing
      try { this.db.exec("ALTER TABLE entries ADD COLUMN content_hash TEXT"); } catch {}
```

- [ ] **Step 4: Add `incrementalUpdate(filePath)` and `removeEntryByPath(filePath)` methods**

In `MemoryStore` class, add (after `rebuildIndex`):

```javascript
  /** Index or refresh a single memory entry from filesystem. Hash-based skip if unchanged. */
  async incrementalUpdate(absPath) {
    const { readFile } = await import('node:fs/promises');
    const matter = (await import('gray-matter')).default;
    const { hashFile } = await import('./file-hash.mjs');
    const { chunkText, countTokens } = await import('./chunker.mjs');

    let content;
    try { content = await readFile(absPath, 'utf8'); }
    catch (err) {
      if (err.code === 'ENOENT') return await this.removeEntryByPath(absPath) || { skipped: 'file-deleted' };
      throw err;
    }

    const parsed = matter(content);
    const data = parsed.data;
    const body = parsed.content || '';
    if (!data.id) return { skipped: 'no-id-in-frontmatter' };

    const hash = await hashFile(absPath);
    const existing = this.db.prepare('SELECT content_hash FROM entries WHERE id = ?').get(String(data.id));
    if (existing && existing.content_hash === hash) {
      return { skipped: 'unchanged' };
    }

    // Remove old chunks (CASCADE)
    this.db.prepare('DELETE FROM entry_chunks WHERE entry_id = ?').run(String(data.id));
    this.db.prepare('DELETE FROM entries_fts WHERE id = ?').run(String(data.id));
    this.db.prepare('DELETE FROM tags WHERE entry_id = ?').run(String(data.id));

    const tagsArr = Array.isArray(data.tags) ? data.tags : [];
    const tagsCSV = tagsArr.join(',');
    const summary = body.split('\n').slice(0, 5).join(' ').slice(0, 500);

    let summaryEmbeddingBuf = null;
    const chunkEmbeddings = [];
    if (this.useEmbeddings) {
      try {
        const { embed, vectorToBuffer } = await import('./embeddings.mjs');
        const summaryText = `${data.id}\n${tagsCSV}\n${summary}`;
        summaryEmbeddingBuf = vectorToBuffer(await embed(summaryText, 'passage'));
        const chunks = await chunkText(body, { targetTokens: 200, overlapTokens: 32 });
        for (let i = 0; i < chunks.length; i++) {
          const vec = await embed(chunks[i], 'passage');
          chunkEmbeddings.push({
            idx: i,
            text: chunks[i],
            tokens: await countTokens(chunks[i]),
            buf: vectorToBuffer(vec)
          });
        }
      } catch {} // graceful degrade
    }

    const dateStr = data.date instanceof Date
      ? data.date.toISOString().slice(0, 10)
      : (data.date ? String(data.date) : null);

    this.db.prepare(`
      INSERT OR REPLACE INTO entries
        (id, type, date, tags_csv, agent, confidence, file, summary, content, content_hash, embedding, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      String(data.id),
      String(data.type || 'decision'),
      dateStr,
      String(tagsCSV),
      String(data.agent || 'unknown'),
      Number(data.confidence || 0),
      String(this.toRelativePath(absPath)),
      String(summary),
      String(body),
      hash,
      summaryEmbeddingBuf
    );

    if (chunkEmbeddings.length > 0) {
      const ins = this.db.prepare('INSERT INTO entry_chunks (entry_id, chunk_idx, chunk_text, token_count, embedding) VALUES (?, ?, ?, ?, ?)');
      for (const c of chunkEmbeddings) ins.run(String(data.id), c.idx, String(c.text), c.tokens, c.buf);
    }

    this.db.prepare('INSERT INTO entries_fts (id, content, summary, tags_csv) VALUES (?, ?, ?, ?)').run(String(data.id), body, summary, tagsCSV);
    const insTag = this.db.prepare('INSERT OR IGNORE INTO tags (tag, entry_id) VALUES (?, ?)');
    for (const tag of tagsArr) insTag.run(tag, String(data.id));

    return { indexed: true };
  }

  /** Remove entry whose source file matches relPath. */
  async removeEntryByPath(absPath) {
    const relPath = this.toRelativePath(absPath);
    const row = this.db.prepare('SELECT id FROM entries WHERE file = ?').get(relPath);
    if (!row) return { skipped: 'not-in-index' };
    this.db.prepare('DELETE FROM entry_chunks WHERE entry_id = ?').run(row.id);
    this.db.prepare('DELETE FROM entries_fts WHERE id = ?').run(row.id);
    this.db.prepare('DELETE FROM tags WHERE entry_id = ?').run(row.id);
    this.db.prepare('DELETE FROM entries WHERE id = ?').run(row.id);
    return { removed: true, id: row.id };
  }
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --no-warnings --test tests/memory-incremental.test.mjs`
Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/memory-store.mjs tests/memory-incremental.test.mjs
git commit -m "feat(memory): add incremental update + hash-based dedup + path-based removal"
```

---

### Task B2: code-watcher (chokidar daemon)

**Files:**
- Create: `scripts/lib/code-watcher.mjs`
- Modify: `package.json` (add `chokidar` devDep)

- [ ] **Step 1: Install chokidar**

Run: `npm install chokidar`
Expected: 1 package added.

- [ ] **Step 2: Implement watcher**

Create `scripts/lib/code-watcher.mjs`:

```javascript
// File-watcher daemon that auto-reindexes memory + code on file changes.
// Uses chokidar for cross-platform fs watching with debouncing.

import chokidar from 'chokidar';
import { join } from 'node:path';
import { MemoryStore } from './memory-store.mjs';
import { CodeStore } from './code-store.mjs';

const SUPPORTED_CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|php|rs|go|java|rb|vue|svelte)$/i;

export async function startWatcher(projectRoot, opts = {}) {
  const { useEmbeddings = true, verbose = true } = opts;

  const memoryStore = new MemoryStore(projectRoot, { useEmbeddings });
  await memoryStore.init();

  const codeStore = new CodeStore(projectRoot, { useEmbeddings });
  await codeStore.init();

  if (verbose) console.log(`[evolve-watcher] starting; root=${projectRoot}`);

  // Memory watcher
  const memWatcher = chokidar.watch(join(projectRoot, '.claude', 'memory'), {
    ignored: /(^|[/\\])\..*\.swp$|memory\.db|code\.db$/,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  });

  memWatcher
    .on('add', async (path) => {
      if (!path.endsWith('.md')) return;
      try {
        const r = await memoryStore.incrementalUpdate(path);
        if (verbose) console.log(`[evolve-watcher] memory +${r.indexed ? 'INDEXED' : r.skipped}: ${path}`);
      } catch (err) { console.error(`[evolve-watcher] memory err: ${err.message}`); }
    })
    .on('change', async (path) => {
      if (!path.endsWith('.md')) return;
      try {
        const r = await memoryStore.incrementalUpdate(path);
        if (verbose) console.log(`[evolve-watcher] memory ~${r.indexed ? 'REINDEXED' : r.skipped}: ${path}`);
      } catch (err) { console.error(`[evolve-watcher] memory err: ${err.message}`); }
    })
    .on('unlink', async (path) => {
      try {
        const r = await memoryStore.removeEntryByPath(path);
        if (verbose) console.log(`[evolve-watcher] memory -REMOVED: ${path} (${JSON.stringify(r)})`);
      } catch (err) { console.error(`[evolve-watcher] memory err: ${err.message}`); }
    });

  // Code watcher (project-wide, language-filtered)
  const codeWatcher = chokidar.watch(projectRoot, {
    ignored: [
      /(^|[\/\\])\../, // dotfiles
      /node_modules/,
      /\.git/,
      /\bdist\b/,
      /\bbuild\b/,
      /\bout\b/,
      /\.next/,
      /coverage/,
      /\.turbo/,
      /vendor/,
      /__pycache__/,
      /\btarget\b/,
      /\.venv|\bvenv\b/,
      /\.(min|bundle)\./,
      /\.(test|spec)\.(ts|tsx|js|jsx)$/,
      /\.d\.ts$/
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 }
  });

  const handleCode = async (event, path) => {
    if (!SUPPORTED_CODE_EXT.test(path)) return;
    try {
      if (event === 'unlink') {
        await codeStore.removeFile(path);
        if (verbose) console.log(`[evolve-watcher] code -REMOVED: ${path}`);
      } else {
        const r = await codeStore.indexFile(path);
        if (verbose && r.indexed) console.log(`[evolve-watcher] code ~${event.toUpperCase()}: ${path} (${r.chunks} chunks)`);
      }
    } catch (err) { console.error(`[evolve-watcher] code err: ${err.message}`); }
  };

  codeWatcher
    .on('add', (p) => handleCode('add', p))
    .on('change', (p) => handleCode('change', p))
    .on('unlink', (p) => handleCode('unlink', p));

  if (verbose) console.log(`[evolve-watcher] watching .claude/memory/ + project source files`);

  return {
    stop: async () => {
      await memWatcher.close();
      await codeWatcher.close();
      memoryStore.close();
      codeStore.close();
      if (verbose) console.log('[evolve-watcher] stopped');
    },
    memoryStore,
    codeStore
  };
}
```

- [ ] **Step 3: Verify chokidar can be imported**

Run: `node --no-warnings -e "import('chokidar').then(m => console.log('OK', !!m.default))"`
Expected: stdout `OK true`.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/code-watcher.mjs package.json package-lock.json
git commit -m "feat(rag): add chokidar-based file watcher for memory + code auto-reindex"
```

---

### Task B3: watch-memory CLI daemon

**Files:**
- Create: `scripts/watch-memory.mjs`

- [ ] **Step 1: Implement daemon entry**

Create `scripts/watch-memory.mjs`:

```javascript
#!/usr/bin/env node
// File-watcher daemon entry. Run via `npm run memory:watch`.
// Auto-reindexes memory entries (.claude/memory/**) AND source code on change.
// Stop with Ctrl+C.

import { startWatcher } from './lib/code-watcher.mjs';

const PROJECT_ROOT = process.cwd();

async function main() {
  const args = process.argv.slice(2);
  const noEmbeddings = args.includes('--no-embeddings');

  console.log(`Starting evolve memory + code watcher in ${PROJECT_ROOT}`);
  if (noEmbeddings) console.log('  (embeddings disabled — BM25 only)');

  const handle = await startWatcher(PROJECT_ROOT, {
    useEmbeddings: !noEmbeddings,
    verbose: true
  });

  // Graceful shutdown
  const shutdown = async (sig) => {
    console.log(`\n[evolve-watcher] received ${sig}, shutting down...`);
    await handle.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('Watcher running. Press Ctrl+C to stop.');
  // Keep process alive
  setInterval(() => {}, 1 << 30);
}

main().catch(err => { console.error('watch-memory error:', err); process.exit(1); });
```

- [ ] **Step 2: Verify it boots and shuts down**

Run (for 3 seconds, then SIGTERM): `timeout 3 node scripts/watch-memory.mjs --no-embeddings || true`
Expected: stdout shows "Starting evolve memory + code watcher", "Watcher running"; clean exit (no stack trace).

- [ ] **Step 3: Commit**

```bash
git add scripts/watch-memory.mjs
git commit -m "feat(rag): add memory:watch daemon CLI"
```

---

### Task B4: Add memory:watch + chokidar to knip + verify check passes

**Files:**
- Modify: `knip.json`

- [ ] **Step 1: Check knip output for unused-deps warnings**

Run: `npx knip --no-progress`
Expected: chokidar shouldn't be flagged (it's used by code-watcher).

- [ ] **Step 2: If chokidar flagged, add to knip allowlist**

If knip complains about chokidar being unused at top-level, modify `knip.json`:

```json
  "ignoreDependencies": ["husky", "lint-staged", "@commitlint/cli", "@commitlint/config-conventional"]
```

(no change needed if chokidar properly resolves; only edit if knip flags it).

- [ ] **Step 3: Run full check**

Run: `npm run check`
Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add knip.json
git commit -m "chore(knip): allow chokidar in dep audit"
```

(skip commit if no change needed.)

---

## Phase C — Strengthen 42 Compact Agents (Tasks C1–C42)

**Strategy**: each task strengthens ONE compact agent to ≥250 lines following the proven template established by `code-reviewer.md` (244 lines), `root-cause-debugger.md` (238 lines), `repo-researcher.md` (197 lines), `security-auditor.md` (267 lines).

**Strengthen template** — every strengthened agent must add/expand:
1. **Persona** — multi-paragraph, 15+ years background with specific stack/tool history, core principle in quotes, 4-priority list with explicit ordering, 2-paragraph mental model
2. **Project Context** — 4-7 bullets of detected paths, conventions, tools, memory location
3. **Skills** — list with one-line purpose each, ≥3 skills
4. **Decision tree** — ASCII tree covering main task variants
5. **Procedure** — 8-15 numbered steps with sub-bullets
6. **Output contract** — Markdown template with all sections
7. **Anti-patterns** — ≥5 patterns, each with 1-line reasoning
8. **Verification** — explicit commands + evidence requirements
9. **Common workflows** — ≥3 workflows (named scenarios with steps)
10. **Out of scope** — what to defer, to whom
11. **Related** — cross-links to ≥3 related agents/skills

**Each strengthen task is structurally identical** — only the agent file path and domain content differ. Use code-reviewer.md as the canonical reference for structure.

---

### Task C1: Strengthen `agents/_core/architect-reviewer.md`

**Files:**
- Modify: `agents/_core/architect-reviewer.md`

- [ ] **Step 1: Read current file**

Read `agents/_core/architect-reviewer.md` (~74 lines).

- [ ] **Step 2: Read reference template**

Read `agents/_core/code-reviewer.md` (244 lines). Note structure of Persona, Decision tree, Procedure, Output contract, Anti-patterns, Common workflows, Verification, Out of scope, Related.

- [ ] **Step 3: Rewrite the agent file**

Apply the strengthen template:
- Frontmatter: bump `version: 1.0` → `version: 1.1`, add today's date to `last-verified`
- Persona expanded to 4 paragraphs (background, principle, priorities, mental model with ADR/architectural-decisions context)
- Decision tree: REVIEW types (system arch / module arch / data flow / API contract)
- Procedure: 10+ steps including: read CLAUDE.md architecture style → map current boundaries → identify the change's architectural impact → check layer-violation patterns → coupling analysis → propose ADR if structural → score
- Output contract: Markdown template with **Verdict / Architectural Concerns (CRITICAL/MAJOR/MINOR/SUGGESTION) / Layer Violations Found / Recommendations**
- Anti-patterns: 7 (mix-concerns / premature-abstraction / architecture-astronomy / ignore-existing-patterns / approve-without-tracing-dependencies / suggest-rewrite-when-refactor-suffices / no-evidence-for-claims)
- Common workflows: 4 (new-module-review / refactor-review / migration-review / boundary-violation-investigation)
- Out of scope: explicit list
- Related: ≥4 cross-links

Write the result. The file MUST be ≥250 lines.

- [ ] **Step 4: Validate frontmatter**

Run: `npm run validate:frontmatter | grep architect-reviewer`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add agents/_core/architect-reviewer.md
git commit -m "refactor(agents): strengthen _core:architect-reviewer to 250+ lines (full persona/decision-tree/workflows)"
```

---

### Task C2: Strengthen `agents/_core/refactoring-specialist.md`

**Files:**
- Modify: `agents/_core/refactoring-specialist.md`

- [ ] **Step 1-5**: Same pattern as C1.

Read current file (~79 lines), use `code-reviewer.md` as template, expand to ≥250 lines covering:
- Persona: refactor-only-when-tests-green, preserve-behavior, blast-radius philosophy
- Decision tree: rename / extract method / inline / move / split-class / merge-modules
- Procedure: read CLAUDE.md → identify smell → ensure baseline tests green → make smallest change → run tests → commit → repeat
- Output contract: refactor report with before/after metrics
- Anti-patterns: refactor-with-features-mixed / premature-abstraction / over-renaming / big-bang-refactor / no-test-baseline / ignore-callers
- Workflows: rename-symbol / extract-method / split-large-file / module-boundary-cleanup
- Related: code-reviewer, architect-reviewer, repo-researcher, root-cause-debugger

```bash
git add agents/_core/refactoring-specialist.md
git commit -m "refactor(agents): strengthen _core:refactoring-specialist to 250+ lines"
```

---

### Task C3: Strengthen `agents/_core/quality-gate-reviewer.md`

Same pattern. Expand quality-gate-reviewer (currently ~75 lines) to ≥250 lines covering verdict criteria, evidence-aggregation across rubrics, override audit role, gate-level decision tree.

```bash
git add agents/_core/quality-gate-reviewer.md
git commit -m "refactor(agents): strengthen _core:quality-gate-reviewer to 250+ lines"
```

---

### Task C4: Strengthen `agents/_meta/rules-curator.md`

Read current (~80 lines), expand to ≥250 lines covering rule lifecycle (add/modify/retire), contradiction-detection methods, sync-rules across projects, rule-quality rubric application.

```bash
git add agents/_meta/rules-curator.md
git commit -m "refactor(agents): strengthen _meta:rules-curator to 250+ lines"
```

---

### Task C5: Strengthen `agents/_meta/memory-curator.md`

Same pattern. Cover hygiene workflows (dedup, tag normalization, retirement, cross-link integrity, confidence audit).

```bash
git add agents/_meta/memory-curator.md
git commit -m "refactor(agents): strengthen _meta:memory-curator to 250+ lines"
```

---

### Task C6: Strengthen `agents/_product/product-manager.md`

Cover CPO scope, prioritization (RICE/ICE/Kano), roadmap, OKRs, business-case framing, stakeholder alignment.

```bash
git add agents/_product/product-manager.md
git commit -m "refactor(agents): strengthen _product:product-manager (CPO scope) to 250+ lines"
```

---

### Task C7: Strengthen `agents/_product/systems-analyst.md`

Cover requirements elicitation, acceptance criteria templates, edge case enumeration playbook, system contract format.

```bash
git add agents/_product/systems-analyst.md
git commit -m "refactor(agents): strengthen _product:systems-analyst to 250+ lines"
```

---

### Task C8: Strengthen `agents/_product/qa-test-engineer.md`

Cover test pyramid, Pest/Vitest/Playwright workflows, fixture design, flaky-test isolation, coverage strategy.

```bash
git add agents/_product/qa-test-engineer.md
git commit -m "refactor(agents): strengthen _product:qa-test-engineer to 250+ lines"
```

---

### Task C9: Strengthen `agents/_product/analytics-implementation.md`

Cover event taxonomy, GTM/Mixpanel/Amplitude patterns, GDPR-clean instrumentation, tracking plan format.

```bash
git add agents/_product/analytics-implementation.md
git commit -m "refactor(agents): strengthen _product:analytics-implementation to 250+ lines"
```

---

### Task C10: Strengthen `agents/_product/seo-specialist.md`

Cover technical SEO checklist, schema.org/JSON-LD per page type, sitemap/robots/canonical/hreflang strategy, CWV-for-SEO targeting.

```bash
git add agents/_product/seo-specialist.md
git commit -m "refactor(agents): strengthen _product:seo-specialist to 250+ lines"
```

---

### Task C11: Strengthen `agents/_product/email-lifecycle.md`

Cover transactional/marketing flows, deliverability (SPF/DKIM/DMARC), HTML email patterns, lifecycle state machine, bounce handling.

```bash
git add agents/_product/email-lifecycle.md
git commit -m "refactor(agents): strengthen _product:email-lifecycle to 250+ lines"
```

---

### Task C12: Strengthen `agents/_ops/devops-sre.md`

Cover CI/CD design, runbook authoring, SLO/SLI design, observability stack, incident command, GitOps patterns.

```bash
git add agents/_ops/devops-sre.md
git commit -m "refactor(agents): strengthen _ops:devops-sre to 250+ lines"
```

---

### Task C13: Strengthen `agents/_ops/performance-reviewer.md`

Cover profile-first methodology, bottleneck taxonomy (CPU/IO/memory/lock/network), benchmark workflow, regression detection.

```bash
git add agents/_ops/performance-reviewer.md
git commit -m "refactor(agents): strengthen _ops:performance-reviewer to 250+ lines"
```

---

### Task C14: Strengthen `agents/_ops/dependency-reviewer.md`

Cover audit workflow per ecosystem, license compliance matrix, supply-chain signals (typosquat / abandonment / maintainer-activity).

```bash
git add agents/_ops/dependency-reviewer.md
git commit -m "refactor(agents): strengthen _ops:dependency-reviewer to 250+ lines"
```

---

### Task C15: Strengthen `agents/_ops/db-reviewer.md`

Cover EXPLAIN ANALYZE walkthrough, index strategy decision tree, migration safety patterns, replication impact assessment.

```bash
git add agents/_ops/db-reviewer.md
git commit -m "refactor(agents): strengthen _ops:db-reviewer to 250+ lines"
```

---

### Task C16: Strengthen `agents/_ops/api-contract-reviewer.md`

Cover REST/GraphQL/gRPC contract review, breaking change taxonomy, deprecation strategy, OpenAPI diff workflow.

```bash
git add agents/_ops/api-contract-reviewer.md
git commit -m "refactor(agents): strengthen _ops:api-contract-reviewer to 250+ lines"
```

---

### Task C17: Strengthen `agents/_ops/infrastructure-architect.md`

Cover Sentinel vs Cluster decision tree, Postgres replication topology, queue topology, cache layer design, failure-mode analysis.

```bash
git add agents/_ops/infrastructure-architect.md
git commit -m "refactor(agents): strengthen _ops:infrastructure-architect to 250+ lines"
```

---

### Task C18: Strengthen `agents/_ops/ai-integration-architect.md`

Cover prompt registry, RAG architecture, vector DB choice matrix, model routing, eval harness, prompt-injection defenses.

```bash
git add agents/_ops/ai-integration-architect.md
git commit -m "refactor(agents): strengthen _ops:ai-integration-architect to 250+ lines"
```

---

### Task C19: Strengthen `agents/_design/creative-director.md`

Cover brand direction methodology, palette/typographic intent process, mood-board discipline, alignment workflows.

```bash
git add agents/_design/creative-director.md
git commit -m "refactor(agents): strengthen _design:creative-director to 250+ lines"
```

---

### Task C20: Strengthen `agents/_design/ux-ui-designer.md`

Cover screen-spec methodology, info architecture, states matrix, jobs-to-be-done framework, interaction notes.

```bash
git add agents/_design/ux-ui-designer.md
git commit -m "refactor(agents): strengthen _design:ux-ui-designer to 250+ lines"
```

---

### Task C21: Strengthen `agents/_design/ui-polish-reviewer.md`

Cover 8-dim review (hierarchy/spacing/alignment/states/keyboard/responsive/copy/DS-consistency), severity classification, scan patterns.

```bash
git add agents/_design/ui-polish-reviewer.md
git commit -m "refactor(agents): strengthen _design:ui-polish-reviewer to 250+ lines"
```

---

### Task C22: Strengthen `agents/_design/accessibility-reviewer.md`

Cover WCAG AA checklist, keyboard nav workflow, screen reader testing, contrast measurement, motion preferences.

```bash
git add agents/_design/accessibility-reviewer.md
git commit -m "refactor(agents): strengthen _design:accessibility-reviewer to 250+ lines"
```

---

### Task C23: Strengthen `agents/_design/copywriter.md`

Cover voice/tone framework, microcopy patterns, error message templates, CTA optimization, do/don't pairs.

```bash
git add agents/_design/copywriter.md
git commit -m "refactor(agents): strengthen _design:copywriter to 250+ lines"
```

---

### Task C24: Strengthen `agents/_design/prototype-builder.md`

Cover HTML/CSS prototype workflow, token-discipline enforcement, states matrix implementation, drift-check methodology.

```bash
git add agents/_design/prototype-builder.md
git commit -m "refactor(agents): strengthen _design:prototype-builder to 250+ lines"
```

---

### Task C25-C28: Strengthen Laravel stack agents

C25 — `agents/stacks/laravel/laravel-architect.md` — bounded contexts, Eloquent vs Repository decision, queue topology, ADR triggers.

C26 — `agents/stacks/laravel/laravel-developer.md` — Pest TDD workflow, Form Request patterns, Policy/Gate, queue jobs.

C27 — `agents/stacks/laravel/queue-worker-architect.md` — Horizon, idempotency patterns, retry/backoff, dead-letter handling.

C28 — `agents/stacks/laravel/eloquent-modeler.md` — N+1 prevention, polymorphic patterns, scope design, eager-load strategies.

```bash
# After each:
git add agents/stacks/laravel/<file>.md
git commit -m "refactor(agents): strengthen stacks/laravel:<name> to 250+ lines"
```

---

### Task C29-C31: Strengthen Next.js stack agents

C29 — `agents/stacks/nextjs/nextjs-architect.md` — server vs client decision tree, streaming/Suspense placement, edge runtime selection.

C30 — `agents/stacks/nextjs/nextjs-developer.md` — App Router patterns, Server Components default, error/loading states.

C31 — `agents/stacks/nextjs/server-actions-specialist.md` — Zod validation, revalidation patterns, optimistic updates, error envelope.

```bash
# After each:
git add agents/stacks/nextjs/<file>.md
git commit -m "refactor(agents): strengthen stacks/nextjs:<name> to 250+ lines"
```

---

### Task C32-C34: Strengthen Postgres / Redis / React stack agents

C32 — `agents/stacks/postgres/postgres-architect.md` — schema design, migration safety patterns (3-deploy column add), index strategy, replication topology.

C33 — `agents/stacks/redis/redis-architect.md` — Sentinel/Cluster decision tree, key namespace, expiration/eviction policy, persistence (RDB+AOF).

C34 — `agents/stacks/react/react-implementer.md` — hooks discipline, state colocation, Suspense + ErrorBoundary, custom hook extraction.

```bash
# After each:
git add agents/stacks/<stack>/<file>.md
git commit -m "refactor(agents): strengthen stacks/<stack>:<name> to 250+ lines"
```

---

### Task C35-C36: Strengthen FastAPI stack agents

C35 — `agents/stacks/fastapi/fastapi-architect.md` — module organization, Pydantic v2 patterns, async DB session DI, Alembic migration policy.

C36 — `agents/stacks/fastapi/fastapi-developer.md` — pytest-asyncio workflow, Pydantic schema design, dependency injection patterns, error-handler chain.

```bash
# After each:
git add agents/stacks/fastapi/<file>.md
git commit -m "refactor(agents): strengthen stacks/fastapi:<name> to 250+ lines"
```

---

### Task C37-C42: Bulk strengthen remaining 6 agents

The remaining agents that haven't been touched yet (verify with `for f in agents/**/*.md; do echo "$(wc -l <"$f") $f"; done | sort -n | head -10` after C1-C36 to find any still under 250 lines).

For each remaining, repeat the strengthen pattern.

```bash
# After each:
git add agents/<path>.md
git commit -m "refactor(agents): strengthen <namespace>:<name> to 250+ lines"
```

---

### Task C-FINAL: Verify ALL agents ≥250 lines

**Files:**
- (verification only)

- [ ] **Step 1: Count lines per agent**

Run:
```bash
find agents -name "*.md" -not -name ".gitkeep" -exec wc -l {} \; | sort -n
```
Expected: every line shows ≥250.

- [ ] **Step 2: If any agent is <250 lines**, return to its strengthen task and expand further.

- [ ] **Step 3: Run full check**

Run: `npm run check`
Expected: 0 errors, 52+ tests pass.

- [ ] **Step 4: Update CHANGELOG**

Append v1.5.0 entry to `CHANGELOG.md` with:
- Phase A summary (code RAG + chunker + watcher)
- Phase B summary (incremental memory updates)
- Phase C summary (42 agents strengthened to spec)

- [ ] **Step 5: Bump version**

Modify `.claude-plugin/plugin.json`: `"version": "1.5.0"`.
Modify `package.json`: `"version": "1.5.0"`.
Modify `README.md`: status line updated.

- [ ] **Step 6: Commit release**

```bash
git add CHANGELOG.md .claude-plugin/plugin.json package.json README.md
git commit -m "chore(release): v1.5.0 — code RAG + incremental memory + agent strengthen pass"
```

---

## Self-Review

### 1. Spec coverage

| Identified gap | Plan task(s) |
|----------------|--------------|
| Code not indexed in RAG (was 2/10) | Phase A (Tasks A1-A8): chunker, store, CLIs, skill, agent wiring, docs |
| No auto-reindex on file changes | Phase A Task A2 (chunker), Phase B Task B2 (watcher), Task B3 (daemon) |
| No memory cleanup / hash-based dedup | Phase B Task B1 (incrementalUpdate + content_hash column + removeEntryByPath) |
| 42 agents at compact 60-130 lines | Phase C (Tasks C1-C42): strengthen pass per agent to ≥250 lines |
| User-facing LightRAG UI (per user veto) | EXPLICITLY EXCLUDED |

### 2. Placeholder scan

- All TDD tasks have full failing-test code, full implementation code, exact pass commands.
- C1 has full step detail; C2-C42 reference C1's structure but each task has its own commit + the strengthen template is explicit at top of Phase C. Engineer reading C5 in isolation: needs to read Phase C intro for template; that's acceptable per "Repeat the code — engineer may read out of order" because the template IS spelled out at Phase C intro AND the reference file (`code-reviewer.md`) is named explicitly.
- No "TBD"/"implement later"/"add validation" anywhere.

### 3. Type consistency

- `MemoryStore.incrementalUpdate(absPath)` signature: returns `{indexed: true}` | `{skipped: '<reason>'}` — used consistently in B1 tests + B2 watcher.
- `CodeStore.indexFile(absPath)` returns `{indexed: true, chunks: N}` | `{skipped: '<reason>'}` — used consistently in A3 tests + A4 CLI + B2 watcher.
- `chunkCode(code, filePath, opts)` returns `Array<{text, startLine, endLine, kind, name?, tokens}>` — used in A2 tests + A3 indexFile.
- `embed(text, mode)` requires `mode='passage'|'query'` — already established in v1.4.0; new code respects this.
- File paths: relative-from-projectRoot using `relative(...).split(sep).join('/')` — same pattern as MemoryStore (POSIX format in DB, OS-native at fs boundary).

### 4. Risks / accepted limitations

- **Strengthen-pass quality**: 42 expanded agents should match code-reviewer.md quality bar; each task's content checklist is concrete enough to enable subagent execution. Manual review of resulting line count + frontmatter validation is the gate.
- **chokidar overhead**: file-watcher daemon is opt-in (`npm run memory:watch`). Without it, manual `code:index` is the fallback. Acceptable.
- **Code RAG model**: reuses multilingual-e5-small (general-purpose, not code-specialized). Quality acceptable for cross-language navigation; can swap to code-specific embedding model in v1.6 if metrics show need.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-27-code-rag-and-quality-pass.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. ~50 tasks (A1-A8, B1-B4, C1-C42, C-FINAL). Phase C agents strengthen tasks are highly parallel — each task is independent file modification.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints (Phase A, then Phase B, then Phase C in batches of 6 agents).

Which approach?
