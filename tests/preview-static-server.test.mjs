import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { derivePreviewArtifactSlug, startStaticServer } from '../scripts/lib/preview-static-server.mjs';

const sandbox = join(tmpdir(), `supervibe-preview-srv-${Date.now()}`);
let server;
let port;

before(async () => {
  await mkdir(sandbox, { recursive: true });
  await writeFile(join(sandbox, 'index.html'), '<html><body>Hello</body></html>');
  await writeFile(join(sandbox, 'style.css'), 'body { color: red; }');
  await writeFile(join(sandbox, 'app.js'), 'console.log("hi");');
  server = await startStaticServer({ root: sandbox, port: 0 });
  port = server.port;
});

after(async () => {
  await server.stop();
  await rm(sandbox, { recursive: true, force: true });
});

function fetch(path) {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, method: 'GET' }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject).end();
  });
}

test('serves HTML with hot-reload script injected', async () => {
  const r = await fetch('/index.html');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-type'], /text\/html/);
  assert.match(r.body, /Hello/);
  assert.match(r.body, /__supervibe_preview\/sse/);
  assert.match(r.body, /EventSource/);
  assert.match(r.body, /supervibe-fb-toggle/);
  assert.match(r.body, /Feedback/);
});

test('serves CSS without injection', async () => {
  const r = await fetch('/style.css');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-type'], /text\/css/);
  assert.strictEqual(r.body, 'body { color: red; }');
  assert.doesNotMatch(r.body, /EventSource/);
});

test('serves JS without injection', async () => {
  const r = await fetch('/app.js');
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-type'], /application\/javascript/);
  assert.strictEqual(r.body, 'console.log("hi");');
});

test('returns 404 for unknown path', async () => {
  const r = await fetch('/does-not-exist.html');
  assert.strictEqual(r.status, 404);
});

test('directory request serves index.html', async () => {
  const r = await fetch('/');
  assert.strictEqual(r.status, 200);
  assert.match(r.body, /Hello/);
});

test('rejects path traversal attempts', async () => {
  const r = await fetch('/../../../etc/passwd');
  assert.ok(r.status === 403 || r.status === 404, 'must not serve outside root');
});

test('SSE endpoint sets correct headers', async () => {
  const r = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/__supervibe_preview/sse', method: 'GET' }, res => {
      resolve({ status: res.statusCode, headers: res.headers });
      req.destroy();
    });
    req.on('error', reject);
    req.end();
  });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers['content-type'], /text\/event-stream/);
});

test('server.broadcastReload pushes data to SSE clients', async () => {
  const messages = [];
  const req = request({ host: '127.0.0.1', port, path: '/__supervibe_preview/sse', method: 'GET' });
  req.end();
  const res = await new Promise(resolve => req.on('response', resolve));
  res.on('data', chunk => messages.push(chunk.toString()));

  await new Promise(r => setTimeout(r, 50));
  server.broadcastReload();
  await new Promise(r => setTimeout(r, 200));

  req.destroy();

  const allMessages = messages.join('');
  assert.match(allMessages, /event: reload/);
});

test('server tracks last-activity timestamp', async () => {
  const t0 = Date.now();
  await fetch('/index.html');
  assert.ok(server.getLastActivityAt() >= t0, 'activity timestamp updated by request');
});

test('server reports active SSE clients count', async () => {
  // Count starts at whatever; just verify boolean works
  const initial = server.hasActiveSseClients();
  assert.strictEqual(typeof initial, 'boolean');
});

test('derivePreviewArtifactSlug supports design preview roots', () => {
  assert.strictEqual(derivePreviewArtifactSlug('/workspace/repo/prototypes/checkout/index.html'), 'checkout');
  assert.strictEqual(derivePreviewArtifactSlug('/workspace/repo/mockups/landing/index.html'), 'mockup:landing');
  assert.strictEqual(derivePreviewArtifactSlug('/workspace/repo/presentations/investor/preview/index.html'), 'presentation:investor');
  assert.strictEqual(derivePreviewArtifactSlug('/workspace/repo/public/index.html'), 'unknown');
});
