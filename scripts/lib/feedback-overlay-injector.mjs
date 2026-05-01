import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const cache = {};
async function loadAsset(name) {
  if (!cache[name]) {
    cache[name] = await readFile(join(here, 'feedback-overlay', name), 'utf8');
  }
  return cache[name];
}

export async function injectOverlay(html, { prototypeSlug = 'unknown', viewport } = {}) {
  const js = await loadAsset('overlay.js');
  const css = await loadAsset('overlay.css');
  const slug = JSON.stringify(prototypeSlug);
  const vp = viewport ? `window.__supervibeViewport=${JSON.stringify(viewport)};` : '';
  const tag = `
<style>${css}</style>
<script>window.__supervibePrototypeSlug=${slug};${vp}</script>
<script>${js}</script>
`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, tag + '</body>');
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, tag + '</html>');
  return html + tag;
}
