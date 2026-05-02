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
  for (const c of chunks) {
    assert.ok(c.text.trim().length > 0);
  }
});

test('chunkCode: observes shouldStop before expensive tokenization work', async () => {
  await assert.rejects(
    () => chunkCode('pub fn blocked_fixture() {}\n', 'foo.rs', {
      shouldStop: () => true,
      tokenMode: 'approximate',
    }),
    /chunking aborted/,
  );
});

test('chunkCode: Rust approximate mode recognizes modules and macros as chunk boundaries', async () => {
  const code = `
pub mod service_layer {
  pub struct ServiceState {
    value: i32,
  }
}

macro_rules! service_event {
  ($name:expr) => {
    println!("{}", $name);
  };
}

pub trait ServiceRunner {
  fn run(&self);
}

impl ServiceRunner for ServiceState {
  fn run(&self) {}
}

pub enum ServiceKind {
  Fast,
  Slow,
}

pub async fn execute_service() {
  service_event!("execute");
}
`;

  const chunks = await chunkCode(code, 'src/services/large_service.rs', {
    tokenMode: 'approximate',
    targetTokens: 24,
    overlapTokens: 0,
  });
  const names = chunks.map((chunk) => chunk.name).filter(Boolean);

  assert.ok(names.includes('service_layer'), `expected mod chunk, got ${names.join(', ')}`);
  assert.ok(names.includes('service_event'), `expected macro_rules chunk, got ${names.join(', ')}`);
  assert.ok(names.includes('ServiceRunner'), `expected trait chunk, got ${names.join(', ')}`);
  assert.ok(names.includes('ServiceKind'), `expected enum chunk, got ${names.join(', ')}`);
  assert.ok(names.includes('execute_service'), `expected fn chunk, got ${names.join(', ')}`);
});
