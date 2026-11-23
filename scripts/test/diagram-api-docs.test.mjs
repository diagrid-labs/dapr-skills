import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../skills/create-diagram');
const ENGINE = path.join(SKILL, 'engine');
const API = readFileSync(path.join(SKILL, 'API.md'), 'utf8');
const MODULES = ['engine', 'shapes', 'app', 'icons', 'cards', 'apis', 'services', 'brands', 'flow'];

// Exports no scene should call. Everything else must be in API.md.
const INTERNAL = new Set([
  'setIconScope', // the exporter scopes icon ids per scene (renderScene)
  'setCanvasWidth', // the exporter sets the canvas width before build() (renderScene)
  'parseMark', // icons.mjs parses mark files itself; scenes use icon() and brand()
  'ICONS_DIR', // the engine's own icon folder; scenes name marks, not paths
]);
const INTERNAL_PATTERNS = [/^LINE_/]; // the label wrapper's tuning, used by label() only

const documented = (name) => API.includes('`' + name + '`') || API.includes('`' + name + '(');

test('every engine export is documented in API.md', async () => {
  const missing = [];
  for (const m of MODULES) {
    const mod = await import(pathToFileURL(path.join(ENGINE, `${m}.mjs`)).href);
    for (const name of Object.keys(mod)) {
      if (INTERNAL.has(name) || INTERNAL_PATTERNS.some((re) => re.test(name))) continue;
      if (!documented(name)) missing.push(`${m}.${name}`);
    }
  }
  assert.deepEqual(missing, [], `undocumented engine exports: ${missing.join(', ')}`);
});

test('C has the python brand token and themed() resolves it', async () => {
  const { C, el } = await import(pathToFileURL(path.join(ENGINE, 'engine.mjs')).href);
  const { renderScene, themed } = await import(pathToFileURL(path.join(ENGINE, 'export.mjs')).href);
  assert.equal(C.pythonBrand, 'var(--d-brand-python)');
  const scene = {
    title: 'Python brand',
    desc: 'A square in the Python brand colour.',
    width: 100,
    height: 100,
    build: () => [el('rect', { x: 10, y: 10, width: 20, height: 20, fill: C.pythonBrand })],
  };
  const out = themed(renderScene('python-brand', scene), 'python-brand');
  // The token is defined (light and dark) once, and every use resolves to it.
  assert.match(out, /--d-brand-python\s*:/);
  const stripped = out.replace(/--d-[a-z0-9-]+\s*:[^;}]*[;}]/g, '');
  const used = [...stripped.matchAll(/var\((--d-[a-z0-9-]+)\)/g)].map((m) => m[1]);
  assert.ok(used.includes('--d-brand-python'));
  for (const t of used) assert.match(out, new RegExp(`${t}\\s*:`), `${t} is defined`);
});
