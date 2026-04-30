import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractGraph, isSfcFile, detectGrammar } from '../scripts/lib/code-graph.mjs';

test('isSfcFile: detects .vue', () => {
  assert.equal(isSfcFile('src/components/Foo.vue'), true);
});

test('isSfcFile: detects .svelte', () => {
  assert.equal(isSfcFile('src/Bar.svelte'), true);
});

test('isSfcFile: false for .ts', () => {
  assert.equal(isSfcFile('src/foo.ts'), false);
});

test('detectGrammar: returns null for .vue (handled by SFC path)', () => {
  assert.equal(detectGrammar('Foo.vue'), null);
});

test('extractGraph: Vue SFC with TS script extracts symbols at correct lines', async () => {
  const sfc = `<template>
  <button @click="handleClick">Hi</button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const handleClick = () => {
  console.log('clicked')
}
</script>`;
  const { symbols, edges } = await extractGraph(sfc, 'Foo.vue');
  // Should have symbols extracted from script (handleClick exists at original line ~8)
  assert.ok(Array.isArray(symbols));
  assert.ok(Array.isArray(edges));
  assert.ok(symbols.some(s => s.name === 'handleClick' && s.kind === 'function'), 'expected script arrow function symbol for handleClick');
  // Template-side ref edge should exist
  const templateRef = edges.find(e => e.toName === 'handleClick' && e.kind === 'references');
  assert.ok(templateRef, 'expected template-side reference edge for handleClick');
});

test('extractGraph: Svelte SFC dual-script (module + instance) handled', async () => {
  const sfc = `<script context="module" lang="ts">
export function helper() { return 1 }
</script>

<script lang="ts">
let local = 2
</script>

<button on:click={helper}>Click</button>`;
  const { symbols, edges } = await extractGraph(sfc, 'Component.svelte');
  assert.ok(Array.isArray(symbols));
  assert.ok(Array.isArray(edges));
  // Template ref to helper should be there
  const helperRef = edges.find(e => e.toName === 'helper' && e.kind === 'references');
  assert.ok(helperRef, 'expected template-side reference edge for helper');
});

test('extractGraph: SFC without <script> returns empty symbols + only template refs', async () => {
  const sfc = `<template>
  <div>{{ greeting }}</div>
</template>`;
  const { symbols, edges } = await extractGraph(sfc, 'Greeting.vue');
  assert.equal(symbols.length, 0);
  // Template ref to 'greeting' should exist
  const ref = edges.find(e => e.toName === 'greeting');
  assert.ok(ref);
});

test('extractGraph: empty SFC returns empty graph', async () => {
  const { symbols, edges } = await extractGraph('', 'Empty.vue');
  assert.equal(symbols.length, 0);
  assert.equal(edges.length, 0);
});
