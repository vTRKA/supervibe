#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import PptxGenJS from 'pptxgenjs';

const DEFAULT_COLORS = {
  background: 'FFFFFF',
  foreground: '111827',
  muted: '64748B',
  accent: '2563EB',
  accentText: 'FFFFFF',
};

function normalizeHex(value, fallback) {
  const raw = String(value || fallback || '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : fallback;
}

function safeText(value) {
  if (value == null) return '';
  return String(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function validateDeckSpec(deck) {
  const issues = [];
  if (!deck || typeof deck !== 'object') issues.push('deck must be an object');
  if (!safeText(deck?.title).trim()) issues.push('title is required');
  if (!Array.isArray(deck?.slides) || deck.slides.length === 0) issues.push('slides must be a non-empty array');
  for (const [index, slide] of asArray(deck?.slides).entries()) {
    if (!slide || typeof slide !== 'object') issues.push(`slides[${index}] must be an object`);
    if (!safeText(slide?.title).trim() && slide?.type !== 'image') issues.push(`slides[${index}].title is required`);
  }
  return issues;
}

function addFooter(slide, pptx, deck, index, colors) {
  slide.addText(`${index + 1}`, {
    x: 12.25,
    y: 7.05,
    w: 0.35,
    h: 0.18,
    fontFace: deck.theme?.bodyFontFace || 'Aptos',
    fontSize: 8,
    color: colors.muted,
    margin: 0,
    align: 'right',
  });
  if (deck.title) {
    slide.addText(deck.title, {
      x: 0.55,
      y: 7.03,
      w: 5.5,
      h: 0.2,
      fontFace: deck.theme?.bodyFontFace || 'Aptos',
      fontSize: 7,
      color: colors.muted,
      margin: 0,
    });
  }
}

function addTitle(slide, deck, item, colors) {
  slide.addText(safeText(item.title), {
    x: 0.7,
    y: item.type === 'title' ? 2.1 : 0.65,
    w: item.type === 'title' ? 9.3 : 10.4,
    h: item.type === 'title' ? 0.8 : 0.45,
    fontFace: deck.theme?.headFontFace || 'Aptos Display',
    fontSize: item.type === 'title' ? 42 : 26,
    bold: true,
    color: colors.foreground,
    margin: 0,
    fit: 'shrink',
  });
}

function addSubtitle(slide, deck, item, colors) {
  if (!item.subtitle) return;
  slide.addText(safeText(item.subtitle), {
    x: 0.72,
    y: item.type === 'title' ? 3.08 : 1.18,
    w: item.type === 'title' ? 8.4 : 10.1,
    h: item.type === 'title' ? 0.6 : 0.35,
    fontFace: deck.theme?.bodyFontFace || 'Aptos',
    fontSize: item.type === 'title' ? 18 : 12,
    color: colors.muted,
    margin: 0,
    fit: 'shrink',
  });
}

function addBullets(slide, deck, item, colors) {
  const bullets = asArray(item.bullets).filter(Boolean);
  if (bullets.length === 0) return;
  slide.addText(bullets.map(text => ({ text: safeText(text), options: { bullet: { indent: 18 }, breakLine: true } })), {
    x: 0.95,
    y: 1.75,
    w: 8.7,
    h: 4.7,
    fontFace: deck.theme?.bodyFontFace || 'Aptos',
    fontSize: 18,
    color: colors.foreground,
    breakLine: false,
    fit: 'shrink',
    paraSpaceAfterPt: 14,
  });
}

function addQuote(slide, deck, item, colors) {
  slide.addText(safeText(item.quote || item.subtitle || ''), {
    x: 1.2,
    y: 2.0,
    w: 9.5,
    h: 2.2,
    fontFace: deck.theme?.headFontFace || 'Aptos Display',
    fontSize: 30,
    italic: true,
    color: colors.foreground,
    fit: 'shrink',
    margin: 0,
  });
  if (item.attribution) {
    slide.addText(safeText(item.attribution), {
      x: 1.25,
      y: 4.45,
      w: 7,
      h: 0.35,
      fontFace: deck.theme?.bodyFontFace || 'Aptos',
      fontSize: 13,
      color: colors.muted,
      margin: 0,
    });
  }
}

function addImage(slide, item, baseDir) {
  const imagePath = item.image?.path || item.imagePath;
  const resolved = imagePath ? resolve(baseDir, imagePath) : '';
  if (!imagePath || !existsSync(resolved)) return false;
  slide.addImage({
    path: resolved,
    x: item.image?.x ?? 7.15,
    y: item.image?.y ?? 1.45,
    w: item.image?.w ?? 4.75,
    h: item.image?.h ?? 4.15,
  });
  return true;
}

function addAccentBar(slide, colors) {
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.12,
    h: 7.5,
    fill: { color: colors.accent },
    line: { color: colors.accent },
  });
}

export async function buildPresentation({ input, output }) {
  const inputPath = resolve(input);
  const outputPath = resolve(output);
  const deck = JSON.parse(await readFile(inputPath, 'utf8'));
  const issues = validateDeckSpec(deck);
  if (issues.length > 0) {
    throw new Error(`Invalid deck spec:\n- ${issues.join('\n- ')}`);
  }

  const colors = {
    background: normalizeHex(deck.theme?.colors?.background, DEFAULT_COLORS.background),
    foreground: normalizeHex(deck.theme?.colors?.foreground, DEFAULT_COLORS.foreground),
    muted: normalizeHex(deck.theme?.colors?.muted, DEFAULT_COLORS.muted),
    accent: normalizeHex(deck.theme?.colors?.accent, DEFAULT_COLORS.accent),
    accentText: normalizeHex(deck.theme?.colors?.accentText, DEFAULT_COLORS.accentText),
  };

  const pptx = new PptxGenJS();
  pptx.layout = deck.layout || 'LAYOUT_WIDE';
  pptx.author = deck.author || 'Supervibe';
  pptx.subject = deck.title;
  pptx.title = deck.title;
  pptx.company = deck.company || '';
  pptx.lang = deck.theme?.lang || 'en-US';
  pptx.theme = {
    headFontFace: deck.theme?.headFontFace || 'Aptos Display',
    bodyFontFace: deck.theme?.bodyFontFace || 'Aptos',
    lang: pptx.lang,
  };

  for (const [index, item] of deck.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: normalizeHex(item.background, colors.background) };
    addAccentBar(slide, colors);

    if (item.type === 'section') {
      slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: colors.accent }, line: { color: colors.accent } });
      slide.addText(safeText(item.title), {
        x: 0.9,
        y: 2.7,
        w: 10.4,
        h: 0.75,
        fontFace: deck.theme?.headFontFace || 'Aptos Display',
        fontSize: 38,
        bold: true,
        color: colors.accentText,
        margin: 0,
        fit: 'shrink',
      });
      addSubtitle(slide, deck, item, { ...colors, muted: colors.accentText });
    } else if (item.type === 'quote') {
      addTitle(slide, deck, item, colors);
      addQuote(slide, deck, item, colors);
    } else {
      addTitle(slide, deck, item, colors);
      addSubtitle(slide, deck, item, colors);
      addBullets(slide, deck, item, colors);
      addImage(slide, item, dirname(inputPath));
    }

    addFooter(slide, pptx, deck, index, colors);
    if (item.notes && typeof slide.addNotes === 'function') {
      slide.addNotes(safeText(item.notes));
    }
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await pptx.writeFile({ fileName: outputPath });
  return { output: outputPath, slides: deck.slides.length, title: deck.title };
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', short: 'i' },
      output: { type: 'string', short: 'o' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || !values.input || !values.output) {
    console.log(`Usage:
  node scripts/build-presentation.mjs --input presentations/<slug>/deck.json --output presentations/<slug>/export/<slug>.pptx [--json]`);
    process.exit(values.help ? 0 : 2);
  }

  const result = await buildPresentation({ input: values.input, output: values.output });
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[supervibe-presentation] exported ${result.slides} slides -> ${result.output}`);
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
