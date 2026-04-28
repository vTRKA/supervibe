import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractScriptBlocks, extractTemplateRefs } from '../scripts/lib/sfc-extractor.mjs';

test('extracts <script> block (Vue, default JS)', () => {
  const sfc = `<template><div>x</div></template>
<script>
export default { name: 'X' }
</script>`;
  const blocks = extractScriptBlocks(sfc);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lang, 'javascript');
  assert.ok(blocks[0].code.includes('export default'));
});

test('extracts <script lang="ts"> as typescript', () => {
  const sfc = `<template></template>
<script lang="ts">
const x: number = 1
</script>`;
  const blocks = extractScriptBlocks(sfc);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lang, 'typescript');
});

test('extracts <script setup lang="ts">', () => {
  const sfc = `<template></template>
<script setup lang="ts">
import { ref } from 'vue'
const count = ref(0)
</script>`;
  const blocks = extractScriptBlocks(sfc);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lang, 'typescript');
  assert.ok(blocks[0].code.includes('import { ref }'));
});

test('extracts multiple <script> blocks (Svelte: module + instance)', () => {
  const sfc = `<script context="module" lang="ts">
export const helper = () => 1
</script>

<script lang="ts">
const local = 2
</script>

<div>x</div>`;
  const blocks = extractScriptBlocks(sfc);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].lang, 'typescript');
  assert.equal(blocks[1].lang, 'typescript');
});

test('lineOffset places code at correct original SFC line', () => {
  const sfc = `<template>
  <div></div>
</template>
<script lang="ts">
const a = 1
</script>`;
  const blocks = extractScriptBlocks(sfc);
  assert.equal(blocks.length, 1);
  // <script> opens on line 4; CONTENT starts immediately after the > on line 4,
  // but actual JS on line 5 due to newline after >.
  // lineOffset should be the line of the FIRST char of code (4 — the same line as <script> tag close)
  assert.ok(blocks[0].lineOffset >= 4);
});

test('extractTemplateRefs picks up Vue @click handler', () => {
  const sfc = `<template>
  <button @click="handleClick">Hi</button>
</template>
<script>const handleClick = () => 1</script>`;
  const refs = extractTemplateRefs(sfc);
  assert.ok(refs.some(r => r.name === 'handleClick'));
});

test('extractTemplateRefs picks up Vue {{ interpolation }}', () => {
  const sfc = `<template>
  <div>{{ userName }}</div>
</template>`;
  const refs = extractTemplateRefs(sfc);
  assert.ok(refs.some(r => r.name === 'userName'));
});

test('extractTemplateRefs picks up Svelte on:click={fn}', () => {
  const sfc = `<script>const onSubmit = () => 1</script>
<button on:click={onSubmit}>Go</button>`;
  const refs = extractTemplateRefs(sfc);
  assert.ok(refs.some(r => r.name === 'onSubmit'));
});

test('extractTemplateRefs picks up Svelte plain {expr}', () => {
  const sfc = `<script>let title = 'hi'</script>
<h1>{title}</h1>`;
  const refs = extractTemplateRefs(sfc);
  assert.ok(refs.some(r => r.name === 'title'));
});

test('extractTemplateRefs filters language keywords', () => {
  const sfc = `<template><div>{{ true }}</div></template>`;
  const refs = extractTemplateRefs(sfc);
  // 'true' is a keyword, should NOT appear
  assert.ok(!refs.some(r => r.name === 'true'));
});

test('extractTemplateRefs ignores identifiers inside <script>', () => {
  const sfc = `<script>const insideScript = { foo: 1 }</script>
<div>{{ outsideRef }}</div>`;
  const refs = extractTemplateRefs(sfc);
  // should pick up outsideRef but NOT insideScript or foo (which are JS-internal)
  assert.ok(refs.some(r => r.name === 'outsideRef'));
  assert.ok(!refs.some(r => r.name === 'insideScript'));
});

test('extractTemplateRefs picks up :prop="expr" Vue bind', () => {
  const sfc = `<template>
  <my-component :user="currentUser" :count="totalCount" />
</template>`;
  const refs = extractTemplateRefs(sfc);
  assert.ok(refs.some(r => r.name === 'currentUser'));
  assert.ok(refs.some(r => r.name === 'totalCount'));
});

test('extractTemplateRefs picks up Vue v-bind:x="y" syntax', () => {
  const sfc = `<template>
  <input v-bind:value="username" v-on:input="handleInput" />
</template>`;
  const refs = extractTemplateRefs(sfc);
  assert.ok(refs.some(r => r.name === 'username'));
  assert.ok(refs.some(r => r.name === 'handleInput'));
});
