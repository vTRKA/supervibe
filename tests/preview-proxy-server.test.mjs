import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeProxyTarget, startProxyServer } from '../scripts/lib/preview-proxy-server.mjs';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsAcceptKey(clientKey) {
  return createHash('sha1').update(clientKey + WS_GUID).digest('base64');
}

function buildWsFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

async function startTarget(handler = null) {
  const server = createServer(handler || ((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><main>Framework app</main></body></html>');
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('proxy injects feedback overlay into framework HTML', async () => {
  const target = await startTarget();
  const projectRoot = await mkdtemp(join(tmpdir(), 'supervibe-proxy-html-'));
  const proxy = await startProxyServer({ target: target.url, port: 0, projectRoot });
  try {
    const res = await fetch(`http://127.0.0.1:${proxy.port}/`);
    const body = await res.text();

    assert.equal(res.status, 200);
    assert.match(body, /Framework app/);
    assert.match(body, /supervibe-fb-toggle/);
    assert.match(body, /Feedback/);
  } finally {
    await proxy.stop();
    await target.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('proxy target validation accepts only loopback http targets', () => {
  assert.equal(normalizeProxyTarget('http://127.0.0.1:3000').origin, 'http://127.0.0.1:3000');
  assert.equal(normalizeProxyTarget('http://localhost:5173').origin, 'http://localhost:5173');
  assert.equal(normalizeProxyTarget('http://[::1]:3000').origin, 'http://[::1]:3000');
  assert.throws(() => normalizeProxyTarget('https://example.com'), /loopback-only/);
  assert.throws(() => normalizeProxyTarget('file:///tmp/index.html'), /http or https/);
});

test('proxy keeps browser feedback local and writes queue entries', async () => {
  const target = await startTarget();
  const projectRoot = await mkdtemp(join(tmpdir(), 'supervibe-proxy-feedback-'));
  const proxy = await startProxyServer({ target: target.url, port: 0, projectRoot });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${proxy.port}/_feedback`);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    const ackPromise = new Promise((resolve) => {
      ws.addEventListener('message', (event) => resolve(JSON.parse(event.data)), { once: true });
    });
    ws.send(JSON.stringify({
      prototypeSlug: 'framework:3000',
      viewport: '1440',
      region: { selector: 'main', x: 0, y: 0, width: 100, height: 40 },
      comment: 'proxy feedback works',
      type: 'layout',
    }));

    const ack = await ackPromise;
    assert.ok(ack.ack);
    ws.close();

    const raw = await readFile(join(projectRoot, '.supervibe', 'memory', 'feedback-queue.jsonl'), 'utf8');
    const entry = JSON.parse(raw.trim().split('\n').pop());
    assert.equal(entry.comment, 'proxy feedback works');
    assert.equal(entry.type, 'layout');
  } finally {
    await proxy.stop();
    await target.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('proxy tunnels non-feedback WebSocket upgrades to target framework server', async () => {
  let upgradedPath = null;
  const target = await startTarget((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  target.server.on('upgrade', (req, socket) => {
    upgradedPath = req.url;
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${wsAcceptKey(req.headers['sec-websocket-key'])}`,
      '\r\n',
    ].join('\r\n'));
    socket.write(buildWsFrame('target-upgrade-ok'));
    setTimeout(() => socket.end(), 10);
  });
  const projectRoot = await mkdtemp(join(tmpdir(), 'supervibe-proxy-upgrade-'));
  const proxy = await startProxyServer({ target: target.url, port: 0, projectRoot });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${proxy.port}/_next/webpack-hmr`);
    const message = await new Promise((resolve, reject) => {
      ws.addEventListener('message', (event) => resolve(event.data), { once: true });
      ws.addEventListener('error', reject, { once: true });
    });

    assert.equal(message, 'target-upgrade-ok');
    assert.equal(upgradedPath, '/_next/webpack-hmr');
    ws.close();
  } finally {
    await proxy.stop();
    await target.close();
    await rm(projectRoot, { recursive: true, force: true });
  }
});
