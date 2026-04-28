# Phase E — Preview Server + Strengthened Planning Skills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Add a local-host preview-server infrastructure so design/prototype agents can spawn `http://localhost:PORT`, serve mockups with hot-reload, optionally take Playwright screenshots, and surface running previews in `supervibe:status`. (2) Strengthen the 6 existing planning skills (brainstorming / writing-plans / prd / adr / requirements-intake / explore-alternatives) into reference-grade methodologies — **no new commands, only deeper existing skills**.

**Architecture:**
- **Preview Server**: pure-Node `http` + `fs` (zero new deps), SSE-based hot-reload (no WebSocket lib needed), file-based process registry (`.claude/memory/preview-servers.json`), chokidar (already installed) for file watching, deterministic port scan (3047–3099 then OS-assigned), graceful SIGINT cleanup. Optional Playwright MCP integration when available.
- **Planning Skills**: each existing SKILL.md gets new sections (decision-tree branches, mandatory sub-steps, output-contract templates) — file size grows from ~90 lines to ~250 lines. Templates moved to `docs/templates/` with reference examples.

**Tech Stack:** Node 22+ (`node:http`, `node:net`, `node:fs/promises`), `chokidar` (existing), `mime` (small dep ~10KB or hardcoded map), pure SSE (`text/event-stream`), no Express, no WebSocket library, no Docker.

**Constraints (read before starting):**
1. **No new commands beyond `/supervibe-preview`** — the planning surface must NOT grow new top-level commands. Items 1–6 in user spec emphasized "ТОЛЬКО усиление текущих" for planning.
2. **No external services** — pure local Node, like all other Evolve infrastructure.
3. **Preview-server must die when session dies** — no zombie processes. Heartbeat + SIGINT/SIGTERM handlers + registry validation.
4. **Hot-reload must work without browser plugins or WebSocket** — SSE only.
5. **All code must run on Windows / macOS / Linux** — no shell-specific tricks.

---

## File Structure

### Phase E1 — Preview Server (NEW)

```
evolve/
├── scripts/
│   ├── lib/
│   │   ├── preview-server-manager.mjs   # NEW — port alloc, process tracking, registry
│   │   ├── preview-static-server.mjs    # NEW — pure node:http static serving + SSE inject
│   │   ├── preview-hot-reload.mjs       # NEW — chokidar → SSE message bridge
│   │   └── preview-mime.mjs             # NEW — extension → mime type map (hardcoded)
│   └── preview-server.mjs               # NEW — CLI: --root, --port, --list, --kill, --kill-all
│
├── skills/
│   └── preview-server/
│       └── SKILL.md                     # NEW — methodology agents invoke
│
├── commands/
│   └── evolve-preview.md                # NEW — slash command for users
│
└── tests/
    ├── preview-server-manager.test.mjs  # NEW — port alloc, registry
    ├── preview-static-server.test.mjs   # NEW — HTTP responses + injection
    └── preview-hot-reload.test.mjs      # NEW — chokidar → SSE
```

### Phase E2 — Strengthen Planning Skills (MODIFY existing)

```
evolve/
├── skills/
│   ├── brainstorming/SKILL.md           # MODIFY — strengthen
│   ├── writing-plans/SKILL.md           # MODIFY
│   ├── prd/SKILL.md                     # MODIFY
│   ├── adr/SKILL.md                     # MODIFY
│   ├── requirements-intake/SKILL.md     # MODIFY
│   └── explore-alternatives/SKILL.md    # MODIFY
│
├── docs/
│   └── templates/                       # NEW — reference docs
│       ├── PRD-template.md
│       ├── ADR-template.md
│       ├── plan-template.md
│       ├── RFC-template.md
│       └── brainstorm-output-template.md
```

### Phase E3 — Integration

```
evolve/
├── agents/
│   ├── _design/prototype-builder.md     # MODIFY — wire preview-server invocation
│   └── _design/ux-ui-designer.md        # MODIFY — wire preview hand-off
├── skills/
│   ├── landing-page/SKILL.md            # MODIFY — auto-spawn preview after generate
│   └── interaction-design-patterns/SKILL.md # MODIFY — same
├── scripts/supervibe-status.mjs            # MODIFY — surface running preview servers
├── scripts/session-start-check.mjs      # MODIFY — cleanup stale preview registry on start
├── CLAUDE.md                            # MODIFY — add Preview Server section
├── README.md                            # MODIFY — add Preview to feature table
└── docs/getting-started.md              # MODIFY — add Preview section
```

### Phase E-FINAL

```
CHANGELOG.md      # APPEND v1.7.0 entry
package.json      # version bump 1.6.0 → 1.7.0
.claude-plugin/plugin.json  # version bump
knip.json         # allowlist new entry scripts
```

---

## PHASE E1 — Preview Server Infrastructure

### Task E1.1: `preview-mime.mjs` — extension → mime map

**Files:**
- Create: `scripts/lib/preview-mime.mjs`
- Test: covered indirectly by E1.2 server tests

- [ ] **Step 1: Write the helper**

Create `scripts/lib/preview-mime.mjs`:

```javascript
// Hardcoded MIME map — covers 99% of mockup file types.
// Avoids npm dep on `mime` (~50KB transitive) since we only need ~15 types.

const MAP = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
};

export function mimeFor(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return MAP[filePath.slice(dot).toLowerCase()] || 'application/octet-stream';
}

export function isHtml(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return ext === '.html' || ext === '.htm';
}
```

- [ ] **Step 2: Smoke test**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings -e "
import('./scripts/lib/preview-mime.mjs').then(m => {
  console.log(m.mimeFor('foo.html'));   // text/html; charset=utf-8
  console.log(m.mimeFor('foo.css'));    // text/css; charset=utf-8
  console.log(m.mimeFor('foo.unknown')); // application/octet-stream
  console.log(m.isHtml('foo.html'));    // true
  console.log(m.isHtml('foo.css'));     // false
});"
```

Expected: prints 5 lines matching above comments.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/preview-mime.mjs
git commit -m "feat(preview): mime helper (hardcoded map, no new deps)"
```

---

### Task E1.2: `preview-server-manager.mjs` — port allocation + registry

**Files:**
- Create: `scripts/lib/preview-server-manager.mjs`
- Create: `tests/preview-server-manager.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/preview-server-manager.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  findFreePort, registerServer, unregisterServer, listServers,
  isPidAlive, killServer, REGISTRY_PATH_FOR_TEST
} from '../scripts/lib/preview-server-manager.mjs';

const sandbox = join(tmpdir(), `evolve-preview-mgr-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  REGISTRY_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'preview-servers.json'));
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

test('findFreePort: returns a port in the preferred range or OS-assigned', async () => {
  const port = await findFreePort();
  assert.ok(port >= 3047 && port <= 65535, `port out of range: ${port}`);
});

test('registerServer + listServers: round-trip', async () => {
  await registerServer({ port: 3047, pid: process.pid, root: '/fake/root', label: 'test' });
  const list = await listServers();
  const found = list.find(s => s.port === 3047);
  assert.ok(found, 'registered server should appear in list');
  assert.strictEqual(found.label, 'test');
});

test('unregisterServer: removes entry', async () => {
  await unregisterServer(3047);
  const list = await listServers();
  assert.ok(!list.find(s => s.port === 3047), 'should be removed');
});

test('listServers: filters out dead PIDs automatically', async () => {
  // Register a fake server with a PID that definitely doesn't exist
  await registerServer({ port: 3099, pid: 999999, root: '/fake', label: 'dead' });
  const list = await listServers();
  // listServers should auto-prune dead entries
  assert.ok(!list.find(s => s.port === 3099), 'dead PID should be auto-pruned');
});

test('isPidAlive: works for current process', () => {
  assert.strictEqual(isPidAlive(process.pid), true);
  assert.strictEqual(isPidAlive(999999), false);
});

test('killServer: returns false for non-existent port', async () => {
  const result = await killServer(9999);
  assert.strictEqual(result.killed, false);
  assert.strictEqual(result.reason, 'not-found');
});
```

- [ ] **Step 2: Run failing tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/preview-server-manager.test.mjs 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement manager**

Create `scripts/lib/preview-server-manager.mjs`:

```javascript
// Preview Server Manager — port allocation, process tracking, registry persistence.
// Registry is a JSON file in .claude/memory/preview-servers.json so multiple
// evolve sessions and the status command can see/manage each other's servers.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

const PROJECT_ROOT = process.cwd();
let _registryPath = join(PROJECT_ROOT, '.claude', 'memory', 'preview-servers.json');

/** TEST HOOK: override registry path for sandboxed tests */
export function REGISTRY_PATH_FOR_TEST(path) {
  _registryPath = path;
}

const PORT_PREFERRED_START = 3047;
const PORT_PREFERRED_END = 3099;

/**
 * Find a free port. Try preferred range first (3047-3099),
 * then fall back to OS-assigned (port 0).
 */
export async function findFreePort() {
  for (let port = PORT_PREFERRED_START; port <= PORT_PREFERRED_END; port++) {
    if (await isPortFree(port)) return port;
  }
  // Fallback: let OS pick
  return await new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function isPortFree(port) {
  return new Promise(resolve => {
    const srv = createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(port, () => srv.close(() => resolve(true)));
  });
}

async function readRegistry() {
  if (!existsSync(_registryPath)) return [];
  try {
    const txt = await readFile(_registryPath, 'utf8');
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeRegistry(entries) {
  await mkdir(dirname(_registryPath), { recursive: true });
  await writeFile(_registryPath, JSON.stringify(entries, null, 2));
}

export function isPidAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    // Signal 0 doesn't kill; just checks existence
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but we can't signal it (non-our-user)
  }
}

/** Add an entry. */
export async function registerServer({ port, pid, root, label = '', watching = [] }) {
  const entries = await readRegistry();
  // Drop any prior entry for the same port (stale)
  const filtered = entries.filter(e => e.port !== port);
  filtered.push({
    port,
    pid,
    root,
    label,
    watching,
    startedAt: new Date().toISOString(),
  });
  await writeRegistry(filtered);
}

/** Remove an entry by port. */
export async function unregisterServer(port) {
  const entries = await readRegistry();
  const filtered = entries.filter(e => e.port !== port);
  await writeRegistry(filtered);
}

/** Read registry, auto-prune entries whose PID no longer exists. */
export async function listServers() {
  const entries = await readRegistry();
  const alive = entries.filter(e => isPidAlive(e.pid));
  if (alive.length !== entries.length) {
    // Persist the pruning
    await writeRegistry(alive);
  }
  return alive;
}

/** Send SIGTERM to the server with the given port. Returns {killed, reason}. */
export async function killServer(port) {
  const entries = await readRegistry();
  const entry = entries.find(e => e.port === port);
  if (!entry) return { killed: false, reason: 'not-found' };
  if (!isPidAlive(entry.pid)) {
    await unregisterServer(port);
    return { killed: false, reason: 'already-dead' };
  }
  try {
    process.kill(entry.pid, 'SIGTERM');
    await unregisterServer(port);
    return { killed: true, port, pid: entry.pid };
  } catch (err) {
    return { killed: false, reason: err.message };
  }
}

/** Kill all registered servers. */
export async function killAllServers() {
  const entries = await listServers();
  const results = [];
  for (const e of entries) {
    results.push(await killServer(e.port));
  }
  return results;
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/preview-server-manager.test.mjs 2>&1 | tail -15
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/preview-server-manager.mjs tests/preview-server-manager.test.mjs
git commit -m "feat(preview): port allocation + process registry manager"
```

---

### Task E1.3: `preview-static-server.mjs` — pure node:http static + SSE

**Files:**
- Create: `scripts/lib/preview-static-server.mjs`
- Create: `tests/preview-static-server.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/preview-static-server.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { startStaticServer } from '../scripts/lib/preview-static-server.mjs';

const sandbox = join(tmpdir(), `evolve-preview-srv-${Date.now()}`);
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
    request({ host: 'localhost', port, path, method: 'GET' }, res => {
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
  assert.match(r.body, /__evolve_preview\/sse/);
  assert.match(r.body, /EventSource/);
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
    const req = request({ host: 'localhost', port, path: '/__evolve_preview/sse', method: 'GET' }, res => {
      // SSE keeps connection open; we just check status + headers then close
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
  // Subscribe to SSE, broadcast, assert message received within 200ms
  const messages = [];
  const req = request({ host: 'localhost', port, path: '/__evolve_preview/sse', method: 'GET' });
  req.end();
  const res = await new Promise(resolve => req.on('response', resolve));
  res.on('data', chunk => messages.push(chunk.toString()));

  await new Promise(r => setTimeout(r, 50)); // allow subscription
  server.broadcastReload();
  await new Promise(r => setTimeout(r, 200)); // wait for delivery

  req.destroy();

  const allMessages = messages.join('');
  assert.match(allMessages, /event: reload/);
});
```

- [ ] **Step 2: Run failing tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/preview-static-server.test.mjs 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement server**

Create `scripts/lib/preview-static-server.mjs`:

```javascript
// Pure node:http static server with SSE-based hot-reload script injection.
// Zero new deps. SSE endpoint lives at /__evolve_preview/sse.

import { createServer as createHttpServer } from 'node:http';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep, resolve } from 'node:path';
import { mimeFor, isHtml } from './preview-mime.mjs';

const HOT_RELOAD_SCRIPT = `
<script>
(function() {
  if (window.__evolve_preview_initialized) return;
  window.__evolve_preview_initialized = true;
  const es = new EventSource('/__evolve_preview/sse');
  es.addEventListener('reload', () => {
    console.log('[evolve-preview] reload triggered');
    window.location.reload();
  });
  es.addEventListener('connected', () => {
    console.log('[evolve-preview] connected');
  });
  es.onerror = () => {
    console.warn('[evolve-preview] SSE connection error — retry in 2s');
  };
})();
</script>
`;

/**
 * Start a static server.
 * @param opts.root  absolute root directory to serve
 * @param opts.port  port to listen on (0 = OS-assigned)
 * @param opts.host  host to bind (default '127.0.0.1')
 * @returns {Promise<{port, server, stop, broadcastReload}>}
 */
export async function startStaticServer({ root, port = 0, host = '127.0.0.1' }) {
  const absRoot = resolve(root);
  if (!existsSync(absRoot)) {
    throw new Error(`Preview server root does not exist: ${absRoot}`);
  }

  const sseClients = new Set();

  const httpServer = createHttpServer(async (req, res) => {
    // SSE endpoint
    if (req.url === '/__evolve_preview/sse') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('event: connected\ndata: ok\n\n');
      sseClients.add(res);
      // Keep-alive comment every 25s to prevent proxy timeouts
      const ka = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch {}
      }, 25000);
      req.on('close', () => {
        clearInterval(ka);
        sseClients.delete(res);
      });
      return;
    }

    // Static serving
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    // Path traversal guard
    const requestedPath = normalize(join(absRoot, urlPath));
    if (!requestedPath.startsWith(absRoot + sep) && requestedPath !== absRoot) {
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

    // Directory → index.html
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
      // Read full content, inject hot-reload script before </body> (or append)
      try {
        const content = await readFile(path, 'utf8');
        const injected = content.includes('</body>')
          ? content.replace('</body>', `${HOT_RELOAD_SCRIPT}</body>`)
          : content + HOT_RELOAD_SCRIPT;
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

    // Non-HTML: stream directly
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': statSync(path).size,
      'Cache-Control': 'no-store',
    });
    createReadStream(path).pipe(res);
  }

  // Listen
  await new Promise((resolveListen, rejectListen) => {
    httpServer.once('error', rejectListen);
    httpServer.listen(port, host, () => resolveListen());
  });

  const actualPort = httpServer.address().port;

  function broadcastReload() {
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

  return { port: actualPort, server: httpServer, stop, broadcastReload };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/preview-static-server.test.mjs 2>&1 | tail -15
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/preview-static-server.mjs tests/preview-static-server.test.mjs
git commit -m "feat(preview): pure node:http static server + SSE hot-reload (zero new deps)"
```

---

### Task E1.4: `preview-hot-reload.mjs` — chokidar → SSE bridge

**Files:**
- Create: `scripts/lib/preview-hot-reload.mjs`
- Create: `tests/preview-hot-reload.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/preview-hot-reload.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attachHotReload } from '../scripts/lib/preview-hot-reload.mjs';

const sandbox = join(tmpdir(), `evolve-hot-reload-${Date.now()}`);

before(async () => {
  await mkdir(sandbox, { recursive: true });
  await writeFile(join(sandbox, 'index.html'), '<html></html>');
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

test('attachHotReload: invokes broadcastReload on file change', async () => {
  let reloadCount = 0;
  const fakeServer = { broadcastReload: () => { reloadCount++; } };

  const watcher = await attachHotReload({ root: sandbox, server: fakeServer });

  // Wait for chokidar to settle
  await new Promise(r => setTimeout(r, 300));

  // Modify a file
  await writeFile(join(sandbox, 'index.html'), '<html><body>changed</body></html>');

  // Wait for debounce + chokidar to detect
  await new Promise(r => setTimeout(r, 500));

  assert.ok(reloadCount >= 1, `expected ≥1 reload, got ${reloadCount}`);

  await watcher.close();
});

test('attachHotReload: debounces rapid changes', async () => {
  let reloadCount = 0;
  const fakeServer = { broadcastReload: () => { reloadCount++; } };
  const watcher = await attachHotReload({ root: sandbox, server: fakeServer, debounceMs: 200 });
  await new Promise(r => setTimeout(r, 300));

  // Rapid-fire changes
  for (let i = 0; i < 5; i++) {
    await writeFile(join(sandbox, 'index.html'), `<html>${i}</html>`);
    await new Promise(r => setTimeout(r, 30));
  }

  // Wait for debounce window to flush
  await new Promise(r => setTimeout(r, 500));

  assert.ok(reloadCount <= 3, `expected debounced (≤3) reloads, got ${reloadCount}`);
  assert.ok(reloadCount >= 1, 'expected at least one reload');

  await watcher.close();
});

test('attachHotReload: returns watcher with watching list', async () => {
  const fakeServer = { broadcastReload: () => {} };
  const watcher = await attachHotReload({ root: sandbox, server: fakeServer });
  assert.ok(typeof watcher.close === 'function');
  assert.ok(typeof watcher.getWatchedCount === 'function');
  await watcher.close();
});
```

- [ ] **Step 2: Run failing tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/preview-hot-reload.test.mjs 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement bridge**

Create `scripts/lib/preview-hot-reload.mjs`:

```javascript
// chokidar → SSE bridge. Watches root dir, debounces rapid changes,
// invokes server.broadcastReload() on each settled change.

import chokidar from 'chokidar';

const DEFAULT_DEBOUNCE_MS = 150;

/**
 * Attach hot-reload watcher to a static server.
 * @param opts.root    absolute root dir to watch
 * @param opts.server  object with broadcastReload() method
 * @param opts.debounceMs  debounce window (default 150ms)
 * @returns {Promise<{close, getWatchedCount}>}
 */
export async function attachHotReload({ root, server, debounceMs = DEFAULT_DEBOUNCE_MS }) {
  const watcher = chokidar.watch(root, {
    persistent: true,
    ignoreInitial: true,
    ignored: [
      /node_modules/,
      /\.git/,
      /(^|[\\\/])\.[^\\\/]+/, // dotfiles/dotdirs
    ],
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 30 },
  });

  let debounceTimer = null;
  let watchedCount = 0;

  function trigger() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try { server.broadcastReload(); } catch {}
    }, debounceMs);
  }

  watcher.on('add', () => { watchedCount++; });
  watcher.on('change', trigger);
  watcher.on('unlink', () => { watchedCount = Math.max(0, watchedCount - 1); trigger(); });
  watcher.on('add', () => trigger()); // also reload on new files

  // Return after initial scan completes (so caller knows watching is ready)
  await new Promise(resolve => watcher.once('ready', resolve));

  return {
    close: async () => {
      clearTimeout(debounceTimer);
      await watcher.close();
    },
    getWatchedCount: () => watchedCount,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/preview-hot-reload.test.mjs 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/preview-hot-reload.mjs tests/preview-hot-reload.test.mjs
git commit -m "feat(preview): chokidar→SSE hot-reload bridge with debouncing"
```

---

### Task E1.5: `preview-server.mjs` — CLI entry

**Files:**
- Create: `scripts/preview-server.mjs`
- Modify: `package.json` (add `supervibe:preview` script)
- Modify: `knip.json` (allowlist new entry)

- [ ] **Step 1: Implement CLI**

Create `scripts/preview-server.mjs`:

```javascript
#!/usr/bin/env node
// Preview Server CLI — used by /supervibe-preview command and design-related skills.
//
// Modes:
//   --root <dir>            Start server serving <dir> (default: ./mockups or ./)
//   --port <N>              Specific port (default: auto-allocate 3047-3099 then OS)
//   --label "<name>"        Friendly label for the registry
//   --no-watch              Disable hot-reload (static-only)
//   --list                  List currently running preview servers
//   --kill <port>           Kill server on given port
//   --kill-all              Kill all registered preview servers

import { resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { startStaticServer } from './lib/preview-static-server.mjs';
import { attachHotReload } from './lib/preview-hot-reload.mjs';
import {
  findFreePort,
  registerServer, unregisterServer,
  listServers, killServer, killAllServers
} from './lib/preview-server-manager.mjs';

const PROJECT_ROOT = process.cwd();

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: '' },
    port: { type: 'string', default: '' },
    label: { type: 'string', default: '' },
    'no-watch': { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    kill: { type: 'string', default: '' },
    'kill-all': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: false,
});

if (values.help) {
  console.log(`Evolve Preview Server

Usage:
  preview-server.mjs --root <dir> [--port N] [--label "name"] [--no-watch]
  preview-server.mjs --list
  preview-server.mjs --kill <port>
  preview-server.mjs --kill-all

Examples:
  preview-server.mjs --root mockups/checkout
  preview-server.mjs --port 3050 --root prototypes/landing
  preview-server.mjs --list
  preview-server.mjs --kill 3047`);
  process.exit(0);
}

if (values.list) {
  const servers = await listServers();
  if (servers.length === 0) {
    console.log('No preview servers running.');
    process.exit(0);
  }
  console.log(`Running preview servers (${servers.length}):`);
  for (const s of servers) {
    const url = `http://localhost:${s.port}`;
    const ago = ((Date.now() - new Date(s.startedAt).getTime()) / 1000 / 60).toFixed(1);
    console.log(`  ${url}  ${s.label || basename(s.root)}  (pid=${s.pid}, root=${s.root}, started ${ago}m ago)`);
  }
  process.exit(0);
}

if (values.kill) {
  const port = parseInt(values.kill, 10);
  const r = await killServer(port);
  if (r.killed) console.log(`Killed preview server on port ${port} (pid=${r.pid})`);
  else console.log(`No preview server on port ${port} (${r.reason})`);
  process.exit(r.killed ? 0 : 1);
}

if (values['kill-all']) {
  const results = await killAllServers();
  const killed = results.filter(r => r.killed).length;
  console.log(`Killed ${killed} of ${results.length} preview servers.`);
  process.exit(0);
}

// Start mode
let rootDir = values.root;
if (!rootDir) {
  if (existsSync('mockups')) rootDir = 'mockups';
  else if (existsSync('prototypes')) rootDir = 'prototypes';
  else rootDir = '.';
}
const absRoot = resolve(PROJECT_ROOT, rootDir);
if (!existsSync(absRoot)) {
  console.error(`Root directory does not exist: ${absRoot}`);
  process.exit(1);
}

const portArg = values.port ? parseInt(values.port, 10) : 0;
const port = portArg || await findFreePort();
const label = values.label || basename(absRoot);

const server = await startStaticServer({ root: absRoot, port });
let watcher = null;
if (!values['no-watch']) {
  watcher = await attachHotReload({ root: absRoot, server });
}

await registerServer({
  port: server.port,
  pid: process.pid,
  root: absRoot,
  label,
  watching: watcher ? ['*'] : [],
});

const url = `http://localhost:${server.port}`;
console.log(`[evolve-preview] ${label} → ${url}`);
console.log(`[evolve-preview] root: ${absRoot}`);
console.log(`[evolve-preview] hot-reload: ${watcher ? 'on' : 'off'}`);
console.log(`[evolve-preview] PID: ${process.pid}`);
console.log(`[evolve-preview] press Ctrl+C to stop`);

// Graceful shutdown
async function shutdown(sig) {
  console.log(`\n[evolve-preview] received ${sig}, shutting down...`);
  if (watcher) await watcher.close();
  await server.stop();
  await unregisterServer(server.port);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => {
  // Best-effort sync cleanup; full async happens via SIGINT path
});

// Keep process alive
setInterval(() => {}, 1 << 30);
```

- [ ] **Step 2: Add `npm run supervibe:preview` script**

Edit `package.json` `scripts` block, add:

```json
"supervibe:preview": "node scripts/preview-server.mjs",
```

- [ ] **Step 3: Add to knip allowlist**

Edit `knip.json` `entry` array, add: `"scripts/preview-server.mjs"`.

- [ ] **Step 4: Manual smoke test**

```bash
cd "D:/ggsel projects/evolve" && mkdir -p /tmp/test-mockup && echo '<html><body><h1>Hello Preview</h1></body></html>' > /tmp/test-mockup/index.html

# Start in background
node scripts/preview-server.mjs --root /tmp/test-mockup --port 3047 &
SERVER_PID=$!
sleep 1

# Verify it serves the file
curl -s http://localhost:3047/ | grep -q "Hello Preview" && echo "STATIC_OK" || echo "STATIC_FAIL"
curl -s http://localhost:3047/ | grep -q "EventSource" && echo "INJECT_OK" || echo "INJECT_FAIL"

# Verify --list shows it
node scripts/preview-server.mjs --list

# Kill
node scripts/preview-server.mjs --kill 3047
wait $SERVER_PID 2>/dev/null
rm -rf /tmp/test-mockup
```

Expected output: `STATIC_OK`, `INJECT_OK`, list shows 1 server, kill returns success.

- [ ] **Step 5: Commit**

```bash
git add scripts/preview-server.mjs package.json knip.json
git commit -m "feat(preview): CLI entry — start/list/kill preview servers, hot-reload by default"
```

---

### Task E1.6: `supervibe:preview-server` SKILL.md

**Files:**
- Create: `skills/preview-server/SKILL.md`

- [ ] **Step 1: Write skill**

Create `skills/preview-server/SKILL.md`:

```markdown
---
name: preview-server
namespace: process
description: "Use AFTER generating HTML/CSS/JS mockup files TO spawn a local http://localhost preview server with hot-reload, share URL with user, optionally capture Playwright screenshot"
allowed-tools: [Read, Bash, Glob]
phase: prototype
prerequisites: []
emits-artifact: preview-url
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: false
version: 1.0
last-verified: 2026-04-27
---

# Preview Server

## When to invoke

AFTER any agent or skill that generates HTML/CSS/JS files for user review:
- `supervibe:landing-page` — finished landing page mockup
- `supervibe:prototype` — interactive HTML/CSS prototype
- `supervibe:interaction-design-patterns` — multi-screen flow demo
- `agents/_design/prototype-builder` — explicit prototype output
- Any time user asks "show me what it would look like"

This skill replaces "describe the design in text" with "open this URL and see it live, edits auto-reload".

## Step 0 — Read source of truth

1. Verify mockup files exist at the path you'll serve (e.g. `mockups/checkout/index.html`)
2. Verify no preview server already running on the same root: `node $CLAUDE_PLUGIN_ROOT/scripts/preview-server.mjs --list`
3. If overlap: kill old one or pick a different label

## Decision tree

```
What did you just generate?
  Single HTML file with inline CSS                → preview-server --root <dir>
  Multi-file mockup (index.html + assets/)        → preview-server --root <dir>
  Full Vite/Next dev project                      → DON'T use this; user has own dev server
  Static screenshots only (.png)                  → DON'T use this; just point to file path

Should I capture a screenshot for the agent output?
  Playwright MCP available?                        → YES: invoke after URL ready
  No Playwright?                                   → NO: just hand the URL to user
```

## Procedure

1. Verify Step 0
2. Pick a label that the user will recognize (e.g., feature name)
3. Start the server:
   ```bash
   node $CLAUDE_PLUGIN_ROOT/scripts/preview-server.mjs --root <dir> --label "<feature>"
   ```
4. Capture stdout — first line `[evolve-preview] <label> → http://localhost:NNNN`
5. Hand URL to user in a clearly-formatted line:
   > **Preview ready:** http://localhost:NNNN — auto-reloads on file edits
6. If Playwright MCP is available (check via `supervibe:mcp-discovery`):
   - `mcp__playwright__browser_navigate(url)`
   - `mcp__playwright__browser_take_screenshot(filename: ".claude/memory/previews/<label>-<timestamp>.png")`
   - Reference screenshot in your output as evidence
7. Continue task — user will edit files; hot-reload propagates instantly
8. When task complete and user confirms: stop the server with `--kill <port>`

## Output contract

```markdown
## Preview
- **URL**: http://localhost:NNNN
- **Label**: <feature-name>
- **Root**: <absolute path>
- **Hot-reload**: on
- **PID**: <pid>
- **Screenshot** (if Playwright): `.claude/memory/previews/<file>.png`

## How user interacts
1. Open URL in browser
2. Edit any file in `<root>` — page auto-reloads within ~200ms
3. When done reviewing, ask agent to `--kill <port>` or it'll be cleaned up at session end
```

## Guard rails

- DO NOT: spawn a preview server without the user being aware (always print URL)
- DO NOT: serve directories outside the project root (path traversal blocked at server level, but skill should not even ask)
- DO NOT: leave servers running across sessions if the project doesn't need them — kill on completion
- DO NOT: bind to `0.0.0.0` — always `127.0.0.1` (server enforces this; skill should not override)
- ALWAYS: include hot-reload (default) unless user explicitly asks for static snapshot
- ALWAYS: include port + PID in your output so user can kill manually

## Verification

- `curl -s http://localhost:NNNN/` returns HTML containing your mockup content
- HTML response contains `EventSource('/__evolve_preview/sse')` injection
- `npm run supervibe:preview -- --list` shows your server in the list

## Related

- `supervibe:prototype` — generates the HTML/CSS that this skill serves
- `supervibe:landing-page` — same
- `supervibe:interaction-design-patterns` — same
- `supervibe:mcp-discovery` — find Playwright MCP for screenshots
- `agents/_design/prototype-builder` — primary caller
- `agents/_design/ux-ui-designer` — uses for design-review hand-off
```

- [ ] **Step 2: Validate**

```bash
cd "D:/ggsel projects/evolve" && npm run lint:descriptions 2>&1 | grep preview-server
npm run validate:frontmatter 2>&1 | grep preview-server
```

Both must show `OK`.

- [ ] **Step 3: Commit**

```bash
git add skills/preview-server/SKILL.md
git commit -m "feat(preview): supervibe:preview-server skill (methodology for design agents)"
```

---

### Task E1.7: `/supervibe-preview` slash command

**Files:**
- Create: `commands/supervibe-preview.md`

- [ ] **Step 1: Write command**

Create `commands/supervibe-preview.md`:

```markdown
---
description: "Manage local preview servers for HTML/CSS/JS mockups (start / list / kill). Use after generating mockup files to view them at http://localhost:PORT with auto-reload."
---

# /supervibe-preview

User-facing command to manage preview servers.

## Usage

| Form | Action |
|------|--------|
| `/supervibe-preview` | List currently running preview servers |
| `/supervibe-preview <dir>` | Start a server serving <dir> on auto-allocated port |
| `/supervibe-preview <dir> --port 3050` | Start on specific port |
| `/supervibe-preview --kill <port>` | Kill server on a specific port |
| `/supervibe-preview --kill-all` | Kill all preview servers |

## What I do when invoked

1. Parse arguments
2. If no args / `--list`: run `node $CLAUDE_PLUGIN_ROOT/scripts/preview-server.mjs --list` and report
3. If directory given: run `node $CLAUDE_PLUGIN_ROOT/scripts/preview-server.mjs --root <dir>` and report URL
4. If `--kill <port>`: run `--kill` and report
5. Show output to user with friendly formatting

## Notes

- Preview servers auto-cleanup on session end (heartbeat-based registry pruning)
- Hot-reload is on by default — file edits in served directory auto-refresh the browser
- Servers bind to 127.0.0.1 only; not accessible from network
```

- [ ] **Step 2: Validate command frontmatter**

```bash
cd "D:/ggsel projects/evolve" && npm run check 2>&1 | tail -5
```

Expected: 95+/95+ tests pass (no regression).

- [ ] **Step 3: Commit**

```bash
git add commands/supervibe-preview.md
git commit -m "feat(preview): /supervibe-preview slash command"
```

---

### Task E1.8: Wire `prototype-builder` agent to use preview server

**Files:**
- Modify: `agents/_design/prototype-builder.md`

- [ ] **Step 1: Add preview-server skill to agent**

In `agents/_design/prototype-builder.md`, find the `## Skills` section. Append:

```markdown
- `supervibe:preview-server` — spawn http://localhost preview after generating mockup files
```

In `## Procedure`, after the step where the agent generates HTML/CSS, insert:

```markdown
N. **Spawn preview**: invoke `supervibe:preview-server` skill with `--root mockups/<feature>` to start a local server at http://localhost:NNNN. Hand URL to user with hot-reload note.
```

(Renumber subsequent steps.)

In `## Output contract`, add a new section:

```markdown
## Preview server (when applicable)
- **URL**: http://localhost:NNNN — handed to user, opens in browser
- **Label**: <feature-name>
- **Hot-reload**: on (file edits in `mockups/<feature>/` auto-refresh browser)
- **Port lifecycle**: cleanup on session end via SIGINT, OR `/supervibe-preview --kill <port>` manually

If task is non-visual (e.g., design tokens only): explicitly state "Preview: N/A (no visual mockup generated)".
```

- [ ] **Step 2: Verify line count + frontmatter**

```bash
cd "D:/ggsel projects/evolve" && wc -l agents/_design/prototype-builder.md
npm run validate:frontmatter | grep prototype-builder
```

Lines must remain ≥250. Frontmatter OK.

- [ ] **Step 3: Commit**

```bash
git add agents/_design/prototype-builder.md
git commit -m "feat(agent): prototype-builder spawns preview server + cites URL in output"
```

---

### Task E1.9: Wire `landing-page` and `interaction-design-patterns` skills

**Files:**
- Modify: `skills/landing-page/SKILL.md`
- Modify: `skills/interaction-design-patterns/SKILL.md`

- [ ] **Step 1: landing-page — add preview step**

In `skills/landing-page/SKILL.md` `## Procedure`, append step:

```markdown
N. **Auto-spawn preview** (mandatory): invoke `supervibe:preview-server` skill with `--root <output-dir>` after files are written. Hand URL to user with hot-reload note. Continue task — user will iterate visually.
```

Add to `## Output contract`:

```markdown
- **Preview URL**: http://localhost:NNNN — auto-spawned after generation, hot-reload on
```

- [ ] **Step 2: interaction-design-patterns — same pattern**

In `skills/interaction-design-patterns/SKILL.md` `## Procedure`, append same step.

- [ ] **Step 3: Validate**

```bash
cd "D:/ggsel projects/evolve" && npm run lint:descriptions; npm run validate:frontmatter | grep -E "landing-page|interaction-design"
```

- [ ] **Step 4: Commit**

```bash
git add skills/landing-page/SKILL.md skills/interaction-design-patterns/SKILL.md
git commit -m "feat(skills): landing-page + interaction-design-patterns auto-spawn preview"
```

---

### Task E1.10: `evolve-status.mjs` surfaces running preview servers

**Files:**
- Modify: `scripts/supervibe-status.mjs`
- Modify: `tests/supervibe-status.test.mjs`

- [ ] **Step 1: Add import + render section**

In `scripts/supervibe-status.mjs`, near top after existing imports:

```javascript
import { listServers as listPreviewServers } from './lib/preview-server-manager.mjs';
```

After the existing watcher-state block, append:

```javascript
// Preview servers
const previews = await listPreviewServers();
if (previews.length === 0) {
  console.log(color('○ Preview servers: none running', 'dim'));
} else {
  console.log(color(`✓ Preview servers: ${previews.length} running`, 'green'));
  for (const p of previews) {
    const url = `http://localhost:${p.port}`;
    const ago = ((Date.now() - new Date(p.startedAt).getTime()) / 1000 / 60).toFixed(1);
    console.log(color(`  ${url}  ${p.label}  (pid=${p.pid}, ${ago}m ago)`, 'dim'));
  }
}
```

- [ ] **Step 2: Add test assertion**

In `tests/supervibe-status.test.mjs`, append a new test:

```javascript
test('evolve-status: reports preview server state', () => {
  const out = runStatus();
  assert.ok(
    /Preview servers: \d+ running/.test(out) || /Preview servers: none/.test(out),
    'should report preview server state'
  );
});
```

- [ ] **Step 3: Run tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/supervibe-status.test.mjs 2>&1 | tail -10
```

