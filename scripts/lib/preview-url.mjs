import { basename } from 'node:path';

const DESIGN_CONTAINER_ROOTS = new Set(['prototypes', 'mockups', 'presentations']);

export function resolvePreviewUrlPath({ root, label } = {}) {
  const rootName = basename(String(root || ''));
  const safeLabel = String(label || '').trim();
  if (!DESIGN_CONTAINER_ROOTS.has(rootName) || !safeLabel || safeLabel.includes('/') || safeLabel.includes('\\')) {
    return '/';
  }
  return `/${encodeURIComponent(safeLabel)}/`;
}

export function formatPreviewUrl({ port, root, label, host = 'localhost' } = {}) {
  const path = resolvePreviewUrlPath({ root, label });
  return `http://${host}:${port}${path === '/' ? '' : path}`;
}
