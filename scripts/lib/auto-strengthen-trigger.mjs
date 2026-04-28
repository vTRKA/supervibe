// Auto-strengthen trigger: when underperformers detected, prepare a list
// the user can act on with one confirmation. Never auto-modifies agent files.

import { readInvocations } from './agent-invocation-logger.mjs';
import { detectUnderperformers } from './underperformer-detector.mjs';

/**
 * Returns list of agents to strengthen + suggested commands.
 * @returns {Promise<Array<{agent_id, reason, value, command}>>}
 */
export async function buildStrengthenSuggestions() {
  const all = await readInvocations({ limit: 10000 });
  if (all.length < 10) return [];
  const flagged = detectUnderperformers(all);
  return flagged.map(f => ({
    agent_id: f.agent_id,
    reason: f.reason,
    value: f.value,
    command: `/supervibe-strengthen ${f.agent_id}`,
  }));
}
