// Hardcoded MIME map — covers 99% of mockup file types.
// Avoids npm dep on `mime` since we only need ~15 types.

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
