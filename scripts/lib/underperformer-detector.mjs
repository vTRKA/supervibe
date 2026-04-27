// Detect agents whose recent performance is degrading.
// Two signals: avg confidence < threshold, OR rising override-rate trend.

const MIN_INVOCATIONS = 10;
const CONFIDENCE_THRESHOLD = 8.5;
const TREND_WINDOW = 10;
const OVERRIDE_TREND_DELTA = 0.4;

export function detectUnderperformers(allInvocations, opts = {}) {
  const minInv = opts.minInvocations ?? MIN_INVOCATIONS;
  const confThreshold = opts.confidenceThreshold ?? CONFIDENCE_THRESHOLD;

  const byAgent = {};
  for (const inv of allInvocations) {
    if (!byAgent[inv.agent_id]) byAgent[inv.agent_id] = [];
    byAgent[inv.agent_id].push(inv);
  }

  const flagged = [];
  for (const [agent_id, invs] of Object.entries(byAgent)) {
    if (invs.length < minInv) continue;
    const sorted = invs.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
    const recent = sorted.slice(-TREND_WINDOW);

    const avg = recent.reduce((s, e) => s + (e.confidence_score || 0), 0) / recent.length;
    if (avg < confThreshold) {
      flagged.push({ agent_id, reason: 'low-avg-confidence', value: avg.toFixed(2) });
      continue;
    }

    if (recent.length >= 6) {
      const half = Math.floor(recent.length / 2);
      const firstHalf = recent.slice(0, half);
      const secondHalf = recent.slice(-half);
      const fhRate = firstHalf.filter(e => e.override).length / firstHalf.length;
      const shRate = secondHalf.filter(e => e.override).length / secondHalf.length;
      if (shRate - fhRate >= OVERRIDE_TREND_DELTA) {
        flagged.push({
          agent_id,
          reason: 'rising-override-rate',
          value: `${(fhRate*100).toFixed(0)}% → ${(shRate*100).toFixed(0)}%`,
        });
      }
    }
  }
  return flagged;
}
