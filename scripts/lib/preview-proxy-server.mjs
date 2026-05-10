import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { join } from 'node:path';
import { createFeedbackChannel } from './feedback-channel.mjs';
import { injectOverlay } from './feedback-overlay-injector.mjs';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function normalizeProxyTarget(target) {
  let url;
  try {
    url = new URL(String(target || ''));
  } catch {
    throw new Error(`Invalid preview proxy target: ${target}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Preview proxy target must be http or https: ${target}`);
  }
  if (!isLoopbackHost(url.hostname)) {
    throw new Error(`Preview proxy target must be loopback-only: ${target}`);
  }
  return url;
}

function isLoopbackHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost'
    || host === '::1'
    || host === '[::1]'
    || host === '0:0:0:0:0:0:0:1'
    || host.startsWith('127.');
}

function targetPort(url) {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

function targetHostname(url) {
  return String(url.hostname).replace(/^\[/, '').replace(/\]$/, '');
}

function targetRequestPath(url, requestUrl = '/') {
  const incoming = String(requestUrl || '/');
  const path = incoming.startsWith('/') ? incoming : `/${incoming}`;
  const base = url.pathname && url.pathname !== '/'
    ? url.pathname.replace(/\/$/, '')
    : '';
  return `${base}${path}`;
}

function filteredHeaders(headers = {}, extra = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return { ...out, ...extra };
}

function upgradeHeaders(headers = {}, extra = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'proxy-authenticate' || lower === 'proxy-authorization') continue;
    out[key] = value;
  }
  return { ...out, ...extra };
}

function responseHeaders(proxyHeaders, { injected = false, requestHost, target }) {
  const headers = filteredHeaders(proxyHeaders);
  if (headers.location && requestHost) {
    const location = String(headers.location);
    if (location.startsWith(target.origin)) {
      headers.location = location.replace(target.origin, `http://${requestHost}`);
    }
  }
  if (injected) {
    delete headers['content-length'];
    delete headers['Content-Length'];
    delete headers['content-encoding'];
    delete headers['Content-Encoding'];
    headers['cache-control'] = 'no-store';
  }
  return headers;
}

function shouldInject(proxyRes, feedback) {
  if (!feedback) return false;
  const contentType = String(proxyRes.headers['content-type'] || '');
  const encoding = proxyRes.headers['content-encoding'];
  return /text\/html|application\/xhtml\+xml/i.test(contentType) && !encoding;
}

export async function startProxyServer({
  target,
  port = 0,
  host = '127.0.0.1',
  feedback = true,
  projectRoot = process.cwd(),
} = {}) {
  const targetUrl = normalizeProxyTarget(target);
  const feedbackQueuePath = join(projectRoot, '.supervibe', 'memory', 'feedback-queue.jsonl');
  const feedbackTargetContext = {
    kind: 'framework-proxy',
    prototypeSlug: `framework:${targetUrl.host}`,
    feedbackTargetId: `framework-proxy:${targetUrl.host}`,
    targetOrigin: targetUrl.origin,
    sourceServerPort: null,
    previewUrl: null,
  };
  const feedbackChannel = feedback ? createFeedbackChannel({ queuePath: feedbackQueuePath, targetContext: feedbackTargetContext }) : null;
  const sockets = new Set();
  let lastActivityAt = Date.now();
  function touch() { lastActivityAt = Date.now(); }

  const httpServer = createHttpServer((req, res) => {
    touch();
    const headers = filteredHeaders(req.headers, {
      host: targetUrl.host,
      'accept-encoding': 'identity',
    });
    const client = targetUrl.protocol === 'https:' ? httpsRequest : httpRequest;
    const proxyReq = client({
      protocol: targetUrl.protocol,
      hostname: targetHostname(targetUrl),
      port: targetPort(targetUrl),
      method: req.method,
      path: targetRequestPath(targetUrl, req.url),
      headers,
    }, (proxyRes) => {
      if (!shouldInject(proxyRes, feedback)) {
        res.writeHead(proxyRes.statusCode || 502, responseHeaders(proxyRes.headers, {
          requestHost: req.headers.host,
          target: targetUrl,
        }));
        proxyRes.pipe(res);
        return;
      }

      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', async () => {
        try {
          const html = Buffer.concat(chunks).toString('utf8');
          const injected = await injectOverlay(html, {
            prototypeSlug: `framework:${targetUrl.host}`,
            feedbackTarget: feedbackTargetContext,
          });
          const body = Buffer.from(injected, 'utf8');
          res.writeHead(proxyRes.statusCode || 200, responseHeaders(proxyRes.headers, {
            injected: true,
            requestHost: req.headers.host,
            target: targetUrl,
          }));
          res.end(body);
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`502 preview proxy injection failed: ${err.message}`);
        }
      });
    });

    proxyReq.on('error', (err) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`502 preview proxy target unavailable: ${err.message}`);
    });
    req.pipe(proxyReq);
  });

  httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  httpServer.on('upgrade', (req, socket, head) => {
    touch();
    if (feedbackChannel?.handleUpgrade(req, socket)) return;
    tunnelUpgrade({ req, socket, head, targetUrl });
  });

  await new Promise((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(port, host, () => resolveListen());
  });

  const actualPort = httpServer.address().port;
  feedbackTargetContext.sourceServerPort = actualPort;
  feedbackTargetContext.previewUrl = `http://${host}:${actualPort}`;
  return {
    port: actualPort,
    target: targetUrl.origin,
    getLastActivityAt: () => lastActivityAt,
    hasActiveSseClients: () => false,
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolveClose) => httpServer.close(resolveClose));
    },
  };
}

function tunnelUpgrade({ req, socket, head, targetUrl }) {
  const connect = targetUrl.protocol === 'https:'
    ? tlsConnect({
      host: targetHostname(targetUrl),
      port: targetPort(targetUrl),
      servername: targetHostname(targetUrl),
    })
    : createConnection({
      host: targetHostname(targetUrl),
      port: targetPort(targetUrl),
    });

  connect.once('connect', () => {
    const lines = [
      `${req.method} ${targetRequestPath(targetUrl, req.url)} HTTP/${req.httpVersion}`,
    ];
    const headers = upgradeHeaders(req.headers, { host: targetUrl.host });
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${key}: ${item}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    connect.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head?.length) connect.write(head);
    socket.pipe(connect).pipe(socket);
  });

  connect.once('error', () => {
    socket.destroy();
  });
  socket.once('error', () => connect.destroy());
}
