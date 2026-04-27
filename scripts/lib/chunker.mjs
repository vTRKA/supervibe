// Token-aware text chunker for embedding indexing.
// Splits text into overlapping windows of ~target tokens, preserves paragraph/sentence boundaries.
// Uses real e5 tokenizer for accurate token counts (no char-based approximation).

import { AutoTokenizer, env } from '@huggingface/transformers';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LOCAL_MODEL_DIR = join(PLUGIN_ROOT, 'models');

env.localModelPath = LOCAL_MODEL_DIR;
env.allowLocalModels = true;
env.allowRemoteModels = !existsSync(join(LOCAL_MODEL_DIR, 'Xenova', 'multilingual-e5-small', 'config.json'));

const TOKENIZER_ID = 'Xenova/multilingual-e5-small';

let _tokenizer = null;
async function getTokenizer() {
  if (!_tokenizer) {
    _tokenizer = await AutoTokenizer.from_pretrained(TOKENIZER_ID);
  }
  return _tokenizer;
}

/**
 * Count actual tokens (e5 tokenizer).
 */
export async function countTokens(text) {
  const tok = await getTokenizer();
  const encoded = tok.encode(text);
  // encode() returns array of ids; -2 for [CLS]/[SEP] special tokens
  return Math.max(0, encoded.length - 2);
}

/**
 * Split text into chunks of approximately `targetTokens` tokens with `overlapTokens` overlap.
 * Preserves paragraph (\n\n) and sentence (.!?) boundaries when possible.
 * Reserves room for "passage: " prefix (~3 tokens) — caller adds prefix to each chunk.
 *
 * Strategy:
 *   1. Split into paragraphs (\n\n)
 *   2. For each paragraph: if fits in budget → append to current chunk; else flush + start new
 *   3. If single paragraph > targetTokens: split by sentences
 *   4. If single sentence > targetTokens: hard-split by tokens (rare; very long single sentence)
 *
 * Overlap: each new chunk starts with last `overlapTokens` tokens of previous chunk
 *   (preserves context across boundaries — query about middle of doc still matches).
 *
 * @param {string} text - Full document text
 * @param {object} opts
 * @param {number} [opts.targetTokens=200] - Target tokens per chunk (e5 max=512; reserve buffer)
 * @param {number} [opts.overlapTokens=32] - Overlap between consecutive chunks
 * @returns {Promise<string[]>} - Array of chunk strings
 */
export async function chunkText(text, { targetTokens = 200, overlapTokens = 32 } = {}) {
  if (!text || typeof text !== 'string') return [];
  const tok = await getTokenizer();

  // Quick path: if whole text fits, return as single chunk
  const totalTokens = await countTokens(text);
  if (totalTokens <= targetTokens) return [text.trim()];

  // Split into paragraphs first (preserve structure)
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  const chunks = [];
  let currentChunk = '';
  let currentTokens = 0;

  const flushChunk = () => {
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    currentChunk = '';
    currentTokens = 0;
  };

  for (const paragraph of paragraphs) {
    const pTokens = await countTokens(paragraph);

    // Case 1: single paragraph exceeds target → split by sentences
    if (pTokens > targetTokens) {
      flushChunk();
      const sentences = paragraph.match(/[^.!?\n]+[.!?]+(?:\s|$)|[^.!?\n]+$/g) || [paragraph];
      for (const sentence of sentences) {
        const sTokens = await countTokens(sentence);

        // Case 1a: single sentence still > target → hard token-split (rare)
        if (sTokens > targetTokens) {
          flushChunk();
          const ids = tok.encode(sentence);
          for (let i = 0; i < ids.length; i += targetTokens - overlapTokens) {
            const slice = ids.slice(i, i + targetTokens);
            const decoded = tok.decode(slice, { skip_special_tokens: true });
            chunks.push(decoded.trim());
          }
          continue;
        }

        // Case 1b: sentence fits → add to current
        if (currentTokens + sTokens > targetTokens) flushChunk();
        currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
        currentTokens += sTokens;
      }
      continue;
    }

    // Case 2: paragraph fits in budget — try to add to current
    if (currentTokens + pTokens > targetTokens) {
      flushChunk();
      currentChunk = paragraph;
      currentTokens = pTokens;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      currentTokens += pTokens;
    }
  }
  flushChunk();

  // Add overlap: prepend last N tokens of chunk[i-1] to chunk[i]
  if (overlapTokens > 0 && chunks.length > 1) {
    const withOverlap = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prevIds = tok.encode(chunks[i - 1]);
      const overlap = prevIds.slice(Math.max(0, prevIds.length - overlapTokens - 2), prevIds.length - 1);
      const overlapText = tok.decode(overlap, { skip_special_tokens: true });
      withOverlap.push(`${overlapText.trim()} ${chunks[i]}`);
    }
    return withOverlap;
  }

  return chunks;
}
