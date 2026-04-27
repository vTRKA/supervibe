import { mkdir, appendFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const REQUIRED_FIELDS = [
  'artifact-type', 'artifact-ref', 'score', 'max-score',
  'status-overridden', 'override', 'reason', 'gaps', 'agent', 'user-confirmed'
];
const MIN_REASON_LENGTH = 10;

/**
 * Append a single override entry to .claude/confidence-log.jsonl in the given project root.
 * Creates .claude/ and the log file if they don't exist.
 */
export async function appendOverrideEntry(projectRoot, entry) {
  const missing = REQUIRED_FIELDS.filter(f => !(f in entry));
  if (missing.length > 0) {
    throw new Error(`missing required field(s): ${missing.join(', ')}`);
  }
  if (typeof entry.reason !== 'string' || entry.reason.length < MIN_REASON_LENGTH) {
    throw new Error(`reason must be at least ${MIN_REASON_LENGTH} characters`);
  }

  const claudeDir = join(projectRoot, '.claude');
  await mkdir(claudeDir, { recursive: true });

  const fullEntry = {
    timestamp: new Date().toISOString(),
    ...entry
  };

  const logPath = join(claudeDir, 'confidence-log.jsonl');
  await appendFile(logPath, JSON.stringify(fullEntry) + '\n', 'utf8');
}

export async function readOverrideLog(projectRoot) {
  const logPath = join(projectRoot, '.claude', 'confidence-log.jsonl');
  try {
    await access(logPath);
  } catch {
    return [];
  }
  const content = await readFile(logPath, 'utf8');
  return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

export async function computeOverrideRate(projectRoot, { window = 100 } = {}) {
  const entries = await readOverrideLog(projectRoot);
  const recent = entries.slice(-window);
  const overrides = recent.filter(e => e.override === true);
  return {
    totalEntries: recent.length,
    overrideEntries: overrides.length,
    rate: recent.length === 0 ? 0 : overrides.length / recent.length
  };
}
