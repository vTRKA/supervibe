// Pure node:http static server with SSE-based hot-reload script injection.
// Zero new deps. SSE endpoint lives at /__supervibe_preview/sse.

import { createServer as createHttpServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep, resolve } from 'node:path';
import { mimeFor, isHtml } from './preview-mime.mjs';
import { createFeedbackChannel } from './feedback-channel.mjs';
import { injectOverlay } from './feedback-overlay-injector.mjs';

const HOT_RELOAD_SCRIPT = `
<script>
(function() {
  if (window.__supervibe_preview_initialized) return;
  window.__supervibe_preview_initialized = true;
  const es = new EventSource('/__supervibe_preview/sse');
  es.addEventListener('reload', () => {
    console.log('[supervibe-preview] reload triggered');
    window.location.reload();
  });
  es.addEventListener('connected', () => {
    console.log('[supervibe-preview] connected');
  });
  es.onerror = () => {
    console.warn('[supervibe-preview] SSE connection error — retry in 2s');
  };
})();
</script>
`;

export function derivePreviewArtifactSlug(filePath) {
  const norm = filePath.split(sep).join('/');
  const prototype = norm.match(/\/prototypes\/([^/]+)/);
  if (prototype) return prototype[1];
  const mockup = norm.match(/\/mockups\/([^/]+)/);
  if (mockup) return `mockup:${mockup[1]}`;
  const presentation = norm.match(/\/presentations\/([^/]+)/);
  if (presentation) return `presentation:${presentation[1]}`;
  return 'unknown';
}

/**
 * Start a static server.
 */
export async function startStaticServer({ root, port = 0, host = '127.0.0.1', feedback = true, projectRoot = process.cwd() }) {
  const absRoot = resolve(root);
  if (!existsSync(absRoot)) {
    throw new Error(`Preview server root does not exist: ${absRoot}`);
  }
  const designSystemAliasRoot = findSiblingDesignSystemRoot(absRoot);

  const sseClients = new Set();
  let lastActivityAt = Date.now();
  function touch() { lastActivityAt = Date.now(); }

  const feedbackQueuePath = join(projectRoot, '.supervibe', 'memory', 'feedback-queue.jsonl');
  const feedbackChannel = feedback ? createFeedbackChannel({ queuePath: feedbackQueuePath }) : null;

  const httpServer = createHttpServer(async (req, res) => {
    touch();

    if (req.url === '/__supervibe_preview/sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('event: connected\ndata: ok\n\n');
      sseClients.add(res);
      const ka = setInterval(() => {
        try { res.write(': keepalive\n\n'); touch(); } catch {}
      }, 25000);
      req.on('close', () => {
        clearInterval(ka);
        sseClients.delete(res);
      });
      return;
    }

    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    let requestedPath = normalize(join(absRoot, urlPath));
    const aliasedPath = resolveDesignSystemAliasPath({ urlPath, designSystemAliasRoot });
    if (aliasedPath) {
      requestedPath = aliasedPath;
    }

    if (!aliasedPath && !requestedPath.startsWith(absRoot + sep) && requestedPath !== absRoot) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden (path traversal blocked)');
      return;
    }

    if (!existsSync(requestedPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    let stat;
    try { stat = statSync(requestedPath); }
    catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    if (stat.isDirectory()) {
      const indexPath = join(requestedPath, 'index.html');
      if (!existsSync(indexPath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found (no index.html)');
        return;
      }
      return serveFile(indexPath, res);
    }

    return serveFile(requestedPath, res);
  });

  async function serveFile(path, res) {
    const mime = mimeFor(path);

    if (isHtml(path)) {
      try {
        const content = await readFile(path, 'utf8');
        let injected = content.includes('</body>')
          ? content.replace('</body>', `${HOT_RELOAD_SCRIPT}</body>`)
          : content + HOT_RELOAD_SCRIPT;
        if (feedback) {
          injected = await injectOverlay(injected, {
            prototypeSlug: derivePreviewArtifactSlug(path),
          });
        }
        const buf = Buffer.from(injected, 'utf8');
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': buf.length,
          'Cache-Control': 'no-store',
        });
        res.end(buf);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 ${err.message}`);
      }
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': statSync(path).size,
      'Cache-Control': 'no-store',
    });
    createReadStream(path).pipe(res);
  }

  if (feedbackChannel) {
    feedbackChannel.attachUpgrade(httpServer);
  }

  await new Promise((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(port, host, () => resolveListen());
  });

  const actualPort = httpServer.address().port;

  function broadcastReload() {
    touch();
    const payload = `event: reload\ndata: ${Date.now()}\n\n`;
    for (const client of sseClients) {
      try { client.write(payload); } catch {}
    }
  }

  async function stop() {
    for (const client of sseClients) {
      try { client.end(); } catch {}
    }
    sseClients.clear();
    await new Promise(r => httpServer.close(r));
  }

  return {
    port: actualPort,
    server: httpServer,
    stop,
    broadcastReload,
    getLastActivityAt: () => lastActivityAt,
    hasActiveSseClients: () => sseClients.size > 0,
  };
}

function findSiblingDesignSystemRoot(absRoot) {
  const normalized = absRoot.split(sep).join('/');
  const match = normalized.match(/^(.*\/\.supervibe\/artifacts\/prototypes)\/([^/]+)(?:\/.*)?$/);
  if (!match || match[2] === '_design-system') return null;
  const candidate = resolve(match[1].split('/').join(sep), '_design-system');
  return existsSync(candidate) ? candidate : null;
}

function resolveDesignSystemAliasPath({ urlPath, designSystemAliasRoot }) {
  if (!designSystemAliasRoot) return null;
  if (urlPath !== '/_design-system' && !urlPath.startsWith('/_design-system/')) return null;
  const rest = urlPath.replace(/^\/_design-system\/?/, '');
  const requestedPath = normalize(join(designSystemAliasRoot, rest));
  if (!requestedPath.startsWith(designSystemAliasRoot + sep) && requestedPath !== designSystemAliasRoot) {
    return null;
  }
  return requestedPath;
}