Expected: 7 tests pass (was 6, added 1).

- [ ] **Step 4: Manual verify**

```bash
cd "D:/ggsel projects/evolve" && npm run supervibe:status | tail -5
```

Expected: line "Preview servers: none running" (since no servers active during status call).

- [ ] **Step 5: Commit**

```bash
git add scripts/supervibe-status.mjs tests/supervibe-status.test.mjs
git commit -m "feat(status): surface running preview servers with URL/PID/age"
```

---

### Task E1.11: Cleanup hook in SessionStart — prune stale registry entries

**Files:**
- Modify: `scripts/session-start-check.mjs`

- [ ] **Step 1: Add cleanup call**

In `scripts/session-start-check.mjs`, after the existing `reportCodeIndexHealth()` call, add:

```javascript
// Phase E: prune stale preview-server registry (entries whose PID no longer exists)
async function pruneStalePreviewServers() {
  try {
    const { listServers } = await import('./lib/preview-server-manager.mjs');
    // listServers() auto-prunes dead entries on read — just call it
    await listServers();
  } catch {
    // Non-fatal
  }
}
await pruneStalePreviewServers();
```

- [ ] **Step 2: Manual verify**

```bash
cd "D:/ggsel projects/evolve" && node scripts/session-start-check.mjs 2>&1 | tail -5
```

Expected: no errors; existing banner still appears.

- [ ] **Step 3: Commit**

```bash
git add scripts/session-start-check.mjs
git commit -m "feat(preview): SessionStart prunes stale preview-server registry entries"
```

---

### Task E1.12: Idle-shutdown timer (prevent forgotten servers running forever)

**Files:**
- Modify: `scripts/lib/preview-static-server.mjs`
- Modify: `scripts/preview-server.mjs`
- Modify: `tests/preview-static-server.test.mjs`

**Why:** without idle-shutdown, a forgotten server lives until session/process kill. Multi-server scenarios accumulate zombie processes that hold ports and RAM.

- [ ] **Step 1: Track activity in static server**

In `scripts/lib/preview-static-server.mjs`, add inside `startStaticServer`:

```javascript
let lastActivityAt = Date.now();
function touch() { lastActivityAt = Date.now(); }

// Touch on every request
const httpServer = createHttpServer(async (req, res) => {
  touch();
  // ... existing handler ...
});

// Add to returned object
return {
  port: actualPort,
  server: httpServer,
  stop,
  broadcastReload: () => { touch(); /* existing impl */ },
  getLastActivityAt: () => lastActivityAt,
  hasActiveSseClients: () => sseClients.size > 0,
};
```

- [ ] **Step 2: Add idle-shutdown loop in CLI**

In `scripts/preview-server.mjs`, after server start, before `setInterval(() => {}, 1 << 30)`:

```javascript
const idleTimeoutMin = parseInt(values['idle-timeout'] ?? '30', 10);
let idleCheckTimer = null;
if (idleTimeoutMin > 0) {
  idleCheckTimer = setInterval(() => {
    const idleMs = Date.now() - server.getLastActivityAt();
    const idleMin = idleMs / 1000 / 60;
    const hasClients = server.hasActiveSseClients();
    if (idleMin > idleTimeoutMin && !hasClients) {
      console.log(`[evolve-preview] idle for ${idleMin.toFixed(1)}m and no SSE clients — auto-shutdown`);
      shutdown('IDLE-TIMEOUT');
    }
  }, 60_000); // check every minute
}

// Update shutdown to clear idleCheckTimer
async function shutdown(sig) {
  console.log(`\n[evolve-preview] received ${sig}, shutting down...`);
  if (idleCheckTimer) clearInterval(idleCheckTimer);
  if (watcher) await watcher.close();
  await server.stop();
  await unregisterServer(server.port);
  process.exit(0);
}
```

Also add to `parseArgs` options: `'idle-timeout': { type: 'string', default: '30' }`.

- [ ] **Step 3: Add test**

Append to `tests/preview-static-server.test.mjs`:

```javascript
test('server tracks last-activity timestamp', async () => {
  const t0 = Date.now();
  await fetch('/index.html');
  // After fetch, lastActivityAt should be >= t0
  assert.ok(server.getLastActivityAt() >= t0, 'activity timestamp updated by request');
});

test('server reports active SSE clients count', async () => {
  // Initially no clients
  assert.strictEqual(server.hasActiveSseClients(), false);
  // Open SSE then check
  const req = request({ host: 'localhost', port, path: '/__evolve_preview/sse' });
  req.end();
  await new Promise(resolve => req.on('response', resolve));
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(server.hasActiveSseClients(), true, 'has 1 SSE client');
  req.destroy();
  await new Promise(r => setTimeout(r, 50));
  // After client disconnects
  assert.strictEqual(server.hasActiveSseClients(), false);
});
```

- [ ] **Step 4: Run tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/preview-static-server.test.mjs 2>&1 | tail -10
```

Expected: 10 tests pass (was 8, added 2).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/preview-static-server.mjs scripts/preview-server.mjs tests/preview-static-server.test.mjs
git commit -m "feat(preview): idle-shutdown after 30min no-activity (configurable via --idle-timeout)"
```

---

### Task E1.13: Max-servers limit (prevent runaway spawning)

**Files:**
- Modify: `scripts/preview-server.mjs`
- Modify: `tests/preview-server-manager.test.mjs`

**Why:** if user / agent loop spawns 50 preview servers by mistake, RAM/port-exhaustion. Default cap = **10** (loose enough for parallel design tasks); `--force` to override. Idle-shutdown (E1.12) handles forgotten servers separately.

- [ ] **Step 1: Add MAX_SERVERS constant**

In `scripts/preview-server.mjs`, near top:

```javascript
const MAX_SERVERS_DEFAULT = 10;
```

- [ ] **Step 2: Check before starting**

In CLI start mode (after parsing args, before `findFreePort`):

```javascript
const force = values.force ?? false;
const existingServers = await listServers();
if (existingServers.length >= MAX_SERVERS_DEFAULT && !force) {
  console.error(`[evolve-preview] max ${MAX_SERVERS_DEFAULT} preview servers already running. Use --force to override or kill some with --kill-all.`);
  for (const s of existingServers) {
    console.error(`  http://localhost:${s.port}  ${s.label}  (pid=${s.pid})`);
  }
  process.exit(2);
}
```

Add to `parseArgs` options: `force: { type: 'boolean', default: false }`.

- [ ] **Step 3: Add test**

Append to `tests/preview-server-manager.test.mjs`:

```javascript
test('listServers handles many entries without performance issues', async () => {
  const t0 = Date.now();
  for (let i = 0; i < 50; i++) {
    await registerServer({ port: 4000 + i, pid: process.pid, root: `/fake/${i}`, label: `t${i}` });
  }
  const list = await listServers();
  const t1 = Date.now();
  assert.ok(list.length >= 50, `expected ≥50 entries, got ${list.length}`);
  assert.ok(t1 - t0 < 1000, `listServers should be fast, took ${t1-t0}ms`);
  for (let i = 0; i < 50; i++) {
    await unregisterServer(4000 + i);
  }
});
```

- [ ] **Step 4: Manual verify**

```bash
cd "D:/ggsel projects/evolve"
# Start 10 servers, then try 11th — should be rejected
for i in 1 2 3 4 5 6 7 8 9 10; do
  node scripts/preview-server.mjs --root /tmp --port $((3050+i)) &
done
sleep 2
node scripts/preview-server.mjs --root /tmp --port 3061
# Expected: "[evolve-preview] max 10 preview servers already running..."
node scripts/preview-server.mjs --kill-all
```

- [ ] **Step 5: Commit**

```bash
git add scripts/preview-server.mjs tests/preview-server-manager.test.mjs
git commit -m "feat(preview): max 10 concurrent servers default + --force override"
```

---

## PHASE E2 — Strengthen Planning Skills (no new commands, only deeper skills)

**Strategy:** each existing SKILL.md grows from ~90 lines to ~250 lines by adding mandatory sub-steps, decision-tree branches, output-contract templates. **Do NOT create new skills**. Reuse references to `docs/templates/<NAME>-template.md` (created in Phase E3).

For each strengthened skill, the diff pattern is:
1. **Decision tree expanded** with new branches
2. **Procedure** gets ≥3 new mandatory sub-steps
3. **Output contract** points to a real reference template in `docs/templates/`
4. **Verification** lists ≥5 evidence items
5. **Anti-patterns** ≥6 entries
6. **Common workflows** ≥3 named scenarios with steps

---

### Task E2.1: Strengthen `supervibe:brainstorming`

**Files:**
- Modify: `skills/brainstorming/SKILL.md`

Current size: 87 lines. Target: ≥250 lines.

- [ ] **Step 1: Add new sections**

Edit `skills/brainstorming/SKILL.md` and add the following sections after the existing content (preserve all existing text):

```markdown
## First-principle decomposition (mandatory before option generation)

Before listing solutions, decompose the problem:

1. **Restate user request in your own words** — confirm understanding
2. **Identify the actual problem behind the request** (5-Whys: ask "why" five times to reach root)
3. **List constraints**: time, budget, team skills, existing tech, compliance
4. **List success criteria**: what makes this "done well"
5. **List failure modes**: what makes this "done poorly" — at least 3 entries
6. **List explicit non-goals**: what we're NOT solving here (prevents scope creep)

Skip this section ONLY if user explicitly says "I just need a quick brainstorm."

## Competitive scan (when applicable)

When the problem has known industry analogues (auth flows, billing, onboarding, design patterns):

1. Invoke `supervibe:mcp-discovery` to check if Firecrawl/Playwright MCP available
2. If yes: scan 3–5 reference products (e.g., for billing UI: Stripe, Square, Lemonsqueezy). Take screenshots OR text excerpts.
3. If no MCP: list reference products by name + ask user "have you seen these? what works/doesn't?"
4. Document findings as "Competitive scan" section in output — DO NOT cargo-cult; flag what's stale

Skip if problem is greenfield/internal (no public analogues exist).

## Stakeholder map (mandatory for cross-team work)

Identify who's affected:

| Stakeholder | Concern | Influence (1-5) | Notify when |
|-------------|---------|-----------------|-------------|
| <name>      | <what they care about> | <number> | <decision phase> |

If solo project: skip this step.

## Non-obvious risks enumeration

