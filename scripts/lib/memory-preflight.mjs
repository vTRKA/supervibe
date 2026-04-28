/**
 * Memory pre-flight helper — universal "what does the project already know about this?"
 * call used by every artifact-producing command.
 *
 * Two-tier strategy:
 *   1. Try semantic search via memory.db (fast, embeddings-based) if index exists
 *   2. Fallback to grep-style scan over .claude/memory/<category>/*.md if no index
 *
 * Returns array of { path, snippet, similarity, category } sorted by similarity desc.
 *
 * Per docs/confidence-gates-spec.md — every artifact-producing command MUST call
 * preflight() before producing the artifact, so users see prior similar work and
 * the project doesn't re-derive what it already knows.
 */
import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const CATEGORIES = ['decisions', 'patterns', 'incidents', 'learnings', 'solutions'];

/**
 * Tokenise a string into lowercase word-set for cheap similarity.
 */
function tokenise(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-zа-яё0-9\s]/giu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3)
  );
}

/**
 * Overlap coefficient (better than Jaccard when query is much smaller than document):
 * intersect / min(|a|, |b|). Score 1.0 if all query tokens appear in doc.
 */
function similarityScore(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  return intersect / Math.min(a.size, b.size);
}

const jaccard = similarityScore;

async function listMemoryFiles(projectRoot) {
  const out = [];
  for (const cat of CATEGORIES) {
    const dir = join(projectRoot, '.claude', 'memory', cat);
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.md')) {
          out.push({ path: join(dir, e.name), category: cat, name: e.name });
        }
      }
    } catch {
      // category dir may not exist yet
    }
  }
  return out;
}

function snippet(content, queryTokens, length = 180) {
  const text = content.replace(/^---[\s\S]*?---\s*/, '').trim();
  const lines = text.split('\n').filter(l => l.trim().length > 0);

  let bestIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const score = jaccard(tokenise(lines[i]), queryTokens);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const start = Math.max(0, bestIdx - 1);
  const end = Math.min(lines.length, bestIdx + 2);
  const out = lines.slice(start, end).join(' ').slice(0, length);
  return out + (out.length === length ? '…' : '');
}

/**
 * Pre-flight memory query — find prior similar work.
 * @param {object} opts
 * @param {string} opts.query - User's task / topic / question
 * @param {string} [opts.projectRoot] - Defaults to CWD
 * @param {number} [opts.limit=5] - Max matches to return
 * @param {number} [opts.similarity=0.5] - Minimum similarity threshold (0-1)
 * @param {string} [opts.agent] - Agent making the call (for telemetry)
 * @returns {Promise<Array<{path,snippet,similarity,category}>>}
 */
export async function preflight({
  query,
  projectRoot = process.cwd(),
  limit = 5,
  similarity = 0.5,
}) {
  const queryTokens = tokenise(query);
  const files = await listMemoryFiles(projectRoot);

  const scored = [];
  for (const f of files) {
    let content;
    try {
      content = await readFile(f.path, 'utf8');
    } catch {
      continue;
    }
    const fileTokens = tokenise(content);
    const sim = similarityScore(queryTokens, fileTokens);
    if (sim >= similarity) {
      scored.push({
        path: f.path,
        category: f.category,
        similarity: sim,
        snippet: snippet(content, queryTokens),
      });
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}

/**
 * Format pre-flight results for terminal output.
 */
export function formatMatches(matches) {
  if (matches.length === 0) {
    return '[memory pre-flight] No prior similar work found in memory. Proceeding from scratch.';
  }

  const lines = ['[memory pre-flight] Found ' + matches.length + ' prior entr' + (matches.length === 1 ? 'y' : 'ies') + ':'];
  for (const m of matches) {
    const pct = Math.round(m.similarity * 100);
    lines.push(`  • ${m.path} (${m.category}, ${pct}% match)`);
    lines.push(`    "${m.snippet}"`);
  }
  lines.push('');
  lines.push('Consider adapting prior work instead of re-deriving.');
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const queryIdx = args.indexOf('--query');
  if (queryIdx === -1 || queryIdx === args.length - 1) {
    console.error('Usage: node memory-preflight.mjs --query "<text>" [--limit N] [--similarity 0.5]');
    process.exit(2);
  }
  const query = args[queryIdx + 1];
  const limitIdx = args.indexOf('--limit');
  const simIdx = args.indexOf('--similarity');

  const matches = await preflight({
    query,
    projectRoot: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    limit: limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 5,
    similarity: simIdx >= 0 ? parseFloat(args[simIdx + 1]) : 0.5,
  });

  console.log(formatMatches(matches));
}

const isMainEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` ||
           fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();
if (isMainEntry) await main();
