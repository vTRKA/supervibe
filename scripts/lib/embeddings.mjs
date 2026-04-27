// Real semantic embeddings via @huggingface/transformers (pure JS, no Python).
// Uses Xenova/multilingual-e5-small (384-dim, quantized ~118MB).
// MULTILINGUAL: handles English, Russian, 100+ languages well.
// Bundled in repo at models/Xenova/multilingual-e5-small/ — no network download needed.
//
// IMPORTANT: e5 family requires PREFIXES for best quality:
//   - "query: <text>" for search queries
//   - "passage: <text>" for indexed documents
// We add these automatically — caller passes mode='query' or mode='passage'.

import { pipeline, env } from '@huggingface/transformers';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LOCAL_MODEL_DIR = join(PLUGIN_ROOT, 'models');

// Use local bundled model (offline, no network, no re-download)
env.localModelPath = LOCAL_MODEL_DIR;
env.allowLocalModels = true;
// Allow remote ONLY as fallback if local missing (e.g., dev who skipped models/ dir)
env.allowRemoteModels = !existsSync(join(LOCAL_MODEL_DIR, 'Xenova', 'multilingual-e5-small', 'config.json'));
env.cacheDir = join(PLUGIN_ROOT, 'node_modules', '@huggingface', '.cache');

const MODEL_ID = 'Xenova/multilingual-e5-small';
const DIM = 384;

let _extractor = null;
async function getExtractor() {
  if (!_extractor) {
    _extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8'  // quantized int8 (~118MB, fast, multilingual)
    });
  }
  return _extractor;
}

/**
 * Embed a text string into a 384-dim Float32 vector.
 * Mean-pooled + L2-normalized (so cosine similarity == dot product).
 *
 * @param {string} text - Raw text to embed
 * @param {'query'|'passage'} mode - e5 prefix mode (REQUIRED for quality)
 *   - 'query' for search queries (what user is looking for)
 *   - 'passage' for indexed documents (what's stored in memory)
 *   Asymmetric model: query↔passage similarity > query↔query or passage↔passage.
 */
export async function embed(text, mode = 'passage') {
  if (!text || typeof text !== 'string') throw new Error('embed() requires non-empty string');
  if (mode !== 'query' && mode !== 'passage') {
    throw new Error(`embed() mode must be 'query' or 'passage', got: ${mode}`);
  }
  const extractor = await getExtractor();
  const prefixedText = `${mode}: ${text}`;
  const output = await extractor(prefixedText, { pooling: 'mean', normalize: true });
  return new Float32Array(output.data);
}

/**
 * Cosine similarity (== dot product when both normalized).
 * @returns number in [-1, 1], higher = more similar
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error(`vector dim mismatch: ${a.length} vs ${b.length}`);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Convert Float32Array to/from Buffer for SQLite BLOB storage. */
export function vectorToBuffer(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function bufferToVector(buf) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export const EMBEDDING_DIM = DIM;