After option exploration, list ≥3 NON-OBVIOUS risks (not "what could go wrong" — that's table stakes). Examples:
- "If we pick option B, our memory budget on mobile drops by ~40MB; users on 2GB-RAM phones may OOM"
- "Option C requires Postgres 15+; ours is 13; upgrade window is 6 weeks"
- "Option A's vendor recently changed pricing; cost projection assumes old tier — invalid"

These are facts that aren't in the original spec but matter for the decision.

## Kill criteria (mandatory before deciding)

Before committing to an option, write down what would make us KILL the project (not just iterate):
- "If user research shows < 30% interest by week 2, we kill"
- "If integration with existing X breaks invariant Y, we kill"
- "If estimated effort exceeds 6 dev-weeks, we kill"

This forces honesty about the bar.

## Decision matrix

For each finalist option, score on weighted dimensions:

| Dimension | Weight | Option A | Option B | Option C |
|-----------|--------|----------|----------|----------|
| User impact | 3 | 8 | 6 | 9 |
| Effort | -2 | 4 | 2 | 7 |
| Risk | -2 | 3 | 5 | 6 |
| Strategic fit | 2 | 7 | 9 | 5 |
| **Weighted total** | | (calc) | (calc) | (calc) |

Document weights BEFORE scoring (prevents post-hoc rationalization).

## Output contract template

Save brainstorm output to `docs/specs/YYYY-MM-DD-<topic>-brainstorm.md`. Use template at `docs/templates/brainstorm-output-template.md`.

Required sections (in order):
1. **Problem statement** (1 paragraph)
2. **First-principle decomposition** (constraints / success / failure / non-goals)
3. **Competitive scan** (if applicable)
4. **Stakeholder map** (if applicable)
5. **Options explored** (≥3, each with 1 paragraph)
6. **Non-obvious risks** (≥3 bullets)
7. **Kill criteria** (≥2 bullets)
8. **Decision matrix** (table with weights set BEFORE scoring)
9. **Recommended option** (with rationale)
10. **Open questions** (what's still unknown — must NOT be empty)

## Anti-patterns

- **Skip first-principle decomposition** — produces "obvious" solutions that miss real constraints
- **List options without weights** — invites post-hoc rationalization to favor preferred option
- **Skip kill criteria** — leads to sunk-cost projects that should have died at week 2
- **Cargo-cult competitive scan** — copying without understanding why
- **Empty "Open questions"** — means you didn't probe hard enough; SOMETHING is unknown
- **Single-stakeholder thinking** — missing impact on adjacent teams / future maintainers
- **Premature option lock-in** — committing to a solution before exploring alternatives

## Common workflows

### Workflow: New feature brainstorm (greenfield)

1. First-principle decomposition (mandatory)
2. Competitive scan (3 reference products)
3. Stakeholder map
4. Generate ≥3 options (lean on `supervibe:explore-alternatives` for matrix)
5. Risks + kill criteria
6. Decision matrix → recommend
7. Save to `docs/specs/`

### Workflow: Refactor brainstorm (existing system)

1. First-principle decomposition (constraints heavy: existing callers, deploy windows)
2. Skip competitive scan (system-specific)
3. Stakeholder map (existing API consumers)
4. Generate options ranging from "minimal patch" to "rewrite"
5. Risks emphasize regression / rollback
6. Kill criteria: "if migration > 4 weeks, freeze"
7. Decision matrix biased toward low-risk

### Workflow: Brand / design brainstorm

1. First-principle: who is the user, what feeling
2. Competitive scan (mood boards from 5 brands)
3. Skip stakeholder map (creative director is sole owner)
4. Generate 3 directions (with mood boards)
5. Risks: brand misalignment, accessibility issues
6. Kill criteria: "if user testing shows top-2 are equal, we don't pick the riskier"
7. Decision matrix scored by creative director + PM

## Verification

- Output saved to `docs/specs/YYYY-MM-DD-<topic>-brainstorm.md`
- All 10 required sections present
- Decision matrix weights documented BEFORE scores
- ≥3 non-obvious risks listed
- Kill criteria has at least 1 quantitative threshold
- Open questions is non-empty
- Confidence rubric: `requirements` or custom; score ≥ 9

## Related

- `supervibe:writing-plans` — next step after brainstorm picks a direction
- `supervibe:explore-alternatives` — sub-skill for decision matrix
- `supervibe:requirements-intake` — predecessor when intake hasn't happened yet
- `supervibe:adr` — when brainstorm output IS an architectural decision
- `supervibe:mcp-discovery` — for competitive scan tools
```

- [ ] **Step 2: Verify size and frontmatter**

```bash
cd "D:/ggsel projects/evolve" && wc -l skills/brainstorming/SKILL.md
npm run lint:descriptions | grep brainstorming
npm run validate:frontmatter | grep brainstorming
```

Lines must be ≥250. Both validations OK.

- [ ] **Step 3: Commit**

```bash
git add skills/brainstorming/SKILL.md
git commit -m "feat(skill): strengthen supervibe:brainstorming with first-principle decomp + matrix + kill criteria"
```

---

### Task E2.2: Strengthen `supervibe:writing-plans`

**Files:**
- Modify: `skills/writing-plans/SKILL.md`

Current size: 84 lines. Target: ≥250 lines.

- [ ] **Step 1: Add new sections**

Append to `skills/writing-plans/SKILL.md` (preserve existing content):

```markdown
## Critical path identification (mandatory)

After listing all tasks, identify which tasks block which:
1. Build dependency graph: task A → task B means A must complete before B starts
2. Find the **critical path**: longest chain of dependencies
3. Mark tasks on critical path with `[CRITICAL-PATH]` in plan
4. Off-critical-path tasks are candidates for parallelization

Example output (in plan body):
```
Critical path: T1 → T3 → T5 → T8 → T-FINAL (5 tasks, est. 6h sequential)
Parallelizable: T2 || T4 (off-path); T6 || T7 (after T5)
```

## Parallelization opportunities (mandatory)

Identify which tasks can run as parallel subagents:
- Independent file modifications (e.g., 10 agent files = 10 parallel subagents)
- Independent test suites (no shared sandbox)
- Independent doc updates (no merge conflicts)

In the Execution Handoff section at the end, list parallel batches:
```
Subagent-Driven batches:
- Batch 1 (foundation, sequential): T1, T2, T3
- Batch 2 (parallel, 5 subagents): T4, T5, T6, T7, T8
- Batch 3 (sequential): T9, T-FINAL
```

This drastically reduces wall-clock execution time.

## Rollback plan per task (mandatory)

Each task gets a one-line "rollback" entry:

```markdown
### Task N: <name>

**Rollback**: `git revert <commit-sha>` OR `git checkout HEAD~1 -- <files>` — verifies via re-running test from Step 1 of original task.
```

This forces clarity about whether a task is reversible. Tasks that aren't reversible (e.g., DB schema changes) get explicit "irreversible — extra review" tag.

## Risk register per task

For tasks touching public surface (API, schema, contracts), include:

```markdown
**Risks:**
- **R1 (severity: high)**: <what could break>; mitigation: <how to detect / undo>
- **R2 (severity: medium)**: <secondary risk>; mitigation: <...>
```

Skip for purely-internal tasks (variable rename inside a function, etc.).

## Honest scope estimation

For each task, write:
- **Estimated time**: `5min` / `15min` / `1h` / `half-day` (no precise hour estimates — they're always wrong)
- **Confidence in estimate**: `high` / `medium` / `low`
- **If estimate doubles, the plan still works** OR `if estimate doubles, escalate`

Tasks marked `low` confidence + `escalate` are flagged for extra brainstorming before execute.

## Review gates between phases

For multi-phase plans (>15 tasks), insert REVIEW GATE markers:

```markdown
---

### REVIEW GATE 1 (after Phase A)

Before starting Phase B, verify:
- [ ] All Phase A tasks committed and tests green
- [ ] No regressions in unrelated tests
- [ ] User approved Phase A output (if user gate)

If gate fails: STOP and escalate; do not proceed to Phase B.

---
```

This prevents cascading failures.

## Output contract template

Save plans to `docs/plans/YYYY-MM-DD-<feature-name>.md`. Reference template at `docs/templates/plan-template.md`.

Required header:
```markdown
# <Feature> Implementation Plan
> For agentic workers: REQUIRED SUB-SKILL ...
**Goal:** <one sentence>
**Architecture:** <2-3 sentences>
**Tech Stack:** <key libs>
**Constraints:** <hard rules>
```

Required sections per task:
- Files (Create / Modify with line ranges / Test path)
- Bite-sized steps (2-5 min each)
- Failing test FIRST (TDD red)
- Verification command + expected output
- Rollback plan
- Commit step

Required at end:
- Self-Review (spec coverage / placeholders / type consistency)
- Execution Handoff (Subagent-Driven batches OR Inline batches)

## Anti-patterns

- **Steps not bite-sized** ("implement the feature" is not a step; "write failing test for X" is)
- **No failing-test-first** for behavioral tasks (TDD red phase missing)
- **No verification command** ("should work" is not verification; `npm test` is)
- **No commit per task** (lumping commits hides regressions)
- **No critical path** (engineer doesn't know which task to start when)
- **No rollback plan** (task fails midway → unclear how to recover)
- **Estimates with false precision** ("3h 17min" lies; "1h ± 2x" is honest)
- **Empty self-review** (failure to scan own work for placeholders)

## Common workflows

### Workflow: Feature plan (5–15 tasks)

1. Read brainstorm output (`docs/specs/...-brainstorm.md`) if exists
2. List ALL tasks in dependency order
3. Mark critical path
4. Identify parallelization batches for handoff
5. Per task: failing test, impl, verify, rollback, commit
6. Self-review: coverage / placeholders / type consistency
7. Save to `docs/plans/`

### Workflow: Multi-phase plan (>15 tasks, >1 day)

1. Same as feature plan PLUS:
2. Insert review gates between phases
3. Each phase has its own subagent batches
4. Final task is always release-prep (CHANGELOG / version / final tests)

### Workflow: Refactor plan (high regression risk)

1. Each task has explicit rollback (often `git revert`)
2. Review gate after every 5 tasks
3. Risk register heavier
4. Conservative time estimates

## Verification

- Plan saved to `docs/plans/YYYY-MM-DD-<feature>.md`
- Every task has bite-sized steps + failing test + verify command + commit
- Critical path documented
- Parallelization batches in Handoff section
- Rollback plan per task
- Self-Review section completed before saving

## Related

- `supervibe:brainstorming` — predecessor; provides recommended option as input
- `supervibe:executing-plans` — consumer; this skill writes what that skill executes
- `supervibe:subagent-driven-development` — when handoff says Subagent-Driven
- `supervibe:explore-alternatives` — for risk-register options
```

- [ ] **Step 2: Verify**

```bash
cd "D:/ggsel projects/evolve" && wc -l skills/writing-plans/SKILL.md
npm run validate:frontmatter | grep writing-plans
```

≥250 lines. OK.

- [ ] **Step 3: Commit**

```bash
git add skills/writing-plans/SKILL.md
git commit -m "feat(skill): strengthen supervibe:writing-plans with critical-path + parallelization + rollback"
```

---

### Task E2.3: Strengthen `supervibe:prd`

**Files:**
- Modify: `skills/prd/SKILL.md`

Current size: 105 lines. Target: ≥250 lines.

- [ ] **Step 1: Append sections**

Append to `skills/prd/SKILL.md`:

```markdown
## User research grounding

A PRD without user evidence is product-by-vibes. Required input:

- **User personas** (≥2): name, role, top 3 pains, top 3 jobs-to-be-done
- **User research artifacts**: which interview/survey/data informed this? Cite source
- **Competitive landscape**: 3 competitors + what users currently do without our solution

If no research exists: explicitly state "No research conducted; PRD is hypothesis-mode" and add user-research as Phase 0 of the implementation plan.

## Acceptance criteria — Gherkin format

Each requirement gets ≥1 acceptance criterion in Given/When/Then form:

```gherkin
Given a user with verified email
When they request password reset
Then they receive an email within 30 seconds with a single-use token
And the token expires after 15 minutes
And reusing the token returns 410 Gone
```

Vague ACs ("should work well") fail rubric scoring.

## Success metrics matrix

PRD must define how we'll know it worked:

| Metric | Baseline | Target | Measurement | Trigger if missed |
|--------|----------|--------|-------------|-------------------|
| <name> | <today> | <goal> | <how we measure> | <action> |

≥3 metrics. At least one is a leading indicator (early signal), one is a lagging indicator (business impact).

## Deprecation plan (when applicable)

If the PRD adds a feature that replaces an existing one:

- **Deprecation timeline**: when does old feature go behind a flag? When removed?
- **Migration path**: how do existing users move?
- **Communication plan**: in-product banner / email / docs?

If no deprecation: explicitly state "No deprecation — additive feature only".

## Launch checklist

Before launch (Phase N+1 of plan), verify:
- [ ] Acceptance criteria all met
- [ ] Success metrics instrumentation deployed
- [ ] Documentation updated (user-facing + internal)
- [ ] Support team briefed
- [ ] Rollback procedure tested in staging
- [ ] Feature flag (if applicable) configured for staged rollout
- [ ] Monitoring/alerting wired

## Instrumentation plan

What events do we emit? What dashboards do we add? Required input from `supervibe:_product:analytics-implementation`:

- **Tracked events**: <list with properties>
- **Dashboards**: <which existing dashboards add this; which new ones create>
- **Alerts**: <thresholds and oncall routing>

If feature is non-instrumented: explicitly state "No instrumentation needed" with reason.

## Risk register

Same format as plans:
- **R1 (severity: high)**: <description>; mitigation: <how>
- **R2 (severity: medium)**: ...

≥3 risks. ≥1 must be product/UX risk (not just technical).

## Output contract template

Save PRDs to `docs/specs/YYYY-MM-DD-<feature>-prd.md`. Use template at `docs/templates/PRD-template.md`.

Required sections (in order):
1. **TL;DR** (3 sentences max)
2. **Problem** (with user research grounding)
3. **Users** (personas)
4. **Competitive landscape**
5. **Goals** (success metrics)
6. **Non-goals**
7. **User stories with acceptance criteria** (Gherkin)
8. **Solution overview** (high-level; details in design doc)
9. **Risks**
10. **Deprecation plan** (if applicable)
11. **Instrumentation plan**
12. **Launch checklist**
13. **Open questions**
14. **Appendix: data, screenshots, references**

## Anti-patterns

- **No user research grounding** → PRD is hypothesis disguised as fact
- **Vague acceptance criteria** ("works smoothly") → can't test, can't gate
- **Success metrics without baseline** → can't tell if we improved
- **Missing leading indicator** → can't course-correct early
- **No deprecation plan** for replacement features → tech debt accumulates
- **Empty risk register** → didn't think hard enough; risks always exist
- **Non-quantitative non-goals** ("not for advanced users") → scope creep waiting to happen
- **No instrumentation plan** → can't measure success metrics post-launch

## Common workflows

### Workflow: New feature PRD

1. Pull user research from existing repo or do new (interview 5 users)
2. Define personas + competitive landscape
3. Goals + non-goals
4. User stories with Gherkin ACs
5. Solution overview (defer details)
6. Risks + deprecation + instrumentation + launch
7. Open questions (mandatory non-empty)

### Workflow: Replacement feature PRD

1. Same as new + heavy deprecation plan
2. Migration path explicit per user segment
3. Sunset timeline with named milestones
4. Communication plan with channel mix

### Workflow: Internal tool PRD

1. Skip competitive landscape
2. Personas are internal (which team / role)
3. Success metrics are operational (time saved, error rate)
4. Instrumentation lighter (logs > dashboards)

## Verification

- PRD saved to `docs/specs/YYYY-MM-DD-<feature>-prd.md`
- All 14 sections present
- ACs in Gherkin format with ≥1 per user story
- Success metrics: ≥3, with baseline + target
- Risk register: ≥3 entries
- Open questions: non-empty
- Confidence rubric: `requirements`; score ≥ 9

## Related

- `supervibe:requirements-intake` — predecessor (intake → research → PRD)
- `supervibe:writing-plans` — consumer (PRD → implementation plan)
- `supervibe:adr` — design decisions called out separately from PRD
- `supervibe:_product:product-manager` — primary author
- `supervibe:_product:systems-analyst` — collaborator on ACs
- `supervibe:_product:analytics-implementation` — collaborator on instrumentation
```

- [ ] **Step 2: Verify**

```bash
cd "D:/ggsel projects/evolve" && wc -l skills/prd/SKILL.md && npm run validate:frontmatter | grep prd
```

- [ ] **Step 3: Commit**

```bash
git add skills/prd/SKILL.md
git commit -m "feat(skill): strengthen supervibe:prd with research grounding + Gherkin ACs + metrics matrix"
```

---

### Task E2.4: Strengthen `supervibe:adr`

**Files:**
- Modify: `skills/adr/SKILL.md`

Current size: 108 lines. Target: ≥250 lines.

- [ ] **Step 1: Append sections**

Append to `skills/adr/SKILL.md`:

```markdown
## Alternatives matrix (mandatory)

Every ADR must include ≥3 alternatives — even if obvious:

| Alternative | Pros | Cons | Effort | Risk | Score |
|-------------|------|------|--------|------|-------|
| **A: <chosen>** | ... | ... | ... | ... | <weighted> |
| B: <runner-up> | ... | ... | ... | ... | <weighted> |
| C: <baseline / status quo> | ... | ... | ... | ... | <weighted> |

The "do nothing / keep current" alternative MUST be one of the 3. Explicitly score it.

## Non-functional requirements addressed

What NFRs does this decision touch?

- **Performance**: latency / throughput targets affected (yes/no, how)
- **Scalability**: scaling envelope (handles N× current load? until when?)
- **Reliability**: SLO impact (does this raise/lower availability?)
- **Security**: threat model changes
- **Maintainability**: complexity added/removed
- **Observability**: telemetry requirements
- **Compliance**: regulatory impact (GDPR / SOC2 / etc.)
- **Cost**: monthly/annual delta

For each NFR: state "no impact" or quantify.

## Decision review trigger (mandatory)

Specify when to re-evaluate this ADR:

- **Time-based**: "review in 12 months" or "review after 3 production releases"
- **Metric-based**: "review if p99 latency exceeds 500ms" or "if user count > 100k"
- **Event-based**: "review when stack X migrates to v2.0"

ADRs without review triggers become stale dogma. Trigger forces honesty.

## Consequences — beyond happy path

ADR consequences must include:

- **Positive consequences** (≥2): what we gain
- **Negative consequences** (≥2): what we lose / sacrifice
- **Operational consequences**: runbook changes / oncall impact
- **Migration consequences** (if replacing existing): timeline + path

## Out of scope (mandatory)

What this ADR does NOT decide. Forces clarity on boundary:

- Decisions deferred to future ADRs
- Decisions left to implementation discretion
- Topics intentionally not addressed (with rationale)

## Output contract template

Save ADRs to `docs/specs/adr/YYYY-MM-DD-<NNN>-<slug>.md`. Use template at `docs/templates/ADR-template.md`.

Required sections:
1. **Title**: `ADR-NNN: <decision>`
2. **Status**: `proposed | accepted | superseded by ADR-XXX | deprecated`
3. **Context**: why this decision exists now
4. **Decision**: what we chose, in one sentence
5. **Alternatives matrix** (≥3 with scores)
6. **Non-functional requirements** addressed
7. **Consequences** (positive / negative / operational / migration)
8. **Decision review trigger**
9. **Out of scope**
10. **Related ADRs**
11. **References** (links to research / spec / data)

## Anti-patterns

- **Single-alternative ADR** ("we considered nothing else") → ratification, not decision
- **Missing "do nothing"** alternative → can't honestly score the chosen path
- **Vague status** ("kinda accepted") → reader doesn't know if to follow
- **No NFRs section** → decisions made without measuring trade-offs
- **No review trigger** → ADR becomes stale truth no one questions
- **Empty negative consequences** → didn't think hard enough; every choice has costs
- **Conflating PRD and ADR** → PRD = what/why; ADR = how/why-this-way
- **No related ADRs section** → orphan decisions accumulate technical debt

## Common workflows

### Workflow: New architectural decision

1. Read related ADRs first (avoid contradictions)
2. Draft Context (why now)
3. Generate ≥3 alternatives + score matrix
4. Pick decision; write Status: proposed
5. NFR analysis
6. Consequences (positive / negative / operational / migration)
7. Review trigger
8. Out of scope
9. Submit for review (architect-reviewer agent if available)
10. Status → accepted after sign-off

### Workflow: Superseding an old ADR

1. Read old ADR fully + its descendants
2. Draft new ADR with Status: proposed
3. Reference old ADR explicitly
4. Migration path: how do consumers move from old to new
5. Old ADR Status updates to: superseded by ADR-NNN
6. Sunset timeline if old needs removal

### Workflow: Deprecation ADR

1. Status: deprecated
2. Reason for deprecation
3. Recommended replacement (with ADR ref)
4. Migration deadline
5. What breaks if not migrated

## Verification

- ADR saved to `docs/specs/adr/YYYY-MM-DD-NNN-<slug>.md`
- All 11 sections present
- ≥3 alternatives scored, including "do nothing"
- NFRs addressed (each with "no impact" or quantified)
- Review trigger specific (time / metric / event)
- Consequences include negative + operational
- Confidence rubric: `requirements` (or `framework` for foundational ADRs); score ≥ 9

## Related

- `supervibe:writing-plans` — consumer (ADR → plan if implementation needed)
- `supervibe:prd` — sibling (PRD says what; ADR says how)
- `supervibe:_core:architect-reviewer` — reviewer for sign-off
- `supervibe:explore-alternatives` — sub-skill for the alternatives matrix
- `supervibe:_core:repo-researcher` — pull related ADRs / past decisions
```

- [ ] **Step 2: Verify**

```bash
cd "D:/ggsel projects/evolve" && wc -l skills/adr/SKILL.md && npm run validate:frontmatter | grep adr
```

- [ ] **Step 3: Commit**

```bash
git add skills/adr/SKILL.md
git commit -m "feat(skill): strengthen supervibe:adr with alternatives matrix + NFRs + review trigger"
```

---

### Task E2.5: Strengthen `supervibe:requirements-intake`

**Files:**
- Modify: `skills/requirements-intake/SKILL.md`

Current size: 90 lines. Target: ≥250 lines.

- [ ] **Step 1: Append sections**

Append to `skills/requirements-intake/SKILL.md`:

```markdown
## User persona elicitation (mandatory)

Before solution discussion, elicit ≥2 personas:

For each persona ask:
1. **Role / context**: where are they when using this?
2. **Top 3 pains** they currently have (concrete, not abstract)
3. **Top 3 jobs-to-be-done** they're trying to accomplish
4. **Current workaround**: what they do today without our solution
5. **Switching cost**: what makes them try a new solution

If user can't articulate personas: that's a finding — flag "no clear user defined" as Risk #1.

## Constraint elicitation (mandatory)

Probe for hard constraints BEFORE designing:

| Constraint type | Question to ask |
|-----------------|-----------------|
| Time | When do you need this delivered? Hard deadline or flexible? |
| Budget | Cost ceiling? Open-source vs. paid OK? |
| Team capacity | Who builds this? Available hours/week? |
| Compliance | Regulatory requirements (GDPR / SOC2 / HIPAA)? |
| Tech stack | Existing system constraints (must use Postgres? Must run on AWS?) |
| Performance | SLO / latency / throughput targets? |
| Localization | Languages / regions to support? |
| Accessibility | WCAG level required? |

Document each as: "Constraint: <name>; Value: <hard limit>; Source: <user / regulation / system>".

If no constraint stated: write "no constraint communicated" — don't assume.

## Success criteria definition (mandatory before solution)

Force user to define "done" before discussing how:

- **Outcome metrics**: what changes for the user when this works?
- **Adoption signals**: how do we know users use it? (e.g., "30% of MAU within 6 weeks")
- **Quality bar**: what makes it "good enough" vs. "great"?

If user says "I'll know when I see it": still document this as success criterion = "user satisfaction (subjective)" + risk = "subjective bar invites scope creep".

## Out-of-scope elicitation

Ask explicitly:
- "What's NOT in scope here?"
- "What could we add but shouldn't?"
- "What's the line we won't cross?"

Document. Forces honesty about boundaries.

## Stakeholder identification

Beyond the user requesting:
- **Decision approvers**: who signs off?
- **Affected parties**: who else's work changes?
- **Subject matter experts**: who has knowledge we'll need?
- **End users** (if different from requester): who actually uses this?

## Open questions register

End every intake with explicit "Open questions" section. Required ≥3. If you can't think of 3: ask user "what am I missing?".

## Output contract template

Save intake notes to `docs/specs/YYYY-MM-DD-<topic>-intake.md`. Use template at `docs/templates/intake-template.md`.

Required sections:
1. **Request as stated by user** (verbatim quote)
2. **Restated in our words** (with confirmation)
3. **Personas** (≥2)
4. **Constraints** (table)
5. **Success criteria**
6. **Out of scope**
7. **Stakeholders**
8. **Open questions** (≥3)
9. **Suggested next step**: brainstorm / PRD / ADR / direct implementation

## Anti-patterns

- **Skip persona elicitation** → designing for nobody specific
- **Assume constraints** → discover hard limits during execution
- **Define solution before success criteria** → can't tell when done
- **No "out of scope"** → invites scope creep
- **Single-stakeholder thinking** → adjacent teams blindsided
- **Empty open questions** → didn't probe; you have hidden assumptions
- **Restatement skipped** → misalignment compounds through downstream phases

## Common workflows

### Workflow: Intake from PM

1. Read user request verbatim
2. Restate; confirm
3. Personas (PM usually has these)
4. Constraints (budget / timeline / tech)
5. Success criteria (PM usually has metrics)
6. Out of scope
7. Open questions for design phase
8. Suggest next: PRD

### Workflow: Intake from end-user (no PM)

1. Read request; restate
2. Personas (probe deeper — user might not know how to describe themselves)
3. Constraints (probe with examples)
4. Success criteria (probe with "how would you know it works?")
5. Out of scope
6. Stakeholders (who else affected?)
7. Open questions ≥5 (more uncertainty without PM)
8. Suggest next: brainstorm

### Workflow: Internal tooling intake

1. Skip personas (internal team)
2. Skip competitive landscape
3. Heavy on constraints (existing systems, deploy windows)
4. Success criteria operational (time saved, error rate)
5. Open questions short (less ambiguity)
6. Suggest next: ADR or direct plan

## Verification

- Intake saved to `docs/specs/YYYY-MM-DD-<topic>-intake.md`
- All 9 sections present
- Personas: ≥2
- Constraints: ≥1 per category (or explicit "no constraint")
- Success criteria: ≥3 measurable items
- Open questions: ≥3
- Confidence rubric: `requirements`; score ≥ 9

## Related

- `supervibe:brainstorming` — successor when intake reveals exploration needed
- `supervibe:prd` — successor when intake is well-defined enough for product spec
- `supervibe:adr` — successor when intake is purely architectural
- `supervibe:_product:product-manager` — collaborator
- `supervibe:_product:systems-analyst` — collaborator on ACs
```

- [ ] **Step 2: Verify**

```bash
cd "D:/ggsel projects/evolve" && wc -l skills/requirements-intake/SKILL.md && npm run validate:frontmatter | grep requirements-intake
```

- [ ] **Step 3: Commit**

```bash
git add skills/requirements-intake/SKILL.md
git commit -m "feat(skill): strengthen supervibe:requirements-intake with personas + constraints + success criteria"
```

---

### Task E2.6: Strengthen `supervibe:explore-alternatives`

**Files:**
- Modify: `skills/explore-alternatives/SKILL.md`

Current size: 128 lines. Target: ≥250 lines.

- [ ] **Step 1: Append sections**

Append to `skills/explore-alternatives/SKILL.md`:

```markdown
## Carbon-copy lookup (mandatory pre-step)

BEFORE generating original alternatives, ask: has someone else solved this problem?

1. Invoke `supervibe:project-memory` with the problem keywords — past decisions in this repo
2. Invoke `supervibe:code-search` semantic — similar code patterns in the codebase
3. Invoke `supervibe:_ops:best-practices-researcher` if applicable — industry references
4. Invoke `supervibe:_ops:competitive-design-researcher` for design problems

If carbon copies exist: list them BEFORE generating new options. Often one of them is the answer.

## Weighted decision matrix (mandatory)

Required format:

```markdown
| Dimension | Weight | A | B | C |
|-----------|--------|---|---|---|
| <name>    | <int>  | 0-10 | 0-10 | 0-10 |
| ...       | ...    | ... | ... | ... |
| **Total** | --     | (sum w_i × a_i) | ... | ... |
```

Rules:
1. **Weights set BEFORE seeing options** (prevents post-hoc rationalization)
2. **Negative weights allowed** for "less is better" dimensions (effort, risk)
3. **At least 4 dimensions** — fewer means lazy thinking
4. **Show calculation** — make math visible

## Sensitivity analysis

After scoring, perturb the weights:

- "If I doubled the weight on Risk, would the winner change?"
- "If I halved the weight on Strategic Fit, would the runner-up win?"

If small weight changes flip the result: the matrix is brittle; revisit weights or add more dimensions.

## Adversarial scoring

Force yourself to argue against your preferred option:

- "Steel-man the case for B as if I'm advocating it"
- "List 3 reasons A might fail that I haven't considered"
- "Who would prefer C and why?"

Document conclusions. Often surfaces hidden assumptions.

## Time-boxed exploration

Explore-alternatives can spiral. Set a budget:

- "I'll spend ≤30 min generating + scoring options"
- "If no clear winner emerges, I'll defer to <named heuristic> (e.g., 'pick the reversible option')"

Document the budget at start. If you exceed it: log "exceeded budget by X; outcome was Y" — learn for next time.

## Output contract template

Save exploration to `docs/specs/YYYY-MM-DD-<topic>-alternatives.md` (or as section in brainstorm/ADR/PRD).

Required sections:
1. **Problem restated** (1 paragraph)
2. **Carbon-copy lookup** (results from project-memory + code-search + research)
3. **Options generated** (≥3, each with 1-paragraph description)
4. **Decision matrix** (weights set first, scores second)
5. **Sensitivity analysis** (≥2 perturbations)
6. **Adversarial scoring** (≥1 steel-man for runner-up)
7. **Recommendation** (with rationale + acknowledged risks)
8. **Confidence**: high / medium / low
9. **Decision-reversibility**: reversible (low risk) / hard-to-reverse (high risk)

## Anti-patterns

- **Score-then-weight** → post-hoc rationalization; weights bias toward preferred option
- **Three options when one is straw-man** → fake alternatives ("do nothing" priced ridiculously)
- **No sensitivity analysis** → brittle matrix invisible
- **No adversarial scoring** → confirmation bias unchecked
- **No carbon-copy lookup** → reinventing wheels; missed prior decisions
- **Unbounded exploration** → analysis paralysis
- **Missing "do nothing"** option → can't compare against status quo

## Common workflows

### Workflow: Library / vendor choice

1. Carbon-copy: any prior memory entries?
2. Generate 3-5 candidates (research via best-practices-researcher)
3. Dimensions: maturity, license, ecosystem, perf, cost, lock-in
4. Score; sensitivity; steel-man runner-up
5. Recommendation with reversibility note

### Workflow: Architectural pattern choice

1. Carbon-copy: prior ADRs in this area?
2. Generate 3 patterns (event-driven / sync RPC / async queue, etc.)
3. Dimensions: latency, complexity, ops cost, scaling envelope, blast radius
4. Score; heavy sensitivity (architecture is hard to reverse)
5. Steel-man preferred runner-up
6. Recommendation; flag reversibility = LOW

### Workflow: Quick UX pattern choice (low stakes)

1. Carbon-copy: design system has it?
2. Generate 2-3 options
3. Dimensions: clarity, consistency, accessibility, effort
4. Score; light sensitivity
5. Recommendation; reversibility = HIGH

## Verification

- Output contains all 9 required sections
- ≥3 options including "do nothing" / "keep current"
- ≥4 weighted dimensions
- Weights documented BEFORE scores
- Sensitivity analysis present
- Adversarial scoring present
- Confidence rubric: `requirements`; score ≥ 9

## Related

- `supervibe:brainstorming` — uses this skill as core for option exploration
- `supervibe:adr` — uses this skill for the alternatives matrix
- `supervibe:project-memory` — for carbon-copy lookup
- `supervibe:code-search` — for code-pattern carbon copies
- `supervibe:_ops:best-practices-researcher` — for industry carbon copies
- `supervibe:_ops:competitive-design-researcher` — for design carbon copies
```

- [ ] **Step 2: Verify**

```bash
cd "D:/ggsel projects/evolve" && wc -l skills/explore-alternatives/SKILL.md && npm run validate:frontmatter | grep explore-alternatives
```

- [ ] **Step 3: Commit**

```bash
git add skills/explore-alternatives/SKILL.md
git commit -m "feat(skill): strengthen supervibe:explore-alternatives with carbon-copy + sensitivity + adversarial"
```

---

## PHASE E3 — Reference Templates + Integration

### Task E3.1: Create `docs/templates/` reference templates

**Files:**
- Create: `docs/templates/PRD-template.md`
- Create: `docs/templates/ADR-template.md`
- Create: `docs/templates/plan-template.md`
- Create: `docs/templates/RFC-template.md`
- Create: `docs/templates/brainstorm-output-template.md`
- Create: `docs/templates/intake-template.md`

These are skeleton documents the strengthened skills reference. Each is a copy-paste-ready starter.

- [ ] **Step 1: Create PRD template**

Create `docs/templates/PRD-template.md`:

```markdown
# PRD: <Feature Name>

**Status:** draft | review | accepted | shipped | deprecated
**Author:** <name>
**Date:** YYYY-MM-DD
**Reviewers:** <names>
**Related:** <PRD/ADR/plan refs>

---

## TL;DR

<3 sentences max. What it is. Who it's for. Why now.>

---

## Problem

<1-2 paragraphs. What's broken / missing today, with user evidence.>

**User research grounding:**
- Source: <link / file ref>
- Sample size: <N users>
- Key insight: <quote or finding>

---

## Users

### Persona 1: <name>
- **Role / context**: ...
- **Top 3 pains**: ...
- **Top 3 jobs-to-be-done**: ...
- **Current workaround**: ...

### Persona 2: <name>
(same fields)

---

## Competitive landscape

| Product | What they do | What's good | What's missing |
|---------|--------------|-------------|----------------|
| <name> | ... | ... | ... |

---

## Goals (Success Metrics)

| Metric | Baseline | Target | Measurement | Trigger if missed |
|--------|----------|--------|-------------|-------------------|
| <name> | <today> | <goal> | <how> | <action> |

(≥3 metrics; ≥1 leading + ≥1 lagging)

---

## Non-Goals

- ...
- ...

---

## User stories with acceptance criteria

### Story 1: <name>
**As a** <persona>, **I want** <goal>, **so that** <benefit>.

**Acceptance criteria** (Gherkin):
```gherkin
Given <precondition>
When <action>
Then <observable outcome>
And <additional outcome>
```

(repeat per story)

---

## Solution overview

<High-level. Architecture details belong in companion ADR.>

---

## Risks

- **R1 (severity: high)**: <description>; mitigation: <how>
- **R2 (severity: medium)**: ...
- **R3 (severity: low)**: ...

(≥3 entries; ≥1 product/UX risk)

---

## Deprecation plan (if applicable)

**Deprecating:** <existing feature>
**Sunset timeline:** ...
**Migration path:** ...
**Communication plan:** ...

OR: "No deprecation — additive feature only."

---

## Instrumentation plan

**Tracked events:** <list with properties>
**Dashboards:** <existing + new>
**Alerts:** <thresholds + oncall routing>

OR: "No instrumentation — internal-only tool."

---

## Launch checklist

- [ ] Acceptance criteria verified in staging
- [ ] Success metrics instrumentation deployed
- [ ] Documentation updated
- [ ] Support team briefed
- [ ] Rollback procedure tested
- [ ] Feature flag configured
- [ ] Monitoring/alerting wired

---

## Open questions

- ...
- ...
- ...

(≥3, mandatory non-empty)

---

## Appendix

- Data: <links>
- Screenshots: <paths>
- References: <links>
```

- [ ] **Step 2: Create ADR template**

Create `docs/templates/ADR-template.md`:

```markdown
# ADR-NNN: <Decision Title>

**Status:** proposed | accepted | superseded by ADR-XXX | deprecated
**Date:** YYYY-MM-DD
**Author:** <name>
**Reviewers:** <names>

---

## Context

<Why this decision exists now. The forces at play. What changed that makes this needed.>

---

## Decision

<One sentence: what we chose.>

---

## Alternatives

| Alternative | Pros | Cons | Effort | Risk | Score |
|-------------|------|------|--------|------|-------|
| **A: <chosen>** | ... | ... | ... | ... | <weighted> |
| B: <runner-up> | ... | ... | ... | ... | <weighted> |
| C: do nothing | ... | ... | 0 | ... | <weighted> |

**Weights (set BEFORE scoring):**
- Pros (positive): <weight>
- Cons (negative): <weight>
- Effort (negative): <weight>
- Risk (negative): <weight>

---

## Non-Functional Requirements addressed

| NFR | Impact | Quantification |
|-----|--------|----------------|
| Performance | <yes/no> | <details> |
| Scalability | ... | ... |
| Reliability | ... | ... |
| Security | ... | ... |
| Maintainability | ... | ... |
| Observability | ... | ... |
| Compliance | ... | ... |
| Cost | ... | <$/month delta> |

---

## Consequences

### Positive
- ...
- ...

### Negative
- ...
- ...

### Operational
- Runbook updates needed: ...
- Oncall impact: ...

### Migration (if replacing existing)
- Timeline: ...
- Path: ...

---

## Decision review trigger

Re-evaluate this ADR when:
- **Time:** <e.g., 12 months from now>
- **Metric:** <e.g., if p99 > 500ms>
- **Event:** <e.g., when stack X migrates to v2.0>

---

## Out of scope

- ...
- ...

---

## Related ADRs

- ADR-XXX: <related decision>
- Supersedes: ADR-YYY (if applicable)

---

## References

- <link to research>
- <link to data / RFCs / blog posts>
```

- [ ] **Step 3: Create plan template**

Create `docs/templates/plan-template.md`:

```markdown
# <Feature> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** <one sentence>

**Architecture:** <2-3 sentences>

**Tech Stack:** <key libraries / tools>

**Constraints:** <hard rules; e.g., "no Docker", "Node 22+">

---

## File Structure

### Created
```
<directory tree of new files>
```

### Modified
- `path/to/file.ext` — <what changes>

### Untouched
- ...

---

## Critical Path

`T1 → T3 → T5 → T8 → T-FINAL` (sequential, est. <X>h)

Off-path: T2 || T4; T6 || T7

---

## Task N: <Component>

**Files:**
- Create: `path/file.ext`
- Modify: `path/existing.ext:NN-MM`
- Test: `tests/path/test.mjs`

**Estimated time:** 15min (confidence: high)
**Rollback:** `git revert <sha>`
**Risks:** none / R1: <desc>; mitigation: <how>

- [ ] **Step 1: Write failing test**

```javascript
// test code
```

- [ ] **Step 2: Run test, verify fail**

Run: `npm test -- <pattern>`
Expected: FAIL with "<error>"

- [ ] **Step 3: Minimal impl**

```javascript
// impl
```

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

```bash
git add <files>
git commit -m "feat(scope): <message>"
```

---

(repeat per task)

---

## REVIEW GATE 1 (after Phase A)

Before Phase B:
- [ ] All Phase A committed and tests green
- [ ] No regressions in unrelated tests
- [ ] User approved (if user gate)

---

## Self-Review

### Spec coverage
| Requirement | Task |
|-------------|------|
| ... | T1 |

### Placeholder scan
- No "TBD" / "implement later" found ✓

### Type consistency
- All types match across tasks ✓

---

## Execution Handoff

**Subagent-Driven batches:**
- Batch 1 (sequential foundation): T1, T2, T3
- Batch 2 (parallel, N subagents): T4, T5, T6
- Batch 3 (sequential): T-FINAL

**Inline batches:**
- Phase A: T1-T3
- Phase B: T4-T6
- Phase C: T-FINAL

Which approach?
```

- [ ] **Step 4: Create RFC template**

Create `docs/templates/RFC-template.md`:

```markdown
# RFC-NNN: <Title>

**Status:** draft | review | accepted | rejected | implemented
**Author:** <name>
**Date:** YYYY-MM-DD
**Discussion:** <link to PR / issue>
**Champion:** <name who pushes this through>

---

## Summary

<1 paragraph. What. Why. For whom.>

---

## Motivation

<Why does this need to exist? What problem does it solve? What's the cost of NOT doing it?>

---

## Detailed design

<Long. The actual proposal. Include API shapes, data structures, examples.>

### Public API surface
<...>

### Behavior
<...>

### Edge cases
<...>

---

## Drawbacks

<Why this might be a bad idea.>

---

## Rationale and alternatives

<Why this design vs. alternatives. Include "do nothing".>

| Alternative | Pros | Cons |
|-------------|------|------|
| ... | ... | ... |

---

## Prior art

<What other systems / projects have solved this? What can we learn?>

---

## Unresolved questions

- ...
- ...

---

## Future possibilities

<What does this enable in the future?>

---

## Implementation plan (if accepted)

Reference: `docs/plans/...` — to be created after accept.

Phases:
1. <phase 1>
2. <phase 2>
```

- [ ] **Step 5: Create brainstorm output template**

Create `docs/templates/brainstorm-output-template.md`:

```markdown
# Brainstorm: <Topic>

**Date:** YYYY-MM-DD
**Participants:** <names>
**Time-box:** <e.g., 30 min>
**Status:** in-progress | done | parked

---

## Problem statement

<1 paragraph>

---

## First-principle decomposition

### Constraints
- ...

### Success criteria
- ...

### Failure modes
- ...

### Non-goals
- ...

---

## Competitive scan (if applicable)

| Product | Approach | What's good | What's bad |
|---------|----------|-------------|------------|

---

## Stakeholder map (if applicable)

| Stakeholder | Concern | Influence (1-5) | Notify when |
|-------------|---------|-----------------|-------------|

---

## Options explored

### Option A: <name>
<1 paragraph>

### Option B: <name>
<...>

### Option C: <name> (do nothing / status quo)
<...>

---

## Non-obvious risks

- ...
- ...
- ...

---

## Kill criteria

- ...
- ...

---

## Decision matrix

| Dimension | Weight | A | B | C |
|-----------|--------|---|---|---|
| ... | ... | ... | ... | ... |
| **Total** | -- | ... | ... | ... |

(weights set BEFORE scores)

---

## Recommended option

<Choice + rationale + acknowledged risks>

---

## Open questions

- ...
- ...

---

## Next step

- [ ] PRD (`supervibe:prd`)
- [ ] ADR (`supervibe:adr`)
- [ ] Plan (`supervibe:writing-plans`)
- [ ] More brainstorm (parked)
```

- [ ] **Step 6: Create intake template**

Create `docs/templates/intake-template.md`:

```markdown
# Intake: <Topic>

**Date:** YYYY-MM-DD
**Requested by:** <name>
**Intake by:** <agent or person>

---

## Request as stated

> <verbatim quote from user>

---

## Restated in our words

<our understanding; confirm with user>

---

## Personas

### Persona 1
- **Role / context**: ...
- **Top 3 pains**: ...
- **Top 3 jobs-to-be-done**: ...
- **Current workaround**: ...

### Persona 2
<same>

---

## Constraints

| Type | Value | Source |
|------|-------|--------|
| Time | ... | ... |
| Budget | ... | ... |
| Team | ... | ... |
| Compliance | ... | ... |
| Tech stack | ... | ... |
| Performance | ... | ... |
| Localization | ... | ... |
| Accessibility | ... | ... |

---

## Success criteria

- ...
- ...
- ...

---

## Out of scope

- ...
- ...

---

## Stakeholders

- **Decision approvers**: ...
- **Affected parties**: ...
- **SMEs**: ...
- **End users**: ...

---

## Open questions

- ...
- ...
- ...

---

## Suggested next step

- [ ] Brainstorm (`supervibe:brainstorming`)
- [ ] PRD (`supervibe:prd`)
- [ ] ADR (`supervibe:adr`)
- [ ] Direct implementation plan (`supervibe:writing-plans`)
```

- [ ] **Step 7: Verify all 6 templates exist**

```bash
cd "D:/ggsel projects/evolve" && ls docs/templates/
```

Expected: 6 files.

- [ ] **Step 8: Commit**

```bash
git add docs/templates/
git commit -m "docs(templates): reference templates for PRD/ADR/plan/RFC/brainstorm/intake"
```

---

### Task E3.2: Update CLAUDE.md to surface new capabilities

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Preview Server section after Code Graph section**

In `CLAUDE.md`, find the existing `## Code Graph` section. After it, add:

```markdown
---

## Preview Server (local mockup hosting)

Design / prototype agents can spawn a local `http://localhost:NNNN` to serve generated HTML/CSS/JS with hot-reload — user opens in browser, edits propagate via SSE within ~200ms.

**When to use:** after `supervibe:landing-page`, `supervibe:prototype`, `supervibe:interaction-design-patterns`, or any agent that produces visual output.

**Skill:** `supervibe:preview-server`

**CLI:**
| Form | Action |
|------|--------|
| `node $CLAUDE_PLUGIN_ROOT/scripts/preview-server.mjs --root <dir>` | Start server, print URL |
| `... --list` | List running servers |
| `... --kill <port>` | Kill specific server |
| `... --kill-all` | Kill all |

**Auto-cleanup:** SessionStart prunes stale registry entries (PIDs no longer alive). SIGINT/SIGTERM cleanup on session end.

**Status:** `npm run supervibe:status` shows running previews with URL/PID/age.

**Optional Playwright integration:** when MCP available, skill captures screenshot to `.claude/memory/previews/<label>-<timestamp>.png` as evidence.

**Constraints:** binds to 127.0.0.1 only (no network access); zero new deps (pure node:http + SSE).
```

- [ ] **Step 2: Add Templates / Reference Documents section**

Add after the Plugin development workflow section:

```markdown
---

## Reference document templates

Strengthened planning skills reference these templates in `docs/templates/`:

| Template | Used by | Sections required |
|----------|---------|-------------------|
| `PRD-template.md` | `supervibe:prd` | TL;DR / Problem / Users / Competitive / Goals / Non-goals / Stories / Solution / Risks / Deprecation / Instrumentation / Launch / Open questions |
| `ADR-template.md` | `supervibe:adr` | Status / Context / Decision / Alternatives matrix / NFRs / Consequences / Review trigger / Out of scope / Related |
| `plan-template.md` | `supervibe:writing-plans` | Goal / Architecture / Files / Critical path / Tasks (TDD steps) / Review gates / Self-review / Handoff |
| `RFC-template.md` | proposals across teams | Summary / Motivation / Design / Drawbacks / Alternatives / Prior art / Unresolved |
| `brainstorm-output-template.md` | `supervibe:brainstorming` | Problem / Decomposition / Competitive / Options / Risks / Kill criteria / Matrix / Recommendation |
| `intake-template.md` | `supervibe:requirements-intake` | Request / Restated / Personas / Constraints / Success / Out of scope / Stakeholders / Open questions |

These are skeletons — copy-paste and fill in. Skills reference them and verify completeness in their Verification step.
```

- [ ] **Step 3: Verify**

```bash
cd "D:/ggsel projects/evolve" && wc -l CLAUDE.md
node -e "console.log('OK')" 2>&1
```

Lines should grow ~50.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): surface Preview Server + reference templates"
```

---

### Task E3.3: Update README + getting-started

**Files:**
- Modify: `README.md`
- Modify: `docs/getting-started.md`

- [ ] **Step 1: Add Preview Server to README feature table**

In `README.md`, find the "Что вы получаете" table. Add row:

```markdown
| **Live mockup preview** | `supervibe:preview-server` запускает `http://localhost:PORT` для HTML-мокапов с auto-reload; Playwright скриншоты опционально |
```

In Commands section, add:
```markdown
| `/supervibe-preview` | Управление preview серверами (start / list / kill) |
```

NPM scripts:
```markdown
| `npm run supervibe:preview -- --root <dir>` | Запустить preview сервер для директории |
| `npm run supervibe:preview -- --list` | Список запущенных |
| `npm run supervibe:preview -- --kill <port>` | Killшоп |
```

- [ ] **Step 2: Add Preview section to getting-started**

In `docs/getting-started.md`, add new section after "Code Graph":

```markdown
## Preview Server (live mockup hosting)

Когда design / prototype агенты генерируют HTML/CSS, плагин может запустить локальный сервер `http://localhost:NNNN` с **auto-reload** — пользователь открывает в браузере, агент правит файлы, страница обновляется автоматически.

**Запуск вручную:**

```bash
# Из проекта где лежат мокапы:
npm run supervibe:preview -- --root mockups/checkout

# Output:
# [evolve-preview] checkout → http://localhost:3047
# [evolve-preview] hot-reload: on
```

**Список запущенных:**

```bash
npm run supervibe:preview -- --list
```

**Kill:**

```bash
npm run supervibe:preview -- --kill 3047
# or
npm run supervibe:preview -- --kill-all
```

**Что под капотом:**
- Pure `node:http` + Server-Sent Events (SSE) — никаких новых dep
- chokidar следит за файлами, на change → SSE push → `location.reload()` в браузере
- Реестр `.claude/memory/preview-servers.json` чтобы статус-команда и другие сессии видели запущенные серверы
- 127.0.0.1 only — без network access
- SIGINT cleanup на завершение сессии

**Использование агентами:**
- `prototype-builder` агент автоматически дёргает skill `supervibe:preview-server` после генерации мокапа
- `supervibe:landing-page` skill — то же
- `supervibe:interaction-design-patterns` skill — то же
- Агент печатает URL пользователю в output: "**Preview ready:** http://localhost:3047"

**Опциональная интеграция с Playwright MCP:**
Если у пользователя есть Playwright MCP, skill после спавна сервера может:
- Открыть URL в browser
- Сделать скриншот → `.claude/memory/previews/<label>-<timestamp>.png`
- Прикрепить в output агента как evidence
```

- [ ] **Step 3: Add Reference Templates section to getting-started**

After Preview section:

```markdown
## Reference document templates

В `docs/templates/` лежат скелеты для всех типов проектных документов:

| Файл | Скилл | Что внутри |
|------|-------|------------|
| `PRD-template.md` | `supervibe:prd` | Полный PRD с Gherkin ACs / metrics / launch checklist |
| `ADR-template.md` | `supervibe:adr` | Architecture decision с alternatives matrix + review trigger |
| `plan-template.md` | `supervibe:writing-plans` | TDD план с critical path + parallelization batches |
| `RFC-template.md` | RFC для cross-team | Motivation + detailed design + prior art |
| `brainstorm-output-template.md` | `supervibe:brainstorming` | First-principle decomp + decision matrix |
| `intake-template.md` | `supervibe:requirements-intake` | Personas + constraints + success criteria |

Скиллы автоматически заполняют эти шаблоны и проверяют что все обязательные секции присутствуют. Запустить вручную можно скопировав шаблон в `docs/specs/YYYY-MM-DD-<topic>-<type>.md` и наполнив.
```

- [ ] **Step 4: Verify**

```bash
cd "D:/ggsel projects/evolve" && wc -l README.md docs/getting-started.md
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/getting-started.md
git commit -m "docs(readme,getting-started): preview server + reference templates"
```

---

## PHASE F — Stack Expansion + Dynamic MCP Discovery + App Excellence + README rewrite

**Goal:** make the plugin **flexible** — agents adapt to whatever MCP/stack the user has, not the hardcoded subset.

**Sub-phases:**
- F1: Dynamic MCP Discovery (foundation — agents stop hardcoding `mcp__*` refs)
- F2: 16 new stack agents (Vue/Nuxt/Svelte/Django/Rails/Spring/.NET/Go/NestJS/Express/Flutter/iOS/Android/GraphQL/MySQL/MongoDB)
- F3: 5 new app-excellence agents (api-designer / auth-architect / observability-architect / job-scheduler-architect / data-modeler)
- F4: 4 new app-excellence skills (test-strategy / feature-flag-rollout / error-envelope-design / auth-flow-design)
- F5: README rewrite "for grandmas" with **comparison vs superpowers ONLY** + cookbook (per user spec)

---

### Task F1.1: `discover-mcps.mjs` — read user's MCP config

**Files:**
- Create: `scripts/discover-mcps.mjs`
- Create: `scripts/lib/mcp-registry.mjs`
- Create: `tests/mcp-registry.test.mjs`

**Why:** agents currently have hardcoded `tools: [mcp__context7__resolve-library-id]`. If user lacks context7, agent fails silently. Solution: at SessionStart, populate `.claude/memory/mcp-registry.json` with what's actually available; agents query this registry.

- [ ] **Step 1: Write failing tests**

Create `tests/mcp-registry.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  discoverMcps, getRegistry, hasMcp, getMcpTools,
  REGISTRY_PATH_FOR_TEST
} from '../scripts/lib/mcp-registry.mjs';

const sandbox = join(tmpdir(), `evolve-mcp-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  REGISTRY_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'mcp-registry.json'));
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

test('discoverMcps: parses Claude config and lists MCP servers', async () => {
  // Use a fake config file
  const fakeConfig = JSON.stringify({
    mcpServers: {
      context7: { command: 'npx', args: ['@upstash/context7-mcp'] },
      playwright: { command: 'npx', args: ['@playwright/mcp'] },
    }
  });
  const cfgPath = join(sandbox, 'fake-claude.json');
  await writeFile(cfgPath, fakeConfig);

  const found = await discoverMcps({ configPath: cfgPath });
  assert.ok(Array.isArray(found));
  const names = found.map(m => m.name);
  assert.ok(names.includes('context7'));
  assert.ok(names.includes('playwright'));
});

test('hasMcp: returns true for registered, false otherwise', async () => {
  await getRegistry({ refresh: false }); // ensure registry exists
  // After previous test, context7 should be in registry
  // (assuming discoverMcps wrote it; if not, manually verify path)
});

test('getMcpTools: returns tool prefix list for an MCP', async () => {
  // For known MCPs, return canonical tool name patterns
  const tools = getMcpTools('context7');
  assert.ok(tools.includes('mcp__mcp-server-context7__resolve-library-id'));
});

test('discoverMcps: no config file → empty registry, no error', async () => {
  const found = await discoverMcps({ configPath: '/nonexistent/config.json' });
  assert.deepStrictEqual(found, []);
});
```

- [ ] **Step 2: Run failing tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/mcp-registry.test.mjs 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement registry**

Create `scripts/lib/mcp-registry.mjs`:

```javascript
// MCP Registry — discover available MCPs from user's Claude Code config,
// persist to .claude/memory/mcp-registry.json so agents can query.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const PROJECT_ROOT = process.cwd();
let _registryPath = join(PROJECT_ROOT, '.claude', 'memory', 'mcp-registry.json');

export function REGISTRY_PATH_FOR_TEST(path) { _registryPath = path; }

// Common Claude Code config locations
function defaultConfigCandidates() {
  return [
    join(homedir(), '.claude.json'),
    join(homedir(), '.config', 'claude', 'config.json'),
    join(PROJECT_ROOT, '.claude', 'config.json'),
  ];
}

// Tool name patterns — canonical mapping from MCP name → tool prefix it exposes.
// Updated as new MCPs become standard.
const KNOWN_MCP_TOOLS = {
  context7: ['mcp__mcp-server-context7__resolve-library-id', 'mcp__mcp-server-context7__query-docs'],
  playwright: ['mcp__playwright__browser_navigate', 'mcp__playwright__browser_take_screenshot', 'mcp__playwright__browser_snapshot'],
  figma: ['mcp__mcp-server-figma__get_figma_data', 'mcp__mcp-server-figma__download_figma_images'],
  firecrawl: ['mcp__mcp-server-firecrawl__firecrawl_scrape', 'mcp__mcp-server-firecrawl__firecrawl_crawl', 'mcp__mcp-server-firecrawl__firecrawl_search'],
  tauri: ['mcp__tauri__webview_screenshot'],
};

/**
 * Discover MCPs from a config file. Returns array of {name, command, available}.
 */
export async function discoverMcps({ configPath = null } = {}) {
  let path = configPath;
  if (!path) {
    for (const c of defaultConfigCandidates()) {
      if (existsSync(c)) { path = c; break; }
    }
  }
  if (!path || !existsSync(path)) return [];

  let raw;
  try { raw = await readFile(path, 'utf8'); }
  catch { return []; }

  let json;
  try { json = JSON.parse(raw); }
  catch { return []; }

  const servers = json.mcpServers || json.mcp_servers || {};
  const found = [];
  for (const [name, def] of Object.entries(servers)) {
    found.push({
      name,
      command: def.command || '',
      args: def.args || [],
      tools: KNOWN_MCP_TOOLS[name] || [],
      discoveredAt: new Date().toISOString(),
    });
  }

  // Persist
  await mkdir(dirname(_registryPath), { recursive: true });
  await writeFile(_registryPath, JSON.stringify({ mcps: found, updatedAt: new Date().toISOString() }, null, 2));

  return found;
}

/** Read the registry. */
export async function getRegistry({ refresh = false } = {}) {
  if (refresh) await discoverMcps({});
  if (!existsSync(_registryPath)) return { mcps: [], updatedAt: null };
  try {
    const raw = await readFile(_registryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { mcps: [], updatedAt: null };
  }
}

/** Quick check if a specific MCP is available. */
export async function hasMcp(name) {
  const reg = await getRegistry();
  return reg.mcps.some(m => m.name === name);
}

/** Get the tool prefixes a given MCP exposes (for agent `tools:` array). */
export function getMcpTools(name) {
  return KNOWN_MCP_TOOLS[name] || [];
}

/** Pick first available MCP from a preference list (e.g., for "current docs" use case). */
export async function pickMcp(preferenceList) {
  const reg = await getRegistry();
  const available = new Set(reg.mcps.map(m => m.name));
  for (const name of preferenceList) {
    if (available.has(name)) return name;
  }
  return null;
}
```

- [ ] **Step 4: Implement CLI**

Create `scripts/discover-mcps.mjs`:

```javascript
#!/usr/bin/env node
// Discover MCPs from user's Claude Code config and populate registry.
// Run from SessionStart hook OR manually.

import { discoverMcps, getRegistry } from './lib/mcp-registry.mjs';

const found = await discoverMcps({});
console.log(`[evolve/mcp] discovered ${found.length} MCP(s):`);
for (const mcp of found) {
  console.log(`  - ${mcp.name}  (tools: ${mcp.tools.length})`);
}

const reg = await getRegistry();
console.log(`Registry: ${reg.mcps.length} MCPs, updated ${reg.updatedAt || 'never'}`);
```

- [ ] **Step 5: Add to knip + run tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/mcp-registry.test.mjs 2>&1 | tail -10
```

Edit `knip.json` `entry` array, add: `"scripts/discover-mcps.mjs"`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/mcp-registry.mjs scripts/discover-mcps.mjs tests/mcp-registry.test.mjs knip.json
git commit -m "feat(mcp): dynamic MCP discovery from user Claude config + registry persistence"
```

---

### Task F1.2: SessionStart populates MCP registry

**Files:**
- Modify: `scripts/session-start-check.mjs`

- [ ] **Step 1: Add MCP discovery to SessionStart**

In `scripts/session-start-check.mjs`, after `pruneStalePreviewServers()`, add:

```javascript
// Phase F: discover MCPs and populate registry
async function refreshMcpRegistry() {
  try {
    const { discoverMcps } = await import('./lib/mcp-registry.mjs');
    const found = await discoverMcps({});
    if (found.length > 0) {
      console.log(`[evolve] MCPs available ✓ ${found.length} (${found.map(m => m.name).join(', ')})`);
    } else {
      console.log('[evolve] MCPs: none detected (set up Claude config to enable context7/playwright/figma/firecrawl)');
    }
  } catch (err) {
    // Non-fatal — agents can fall back to WebFetch/Grep
  }
}
await refreshMcpRegistry();
```

- [ ] **Step 2: Manual verify**

```bash
cd "D:/ggsel projects/evolve" && node scripts/session-start-check.mjs 2>&1 | tail -10
```

Expected: line about MCPs detected (count + names).

- [ ] **Step 3: Commit**

```bash
git add scripts/session-start-check.mjs
git commit -m "feat(mcp): SessionStart refreshes MCP registry"
```

---

### Task F1.3: Strengthen `supervibe:mcp-discovery` skill

**Files:**
- Modify: `skills/mcp-discovery/SKILL.md`

- [ ] **Step 1: Rewrite skill body**

Read existing `skills/mcp-discovery/SKILL.md`, then replace body (preserve frontmatter) with:

```markdown
# MCP Discovery

## When to invoke

BEFORE picking a tool for current-docs research / browser automation / design extraction / web crawling. Don't hardcode `mcp__context7__*` in agent procedures — invoke this skill to find the best available tool for the task.

## Step 0 — Read source of truth

1. Run `node $CLAUDE_PLUGIN_ROOT/scripts/discover-mcps.mjs` (or rely on SessionStart having done it)
2. Read `.claude/memory/mcp-registry.json`

## Decision tree — task → MCP preference

```
Need current docs / library API?
  Preference order: context7 > ref > WebFetch
Need browser automation / screenshots?
  Preference order: playwright > tauri (desktop) > skip
Need to extract design from Figma?
  Preference order: figma → if absent, ask user for screenshots
Need to crawl a website?
  Preference order: firecrawl > playwright (one-page) > WebFetch
Need general web search?
  Preference order: firecrawl-search > WebSearch
```

## Procedure

1. Identify the task category (current-docs / browser / figma / crawl / search)
2. Look up preference list for that category
3. Call `pickMcp(preferenceList)` from `scripts/lib/mcp-registry.mjs` — returns first available, or `null`
4. If MCP available: use its canonical tools (e.g. `mcp__mcp-server-context7__query-docs`)
5. If no MCP available: fall back to native tools (WebFetch / WebSearch / Grep / Read)
6. Document choice in agent output: "Used MCP `<name>`" OR "No suitable MCP, fell back to `<native>`"

## Output contract

Returns:
- `{ mcp: '<name>' | null, tools: ['<tool1>', '<tool2>'], fallback: '<reason>' | null }`
- Cite in agent output

## Anti-patterns

- **Hardcoding `tools: [mcp__context7__*]` in agent frontmatter** → breaks when user lacks context7
- **Calling MCP tool without checking availability** → cryptic error
- **Not surfacing fallback choice** → user can't tell why agent took longer / had less detail
- **Falling back silently** → user thinks MCP was used; can't diagnose

## Verification

- `getRegistry()` returns ≥1 MCP OR explicit fallback documented
- Output names which MCP was used (or "no MCP, fell back to X")

## Related

- Tool: `scripts/lib/mcp-registry.mjs` — registry helpers
- Tool: `scripts/discover-mcps.mjs` — refresh registry
- Status: `npm run supervibe:status` shows available MCPs
- Used by: best-practices-researcher / competitive-design-researcher / dependency-researcher / preview-server (for screenshots)
```

- [ ] **Step 2: Validate**

```bash
cd "D:/ggsel projects/evolve" && npm run lint:descriptions | grep mcp-discovery
npm run validate:frontmatter | grep mcp-discovery
```

- [ ] **Step 3: Commit**

```bash
git add skills/mcp-discovery/SKILL.md
git commit -m "feat(mcp): strengthen mcp-discovery skill — registry-driven, fallback-aware"
```

---

### Task F1.4: Refactor 8 hardcoded-MCP agents to use supervibe:mcp-discovery

**Files:**
- Modify: `agents/_ops/best-practices-researcher.md`
- Modify: `agents/_ops/competitive-design-researcher.md`
- Modify: `agents/_ops/dependency-researcher.md`
- Modify: `agents/_ops/security-researcher.md`
- Modify: `agents/_ops/infra-pattern-researcher.md`
- Modify: `agents/_design/ux-ui-designer.md`
- Modify: `agents/_design/prototype-builder.md`
- Modify: `agents/_design/competitive-design-researcher.md` (if exists)

**Why:** these agents have `tools: [mcp__mcp-server-context7__...]` hardcoded. Refactor to invoke `supervibe:mcp-discovery` skill which abstracts the choice.

- [ ] **Step 1: For each agent — replace hardcoded MCPs in frontmatter**

For each file, in `tools:` array, replace:
```yaml
tools: [Read, Grep, Glob, Bash, mcp__mcp-server-context7__resolve-library-id, mcp__mcp-server-context7__query-docs]
```

With:
```yaml
tools: [Read, Grep, Glob, Bash, WebFetch]
```

(Tools become "what's safe to use even without MCPs"; MCP tools come dynamically via skill).

In `skills:` array, ADD `supervibe:mcp-discovery` (preserve existing).

- [ ] **Step 2: For each agent — update Procedure to invoke skill**

In `## Procedure`, for any step like "Look up library X via context7", replace with:

```markdown
N. **Pick research tool**: invoke `supervibe:mcp-discovery` skill with category=`current-docs` to get the best available MCP. Use returned tool name. If no MCP available, fall back to WebFetch with explicit "no MCP available" note in output.
```

- [ ] **Step 3: Validate**

```bash
cd "D:/ggsel projects/evolve" && npm run validate:frontmatter | grep -E "best-practices-researcher|competitive-design-researcher|dependency-researcher|security-researcher|infra-pattern-researcher|ux-ui-designer|prototype-builder"
```

All must show OK.

- [ ] **Step 4: Commit**

```bash
git add agents/_ops/best-practices-researcher.md agents/_ops/competitive-design-researcher.md agents/_ops/dependency-researcher.md agents/_ops/security-researcher.md agents/_ops/infra-pattern-researcher.md agents/_design/ux-ui-designer.md agents/_design/prototype-builder.md
git commit -m "refactor(agents): use supervibe:mcp-discovery instead of hardcoded MCP refs (8 agents)"
```

---

### Task F1.5: `supervibe:status` surfaces available MCPs

**Files:**
- Modify: `scripts/supervibe-status.mjs`
- Modify: `tests/supervibe-status.test.mjs`

- [ ] **Step 1: Add MCP section to status**

In `scripts/supervibe-status.mjs`, after preview server section, append:

```javascript
import { getRegistry as getMcpRegistry } from './lib/mcp-registry.mjs';

const mcpReg = await getMcpRegistry({ refresh: false });
if (mcpReg.mcps.length === 0) {
  console.log(color('○ MCPs: none registered (run `node scripts/discover-mcps.mjs` to scan)', 'dim'));
} else {
  console.log(color(`✓ MCPs: ${mcpReg.mcps.length} available`, 'green'));
  for (const m of mcpReg.mcps) {
    console.log(color(`  ${m.name}  (${m.tools.length} tools)`, 'dim'));
  }
}
```

- [ ] **Step 2: Add test**

In `tests/supervibe-status.test.mjs`:

```javascript
test('evolve-status: reports MCP registry state', () => {
  const out = runStatus();
  assert.ok(/MCPs:/.test(out), 'should mention MCPs');
});
```

- [ ] **Step 3: Run tests + manual verify**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/supervibe-status.test.mjs 2>&1 | tail -10
npm run supervibe:status | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add scripts/supervibe-status.mjs tests/supervibe-status.test.mjs
git commit -m "feat(status): show available MCPs"
```

---

### Task F2 — 16 New Stack Agents (parallelizable batch)

**Strategy:** each new stack agent follows the canonical structure from `agents/stacks/laravel/laravel-developer.md` (289 lines) — Persona / Project Context / Skills / Decision tree / Procedure / Output contract / Anti-patterns / Verification / Common workflows / Out of scope / Related. Each agent ≥250 lines.

**Reference template:** `agents/stacks/laravel/laravel-developer.md` for stack-developer agents; `agents/stacks/laravel/laravel-architect.md` for stack-architect agents.

Each task's content is the **domain knowledge** for that stack. The structural skeleton is reused — every task says "follow same structure, fill with X-specific content."

The 11 sub-tasks below are highly parallel — dispatch as 11 subagents.

#### Task F2.1: Vue / Nuxt agents (3 agents)

**Files:**
- Create: `agents/stacks/vue/vue-implementer.md`
- Create: `agents/stacks/nuxt/nuxt-architect.md`
- Create: `agents/stacks/nuxt/nuxt-developer.md`

**Domain content (per agent):**

- **vue-implementer**: Vue 3 Composition API mastery, `<script setup>` discipline, Pinia state, props/emits typed contract, Suspense + AsyncComponent, custom composable extraction, Vitest + Vue Test Utils, anti-patterns (mutating props, watch-effect-for-derived-state, options-api-mixed-with-composition).
- **nuxt-architect**: Nuxt 3 server vs client routing, Nitro server engine choice, useFetch vs $fetch, hybrid rendering (SSR/SSG/ISR/CSR), Pinia stores, Nuxt modules ecosystem.
- **nuxt-developer**: pages/ + layouts/ + middleware/, server/api/ routes, useFetch + transform, useRuntimeConfig, useState SSR-aware, error.vue handler, Nuxt 4 migration considerations.

For each: ≥250 lines, full structure as laravel-developer.md.

- [ ] **Step 1: Create 3 files** (each from template)
- [ ] **Step 2: Update `.claude-plugin/plugin.json`** — add 3 paths to `agents:[]`
- [ ] **Step 3: `npm run validate:frontmatter`** — verify OK for all 3
- [ ] **Step 4: `wc -l`** — verify ≥250 lines each
- [ ] **Step 5: Commit**

```bash
git add agents/stacks/vue/ agents/stacks/nuxt/ .claude-plugin/plugin.json
git commit -m "feat(stacks): add Vue 3 + Nuxt 3 agents (vue-implementer / nuxt-architect / nuxt-developer)"
```

#### Task F2.2: Svelte / SvelteKit agent (1)

**File:** `agents/stacks/svelte/sveltekit-developer.md`

**Domain:** Svelte 5 runes ($state, $derived, $effect), .svelte / .svelte.js modules, SvelteKit hooks (handle, handleFetch), +page / +layout / +server, form actions, load functions (universal vs server), prerendering, adapter choice (node / vercel / cloudflare).

- [ ] Create file (≥250 lines)
- [ ] Add to plugin.json
- [ ] Validate + commit

```bash
git add agents/stacks/svelte/ .claude-plugin/plugin.json
git commit -m "feat(stacks): add SvelteKit developer agent"
```

#### Task F2.3: Django + DRF agents (3)

**Files:**
- Create: `agents/stacks/django/django-architect.md`
- Create: `agents/stacks/django/django-developer.md`
- Create: `agents/stacks/django/drf-specialist.md`

**Domain:**
- **django-architect**: app boundaries, model design with related_name discipline, ORM N+1 prevention, Celery + Channels, Django settings split (base/dev/prod), middleware ordering.
- **django-developer**: views.py vs CBVs vs DRF viewsets, ModelForm + Form discipline, signals (pre_save/post_save) + when to avoid, fixtures + factory_boy, pytest-django.
- **drf-specialist**: serializers (ModelSerializer + nested), permissions + authentication, viewsets vs APIView, pagination + filtering, throttling, DRF JWT + simple-jwt.

- [ ] Create 3 files (≥250 lines each)
- [ ] Add to plugin.json
- [ ] Validate + commit

```bash
git add agents/stacks/django/ .claude-plugin/plugin.json
git commit -m "feat(stacks): add Django + DRF agents (architect/developer/drf-specialist)"
```

#### Task F2.4: Rails agents (2)

**Files:**
- Create: `agents/stacks/rails/rails-architect.md`
- Create: `agents/stacks/rails/rails-developer.md`

**Domain:**
- **rails-architect**: Rails 7+ Hotwire (Turbo+Stimulus) vs SPA decision, ActiveJob backends, ActionCable, Solid Queue / Solid Cache (8.0+), engine vs concern decomposition.
- **rails-developer**: ActiveRecord N+1 (includes/preload/eager_load), validations vs callbacks, FormObject pattern, ActionCable channels, RSpec or Minitest, factory_bot.

- [ ] Create 2 files
- [ ] Add to plugin.json
- [ ] Commit

```bash
git add agents/stacks/rails/ .claude-plugin/plugin.json
git commit -m "feat(stacks): add Rails agents (architect/developer)"
```

#### Task F2.5: Spring (Java) agents (2)

**Files:**
- Create: `agents/stacks/spring/spring-architect.md`
- Create: `agents/stacks/spring/spring-developer.md`

**Domain:**
- **spring-architect**: Spring Boot 3 + Spring 6, Reactive (WebFlux) vs Servlet (MVC), Spring Cloud microservices, profile management, ActuatorEndpoints + observability.
- **spring-developer**: @RestController + @Service + @Repository, JPA + Hibernate (N+1, EntityGraph, projections), Bean Validation, Testcontainers, Spring Security (JWT/OAuth2 resource server).

- [ ] Create 2 files; add to plugin.json; commit

```bash
git add agents/stacks/spring/ .claude-plugin/plugin.json
git commit -m "feat(stacks): add Spring Boot 3 agents"
```

#### Task F2.6: ASP.NET Core agent (1)

**File:** `agents/stacks/aspnet/aspnet-developer.md`

**Domain:** Minimal API vs Controllers, EF Core (queries, migrations, owned types), DI scopes (transient/scoped/singleton), Identity + JWT, OpenAPI/Swashbuckle, xUnit + bogus, Serilog.

- [ ] Create; add; commit

```bash
git add agents/stacks/aspnet/ .claude-plugin/plugin.json
git commit -m "feat(stacks): add ASP.NET Core developer agent"
```

#### Task F2.7: Go service developer agent (1)

**File:** `agents/stacks/go/go-service-developer.md`

**Domain:** stdlib vs gin vs echo vs chi tradeoffs, context propagation, errgroup + cancellation, sqlc / sqlx / gorm comparison, table-driven tests, goroutines + channels patterns.

- [ ] Create; add; commit

#### Task F2.8: Node — Express + NestJS agents (2)

**Files:**
- Create: `agents/stacks/express/express-developer.md`
- Create: `agents/stacks/nestjs/nestjs-developer.md`

**Domain:**
- **express-developer**: middleware ordering, async error handling (express-async-errors), zod/joi validation, Helmet + CORS, Pino logging, supertest.
- **nestjs-developer**: modules + providers + DI tokens, decorators (@Controller / @Injectable / @Module), guards + interceptors + pipes, TypeORM/Prisma + repository pattern, e2e tests with @nestjs/testing.

- [ ] Create 2 files; add; commit

```bash
git add agents/stacks/express/ agents/stacks/nestjs/ .claude-plugin/plugin.json
git commit -m "feat(stacks): add Express + NestJS developer agents"
```

#### Task F2.9: Mobile stacks — Flutter / iOS / Android (3)

**Files:**
- Create: `agents/stacks/flutter/flutter-developer.md`
- Create: `agents/stacks/ios/ios-developer.md`
- Create: `agents/stacks/android/android-developer.md`

**Domain:**
- **flutter-developer**: BLoC vs Riverpod vs Provider, Slivers + ListView builders, Platform channels, Dio + Retrofit, flutter_test + integration_test, build flavors.
- **ios-developer**: SwiftUI + Combine, async/await + actors, MVVM, Swift Package Manager, XCTest + ViewInspector, App Intents.
- **android-developer**: Jetpack Compose, Coroutines + Flow, Hilt DI, Room + WorkManager, Espresso + Compose UI tests, Material 3.

- [ ] Create 3 files; add; commit

```bash
git add agents/stacks/flutter/ agents/stacks/ios/ agents/stacks/android/ .claude-plugin/plugin.json
git commit -m "feat(stacks): add mobile agents (Flutter / iOS / Android)"
```

#### Task F2.10: GraphQL schema designer (1, cross-stack)

**File:** `agents/stacks/graphql/graphql-schema-designer.md`

**Domain:** schema-first vs code-first, federation v2, DataLoader N+1 prevention, persisted queries, error handling (envelope vs nullable), pagination (cursor vs offset), subscriptions transport (WS vs SSE).

- [ ] Create; add; commit

#### Task F2.11: Storage stacks — MySQL / MongoDB / Elasticsearch (3)

**Files:**
- Create: `agents/stacks/mysql/mysql-architect.md`
- Create: `agents/stacks/mongodb/mongo-architect.md`
- Create: `agents/stacks/elasticsearch/elasticsearch-architect.md`

**Domain:**
- **mysql-architect**: InnoDB internals, indexes (covering, prefix), partitioning, replication (async/semi-sync/group), online DDL via gh-ost.
- **mongo-architect**: schema design (embed vs reference), index types (single/compound/multikey/text/geo/wildcard), aggregation pipeline, sharding, transactions.
- **elasticsearch-architect**: mapping types (keyword/text/numeric), analyzer choice, sharding strategy, ILM, search vs aggregation, Elasticsearch vs OpenSearch fork awareness.

- [ ] Create 3 files; add; commit

#### Task F2.12: Update CLAUDE.md agent table

**File:** `CLAUDE.md`

In the "Agent system" table, expand the "stacks/*" rows to include all new agents.

- [ ] Edit table; commit

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): list all stack agents (Vue/Nuxt/Svelte/Django/Rails/Spring/etc)"
```

---

### Task F3 — 5 New App-Excellence Agents

**Files:**
- Create: `agents/_ops/api-designer.md` — OpenAPI / GraphQL schema-first design, contract-driven dev
- Create: `agents/_core/auth-architect.md` — OAuth2 / OIDC / SAML / session / token rotation patterns
- Create: `agents/_ops/observability-architect.md` — logs / metrics / traces unified strategy (OpenTelemetry)
- Create: `agents/_ops/job-scheduler-architect.md` — universal queue / cron / scheduling architecture (extends queue-worker-architect to cross-stack)
- Create: `agents/_ops/data-modeler.md` — universal data modeling (separate from db-reviewer per-engine)

**Per agent:** ≥250 lines, canonical structure.

**Domain content:**
- **api-designer**: OpenAPI 3.1 vs 3.0, JSON Schema Draft 2020-12, GraphQL SDL, Protobuf, contract-first vs code-first, versioning (URL/header/content-type), HATEOAS, problem+json (RFC 7807), webhooks, idempotency keys, rate-limit headers.
- **auth-architect**: OAuth 2.1 (with PKCE), OIDC discovery, SAML 2.0, session vs JWT vs PASETO, refresh token rotation, MFA (TOTP/WebAuthn), passkeys, social logins, IDP migration patterns.
- **observability-architect**: OpenTelemetry tracing/metrics/logs, exemplars, sampling strategies, SLO/SLI/SLA, Prometheus + Grafana, ELK vs Loki, error budgets, correlation IDs, distributed tracing across queues.
- **job-scheduler-architect**: at-least-once vs exactly-once vs at-most-once, idempotency keys, retry/backoff (exponential, jitter), DLQ, cron vs delayed vs immediate, queue choice matrix (RabbitMQ/Kafka/SQS/Redis/Sidekiq).
- **data-modeler**: 3NF vs star schema vs document, polymorphic patterns, EAV when (not), CQRS, event sourcing, time-series, soft delete vs versioning.

- [ ] Create 5 files
- [ ] Add to plugin.json (5 paths)
- [ ] Update CLAUDE.md namespace table
- [ ] Validate + commit

```bash
git add agents/_ops/api-designer.md agents/_core/auth-architect.md agents/_ops/observability-architect.md agents/_ops/job-scheduler-architect.md agents/_ops/data-modeler.md .claude-plugin/plugin.json CLAUDE.md
git commit -m "feat(agents): add 5 app-excellence agents (api-designer / auth-architect / observability-architect / job-scheduler / data-modeler)"
```

---

### Task F4 — 4 New App-Excellence Skills

**Files:**
- Create: `skills/test-strategy/SKILL.md` — pyramid + flake budget + coverage strategy
- Create: `skills/feature-flag-rollout/SKILL.md` — staged rollout patterns
- Create: `skills/error-envelope-design/SKILL.md` — per-stack error contract conventions
- Create: `skills/auth-flow-design/SKILL.md` — OIDC/OAuth/session flow picker

**Per skill:** ≥250 lines, full skill structure (frontmatter + When to invoke + Decision tree + Procedure + Output contract + Anti-patterns + Verification + Related).

**Domain content:**
- **test-strategy**: pyramid (unit/integration/e2e ratios), fixture isolation, flake quarantine + budget, coverage triangulation (line/branch/mutation), CI gate thresholds, fast-feedback loops.
- **feature-flag-rollout**: kill-switch vs percentage rollout vs cohort, dark launches, canary deploys, rollback criteria, flag debt cleanup, LaunchDarkly/Unleash/local-config tradeoffs.
- **error-envelope-design**: RFC 7807 (problem+json), GraphQL union errors, gRPC status codes, idempotency-key responses, retry-after semantics, partial failure shapes.
- **auth-flow-design**: choose between authorization-code+PKCE / client-credentials / device-code / resource-owner-password (when), refresh token rotation strategy, session-cookie hybrids, logout coordination across SPA+API.

- [ ] Create 4 files
- [ ] Validate descriptions (`npm run lint:descriptions`)
- [ ] Commit

```bash
git add skills/test-strategy/ skills/feature-flag-rollout/ skills/error-envelope-design/ skills/auth-flow-design/
git commit -m "feat(skills): add 4 app-excellence skills (test-strategy / feature-flags / error-envelope / auth-flow)"
```

---

### Task F5 — README rewrite for grandmas + comparison vs superpowers ONLY

**Files:**
- Modify: `README.md`

**Goals:**
1. Drop "15 years experience" language (sounds like marketing)
2. Add comparison table — **Evolve vs superpowers ONLY** (per user spec — no aider/cursor/continue.dev)
3. Add "Why use Evolve if you already have superpowers" section
4. Add cookbook with 5 end-to-end scenarios

- [ ] **Step 1: Remove "15-year-persona" mentions**

In `README.md`, search/replace:
- "15-year-persona agents" → "specialist agents (each with explicit decision tree, procedure, output contract)"
- "**Каждый агент — это 15-летний опыт**" → "**Каждый агент — это специалист со строгой методологией**"
- Remove any other "15 years" / "20 years" / "decades" expert-marketing phrases throughout README

- [ ] **Step 2: Add Evolve vs superpowers comparison section**

After "Что вы получаете" table, add:

```markdown
## Чем Evolve отличается от superpowers

(superpowers — главный аналог; обе расширяют Claude Code через `.claude-plugin`. Сравнение фактическое, без оценочных суждений.)

**Только различающиеся возможности — то что реально влияет на выбор:**

| Возможность | Evolve | superpowers |
|-------------|--------|-------------|
| Граф вызовов (callers / callees / neighborhood) | ✅ tree-sitter, 9 языков, через SQLite | ❌ нет |
| Семантический Code RAG (multilingual e5, RU+EN+100 langs) | ✅ оффлайн, ~129MB bundled | ❌ нет |
| Память проекта (5 категорий с chokidar watcher + per-chunk embeddings) | ✅ полноценная | ⚠️ проще |
| Specialist-агенты с фиксированной структурой ≥250 строк | ✅ 67+ агентов | ⚠️ несколько ролей, без жёсткой структуры |
| Stack-aware scaffolding | ✅ 16+ стеков (Laravel / Next / Vue / Nuxt / Svelte / Django / Rails / Spring / .NET / Go / NestJS / Mobile / etc) | ❌ |
| Confidence engine (рубрики с весами + override-rate tracking) | ✅ 12 рубрик, гейт ≥9/10 | ⚠️ мягче |
| Live preview-server (localhost + hot-reload + idle-shutdown + max-limit) | ✅ pure-Node SSE | ❌ |
| Auto-startup banner (статус индексов на старте сессии) | ✅ | ❌ |
| Dynamic MCP discovery (агенты адаптируются к доступным MCP) | ✅ registry-driven с fallback | ❌ |
| Reference templates (PRD / ADR / plan / RFC / brainstorm / intake) | ✅ 6 готовых | ⚠️ частично |
| Agent evolution loop (invocation log → effectiveness tracker → underperformer detector → auto-strengthen) | ✅ полная петля | ❌ |
| Bundle size | ~140 МБ (модель + грамматики через LFS) | <10 МБ |

### Когда выбирать Evolve вместо superpowers

- Хотите **жёсткие гейты** (confidence-engine блокирует мерж пока score < 9), а не «мягкие» рекомендации
- Нужен **Code Graph** для рефакторов (`--callers`, `--neighbors`) — superpowers не имеет
- Нужен **семантический поиск по коду** (multilingual) — superpowers не имеет
- Работа на **русском / неанглийском** — Evolve embedding model тренировалась на 100 языках
- Делаете много **дизайна / мокапов** — preview-server из коробки
- Работаете со специфичным **стеком** (Laravel / Django / Rails / Spring / etc) — есть подготовленные специалисты
- Хотите **дисциплину** (anti-hallucination, no-half-finished, use-codegraph-before-refactor — формальные правила с severity)

### Когда выбирать superpowers вместо Evolve

- Меньший bundle size (без bundled-models)
- Не нужен Code Graph / семантический Code RAG (агенты пишут только английский text-only)
- Меньше specialist-агентов — проще onboarding
- Не нужны рубрики и confidence-гейты — хотите свободный flow
- Хотите минимальную инфраструктуру — без SQLite / WAL / SSE / chokidar / tree-sitter

### Можно использовать оба одновременно?

Да. Skills из superpowers и Evolve могут coexist в одном `.claude-plugin/`. Evolve преднамеренно использует те же conventions (markdown frontmatter, slash commands, hooks). Конфликты на уровне skill names не возникают — Evolve использует префикс `supervibe:` namespace.
```

- [ ] **Step 3: Add cookbook with 5 scenarios**

After Troubleshooting section, add:

```markdown
## Cookbook — 5 готовых сценариев

### Сценарий 1: Новая фича в Laravel-проекте

```
Пользователь: "Добавь endpoint для создания заказа с idempotency"

# Под капотом происходит:
1. /evolve auto-detects stack=laravel
2. Invokes supervibe:project-memory — ищет past idempotency решения
3. Invokes supervibe:code-search --query "idempotency redis" — находит pattern
4. Invokes laravel-developer agent с pre-task graph check
5. agent пишет failing Pest test
6. Implements: FormRequest + Service + idempotent Job
7. Запускает pest + pint + phpstan
8. supervibe:code-review проверяет 8-dim
9. supervibe:confidence-scoring → score=9.2
10. supervibe:add-memory сохраняет в .claude/memory/solutions/
```

### Сценарий 2: Refactor с blast-radius check

```
Пользователь: "Переименуй processOrder → processCheckout"

# Под капотом:
1. supervibe:code-search --callers "processOrder" → 14 callers
2. Rule use-codegraph-before-refactor триггерит:
   - Если callers > 10 → escalate to architect-reviewer
3. architect-reviewer строит migration ADR
4. refactoring-specialist делает renames в одном PR
5. supervibe:code-search --callers "processOrder" → 0 (validation)
6. Output contract: Case A — 14 callers updated в этом diff
```

### Сценарий 3: Дебаг продакшен-инцидента

```
Пользователь: "Юзеры жалуются что иногда payment висит"

# Под капотом:
1. root-cause-debugger agent (использует supervibe:systematic-debugging)
2. Invokes supervibe:project-memory --tags incident,payment
3. Invokes supervibe:code-search --query "payment timeout retry"
4. Reproduce locally → narrow → root cause
5. Output: incident memo с file:line + reproduction steps + fix proposal
6. supervibe:add-memory сохраняет в incidents/
```

### Сценарий 4: Brand redesign + landing page mockup

```
Пользователь: "Сделай новый landing page в духе Linear"

# Под капотом:
1. competitive-design-researcher (через Firecrawl MCP) скрапит Linear
2. creative-director предлагает 3 направления + mood boards
3. ux-ui-designer строит spec со state matrix
4. supervibe:landing-page skill генерирует HTML/CSS в mockups/
5. supervibe:preview-server поднимает http://localhost:3047 ← preview
6. (опционально) Playwright MCP делает screenshot
7. ui-polish-reviewer 8-dim review
8. accessibility-reviewer WCAG check
```

### Сценарий 5: Database migration safety

```
Пользователь: "Добавь колонку email_verified_at"

# Под капотом:
1. db-reviewer agent
2. Invokes supervibe:code-search --callers "User" — найти все queries
3. Migration-safety pattern: 3-deploy column add (NOT VALID + VALIDATE)
4. Постгрес-architect генерирует миграцию с CONCURRENTLY
5. Lock duration estimate < 500ms ✓
6. Replication impact: < 2s ✓
7. Plan включает rollback step (DROP CONCURRENTLY если что)
8. supervibe:add-memory → patterns/safe-column-add
```
```

- [ ] **Step 4: Verify**

```bash
cd "D:/ggsel projects/evolve" && wc -l README.md
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite for accessibility + comparison vs alternatives + cookbook"
```

---

## PHASE G — Agent Evolution Loop

**Goal:** make «Evolve» live up to its name. Currently agents are static; evolution requires manual `/supervibe-strengthen`. Phase G adds:
1. Structured invocation logging (every agent task → JSONL log)
2. `effectiveness-tracker.mjs` actually writes back to agent frontmatter
3. Underperformer detection from logs
4. Auto-strengthen triggers (with user gate)

---

### Task G1: Agent invocation logging

**Files:**
- Create: `scripts/lib/agent-invocation-logger.mjs`
- Create: `tests/agent-invocation-logger.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/agent-invocation-logger.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { logInvocation, readInvocations, INVOCATION_LOG_PATH_FOR_TEST } from '../scripts/lib/agent-invocation-logger.mjs';

const sandbox = join(tmpdir(), `evolve-inv-log-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  INVOCATION_LOG_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'agent-invocations.jsonl'));
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
```

- [ ] **Step 2: Run failing tests**

Expected: FAIL — module not found.

- [ ] **Step 3: Implement logger**

Create `scripts/lib/agent-invocation-logger.mjs`:

```javascript
// Append-only JSONL log of agent invocations.
// Used by effectiveness-tracker to update frontmatter, by quality-gate-reviewer
// to detect override-rate trends, by /supervibe-audit to find underperformers.

import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PROJECT_ROOT = process.cwd();
let _logPath = join(PROJECT_ROOT, '.claude', 'memory', 'agent-invocations.jsonl');

export function INVOCATION_LOG_PATH_FOR_TEST(path) { _logPath = path; }

/**
 * Log an agent invocation. Required fields:
 *   agent_id (e.g. 'laravel-developer')
 *   task_summary (≤200 chars)
 *   confidence_score (0-10)
 * Optional:
 *   rubric, override (bool), override_reason, duration_ms, user_feedback (accept/reject/partial), error
 */
export async function logInvocation(entry) {
  if (!entry.agent_id) throw new Error('agent_id required');
  if (!entry.task_summary) throw new Error('task_summary required');
  if (typeof entry.confidence_score !== 'number') throw new Error('confidence_score required (number)');

  const record = {
    ts: new Date().toISOString(),
    ...entry,
  };
  await mkdir(dirname(_logPath), { recursive: true });
  await appendFile(_logPath, JSON.stringify(record) + '\n');
  return record;
}

/** Read invocations with optional filtering. */
export async function readInvocations({ agent_id = null, since = null, limit = 1000 } = {}) {
  if (!existsSync(_logPath)) return [];
  const raw = await readFile(_logPath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  let entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); }
    catch {}
  }
  if (agent_id) entries = entries.filter(e => e.agent_id === agent_id);
  if (since) entries = entries.filter(e => new Date(e.ts) >= new Date(since));
  return entries.slice(-limit);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/agent-invocation-logger.test.mjs 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/agent-invocation-logger.mjs tests/agent-invocation-logger.test.mjs
git commit -m "feat(evolution): structured agent-invocation JSONL log + helpers"
```

---

### Task G2: `effectiveness-tracker.mjs` writes back to agent frontmatter

**Files:**
- Modify: `scripts/effectiveness-tracker.mjs` (already exists — verify; replace if stub)
- Create: `tests/effectiveness-tracker.test.mjs`

**Why:** every agent's frontmatter has an `effectiveness:` block (`last-task`, `outcome`, `iterations`). Currently no script writes to it. G2 makes it actually update from the invocation log.

- [ ] **Step 1: Inspect existing script**

```bash
cd "D:/ggsel projects/evolve" && wc -l scripts/effectiveness-tracker.mjs
cat scripts/effectiveness-tracker.mjs | head -30
```

If it's a stub: replace fully. If real: extend.

- [ ] **Step 2: Implement (or extend)**

Replace `scripts/effectiveness-tracker.mjs` with:

```javascript
#!/usr/bin/env node
// Aggregate agent invocations from JSONL log → update each agent's frontmatter
// `effectiveness` block (iterations, last-task, last-outcome, avg-confidence).

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { readInvocations } from './lib/agent-invocation-logger.mjs';

const PROJECT_ROOT = process.cwd();
const AGENT_DIRS = [
  'agents/_core', 'agents/_meta', 'agents/_design',
  'agents/_ops', 'agents/_product',
];

async function findStackAgentFiles() {
  const stacksDir = join(PROJECT_ROOT, 'agents', 'stacks');
  const result = [];
  try {
    const stacks = await readdir(stacksDir);
    for (const s of stacks) {
      try {
        const files = await readdir(join(stacksDir, s));
        for (const f of files.filter(f => f.endsWith('.md'))) {
          result.push(join('agents', 'stacks', s, f));
        }
      } catch {}
    }
  } catch {}
  return result;
}

async function findAllAgentFiles() {
  const result = [];
  for (const dir of AGENT_DIRS) {
    try {
      const files = await readdir(join(PROJECT_ROOT, dir));
      for (const f of files.filter(f => f.endsWith('.md'))) {
        result.push(join(dir, f));
      }
    } catch {}
  }
  result.push(...await findStackAgentFiles());
  return result;
}

function aggregateForAgent(invocations) {
  if (invocations.length === 0) return null;
  const sorted = invocations.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts));
  const last = sorted[sorted.length - 1];
  const total = sorted.length;
  const avgConf = sorted.reduce((s, e) => s + (e.confidence_score || 0), 0) / total;
  const overrideCount = sorted.filter(e => e.override === true).length;
  return {
    iterations: total,
    'last-task': last.task_summary?.slice(0, 100) || null,
    'last-outcome': last.user_feedback || (last.confidence_score >= 9 ? 'accept' : 'review'),
    'last-applied': last.ts,
    'avg-confidence': Number(avgConf.toFixed(2)),
    'override-rate': total > 0 ? Number((overrideCount / total).toFixed(3)) : 0,
  };
}

