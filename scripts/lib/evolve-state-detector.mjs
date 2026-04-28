// Deterministic state detector for the /evolve auto-router.
//
// Runs the 8 detection checks documented in commands/evolve.md as actual
// code instead of relying on the AI to interpret a procedure. Returns the
// recommended next phase command + structured evidence for each signal.
//
// Used by:
//   - scripts/evolve-detect.mjs  (CLI wrapper, called from /evolve)
//   - tests/evolve-state-detector.test.mjs
//
// Every check is independent and failure-tolerant: a check that throws
// returns {triggered: false, error: '<msg>'}, never propagating.

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const STALE_DAYS = 30;
const OVERRIDE_RATE_THRESHOLD = 0.05;
const OVERRIDE_RATE_WINDOW = 100;

// ---- individual checks ----

async function checkUpstreamBehind(pluginRoot) {
  try {
    const cachePath = join(pluginRoot, '.claude-plugin', '.upgrade-check.json');
    if (!existsSync(cachePath)) return { triggered: false, evidence: 'no upstream-check cache yet' };
    const cache = JSON.parse(await readFile(cachePath, 'utf8'));
    if (cache.error) return { triggered: false, evidence: `last check error: ${cache.error}` };
    if ((cache.behind || 0) > 0) {
      return {
        triggered: true,
        evidence: `${cache.behind} commit(s) behind upstream${cache.latestTag ? ' (latest tag: ' + cache.latestTag + ')' : ''}`,
      };
    }
    return { triggered: false, evidence: 'plugin is up to date with upstream' };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

async function checkVersionBumpUnacked(projectRoot, pluginRoot) {
  try {
    const versionPath = join(projectRoot, '.claude', 'memory', '.evolve-version');
    if (!existsSync(versionPath)) return { triggered: false, evidence: 'project has not seen any plugin version yet' };
    const lastSeen = (await readFile(versionPath, 'utf8')).trim();
    const manifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json');
    if (!existsSync(manifestPath)) return { triggered: false, error: 'plugin manifest missing' };
    const current = JSON.parse(await readFile(manifestPath, 'utf8')).version;
    if (lastSeen && lastSeen !== current) {
      return {
        triggered: true,
        evidence: `project seen ${lastSeen}, plugin now ${current} — adapt to pull upstream agent changes`,
        lastSeen, current,
      };
    }
    return { triggered: false, evidence: `project + plugin both on ${current}` };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

async function checkProjectScaffolded(projectRoot) {
  try {
    const claudeAgentsDir = join(projectRoot, '.claude', 'agents');
    const claudeMd = join(projectRoot, 'CLAUDE.md');
    if (!existsSync(claudeAgentsDir) && !existsSync(claudeMd)) {
      return { triggered: true, evidence: 'no .claude/agents/ and no CLAUDE.md — run genesis first' };
    }
    return { triggered: false, evidence: 'project has Evolve scaffolding' };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

async function checkUnderperformers(projectRoot) {
  try {
    const logPath = join(projectRoot, '.claude', 'memory', 'agent-invocations.jsonl');
    if (!existsSync(logPath)) return { triggered: false, evidence: 'no telemetry log yet' };
    const { readInvocations } = await import('./agent-invocation-logger.mjs');
    const { detectUnderperformers } = await import('./underperformer-detector.mjs');
    process.env.EVOLVE_INVOCATION_LOG = logPath;
    const all = await readInvocations({ limit: 10000 });
    if (all.length < 10) {
      return { triggered: false, evidence: `only ${all.length} invocations logged (need ≥10 for analysis)` };
    }
    const flagged = detectUnderperformers(all);
    if (flagged.length > 0) {
      return {
        triggered: true,
        evidence: `${flagged.length} agent(s) underperforming: ${flagged.map(f => f.agent_id).join(', ')}`,
        flagged,
      };
    }
    return { triggered: false, evidence: `${all.length} invocations, no underperformers` };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

async function checkStaleArtifacts(pluginRoot) {
  try {
    const dirs = ['agents', 'rules', 'skills'].map(d => join(pluginRoot, d));
    const cutoff = Date.now() - STALE_DAYS * 86400000;
    const stale = [];
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      let entries;
      try { entries = await readdir(dir, { recursive: true, withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        const filePath = join(entry.parentPath || dir, entry.name);
        try {
          const content = await readFile(filePath, 'utf8');
          const m = content.match(/last-verified:\s*(\S+)/);
          if (!m) continue;
          if (Date.parse(m[1]) < cutoff) stale.push(filePath);
        } catch {}
      }
    }
    if (stale.length >= 3) {
      return {
        triggered: true,
        evidence: `${stale.length} artifact(s) with last-verified > ${STALE_DAYS} days`,
        sample: stale.slice(0, 5),
      };
    }
    return { triggered: false, evidence: `${stale.length} stale artifact(s) (under 3-threshold)` };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

async function checkOverrideRate(projectRoot) {
  try {
    const logPath = join(projectRoot, '.claude', 'confidence-log.jsonl');
    if (!existsSync(logPath)) return { triggered: false, evidence: 'no override log yet' };
    const raw = await readFile(logPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean).slice(-OVERRIDE_RATE_WINDOW);
    if (lines.length < 10) return { triggered: false, evidence: `only ${lines.length} entries (need ≥10)` };
    const overrides = lines.filter(l => {
      try { return JSON.parse(l).override === true; }
      catch { return false; }
    });
    const rate = overrides.length / lines.length;
    if (rate > OVERRIDE_RATE_THRESHOLD) {
      return {
        triggered: true,
        evidence: `override rate ${(rate * 100).toFixed(1)}% over last ${lines.length} entries (threshold ${OVERRIDE_RATE_THRESHOLD * 100}%)`,
        rate,
      };
    }
    return { triggered: false, evidence: `override rate ${(rate * 100).toFixed(1)}% (under threshold)` };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

async function checkPendingEvaluation(projectRoot) {
  try {
    const logPath = join(projectRoot, '.claude', 'memory', 'agent-invocations.jsonl');
    if (!existsSync(logPath)) return { triggered: false, evidence: 'no invocation log yet' };
    const raw = await readFile(logPath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length === 0) return { triggered: false, evidence: 'invocation log empty' };
    const last = JSON.parse(lines[lines.length - 1]);
    if (!last.outcome && !last.user_feedback) {
      return {
        triggered: true,
        evidence: `latest invocation (${last.agent_id}) has no outcome — run /evolve-evaluate to lock feedback`,
        last,
      };
    }
    return { triggered: false, evidence: 'latest invocation already has outcome' };
  } catch (err) {
    return { triggered: false, error: err.message };
  }
}

// ---- public API ----

/**
 * Run all 8 detection checks in priority order. Returns first triggered
 * check's recommended command + full report of all checks.
 */
export async function detectNextPhase(projectRoot, pluginRoot) {
  const checks = [
    { name: 'upstream-behind',       run: () => checkUpstreamBehind(pluginRoot),               recommend: '/evolve-update' },
    { name: 'version-bump-unacked',  run: () => checkVersionBumpUnacked(projectRoot, pluginRoot), recommend: '/evolve-adapt' },
    { name: 'project-not-scaffolded', run: () => checkProjectScaffolded(projectRoot),           recommend: '/evolve-genesis' },
    { name: 'underperformers',       run: () => checkUnderperformers(projectRoot),             recommend: '/evolve-strengthen' },
    { name: 'stale-artifacts',       run: () => checkStaleArtifacts(pluginRoot),               recommend: '/evolve-audit' },
    { name: 'override-rate-high',    run: () => checkOverrideRate(projectRoot),                recommend: '/evolve-audit' },
    { name: 'pending-evaluation',    run: () => checkPendingEvaluation(projectRoot),           recommend: '/evolve-evaluate' },
  ];

  const report = [];
  let proposed = null;

  for (const c of checks) {
    const result = await c.run();
    report.push({ name: c.name, recommend: c.recommend, ...result });
    if (!proposed && result.triggered) {
      proposed = { command: c.recommend, reason: result.evidence, signal: c.name };
    }
  }

  return {
    proposed: proposed || { command: null, reason: 'system healthy — nothing to do', signal: 'all-green' },
    checks: report,
  };
}
