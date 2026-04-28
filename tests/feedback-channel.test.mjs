import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createServer } from 'node:http';
import { createFeedbackChannel, parseWsFrame } from '../scripts/lib/feedback-channel.mjs';

test('appends well-formed feedback entry to queue', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fbq-'));
  const queuePath = join(dir, 'feedback-queue.jsonl');
  const channel = createFeedbackChannel({ queuePath });

  await channel.submit({
    prototypeSlug: 'demo',
    viewport: 'mobile',
    region: { selector: '.hero', x: 100, y: 200, width: 300, height: 80 },
    comment: 'CTA color too washed out',
    type: 'visual',
  });

  const raw = await readFile(queuePath, 'utf8');
  const lines = raw.trim().split('\n');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.prototypeSlug, 'demo');
  assert.equal(entry.region.selector, '.hero');
  assert.ok(entry.timestamp);
  assert.ok(entry.id);
});

test('parseWsFrame extracts text payload', () => {
  const payload = Buffer.from('hello');
  const mask = Buffer.from([0xa, 0xb, 0xc, 0xd]);
  const masked = Buffer.alloc(5);
  for (let i = 0; i < 5; i++) masked[i] = payload[i] ^ mask[i % 4];
  const frame = Buffer.concat([
    Buffer.from([0x81, 0x85]),
    mask,
    masked,
  ]);
  const out = parseWsFrame(frame);
  assert.equal(out.opcode, 0x1);
  assert.equal(out.payload.toString('utf8'), 'hello');
});

test('e2e: WebSocket client → server → queue → ack', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'fbe2e-'));
  const queuePath = join(dir, 'queue.jsonl');
  const server = createServer();
  const channel = createFeedbackChannel({ queuePath });
  channel.attachUpgrade(server);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  t.after(() => new Promise(r => server.close(r)));

  // Node 22 has built-in WebSocket
  const ws = new WebSocket(`ws://localhost:${port}/_feedback`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  const ackPromise = new Promise(resolve => {
    ws.addEventListener('message', e => resolve(JSON.parse(e.data)));
  });

  ws.send(JSON.stringify({
    prototypeSlug: 'e2e',
    viewport: 'mobile',
    region: { selector: '.x', x: 0, y: 0, width: 10, height: 10 },
    comment: 'e2e ok',
    type: 'visual',
  }));

  const ack = await ackPromise;
  assert.ok(ack.ack);
  ws.close();

  await sleep(50);
  const raw = await readFile(queuePath, 'utf8');
  const entry = JSON.parse(raw.trim().split('\n').pop());
  assert.equal(entry.comment, 'e2e ok');
});