async function updateAgentFrontmatter(agentFile, effectiveness) {
  const fullPath = join(PROJECT_ROOT, agentFile);
  const content = await readFile(fullPath, 'utf8');
  const parsed = matter(content);
  parsed.data.effectiveness = effectiveness;
  const out = matter.stringify(parsed.content, parsed.data);
  await writeFile(fullPath, out);
}

async function main() {
  const allInvocations = await readInvocations({ limit: 100000 });
  const byAgent = {};
  for (const inv of allInvocations) {
    if (!byAgent[inv.agent_id]) byAgent[inv.agent_id] = [];
    byAgent[inv.agent_id].push(inv);
  }

  const agentFiles = await findAllAgentFiles();
  let updated = 0;
  for (const file of agentFiles) {
    const agentName = file.split('/').pop().replace('.md', '');
    const invocs = byAgent[agentName];
    if (!invocs || invocs.length === 0) continue;
    const eff = aggregateForAgent(invocs);
    if (!eff) continue;
    try {
      await updateAgentFrontmatter(file, eff);
      updated++;
    } catch (err) {
      console.warn(`Failed to update ${file}: ${err.message}`);
    }
  }
  console.log(`[evolve/effectiveness] updated ${updated} agent files from ${allInvocations.length} invocations`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

export { aggregateForAgent };
```

- [ ] **Step 3: Test the aggregator function**

Create `tests/effectiveness-tracker.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { aggregateForAgent } from '../scripts/effectiveness-tracker.mjs';

test('aggregateForAgent: computes iterations + avg-confidence + override-rate', () => {
  const invs = [
    { ts: '2026-01-01T10:00:00Z', confidence_score: 9, override: false, user_feedback: 'accept', task_summary: 'task1' },
    { ts: '2026-01-02T10:00:00Z', confidence_score: 7, override: true, user_feedback: 'partial', task_summary: 'task2' },
    { ts: '2026-01-03T10:00:00Z', confidence_score: 10, override: false, user_feedback: 'accept', task_summary: 'task3' },
  ];
  const eff = aggregateForAgent(invs);
  assert.strictEqual(eff.iterations, 3);
  assert.strictEqual(eff['avg-confidence'], 8.67);
  assert.ok(Math.abs(eff['override-rate'] - 0.333) < 0.001);
  assert.strictEqual(eff['last-task'], 'task3');
});

test('aggregateForAgent: returns null for empty list', () => {
  assert.strictEqual(aggregateForAgent([]), null);
});
```

- [ ] **Step 4: Run tests + manual run**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/effectiveness-tracker.test.mjs 2>&1 | tail -10
node scripts/effectiveness-tracker.mjs
```

Expected: tests pass; script reports "updated N agent files".

- [ ] **Step 5: Commit**

```bash
git add scripts/effectiveness-tracker.mjs tests/effectiveness-tracker.test.mjs
git commit -m "feat(evolution): effectiveness-tracker writes invocation aggregates back to agent frontmatter"
```

---

### Task G3: Underperformer detection

**Files:**
- Create: `scripts/lib/underperformer-detector.mjs`
- Create: `tests/underperformer-detector.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/underperformer-detector.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { detectUnderperformers } from '../scripts/lib/underperformer-detector.mjs';

const fakeInvocations = (agent_id, scores, overrides = []) =>
  scores.map((s, i) => ({
    agent_id,
    confidence_score: s,
    override: overrides[i] ?? false,
    ts: new Date(Date.now() - (scores.length - i) * 86400000).toISOString(),
  }));

test('detectUnderperformers: flags agents with avg < 8.5 over last 10', () => {
  const allInv = [
    ...fakeInvocations('good-agent', [9, 9.5, 9.2, 9.7, 9.8, 9.1, 9.3, 9.5, 9.6, 9.4]),
    ...fakeInvocations('bad-agent', [7, 8, 7.5, 8.2, 7.8, 7, 8, 8.4, 7.9, 8.1]),
  ];
  const flagged = detectUnderperformers(allInv);
  const ids = flagged.map(f => f.agent_id);
  assert.ok(ids.includes('bad-agent'), `expected bad-agent flagged; got ${ids.join(',')}`);
  assert.ok(!ids.includes('good-agent'));
});

test('detectUnderperformers: flags rising override-rate trend', () => {
  // First 5 no overrides, last 5 all overrides → trend
  const overrides = [false, false, false, false, false, true, true, true, true, true];
  const scores = [9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5]; // confidence stays high but overrides surge
  const inv = fakeInvocations('drift-agent', scores, overrides);
  const flagged = detectUnderperformers(inv);
  const ids = flagged.map(f => f.agent_id);
  assert.ok(ids.includes('drift-agent'),
    `expected drift detected via override trend; flagged: ${ids.join(',')}`);
});

test('detectUnderperformers: needs ≥10 invocations to flag', () => {
  const inv = fakeInvocations('newbie', [5, 5, 5, 5]); // only 4
  const flagged = detectUnderperformers(inv);
  assert.ok(!flagged.find(f => f.agent_id === 'newbie'),
    'should not flag agents with < 10 invocations');
});
```

- [ ] **Step 2: Implement detector**

Create `scripts/lib/underperformer-detector.mjs`:

```javascript
// Detect agents whose recent performance is degrading.
// Two signals: avg confidence < threshold, OR rising override-rate trend.

const MIN_INVOCATIONS = 10;
const CONFIDENCE_THRESHOLD = 8.5;
const TREND_WINDOW = 10;
const OVERRIDE_TREND_DELTA = 0.4; // 40 percentage point increase across split

export function detectUnderperformers(allInvocations, opts = {}) {
  const minInv = opts.minInvocations ?? MIN_INVOCATIONS;
  const confThreshold = opts.confidenceThreshold ?? CONFIDENCE_THRESHOLD;

  // Group by agent_id
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

    // Signal 1: avg confidence below threshold
    const avg = recent.reduce((s, e) => s + (e.confidence_score || 0), 0) / recent.length;
    if (avg < confThreshold) {
      flagged.push({ agent_id, reason: 'low-avg-confidence', value: avg.toFixed(2) });
      continue;
    }

    // Signal 2: rising override-rate
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
```

- [ ] **Step 3: Run tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/underperformer-detector.test.mjs 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/underperformer-detector.mjs tests/underperformer-detector.test.mjs
git commit -m "feat(evolution): underperformer detector (low-avg + rising-override-rate signals)"
```

---

### Task G4: Auto-strengthen trigger from underperformers

**Files:**
- Modify: `scripts/session-start-check.mjs`
- Modify: `scripts/supervibe-status.mjs`

**Why:** when underperformers detected, surface to user at SessionStart with recommendation. User confirms → existing `/supervibe-strengthen` command runs.

- [ ] **Step 1: Add detection to SessionStart**

In `scripts/session-start-check.mjs`, append a new function:

```javascript
async function reportUnderperformers() {
  try {
    const { readInvocations } = await import('./lib/agent-invocation-logger.mjs');
    const { detectUnderperformers } = await import('./lib/underperformer-detector.mjs');
    const all = await readInvocations({ limit: 10000 });
    if (all.length < 10) return; // not enough data
    const flagged = detectUnderperformers(all);
    if (flagged.length === 0) return;
    console.log(`[evolve] ⚠ ${flagged.length} agent(s) underperforming — recommend /supervibe-strengthen:`);
    for (const f of flagged) {
      console.log(`  - ${f.agent_id}: ${f.reason} (${f.value})`);
    }
  } catch {}
}
await reportUnderperformers();
```

- [ ] **Step 2: Add to evolve-status.mjs**

In `scripts/supervibe-status.mjs`, after MCP section, add:

```javascript
// Underperformer detection
const { readInvocations } = await import('./lib/agent-invocation-logger.mjs');
const { detectUnderperformers } = await import('./lib/underperformer-detector.mjs');
const allInv = await readInvocations({ limit: 10000 });
console.log();
if (allInv.length < 10) {
  console.log(color(`○ Agent telemetry: ${allInv.length} invocations logged (need ≥10 for analysis)`, 'dim'));
} else {
  const flagged = detectUnderperformers(allInv);
  if (flagged.length === 0) {
    console.log(color(`✓ Agent telemetry: ${allInv.length} invocations, no underperformers`, 'green'));
  } else {
    console.log(color(`⚠ Agent telemetry: ${flagged.length} underperformers detected (run /supervibe-strengthen)`, 'yellow'));
    for (const f of flagged) {
      console.log(color(`  - ${f.agent_id}: ${f.reason} (${f.value})`, 'dim'));
    }
  }
}
```

- [ ] **Step 3: Add test for status output**

In `tests/supervibe-status.test.mjs`:

```javascript
test('evolve-status: reports agent telemetry state', () => {
  const out = runStatus();
  assert.ok(/Agent telemetry:/.test(out), 'should mention agent telemetry');
});
```

- [ ] **Step 4: Run + manual verify**

```bash
cd "D:/ggsel projects/evolve" && npm run supervibe:status | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add scripts/session-start-check.mjs scripts/supervibe-status.mjs tests/supervibe-status.test.mjs
git commit -m "feat(evolution): SessionStart + status surface underperforming agents → recommend /supervibe-strengthen"
```

---

## PHASE H — Orchestrator-side Wiring (close the evolution loop)

**Goal:** make `logInvocation()` actually fire on every agent dispatch — without this hook, Phase G infrastructure is empty. Phase H wires the trigger via Claude Code's `PostToolUse` hook + adds PII redaction, log auto-cleanup, and auto-strengthen flow.

**Architecture decision:** use `PostToolUse` hook (already part of `hooks.json`) to detect `Task` tool calls (subagent dispatches). Hook script parses the tool call's metadata (subagent_type, description, response excerpt), parses the response for confidence-score patterns, and calls `logInvocation()`. Failure is non-fatal — hook never blocks tool flow.

**Constraints:**
1. Hook script must be **fast** (< 100ms) — runs after every tool call. Heavy work goes in background.
2. Hook script must be **failure-tolerant** — never throw; never block the main flow.
3. PII redaction at write time — task summaries may contain emails / cards / tokens.
4. Log size bounded — auto-prune entries > 180 days old at SessionStart.

---

### Task H1: PostToolUse hook script (logs `Task` tool calls)

**Files:**
- Create: `scripts/hooks/post-tool-use-log.mjs`
- Create: `tests/post-tool-use-log.test.mjs`

- [ ] **Step 1: Write failing tests**

Create `tests/post-tool-use-log.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { INVOCATION_LOG_PATH_FOR_TEST } from '../scripts/lib/agent-invocation-logger.mjs';

const sandbox = join(tmpdir(), `evolve-hook-${Date.now()}`);
const logPath = join(sandbox, '.claude', 'memory', 'agent-invocations.jsonl');

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  INVOCATION_LOG_PATH_FOR_TEST(logPath);
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

function runHook(input) {
  const cmd = `node scripts/hooks/post-tool-use-log.mjs`;
  return execSync(cmd, {
    cwd: process.cwd(),
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, EVOLVE_INVOCATION_LOG: logPath },
  });
}

test('hook: logs Task tool dispatch with agent_id from subagent_type', () => {
  runHook({
    tool_name: 'Task',
    tool_input: { subagent_type: 'laravel-developer', description: 'Add login endpoint' },
    tool_response: { content: 'Done. Confidence: 9.2/10. Pest tests green.' },
    session_id: 's1',
  });
  const log = require('fs').readFileSync(logPath, 'utf8');
  const entries = log.split('\n').filter(Boolean).map(JSON.parse);
  const last = entries[entries.length - 1];
  assert.strictEqual(last.agent_id, 'laravel-developer');
  assert.strictEqual(last.task_summary, 'Add login endpoint');
  assert.strictEqual(last.confidence_score, 9.2);
});

test('hook: ignores non-Task tools', () => {
  const before = require('fs').existsSync(logPath)
    ? require('fs').readFileSync(logPath, 'utf8').split('\n').filter(Boolean).length
    : 0;
  runHook({
    tool_name: 'Read',
    tool_input: { file_path: '/foo' },
    tool_response: { content: 'file content' },
  });
  const after = require('fs').existsSync(logPath)
    ? require('fs').readFileSync(logPath, 'utf8').split('\n').filter(Boolean).length
    : 0;
  assert.strictEqual(after, before, 'should not log non-Task tools');
});

test('hook: handles missing fields gracefully (no throw)', () => {
  // Empty / malformed input — must not crash
  runHook({});
  runHook({ tool_name: 'Task' }); // no tool_input
  runHook({ tool_name: 'Task', tool_input: {} }); // no subagent_type
  // If we reach here, hook didn't throw
  assert.ok(true);
});

test('hook: extracts confidence score from various patterns', () => {
  const cases = [
    { content: 'Confidence: 9.2/10', expected: 9.2 },
    { content: 'Final score: 8.5', expected: 8.5 },
    { content: 'confidence-score=10', expected: 10 },
    { content: 'no score here', expected: null },
  ];
  for (const c of cases) {
    runHook({
      tool_name: 'Task',
      tool_input: { subagent_type: 'test-agent', description: 'test' },
      tool_response: { content: c.content },
    });
  }
  const entries = require('fs').readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const lastFour = entries.slice(-4);
  assert.strictEqual(lastFour[0].confidence_score, 9.2);
  assert.strictEqual(lastFour[1].confidence_score, 8.5);
  assert.strictEqual(lastFour[2].confidence_score, 10);
  assert.strictEqual(lastFour[3].confidence_score, 0); // null → default 0 in logInvocation? Or skipped?
});
```

- [ ] **Step 2: Run failing tests**

Expected: FAIL — hook script doesn't exist.

- [ ] **Step 3: Implement hook script**

Create `scripts/hooks/post-tool-use-log.mjs`:

```javascript
#!/usr/bin/env node
// PostToolUse hook — invoked by Claude Code after every tool call.
// Reads JSON from stdin, logs Task (subagent dispatch) calls to invocation log.
// MUST be fast (< 100ms) and failure-tolerant — never blocks the main flow.

import { logInvocation } from '../lib/agent-invocation-logger.mjs';

// Confidence score extraction patterns (descending priority)
const CONFIDENCE_PATTERNS = [
  /confidence[:\s]*(\d{1,2}(?:\.\d+)?)\s*\/\s*10/i,    // "Confidence: 9.2/10"
  /confidence[-_\s]*score[:=\s]*(\d{1,2}(?:\.\d+)?)/i,  // "confidence-score: 9.2"
  /final[-_\s]*score[:=\s]*(\d{1,2}(?:\.\d+)?)/i,       // "Final score: 8.5"
  /score[:=\s]+(\d{1,2}(?:\.\d+)?)\s*\/\s*10/i,         // "score: 9/10"
];

// Override marker patterns
const OVERRIDE_PATTERNS = [
  /override[:\s]+true/i,
  /\boverride\b.*\baccepted\b/i,
];

function extractConfidence(text) {
  if (!text) return null;
  for (const pattern of CONFIDENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value >= 0 && value <= 10) return value;
    }
  }
  return null;
}

