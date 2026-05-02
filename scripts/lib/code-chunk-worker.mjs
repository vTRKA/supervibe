import { parentPort, workerData } from 'node:worker_threads';

import { chunkCode } from './code-chunker.mjs';

try {
  const { code, filePath, options } = workerData || {};
  const chunks = await chunkCode(code, filePath, options || {});
  parentPort.postMessage({ ok: true, chunks });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: {
      name: error?.name || 'Error',
      message: error?.message || String(error || 'unknown error'),
      code: error?.code || '',
      stack: error?.stack || '',
    },
  });
}
