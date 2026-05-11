import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logInvocation, readInvocations, updateLatestInvocation, INVOCATION_LOG_PATH_FOR_TEST } from '../scripts/lib/agent-invocation-logger.mjs';

const sandbox = join(tmpdir(), `supervibe-inv-log-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.supervibe', 'memory'), { recursive: true });
  INVOCATION_LOG_PATH_FOR_TEST(join(sandbox, '.supervibe', 'memory', 'agent-invocations.jsonl'));
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('logInvocation: appends entry to JSONL', async () => {
  await logInvocation({
    agent_id: 'laravel-developer',
    task_summary: 'Add login endpoint',
    confidence_score: 9.2,
    rubric: 'agent-delivery',
    override: false,
    duration_ms: 12000,
  });
  const entries = await readInvocations();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].agent_id, 'laravel-developer');
  assert.ok(entries[0].structured_output.json.endsWith('/agent-output.json'));
  const output = JSON.parse(await readFile(join(sandbox, entries[0].structured_output.json), 'utf8'));
  assert.strictEqual(output.agentId, 'laravel-developer');
  assert.strictEqual(output.taskSummary, 'Add login endpoint');
  assert.ok((await readFile(join(sandbox, entries[0].structured_output.summary), 'utf8')).includes('# Agent Output: laravel-developer'));
  const confidenceLog = (await readFile(join(sandbox, '.supervibe', 'confidence-log.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.strictEqual(confidenceLog[0].agent, 'laravel-developer');
  assert.strictEqual(confidenceLog[0].gate, 'review');
  const effectiveness = (await readFile(join(sandbox, '.supervibe', 'memory', 'effectiveness.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.strictEqual(effectiveness[0].outcome, 'partial');
  assert.ok(effectiveness[0].blockers.includes('missing-verification'));
});

test('logInvocation: redacts durable task, risk, and recommendation text', async () => {
  const record = await logInvocation({
    agent_id: 'security-auditor',
    task_summary: 'Investigate key sk-testsecret123 and owner admin@example.com',
    confidence_score: 8.5,
    risks: ['AWS AKIA1234567890ABCDEF appears in prompt'],
    recommendations: ['Contact admin@example.com'],
  });

  assert.strictEqual(record.redaction_status, 'redacted');
  assert.doesNotMatch(record.task_summary, /sk-testsecret123|admin@example\.com/);
  assert.doesNotMatch(JSON.stringify(record.risks), /AKIA1234567890ABCDEF/);
  const output = JSON.parse(await readFile(join(sandbox, record.structured_output.json), 'utf8'));
  assert.doesNotMatch(JSON.stringify(output), /sk-testsecret123|admin@example\.com|AKIA1234567890ABCDEF/);
});

test('logInvocation: writes retrieval evidence ledger when evidence is provided', async () => {
  const record = await logInvocation({
    agent_id: 'repo-researcher',
    task_summary: 'Refactor checkout callers',
    confidence_score: 9,
    retrievalPolicy: { memory: 'mandatory', rag: 'mandatory', codegraph: 'mandatory', reason: 'structural change' },
    evidence: {
      memoryIds: ['checkout-decision'],
      ragChunkIds: ['scripts/checkout.mjs:12'],
      graphSymbols: ['checkoutService'],
      citations: [{ id: 'checkout', source: 'code-rag', path: 'scripts/checkout.mjs:12' }],
      verificationCommands: ['node --test tests/checkout.test.mjs'],
      redactionStatus: 'not-needed',
    },
  });

  assert.strictEqual(record.evidence_gate.pass, true);
  assert.strictEqual(record.retrieval_enforcement.evidenceLedger, 'written');
  const ledger = (await readFile(join(sandbox, '.supervibe', 'memory', 'evidence-ledger.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const latest = ledger[ledger.length - 1];
  assert.strictEqual(latest.agentId, 'repo-researcher');
  assert.strictEqual(latest.gate.pass, true);
  const output = JSON.parse(await readFile(join(sandbox, record.structured_output.json), 'utf8'));
  assert.strictEqual(output.retrievalEnforcement.evidenceLedger, 'written');
  const confidenceLog = (await readFile(join(sandbox, '.supervibe', 'confidence-log.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const latestConfidence = confidenceLog[confidenceLog.length - 1];
  assert.strictEqual(latestConfidence.gate, 'pass');
});

test('logInvocation: high confidence without verification cannot be success', async () => {
  const record = await logInvocation({
    agent_id: 'quality-gate-reviewer',
    task_summary: 'Claim ready without verification',
    confidence_score: 9.8,
  });

  assert.strictEqual(record.confidence.status, 'review');
  const effectiveness = (await readFile(join(sandbox, '.supervibe', 'memory', 'effectiveness.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const latestEffectiveness = effectiveness[effectiveness.length - 1];
  assert.strictEqual(latestEffectiveness.outcome, 'partial');
  assert.ok(latestEffectiveness.blockers.includes('missing-verification'));
  const confidenceLog = (await readFile(join(sandbox, '.supervibe', 'confidence-log.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const latestConfidence = confidenceLog[confidenceLog.length - 1];
  assert.strictEqual(latestConfidence.gate, 'review');
});

test('logInvocation: preserves structured delivery confidence details', async () => {
  const record = await logInvocation({
    agent_id: 'quality-gate-reviewer',
    task_summary: 'Score delivery readiness',
    confidence_score: 9,
    confidence_details: {
      readinessScore: 10,
      riskPenalty: 1,
      uncappedScore: 9,
      finalScore: 9,
      status: 'pass',
      complete: true,
      caps: [{ score: 9, reason: 'review passed' }],
    },
  });

  assert.strictEqual(record.confidence_details.finalScore, 9);
  const output = JSON.parse(await readFile(join(sandbox, record.structured_output.json), 'utf8'));
  assert.strictEqual(output.confidenceDetails.readinessScore, 10);
  assert.strictEqual(output.confidenceDetails.riskPenalty, 1);
  const confidenceLog = (await readFile(join(sandbox, '.supervibe', 'confidence-log.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const latest = confidenceLog[confidenceLog.length - 1];
  assert.strictEqual(latest.confidenceDetails.finalScore, 9);
});

test('readInvocations: filters by agent_id', async () => {
  await logInvocation({ agent_id: 'a', task_summary: 't1', confidence_score: 8 });
  await logInvocation({ agent_id: 'b', task_summary: 't2', confidence_score: 9 });
  await logInvocation({ agent_id: 'a', task_summary: 't3', confidence_score: 10 });
  const aOnly = await readInvocations({ agent_id: 'a' });
  assert.ok(aOnly.length >= 2);
  assert.ok(aOnly.every(e => e.agent_id === 'a'));
});

test('readInvocations: limit/offset works', async () => {
  const all = await readInvocations({ limit: 2 });
  assert.ok(all.length <= 2);
});

test('updateLatestInvocation: patches latest entry', async () => {
  await logInvocation({ agent_id: 'patch-test', task_summary: 'will be patched', confidence_score: 5 });
  const result = await updateLatestInvocation({ confidence_score: 9, user_feedback: 'accept' }, { matchAgentId: 'patch-test' });
  assert.strictEqual(result, true);
  const entries = await readInvocations({ agent_id: 'patch-test' });
  const last = entries[entries.length - 1];
  assert.strictEqual(last.confidence_score, 9);
  assert.strictEqual(last.user_feedback, 'accept');
});