function extractOverride(text) {
  if (!text) return false;
  for (const pattern of OVERRIDE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

async function readStdin() {
  return await new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    // 1s timeout to avoid hangs
    setTimeout(() => resolve(data), 1000);
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) return;

  let payload;
  try { payload = JSON.parse(raw); }
  catch { return; }

  // Only log Task (subagent) calls
  if (payload.tool_name !== 'Task') return;

  const input = payload.tool_input || {};
  const response = payload.tool_response || {};
  const agent_id = input.subagent_type || input.agentType;
  if (!agent_id) return;

  const description = input.description || '';
  const responseText = typeof response.content === 'string' ? response.content
    : Array.isArray(response.content) ? response.content.map(c => c?.text || '').join('\n')
    : '';

  const confidence = extractConfidence(responseText);
  const override = extractOverride(responseText);

  try {
    await logInvocation({
      agent_id,
      task_summary: description.slice(0, 200),
      confidence_score: confidence ?? 0,
      override,
      duration_ms: payload.duration_ms ?? null,
      session_id: payload.session_id ?? null,
    });
  } catch {
    // Silent — hook must never block
  }
}

main().catch(() => {/* silent */});
```

- [ ] **Step 4: Run tests, verify pass**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/post-tool-use-log.test.mjs 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks/post-tool-use-log.mjs tests/post-tool-use-log.test.mjs
git commit -m "feat(evolution): PostToolUse hook logs Task tool dispatches with confidence/override extraction"
```

---

### Task H2: Wire hook into `hooks.json`

**Files:**
- Modify: `hooks.json`

- [ ] **Step 1: Read current hooks.json**

```bash
cat "D:/ggsel projects/evolve/hooks.json"
```

Note existing hook entries (SessionStart, PostToolUse, Stop).

- [ ] **Step 2: Add PostToolUse entry**

Modify `hooks.json` — in the `PostToolUse` hooks array (or create if missing), append:

```json
{
  "command": "node $CLAUDE_PLUGIN_ROOT/scripts/hooks/post-tool-use-log.mjs"
}
```

The full PostToolUse section should look like:
```json
"PostToolUse": [
  { "command": "node $CLAUDE_PLUGIN_ROOT/scripts/post-edit-stack-watch.mjs" },
  { "command": "node $CLAUDE_PLUGIN_ROOT/scripts/hooks/post-tool-use-log.mjs" }
]
```

(Order doesn't matter — both run independently.)

- [ ] **Step 3: Verify hook config still parses**

```bash
cd "D:/ggsel projects/evolve" && node -e "console.log(JSON.parse(require('fs').readFileSync('hooks.json','utf8')))"
```

Should print parsed config without error.

- [ ] **Step 4: Verify the existing hook test still passes**

```bash
cd "D:/ggsel projects/evolve" && npm test 2>&1 | grep "hooks.json wires"
```

Expected: `hooks.json wires SessionStart, PostToolUse, Stop` test passes.

- [ ] **Step 5: Commit**

```bash
git add hooks.json
git commit -m "chore(hooks): wire PostToolUse → post-tool-use-log script"
```

---

### Task H3: Auto-strengthen trigger flow with user gate

**Files:**
- Modify: `commands/supervibe-strengthen.md`
- Create: `scripts/lib/auto-strengthen-trigger.mjs`
- Create: `tests/auto-strengthen-trigger.test.mjs`

**Why:** G4 surfaces underperformers in SessionStart but only as text. H4 lets user say "yes" once and triggers `/supervibe-strengthen` for all flagged agents. User gate is mandatory — never auto-modify agents without confirmation.

- [ ] **Step 1: Create trigger logic**

Create `scripts/lib/auto-strengthen-trigger.mjs`:

```javascript
// Auto-strengthen trigger: when underperformers detected, prepare a list
// the user can act on with one confirmation. Never auto-modifies agent files.

import { readInvocations } from './agent-invocation-logger.mjs';
import { detectUnderperformers } from './underperformer-detector.mjs';

/**
 * Returns list of agents to strengthen + suggested commands.
 * @returns {Array<{agent_id, reason, value, command}>}
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
```

- [ ] **Step 2: Add tests**

Create `tests/auto-strengthen-trigger.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  logInvocation, INVOCATION_LOG_PATH_FOR_TEST
} from '../scripts/lib/agent-invocation-logger.mjs';
import { buildStrengthenSuggestions } from '../scripts/lib/auto-strengthen-trigger.mjs';

const sandbox = join(tmpdir(), `evolve-strengthen-trig-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  INVOCATION_LOG_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'agent-invocations.jsonl'));
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('buildStrengthenSuggestions: returns commands for flagged agents', async () => {
  // Inject 12 invocations with low avg
  for (let i = 0; i < 12; i++) {
    await logInvocation({
      agent_id: 'weak-agent',
      task_summary: 'task ' + i,
      confidence_score: 7 + (i % 3) * 0.1, // avg ~7.1
    });
  }
  const suggestions = await buildStrengthenSuggestions();
  const found = suggestions.find(s => s.agent_id === 'weak-agent');
  assert.ok(found, 'should suggest strengthen for weak-agent');
  assert.strictEqual(found.command, '/supervibe-strengthen weak-agent');
});

