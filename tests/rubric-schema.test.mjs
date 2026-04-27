import { test } from 'node:test';
import assert from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import Ajv from 'ajv';

const SCHEMA_PATH = new URL('../confidence-rubrics/_schema.json', import.meta.url);
const RUBRICS_DIR = new URL('../confidence-rubrics/', import.meta.url);

async function loadSchema() {
  const content = await readFile(SCHEMA_PATH, 'utf8');
  return JSON.parse(content);
}

test('schema validates a minimal valid rubric', async () => {
  const schema = await loadSchema();
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(schema);

  const minimalRubric = {
    artifact: 'test-artifact',
    'max-score': 10,
    dimensions: [
      { id: 'dim1', weight: 5, question: 'Does it pass test 1?', 'evidence-required': 'A passing test' },
      { id: 'dim2', weight: 5, question: 'Does it pass test 2?', 'evidence-required': 'A passing test' }
    ],
    gates: { 'block-below': 9, 'warn-below': 10 }
  };

  const valid = validate(minimalRubric);
  assert.strictEqual(valid, true, JSON.stringify(validate.errors));
});

test('schema rejects rubric missing artifact', async () => {
  const schema = await loadSchema();
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(schema);

  const bad = {
    'max-score': 10,
    dimensions: [{ id: 'd', weight: 10, question: 'q1234567', 'evidence-required': 'e1234567' }],
    gates: { 'block-below': 9, 'warn-below': 10 }
  };

  assert.strictEqual(validate(bad), false);
});

test('every rubric YAML file validates against the schema', async () => {
  const schema = await loadSchema();
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(schema);

  const files = (await readdir(RUBRICS_DIR))
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  if (files.length === 0) {
    console.log('No rubric files yet — skipping content validation');
    return;
  }

  for (const file of files) {
    const content = await readFile(new URL(file, RUBRICS_DIR), 'utf8');
    const data = parseYaml(content);
    const valid = validate(data);
    assert.strictEqual(valid, true, `${file} failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
});

test('every rubric has dimension weights summing to max-score', async () => {
  const files = (await readdir(RUBRICS_DIR))
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of files) {
    const content = await readFile(new URL(file, RUBRICS_DIR), 'utf8');
    const data = parseYaml(content);
    const sum = data.dimensions.reduce((acc, d) => acc + d.weight, 0);
    assert.strictEqual(sum, data['max-score'], `${file}: weights sum=${sum}, expected ${data['max-score']}`);
  }
});
