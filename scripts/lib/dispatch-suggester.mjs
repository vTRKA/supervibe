// Given a low-confidence agent invocation, propose alternative agents that
// scored historically high on similar tasks. Returns nothing when there is
// not enough history — never invents suggestions from thin data.

const HIGH_CONFIDENCE_FOR_SUGGEST = 8.5;
const MIN_SAMPLES_BEFORE_SUGGEST  = 3;
const SIMILAR_TASK_POOL           = 30;
const TOP_K_ALTERNATIVES          = 3;

/**
 * @param {{store: import('./agent-task-store.mjs').AgentTaskStore,
 *   taskSummary: string,
 *   currentAgent: string,
 *   currentScore?: number,
 *   highConfidence?: number,
 *   minSamples?: number}} opts
 * @returns {Promise<Array<{agent_id, avg_score, sample_count, sample_task}>>}
 */
export async function suggestAlternatives(opts) {
  const { store, taskSummary, currentAgent } = opts;
  const highConfidence = opts.highConfidence ?? HIGH_CONFIDENCE_FOR_SUGGEST;
  const minSamples     = opts.minSamples     ?? MIN_SAMPLES_BEFORE_SUGGEST;

  if (!taskSummary || !currentAgent) return [];

  const similar = store.findSimilar(taskSummary, {
    excludeAgent: currentAgent,
    minConfidence: highConfidence,
    limit: SIMILAR_TASK_POOL,
  });
  if (similar.length < minSamples) return [];

  const byAgent = new Map();
  for (const t of similar) {
    let acc = byAgent.get(t.agent_id);
    if (!acc) {
      acc = { tasks: [], totalScore: 0 };
      byAgent.set(t.agent_id, acc);
    }
    acc.tasks.push(t);
    acc.totalScore += t.confidence_score;
  }

  const ranked = [];
  for (const [agent_id, acc] of byAgent) {
    const avg_score = acc.totalScore / acc.tasks.length;
    ranked.push({
      agent_id,
      avg_score,
      sample_count: acc.tasks.length,
      sample_task: acc.tasks[0].task_summary,
      // Score balances quality (avg) with evidence depth (log of count)
      _rankScore: avg_score * Math.log(1 + acc.tasks.length),
    });
  }

  ranked.sort((a, b) => b._rankScore - a._rankScore);
  return ranked.slice(0, TOP_K_ALTERNATIVES).map(({ _rankScore, ...rest }) => rest);
}