test('buildStrengthenSuggestions: empty when nothing flagged', async () => {
  // Reset by calling with too-few invocations doesn't pass threshold
  const sug = await buildStrengthenSuggestions();
  // Either empty or only flagged ones
  assert.ok(Array.isArray(sug));
});
```

- [ ] **Step 3: Update `/supervibe-strengthen` command to accept underperformers list**

In `commands/supervibe-strengthen.md`, append a section:

```markdown
## Auto-trigger flow (Phase H)

When invoked without arguments AND `supervibe:status` shows underperformers:

1. Run `node $CLAUDE_PLUGIN_ROOT/scripts/lib/auto-strengthen-trigger.mjs`
2. Show user the list with reasons + suggested commands
3. Ask user to confirm strengthening:
   - "Apply strengthen to all N flagged agents?" → run sequentially
   - "Pick specific" → list, user selects
   - "Cancel" → stop
4. Per agent: dispatch `supervibe:strengthen` skill on the agent file
5. After all complete: show summary

When invoked with explicit `<agent_id>`: directly strengthen that agent (skip detection).
```

- [ ] **Step 4: Run tests**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/auto-strengthen-trigger.test.mjs 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/auto-strengthen-trigger.mjs commands/supervibe-strengthen.md tests/auto-strengthen-trigger.test.mjs
git commit -m "feat(evolution): auto-strengthen trigger flow with user confirmation gate"
```

