// SHA-256 content hash for change detection.
// Used by code-store and memory-store to skip unchanged files during incremental updates.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** SHA-256 of a string, returned as hex (64 chars). */
export function hashContent(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** SHA-256 of a file's content. */
export async function hashFile(filePath) {
  return await new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', rejectHash);
    stream.once('end', () => resolveHash(hash.digest('hex')));
  });
}
