// Chromium, when the project has it, and a headless page to use it in.
//
// Everything that needs a browser goes through here: measure-bbox.mjs
// measures text, which has no width until a font renders it; font-guard.mjs
// measures labels in fallback faces; render-png.mjs rasterises. Chromium is
// opt-in, so loadChromium() answers null rather than throwing when it is
// missing, and the exporter carries on with SVGs only.

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectPaths } from './paths.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = join(HERE, 'fonts');

// Playwright is installed into the project's diagrams folder (or anywhere
// above it), so it is resolved from there first, then from this file.
function resolvePlaywright(root) {
  const bases = [pathToFileURL(join(root, 'package.json')), import.meta.url];
  for (const base of bases) {
    try {
      return createRequire(base)('@playwright/test');
    } catch {
      // not installed from this base
    }
  }
  return null;
}

const cache = new Map();

// Playwright's chromium, or null when the package cannot be resolved or its
// browser has not been downloaded. Cached per root: a test suite asks often.
export async function loadChromium({ root = projectPaths().root } = {}) {
  if (cache.has(root)) return cache.get(root);
  let chromium = null;
  const pw = resolvePlaywright(root);
  if (pw?.chromium) {
    try {
      if (existsSync(pw.chromium.executablePath())) chromium = pw.chromium;
    } catch {
      // executablePath() throws when the browser registry has no chromium
    }
  }
  cache.set(root, chromium);
  return chromium;
}

export const FACES = [
  ['Geist', 400, 'geist-400.woff2'], ['Geist', 500, 'geist-500.woff2'],
  ['Geist', 600, 'geist-600.woff2'], ['Geist', 700, 'geist-700.woff2'],
  ['Inter', 400, 'inter-400.woff2'], ['Inter', 500, 'inter-500.woff2'],
  ['Inter', 600, 'inter-600.woff2'],
  ['Geist Mono', 400, 'geist-mono-400.woff2'], ['Geist Mono', 500, 'geist-mono-500.woff2'],
];

export const fontCss = FACES
  .map(([family, weight, file]) => `@font-face{font-family:"${family}";font-weight:${weight};font-display:block;src:url("/fonts/${file}") format("woff2")}`)
  .join('');

// The same variables a Dapr docs page sets, so `var(--font-mono)` on a code
// label resolves to the face it will really be drawn in. With fonts: false
// the variables still name the faces, but nothing loads them.
export function harnessHtml(body, { fonts = true } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fonts ? fontCss : ''}
:root{--font-head:"Geist",sans-serif;--font-body:"Inter",sans-serif;--font-mono:"Geist Mono",monospace}
body{margin:0;font-family:var(--font-body)}
.fig svg{display:block;width:100%;height:auto}</style></head><body>${body}</body></html>`;
}

const FACE_FILES = new Set(FACES.map(([, , file]) => file));

// Runs fn(page) on the harness page and returns what it returns. Chromium is
// resolved before anything is started, and the browser and the server are
// released whatever fn does.
export async function withHarness(fn, {
  body = '', viewport = { width: 1000, height: 900 }, fonts = true, colorScheme = 'light', scale = 1,
} = {}) {
  const chromium = await loadChromium();
  if (!chromium) throw new Error('Chromium is not installed (npm i @playwright/test@1.56.1 && npx playwright install chromium)');

  const html = harnessHtml(body, { fonts });
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    // Only the bundled faces, by name: nothing else on disk is reachable.
    const file = path.startsWith('/fonts/') ? basename(path) : '';
    if (fonts && FACE_FILES.has(file) && path === `/fonts/${file}`) {
      res.writeHead(200, { 'content-type': 'font/woff2' });
      res.end(readFileSync(join(FONTS, file)));
      return;
    }
    res.writeHead(404);
    res.end('');
  });

  let browser;
  try {
    await new Promise((ready, fail) => {
      server.once('error', fail);
      server.listen(0, '127.0.0.1', ready);
    });
    const { port } = server.address();
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme });
    const tab = await context.newPage();
    await tab.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);
    return await fn(tab);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.closeAllConnections?.();
    if (server.listening) await new Promise((done) => server.close(() => done()));
  }
}