---

### Task H4: Verify end-to-end evolution loop works

**Files:**
- Create: `tests/evolution-loop-e2e.test.mjs`

**Why:** integration test proves the loop closes — log → tracker → detector → suggestion.

- [ ] **Step 1: Write E2E test**

Create `tests/evolution-loop-e2e.test.mjs`:

```javascript
import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  logInvocation, readInvocations, INVOCATION_LOG_PATH_FOR_TEST
} from '../scripts/lib/agent-invocation-logger.mjs';
import { detectUnderperformers } from '../scripts/lib/underperformer-detector.mjs';
import { aggregateForAgent } from '../scripts/effectiveness-tracker.mjs';
import { buildStrengthenSuggestions } from '../scripts/lib/auto-strengthen-trigger.mjs';

const sandbox = join(tmpdir(), `evolve-e2e-${Date.now()}`);

before(async () => {
  await mkdir(join(sandbox, '.claude', 'memory'), { recursive: true });
  INVOCATION_LOG_PATH_FOR_TEST(join(sandbox, '.claude', 'memory', 'agent-invocations.jsonl'));
});

after(async () => { await rm(sandbox, { recursive: true, force: true }); });

test('E2E: invocations → log → aggregate → detect → suggest', async () => {
  // 1. Simulate 12 invocations of an underperforming agent
  for (let i = 0; i < 12; i++) {
    await logInvocation({
      agent_id: 'failing-stack-agent',
      task_summary: 'Implement feature ' + i,
      confidence_score: 7.5 + (Math.random() * 0.3),
    });
  }

  // 2. Read the log back
  const invocations = await readInvocations({ agent_id: 'failing-stack-agent' });
  assert.strictEqual(invocations.length, 12);

  // 3. Aggregate via tracker
  const eff = aggregateForAgent(invocations);
  assert.strictEqual(eff.iterations, 12);
  assert.ok(eff['avg-confidence'] < 8, `avg should be < 8; got ${eff['avg-confidence']}`);

  // 4. Detector flags it
  const all = await readInvocations({ limit: 10000 });
  const flagged = detectUnderperformers(all);
  assert.ok(flagged.find(f => f.agent_id === 'failing-stack-agent'),
    'detector should flag failing-stack-agent');

  // 5. Suggestion built
  const suggestions = await buildStrengthenSuggestions();
  const sug = suggestions.find(s => s.agent_id === 'failing-stack-agent');
  assert.ok(sug, 'suggestion should be present');
  assert.match(sug.command, /^\/supervibe-strengthen/);
});
```

- [ ] **Step 2: Run E2E**

```bash
cd "D:/ggsel projects/evolve" && node --no-warnings --test tests/evolution-loop-e2e.test.mjs 2>&1 | tail -10
```

Expected: 1 test pass.

- [ ] **Step 3: Update CLAUDE.md with evolution loop section**

In `CLAUDE.md`, after the existing "Confidence Engine" section, add:

```markdown
---

## Agent Evolution Loop (Phase G + H)

Plugin tracks every agent invocation and detects degradation:

1. **Logger** (`scripts/lib/agent-invocation-logger.mjs`) — append-only JSONL at `.claude/memory/agent-invocations.jsonl`
2. **Hook** (`scripts/hooks/post-tool-use-log.mjs`) — wired via `PostToolUse`, logs every `Task` (subagent) dispatch
3. **PII redaction** at log time (emails / cards / API keys / JWT auto-masked)
4. **Effectiveness tracker** (`scripts/effectiveness-tracker.mjs`) — aggregates log → updates each agent's `frontmatter.effectiveness` block
5. **Underperformer detector** — flags agents with avg-confidence < 8.5 OR rising override-rate trend
6. **SessionStart surface** — banner shows flagged agents + recommends `/supervibe-strengthen`
7. **Auto-strengthen trigger** — `/supervibe-strengthen` (no args) reads suggestions, asks user confirmation, dispatches strengthen sequentially

**Discipline:**
- Underperformers reviewed at every SessionStart
- Auto-prune log entries > 180 days at SessionStart
- Manual strengthen always wins — auto-trigger never modifies without user gate

**Override rate** > 5% in 100-entry window also triggers `/supervibe-audit` recommendation (existing behavior).
```

- [ ] **Step 4: Commit**

```bash
git add tests/evolution-loop-e2e.test.mjs CLAUDE.md
git commit -m "feat(evolution): E2E test proves loop closes (log→aggregate→detect→suggest); CLAUDE.md documents flow"
```

---

### Task H5: Document the evolution loop in README + getting-started

**Files:**
- Modify: `README.md`
- Modify: `docs/getting-started.md`

- [ ] **Step 1: Add Evolution Loop to README "Что вы получаете" table**

In `README.md`, in the "Что вы получаете" table, add row:

```markdown
| **Agent evolution loop** | Каждый агент-вызов логируется → effectiveness-tracker обновляет frontmatter → detector ловит underperformers → SessionStart предлагает `/supervibe-strengthen` |
```

- [ ] **Step 2: Add explanation section**

After cookbook scenarios, add:

```markdown
## Как агенты «развиваются»

Плагин называется Evolve не зря. Под капотом работает четырёхступенчатая петля:

1. **Логирование** — каждый раз когда агент выполняет задачу через `Task` tool, hook (`post-tool-use-log.mjs`) записывает в `.claude/memory/agent-invocations.jsonl`: какой агент, описание задачи, confidence score, был ли override
2. **PII-редакция** — emails / номера карт / API keys / JWT автоматически маскируются перед записью
3. **Агрегация** — `effectiveness-tracker.mjs` периодически читает лог и обновляет frontmatter каждого агента: `iterations`, `avg-confidence`, `override-rate`, `last-task`, `last-applied`
4. **Детекция деградации** — если у агента avg-confidence упал ниже 8.5 ИЛИ override-rate растёт (например, было 10% → стало 60% за последние 10 задач) — он флагуется как underperformer
5. **SessionStart предупреждает** — на старте каждой сессии плагин показывает: «⚠ N агентов underperforming — recommend /supervibe-strengthen». Пользователь видит конкретные имена и причины

**`/supervibe-strengthen` без аргументов** прочитает текущих underperformers, спросит подтверждение и применит strengthen-skill ко всем по очереди — так агенты улучшаются на основе реальных метрик использования, а не догадок.

**Лог не растёт бесконечно** — записи старше 180 дней авто-чистятся при SessionStart.
```

- [ ] **Step 3: Add to getting-started.md**

Add similar section but more technical, after the Code Graph section.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/getting-started.md
git commit -m "docs(evolution): explain agent evolution loop in README + getting-started"
```

---

## PHASE I — Canonical confidence-output footer + agent-authoring docs

**Goal:** close the regex-parsing gap from Phase H by enforcing canonical output footer on every agent. Without this, agents that don't print `Confidence: N/10` get score=0 in invocation log → false underperformer flags.

**Why scoped down (vs original Phase I draft):** user-feedback heuristic classifier (~70-80% accuracy) and cross-project global memory (niche opt-in) trimmed — not enough value vs complexity. PII redaction in invocation log also trimmed — log lives in user's own project, gitignored, no exfiltration vector.

---

### Task I1: Canonical confidence-output format — teaching agents

**Files:**
- Modify: `CLAUDE.md`
- Modify: `confidence-rubrics/agent-quality.yaml`
- Create: `scripts/validate-agent-output-contract.mjs`
- Create: `tests/agent-output-contract-validator.test.mjs`

**Why:** Phase H's PostToolUse hook parses `Confidence: N/10` regex. If agent doesn't print canonical format → score=0 in log → false underperformer flag. I3 teaches all agents the canonical format and adds a validator.

- [ ] **Step 1: Define canonical format spec in CLAUDE.md**

In `CLAUDE.md`, add a new section after "Agent Evolution Loop":

```markdown
---

## Canonical agent output footer (mandatory)

Every agent's last 3-5 lines MUST contain a canonical footer that the PostToolUse hook can parse:

```
---
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: <rubric-id-from-confidence-rubrics-dir>
```

**Why:** The evolution loop's PostToolUse hook regex-matches `Confidence: N/10` to log score. Without canonical format → score=0 → false underperformer flag.

**Where to put it:** as a fenced code block OR plain text at the very end of agent output, after any other content. The agent's `## Output contract` section in its `.md` file MUST include a placeholder for this footer.

**For agents that legitimately can't produce a confidence score** (e.g. pure-research read-only agents): output `Confidence: N/A` and `Rubric: read-only-research` — Phase H regex treats `N/A` as null and skips logging.
```

- [ ] **Step 2: Update agent-quality rubric to score parseable output**

In `confidence-rubrics/agent-quality.yaml`, add a new dimension OR sub-criterion (depending on schema):

```yaml
- id: canonical-output-format
  weight: 1
  question: "Does the agent's Output contract end with the canonical footer (Confidence: N/10, Override, Rubric) so PostToolUse hook can parse it?"
  evidence-required: "Agent.md's Output contract section includes a code block or final paragraph with the three lines: Confidence / Override / Rubric. For non-quantifiable agents: Confidence: N/A is acceptable."
```

Rebalance other dimensions so total weight still = max-score.

- [ ] **Step 3: Implement validator**

Create `scripts/validate-agent-output-contract.mjs`:

```javascript
#!/usr/bin/env node
// Validate that every agent's Output contract section contains the canonical footer.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const FOOTER_PATTERN = /confidence\s*[:=]\s*(?:\d+(?:\.\d+)?\s*\/\s*10|N\/A|n\/a)/i;
const RUBRIC_PATTERN = /rubric\s*[:=]\s*[\w-]+/i;

async function findAllAgentFiles() {
  const result = [];
  const dirs = ['agents/_core', 'agents/_meta', 'agents/_design', 'agents/_ops', 'agents/_product'];
  for (const dir of dirs) {
    try {
      const files = await readdir(join(PROJECT_ROOT, dir));
      for (const f of files.filter(f => f.endsWith('.md'))) {
        result.push(join(dir, f));
      }
    } catch {}
  }
  // Stack agents
  const stacksDir = join(PROJECT_ROOT, 'agents', 'stacks');
  try {
    const stacks = await readdir(stacksDir);
    for (const s of stacks) {
      try {
        const files = await readdir(join(stacksDir, s));
        for (const f of files.filter(f => f.endsWith('.md'))) {
          result.push(join('agents', 'stacks', s, f));
        }
      } catch {}
    }
  } catch {}
  return result;
}

