import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inspect } from 'node:util';

export function resolveServerLogPaths({ rootDir = process.cwd(), name = 'server', port = 0 } = {}) {
  const safeName = String(name || 'server')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'server';
  const suffix = port ? `-${port}` : '';
  const base = join(rootDir, '.supervibe', 'servers', `${safeName}${suffix}`);
  return {
    stdout: `${base}.out.log`,
    stderr: `${base}.err.log`,
  };
}

export function buildBackgroundSpawnOptions({
  cwd = process.cwd(),
  env = process.env,
  logs = {},
  platform = process.platform,
} = {}) {
  const strategy = resolvePlatformProcessStrategy(platform);
  return {
    cwd,
    detached: strategy.daemon.detached,
    stdio: 'ignore',
    windowsHide: strategy.daemon.windowsHide,
    env: {
      ...env,
      SUPERVIBE_SERVER_DAEMON: '1',
      SUPERVIBE_SERVER_STDOUT_LOG: logs.stdout || '',
      SUPERVIBE_SERVER_STDERR_LOG: logs.stderr || '',
    },
  };
}

export function resolvePlatformProcessStrategy(platform = process.platform) {
  const common = {
    daemon: {
      detached: true,
      windowsHide: platform === 'win32',
      stopBehavior: platform === 'win32' ? 'pid-registry-taskkill-tree' : 'pid-registry-sigterm-then-sigkill',
    },
    heartbeat: {
      fileName: '.watcher-heartbeat',
      staleMs: 15_000,
    },
    lock: {
      fileName: '.code-index.lock',
      staleRecovery: 'mtime-and-heartbeat-age',
    },
    logs: {
      pathSeparator: platform === 'win32' ? '\\' : '/',
      stdout: '.supervibe/servers/*.out.log',
      stderr: '.supervibe/servers/*.err.log',
    },
    signals: platform === 'win32' ? ['CTRL_BREAK_EVENT', 'taskkill'] : ['SIGTERM', 'SIGKILL'],
    path: {
      caseSensitive: platform !== 'win32',
    },
  };
  return common;
}

export function normalizeProcessPathForPlatform(path, platform = process.platform) {
  const normalized = String(path || '').replace(/\\/g, '/');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function buildDaemonChildArgs(argv = []) {
  const args = argv.filter((arg) => arg !== '--daemon');
  if (!args.includes('--foreground')) args.push('--foreground');
  return args;
}

export function startBackgroundNodeScript({
  scriptPath,
  args = [],
  cwd = process.cwd(),
  name = 'server',
  port = 0,
  env = process.env,
} = {}) {
  if (!scriptPath) throw new Error('scriptPath is required');
  const logs = resolveServerLogPaths({ rootDir: cwd, name, port });
  mkdirSync(dirname(logs.stdout), { recursive: true });
  appendFileSync(logs.stdout, `[supervibe] starting ${name} on port ${port || 'auto'}\n`);
  const child = spawn(process.execPath, [scriptPath, ...buildDaemonChildArgs(args)], buildBackgroundSpawnOptions({
    cwd,
    env,
    logs,
  }));
  child.unref();
  return {
    pid: child.pid,
    logs,
    args: buildDaemonChildArgs(args),
  };
}

export function buildWatcherDaemonConfig({ rootDir = process.cwd(), noEmbeddings = false } = {}) {
  return {
    name: 'memory-watch',
    scriptPath: join(rootDir, 'scripts', 'watch-memory.mjs'),
    args: noEmbeddings ? ['--no-embeddings', '--foreground'] : ['--foreground'],
    logs: resolveServerLogPaths({ rootDir, name: 'memory-watch' }),
  };
}

export function activateDaemonLoggingFromEnv({ env = process.env } = {}) {
  const stdoutPath = env.SUPERVIBE_SERVER_STDOUT_LOG;
  const stderrPath = env.SUPERVIBE_SERVER_STDERR_LOG || stdoutPath;
  if (!stdoutPath && !stderrPath) return null;

  if (stdoutPath) mkdirSync(dirname(stdoutPath), { recursive: true });
  if (stderrPath) mkdirSync(dirname(stderrPath), { recursive: true });

  const write = (target, args) => {
    if (!target) return;
    const line = args.map((arg) => typeof arg === 'string' ? arg : inspect(arg, { colors: false, depth: 6 })).join(' ');
    appendFileSync(target, `${line}\n`);
  };

  console.log = (...args) => write(stdoutPath, args);
  console.info = (...args) => write(stdoutPath, args);
  console.warn = (...args) => write(stderrPath, args);
  console.error = (...args) => write(stderrPath, args);

  process.on('uncaughtException', (error) => {
    write(stderrPath, ['uncaughtException', error?.stack || error?.message || String(error)]);
    process.exit(1);
  });
  process.on('unhandledRejection', (error) => {
    write(stderrPath, ['unhandledRejection', error?.stack || error?.message || String(error)]);
    process.exit(1);
  });

  return { stdout: stdoutPath, stderr: stderrPath };
}