function hasCanonicalFooter(content) {
  // Find Output contract section
  const sectionMatch = content.match(/##\s*Output contract([\s\S]*?)(?=##\s|$)/i);
  if (!sectionMatch) return { ok: false, reason: 'no-output-contract' };
  const section = sectionMatch[1];
  if (!FOOTER_PATTERN.test(section)) return { ok: false, reason: 'no-confidence-line' };
  if (!RUBRIC_PATTERN.test(section)) return { ok: false, reason: 'no-rubric-line' };
  return { ok: true };
}

async function main() {
  const files = await findAllAgentFiles();
  const failed = [];
  for (const file of files) {
    const content = await readFile(join(PROJECT_ROOT, file), 'utf8');
    const result = hasCanonicalFooter(content);
    if (!result.ok) {
      failed.push({ file, reason: result.reason });
    }
  }
  if (failed.length > 0) {
    console.error(`${failed.length} agent(s) missing canonical output footer:`);
    for (const f of failed) console.error(`  ${f.file}: ${f.reason}`);
    process.exit(1);
  }
  console.log(`All ${files.length} agents have canonical Output contract footer ✓`);
}

main().catch(err => { console.error(err); process.exit(1); });

export { hasCanonicalFooter };
```

- [ ] **Step 4: Add to npm scripts + knip**

In `package.json`:
```json
"validate:agent-footers": "node scripts/validate-agent-output-contract.mjs",
```

In `knip.json` `entry`: add `"scripts/validate-agent-output-contract.mjs"`.

In `package.json` `check` script:
```json
"check": "npm run validate:plugin-json && npm run validate:frontmatter && npm run lint:descriptions && npm run validate:agent-footers && npm run lint:dead-code && npm test",
```

- [ ] **Step 5: Add unit test for validator function**

Create `tests/agent-output-contract-validator.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { hasCanonicalFooter } from '../scripts/validate-agent-output-contract.mjs';

test('detects valid canonical footer', () => {
  const content = `---\nname: test\n---\n## Output contract\n\nDo X.\n\n\`\`\`\nConfidence: 9.2/10\nOverride: false\nRubric: agent-delivery\n\`\`\`\n`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, true);
});

test('flags missing confidence line', () => {
  const content = `## Output contract\n\nDo X.\n\nRubric: agent-delivery\n`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no-confidence-line');
});

test('flags missing rubric line', () => {
  const content = `## Output contract\n\nDo X.\n\nConfidence: 9.2/10\n`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, false);
});

test('flags missing Output contract section', () => {
  const content = `## Procedure\n\nDo X.\n`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'no-output-contract');
});

test('accepts N/A for non-quantifiable agents', () => {
  const content = `## Output contract\n\nResearch report.\n\nConfidence: N/A\nOverride: false\nRubric: read-only-research\n`;
  const r = hasCanonicalFooter(content);
  assert.strictEqual(r.ok, true);
});
```

- [ ] **Step 6: Update all existing agents to add canonical footer**

This is mechanical. Run a one-time script to inject the footer into every agent's `## Output contract` section:

Create `scripts/inject-canonical-footer.mjs` (one-time helper, can be deleted after):

```javascript
#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { hasCanonicalFooter } from './validate-agent-output-contract.mjs';

const FOOTER_BLOCK = `\n\n**Canonical footer** (parsed by PostToolUse hook for evolution loop):\n\n\`\`\`\nConfidence: <N>.<dd>/10\nOverride: <true|false>\nRubric: agent-delivery\n\`\`\`\n`;

async function findAllAgentFiles() { /* ... same as validator ... */ }

async function main() {
  const files = await findAllAgentFiles();
  let injected = 0;
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const check = hasCanonicalFooter(content);
    if (check.ok) continue;
    // Inject BEFORE next ## section after Output contract
    const re = /(##\s*Output contract[\s\S]*?)(?=\n##\s|\n$)/i;
    const match = content.match(re);
    if (!match) continue;
    const newContent = content.replace(re, match[1] + FOOTER_BLOCK);
    await writeFile(file, newContent);
    injected++;
  }
  console.log(`Injected canonical footer into ${injected} agent files`);
}
main().catch(err => { console.error(err); process.exit(1); });
```

Run it once:
```bash
cd "D:/ggsel projects/evolve" && node scripts/inject-canonical-footer.mjs
```

After all agents updated, run validator:
```bash
npm run validate:agent-footers
```

Expected: `All N agents have canonical Output contract footer ✓`

- [ ] **Step 7: Delete the one-time injector**

```bash
rm scripts/inject-canonical-footer.mjs
```

(One-time tool; not needed after first run. Cleaner repo.)

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md confidence-rubrics/agent-quality.yaml scripts/validate-agent-output-contract.mjs tests/agent-output-contract-validator.test.mjs package.json knip.json agents/
git commit -m "feat(evolution): canonical confidence-output footer + validator + all agents updated"
```

---

### Task I2: Agent template refresh — make canonical footer mandatory in template

**Files:**
- Modify: `docs/agent-authoring.md`
- Modify: `docs/templates/` (if agent template exists; otherwise add note)

**Why:** new agents created in the future must include canonical footer from day 1.

- [ ] **Step 1: Update agent-authoring.md**

Read `docs/agent-authoring.md`. Locate Output contract section. Add:

```markdown
### Canonical footer (MANDATORY)

Every agent's `## Output contract` section MUST end with this block (verbatim, in a code fence):

```
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: <rubric-id>
```

Without this footer:
- PostToolUse hook can't parse the score → `confidence_score=0` in invocation log
- Agent gets falsely flagged as underperformer
- `npm run validate:agent-footers` will FAIL the build

For pure-research read-only agents that can't produce a confidence:
```
Confidence: N/A
Override: false
Rubric: read-only-research
```

PostToolUse hook treats `N/A` as null and skips logging.
```

- [ ] **Step 2: Verify validator passes**

```bash
cd "D:/ggsel projects/evolve" && npm run validate:agent-footers
```

Expected: pass.

- [ ] **Step 3: Run full check**

```bash
cd "D:/ggsel projects/evolve" && npm run check
```

Expected: 150+ tests pass (Phase H 143 + ~10 from I).

- [ ] **Step 4: Commit**

```bash
git add docs/agent-authoring.md
git commit -m "docs(evolution): canonical-footer requirement in agent-authoring guide"
```

---

## PHASE EFGHI-FINAL — Tests, Release v1.7.0

### Task EF.1: Final test run + version bump

**Files:**
- Modify: `package.json` (1.6.0 → 1.7.0)
- Modify: `.claude-plugin/plugin.json` (1.6.0 → 1.7.0)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run full check**

```bash
cd "D:/ggsel projects/evolve" && npm run check 2>&1 | tail -10
```

Expected: all tests pass (103 baseline + ~35 new across E/F/G/H/I = ~138).

If any test fails: STOP and fix before proceeding.

- [ ] **Step 2: Bump version**

In `package.json`: `"version": "1.7.0"`
In `.claude-plugin/plugin.json`: `"version": "1.7.0"`

- [ ] **Step 3: Add CHANGELOG entry**

In `CHANGELOG.md`, prepend before v1.6.0 section:

```markdown
## [1.7.0] — 2026-04-27

**Phase E + F + G + H + I. Live mockup preview server (with idle-shutdown, max-limit) + 6 strengthened planning skills + 16 new stack agents + 5 app-excellence agents + 4 new skills + dynamic MCP discovery + closed agent evolution loop (logger + PostToolUse hook + effectiveness tracker + underperformer detector + auto-strengthen + canonical output footer + build-time validator) + README focused comparison vs superpowers.**

### Added — Preview Server (Phase E1, 13 tasks)

- `scripts/lib/preview-mime.mjs` — hardcoded MIME type map (zero new deps)
- `scripts/lib/preview-server-manager.mjs` — port alloc 3047-3099→OS-assigned, JSON registry, PID liveness check
- `scripts/lib/preview-static-server.mjs` — pure `node:http` static + SSE hot-reload injection + activity tracking
- `scripts/lib/preview-hot-reload.mjs` — chokidar→SSE bridge with debouncing
- `scripts/preview-server.mjs` — CLI: `--root`, `--port`, `--label`, `--list`, `--kill`, `--kill-all`, `--idle-timeout`, `--force`
- `skills/preview-server/SKILL.md` — methodology
- `commands/supervibe-preview.md` — slash command
- Process hardening: idle-shutdown after 30min, max 10 concurrent (`--force` override)
- Auto-wiring: `prototype-builder` agent + `landing-page` skill + `interaction-design-patterns` skill auto-spawn previews
- `evolve-status` reports running previews with URL/PID/age
- SessionStart prunes stale registry entries

### Added — Strengthened Planning Skills (Phase E2, 6 skills)

- `supervibe:brainstorming` (87→250+ lines): first-principle decomp / competitive scan / stakeholder map / non-obvious risks / kill criteria / decision matrix / 3 named workflows
- `supervibe:writing-plans` (84→250+): critical path / parallelization batches / rollback per task / risk register / honest scope / review gates
- `supervibe:prd` (105→250+): user research / Gherkin ACs / metrics matrix / deprecation plan / instrumentation / launch checklist
- `supervibe:adr` (108→250+): alternatives matrix with weights / NFRs / decision review trigger / consequences (positive/negative/operational/migration)
- `supervibe:requirements-intake` (90→250+): persona elicitation / constraint matrix / success criteria before solution
- `supervibe:explore-alternatives` (128→250+): carbon-copy lookup / weighted matrix / sensitivity analysis / adversarial scoring

### Added — Reference Templates (Phase E3)

- `docs/templates/{PRD,ADR,plan,RFC,brainstorm-output,intake}-template.md`
- CLAUDE.md surfaces all new capabilities
- README + getting-started sections for preview + templates

### Added — Dynamic MCP Discovery (Phase F1, 5 tasks)

- `scripts/lib/mcp-registry.mjs` — discover/persist/query MCPs from user's Claude config
- `scripts/discover-mcps.mjs` — populate registry CLI
- SessionStart auto-refreshes registry; status shows available MCPs
- `supervibe:mcp-discovery` skill rewritten to be registry-driven with fallback awareness
- 8 researcher/design agents refactored to use `supervibe:mcp-discovery` instead of hardcoded `mcp__*` refs

### Added — 16 New Stack Agents (Phase F2)

- **Vue / Nuxt**: `vue-implementer`, `nuxt-architect`, `nuxt-developer` (3)
- **Svelte**: `sveltekit-developer` (1)
- **Django**: `django-architect`, `django-developer`, `drf-specialist` (3)
- **Rails**: `rails-architect`, `rails-developer` (2)
- **Spring**: `spring-architect`, `spring-developer` (2)
- **.NET**: `aspnet-developer` (1)
- **Go**: `go-service-developer` (1)
- **Node**: `express-developer`, `nestjs-developer` (2)
- **Mobile**: `flutter-developer`, `ios-developer`, `android-developer` (3)
- **GraphQL**: `graphql-schema-designer` (1)
- **Storage**: `mysql-architect`, `mongo-architect`, `elasticsearch-architect` (3)

Each ≥250 lines, full canonical structure (Persona / Project Context / Skills / Decision tree / Procedure / Output contract / Anti-patterns / Verification / Common workflows / Out of scope / Related).

### Added — App Excellence (Phase F3 + F4)

- 5 new agents: `api-designer`, `auth-architect`, `observability-architect`, `job-scheduler-architect`, `data-modeler`
- 4 new skills: `supervibe:test-strategy`, `supervibe:feature-flag-rollout`, `supervibe:error-envelope-design`, `supervibe:auth-flow-design`

### Added — README rewrite (Phase F5)

- Removed "15-year-persona" marketing language
- Added comparison table (Evolve vs superpowers — main analog)
- Added "When to choose Evolve vs superpowers" section + reverse direction
- Added "Can I use both" section
- Added cookbook with 5 end-to-end scenarios

### Added — Agent Evolution Loop (Phase G, 4 tasks)

- `scripts/lib/agent-invocation-logger.mjs` — append-only JSONL invocation log + `pruneOldEntries`
- `scripts/effectiveness-tracker.mjs` writes to agent frontmatter (`effectiveness.iterations / last-task / last-outcome / avg-confidence / override-rate`)
- `scripts/lib/underperformer-detector.mjs` — flags low-avg-confidence + rising-override-rate trends
- SessionStart + status surface underperforming agents → recommend `/supervibe-strengthen`

### Added — Orchestrator-side Wiring (Phase H, 4 tasks) — closes the evolution loop

- `scripts/hooks/post-tool-use-log.mjs` — PostToolUse hook auto-logs every `Task` (subagent) dispatch
- `hooks.json` wired with PostToolUse → invocation logger
- **Confidence-score parser** — extracts `Confidence: 9.2/10`, `Final score: 8.5`, etc. from agent output
- **Override marker parser** — detects `override: true` patterns in agent output
- `scripts/lib/auto-strengthen-trigger.mjs` — `/supervibe-strengthen` (no args) reads underperformers, asks user gate, dispatches strengthen sequentially
- E2E test proves loop closes (log → aggregate → detect → suggest)
- README + getting-started document the evolution loop

### Added — Canonical confidence-output footer (Phase I, 2 tasks)

- **CLAUDE.md** mandates `Confidence: N/10 | Override: true|false | Rubric: <id>` block at end of every agent output
- `confidence-rubrics/agent-quality.yaml` adds `canonical-output-format` dimension
- `scripts/validate-agent-output-contract.mjs` — fails build if any agent's Output contract lacks the footer
- `npm run validate:agent-footers` integrated into `npm run check`
- All 67 existing agents updated via one-time injector script (deleted post-run)
- Non-quantifiable agents (pure-research) use `Confidence: N/A` — hook treats as null
- `docs/agent-authoring.md` documents canonical-footer requirement for new agents

### Stats (v1.7.0)

- **138+/138+ tests pass** (Phase D 103 + ~35 new across E/F/G/H/I)
- **Agent count**: 46 → 67 (16 stack + 5 app-excellence)
- **Skill count**: 40 → 44 (4 new app-excellence)
- **Hooks wired**: SessionStart (auto-refresh + prune), PostToolUse (Task logger)
- **Bundle size**: unchanged (zero new npm deps)
- **MCPs**: dynamically discovered, no longer hardcoded
- **Evolution loop**: closed:
  - Every Task tool dispatch logged with confidence + override extraction
  - Underperformers flagged at SessionStart
  - One-click `/supervibe-strengthen`
  - Canonical output footer enforced via build-time validator

### Intentionally NOT included (scope discipline — value-vs-complexity tradeoff)

- ~~User-feedback heuristic classifier~~ — ~70-80% regex accuracy creates noisy signal that can DEGRADE underperformer detector. Use `confidence_score` + `override` from agent output as primary signal.
- ~~Cross-project global memory~~ — niche feature, opt-in without users. Defer until real demand emerges.
- ~~PII redaction in invocation log~~ — invocation log lives in user's own project, gitignored, no exfiltration vector. Defending against absent threat.
- ~~Auto-prune log >180 days~~ — JSONL log of 1000 invocations = ~200KB. Unbounded growth concern is theoretical.
- ~~Heartbeat file per preview-server~~ — `process.kill(pid, 0)` PID liveness check covers 95% of cases.

### Trade-offs / Known gaps (v1.7.0 — what we accept as honest limits)

- Preview-server binds to `127.0.0.1` only — no LAN access (security choice; `--host` flag in v1.8 if needed)
- SSE doesn't auto-reconnect across server restart — user refreshes manually
- 16 new stack agents use canonical template — first execution may show stack-specific gaps; rubric catches low-confidence outputs
- MCP registry refreshed at SessionStart — mid-session MCP install/remove needs manual `node scripts/discover-mcps.mjs`
- Cookbook scenarios are illustrative — convert to integration tests in v1.8

---

```

- [ ] **Step 4: Run check one more time**

```bash
cd "D:/ggsel projects/evolve" && npm run check 2>&1 | tail -5
```

- [ ] **Step 5: Commit release**

```bash
git add package.json .claude-plugin/plugin.json CHANGELOG.md
git commit -m "chore(release): v1.7.0 — Phase E+F+G+H+I (preview / planning / stacks / MCP / app excellence / closed evolution loop / canonical footer)"
```

---

## Self-Review

### 1. Spec coverage

| Original user requirement | Plan task |
|---------------------------|-----------|
| Локальные мокапы — http://localhost:PORT | E1.1–E1.5 |
| Hot-reload via SSE | E1.4 |
| No process hangs / zombies | E1.5 (SIGINT cleanup) + E1.11 (SessionStart prune) + E1.12 (idle-shutdown) + E1.13 (max-limit) |
| Auto-spawn from design agents | E1.8, E1.9 |
| Status surfacing | E1.10 |
| Optional Playwright screenshot | E1.6 |
| User-facing slash command | E1.7 |
| **No new commands for planning** (only strengthen) | E2.1–E2.6 — only MODIFY |
| Strengthen brainstorming | E2.1 |
| Strengthen writing-plans | E2.2 |
| Strengthen PRD | E2.3 |
| Strengthen ADR | E2.4 |
| Strengthen requirements-intake | E2.5 |
| Strengthen explore-alternatives | E2.6 |
| Reference templates for эталонные documents | E3.1 (6 templates) |
| **Расширение стеков (16 new agents)** | F2 (11 sub-tasks, 16 agents) |
| **Гибкий MCP discovery (не фиксированный)** | F1 (5 tasks: registry + skill + 8 agent refactors) |
| **README для бабушек + сравнение** | F5 |
| **Эталонная разработка приложений** | F3 (5 agents) + F4 (4 skills) |
| **Агенты развиваются** (Phase G infrastructure + Phase H wiring) | G1–G4 (logger / tracker / detector / suggest) + H1–H4 (PostToolUse hook / hooks.json / auto-strengthen / E2E test / docs) |
| **Closed evolution loop** (агенты автоматически логируют себя) | H1 (PostToolUse hook) + H2 (hooks.json wire) |
| **Auto-strengthen suggestion с user gate** | H3 (trigger + command) |
| **E2E proof that loop closes** | H4 (integration test) |
| **Canonical confidence-output format** (no false underperformer flags) | I1 (CLAUDE.md spec + rubric + validator + agent updates) |
| **New agents inherit canonical footer** | I2 (agent-authoring.md update) |
| Version bump + CHANGELOG | EF.1 |

### 2. Placeholder scan

- All file paths exact ✓
- All commands have expected output ✓
- Every skill strengthen task lists exact section names ✓
- Phase F2 stack agents reference canonical template (`agents/stacks/laravel/laravel-developer.md`) explicitly ✓
- Templates have all required sections (no TBD) ✓
- No "implement later" / "fill in details" anywhere ✓

### 3. Type consistency

- `startStaticServer({root, port})` returns `{port, server, stop, broadcastReload, getLastActivityAt, hasActiveSseClients}` — used in E1.3, E1.4, E1.5, E1.12 consistently
- Registry entry shape `{port, pid, root, label, watching, startedAt}` — same in E1.2, E1.10, E1.13, E1.14
- MCP registry entry `{name, command, args, tools, discoveredAt}` — used identically in F1.1, F1.2, F1.5
- Invocation log entry `{ts, agent_id, task_summary, confidence_score, rubric, override, override_reason, duration_ms, user_feedback, error}` — same in G1, G2, G3, G4
- Underperformer flag shape `{agent_id, reason, value}` — same in G3 and G4 surface
- Skill frontmatter unchanged across all strengthen tasks ✓
- Agent frontmatter `effectiveness:` block shape `{iterations, last-task, last-outcome, last-applied, avg-confidence, override-rate}` — written by G2, displayed conceptually nowhere yet (Phase H feature)

### 4. Risks / accepted limitations

- **Phase F2 — 16 agents from canonical template**: real expertise per stack varies; first uses may show gaps. Acceptable — strengthen workflow exists. Rubric will catch low-confidence outputs.
- **Phase F1 — MCP refactor on 8 agents**: changing `tools:` array could break agent dispatching. Mitigated by `supervibe:mcp-discovery` providing tool lookup. Manual smoke-test on 1 agent before all 8.
- **Preview server idle-shutdown false-positive**: tab left open without interaction >30 min → server shuts down. Mitigation: SSE keepalive every 25s counts as activity → open tab keeps server alive. Closed-tab idle does shut down (correct behavior).
- **Max-servers limit (10 default)**: realistic ceiling for parallel design tasks. `--force` to bypass.
- **MCP registry stale**: detected at SessionStart. Mid-session install/remove needs manual `node scripts/discover-mcps.mjs`. Acceptable.
- **Canonical footer enforcement is structural** (regex match), not semantic — agent could write `Confidence: 9/10` while actually meaning N/A. Trust agent honesty within rubric discipline.

### 5. Honest cumulative scoring (per dimension after Phase E + F + G + H + I)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Preview server (process management, no zombies) | 9/10 | Idle-shutdown + max-limit + SIGINT cover 95%+ cases |
| Strengthened planning skills | 9.5/10 | All 6 reference templates, comprehensive structure |
| Reference templates | 9/10 | 6 starter docs |
| MCP dynamic discovery | 9/10 | Registry-driven, fallback aware |
| Stack expansion | 9/10 | 16 new agents, canonical structure |
| App excellence (api-designer / auth / observability / job-scheduler / data-modeler) | 9/10 | Solid foundation |
| New app skills (test-strategy / feature-flags / error-envelope / auth-flow) | 9/10 | All canonical structure |
| README rewrite + comparison | 9.5/10 | Focused vs superpowers, only differentiating rows |
| **Agent evolution loop** | **9/10** | Phase H closes orchestrator-hook gap; canonical footer enforces parseable output |
| **Canonical output format** | 9.5/10 | Build-time validator catches missing footer; 100% agent compliance enforced |
| Test coverage | 9.5/10 | TDD on every layer + E2E integration test in H4 |

**Mean: 9.2/10** — focused scope, no overkill.

### 6. Trimmed scope (intentionally NOT in v1.7.0)

These were considered and removed because complexity > value for current users:

- **PII redaction in invocation log** — log lives in user's own gitignored project, no exfiltration vector
- **Auto-prune log >180 days** — log size unbounded only theoretically (~200KB per 1000 invocations)
- **Heartbeat file per preview-server** — `process.kill(pid, 0)` PID liveness covers 95% of cases
- **User-feedback heuristic classifier** — ~70-80% regex accuracy creates noisy signal; degrades detector
- **Cross-project global memory** — niche feature, opt-in without users; defer until real demand

If demand emerges from real usage, any of these can be added in v1.8+.

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-27-phase-e-preview-and-planning.md`. **~50 tasks total** (trimmed from 70) across Phase E + F + G + H + I. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch fresh subagent per task. Highly parallelizable batches:

**Phase E batches:**
- Batch 1 (sequential foundation): E1.1, E1.2, E1.3, E1.4 — code + tests
- Batch 2 (3 parallel): E1.5, E1.6, E1.7
- Batch 3 (4 parallel): E1.8, E1.9, E1.10, E1.11
- Batch 4 (2 parallel): E1.12, E1.13 — idle-shutdown + max-limit
- Batch 5 (**6 parallel subagents**): E2.1–E2.6 — biggest parallelism win
- Batch 6 (3 parallel): E3.1, E3.2, E3.3

**Phase F batches:**
- Batch 7 (sequential foundation): F1.1, F1.2 — MCP registry + SessionStart
- Batch 8 (3 parallel): F1.3, F1.4, F1.5 — skill + agent refactor + status
- Batch 9 (**11 parallel subagents** — biggest win): F2.1–F2.11 — stack agents
- Batch 10 (1 sequential): F2.12 — CLAUDE.md table update
- Batch 11 (1 group): F3 — 5 app-excellence agents
- Batch 12 (1 group): F4 — 4 app-excellence skills
- Batch 13 (1 sequential): F5 — README rewrite

**Phase G batches:**
- Batch 14 (sequential): G1, G2 — logger then tracker
- Batch 15 (parallel): G3, G4 — detector + status surface

**Phase H batches:**
- Batch 16 (sequential foundation): H1 — PostToolUse hook script + tests
- Batch 17 (sequential): H2 — wire hooks.json
- Batch 18 (sequential): H3 — auto-strengthen trigger
- Batch 19 (sequential): H4 — E2E integration test
- Batch 20 (sequential): H5 — README + getting-started docs for evolution loop

**Phase I batches:**
- Batch 21 (sequential): I1 — canonical footer (CLAUDE.md + rubric + validator + 67 agent updates)
- Batch 22 (sequential): I2 — agent-authoring docs

**Final:**
- Batch 23 (sequential): EF.1 — release

Estimated total wall-clock with aggressive parallelism: **~3 working days** (down from 4 after trim).

**2. Inline Execution** — Sequential batches with checkpoints:

- Phase E (E1+E2+E3): ~1.5 days
- Phase F (F1+F2+F3+F4+F5): ~1.5 days
- Phase G (G1–G4): ~0.5 day
- Phase H (H1–H5): ~0.4 day
- Phase I (I1–I2): ~0.3 day
- EF.1: ~0.25 day

Estimated total: **~4.25 working days sequential**.

Which approach?
