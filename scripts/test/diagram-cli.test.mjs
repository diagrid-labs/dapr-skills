import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireChromium } from './helpers/chromium.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'create-diagram', 'engine');
const SCENES = `import { el } from '../_engine/engine.mjs';
export const scenes = { demo: { width: 100, height: 50, title: 't', desc: 'd', build: () => [el('rect', { x: 0, y: 0, width: 10, height: 10 })] } };
`;
const layout = () => {
  const tmp = mkdtempSync(join(tmpdir(), 'diagram-cli-'));
  cpSync(ENGINE, join(tmp, 'diagrams', '_engine'), { recursive: true });
  mkdirSync(join(tmp, 'diagrams', 'scenes'), { recursive: true });
  writeFileSync(join(tmp, 'diagrams', 'scenes', 'index.mjs'), SCENES);
  return tmp;
};
const cli = (tmp, cwd, ...args) =>
  spawnSync(process.execPath, [join(tmp, 'diagrams', '_engine', 'export.mjs'), ...args], { cwd, encoding: 'utf8' });

test('cli runs from a copied layout', () => {
  const tmp = layout();
  try {
    for (const cwd of [tmp, join(tmp, 'diagrams')]) {
      rmSync(join(tmp, 'diagrams', 'out'), { recursive: true, force: true });
      const r = cli(tmp, cwd, '--no-browser');
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Exported 1 diagram\(s\) to /);
      assert.ok(existsSync(join(tmp, 'diagrams', 'out', 'demo.svg')));
    }
    const c = cli(tmp, tmp, '--check');
    assert.equal(c.status, 0, c.stderr);
    assert.match(c.stdout, /Diagrams up to date \(1\)/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cli rejects unknown flags, bad --only, missing scenes', () => {
  const tmp = layout();
  try {
    assert.equal(cli(tmp, tmp, '--bogus').status, 2);
    assert.equal(cli(tmp, tmp, '--only').status, 2);
    assert.equal(cli(tmp, tmp, '--only', 'nope').status, 2);
    assert.equal(cli(tmp, tmp, '--only', 'demo').status, 0);
    rmSync(join(tmp, 'diagrams', 'scenes', 'index.mjs'));
    const r = cli(tmp, tmp);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /scenes[\\/]index\.mjs/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

const NO_CHROMIUM = 'Chromium not installed: skipped centring, fallback-font check and PNGs. To enable, ask your coding agent to run the create-diagram setup with --with-browser.';
const lines = (r, pattern) => `${r.stdout}${r.stderr}`.split(/\r?\n/).filter((l) => pattern.test(l));

test('export without playwright writes svg and warns once', () => {
  const tmp = layout();
  try {
    const r = cli(tmp, tmp);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lines(r, /Chromium not installed/), [NO_CHROMIUM]);
    assert.ok(existsSync(join(tmp, 'diagrams', 'out', 'demo.svg')));
    assert.deepEqual(readdirSync(join(tmp, 'diagrams', 'out')), ['demo.svg']);
    assert.equal(existsSync(join(tmp, 'diagrams', 'bbox.json')), false);
    const c = cli(tmp, tmp, '--check');
    assert.equal(c.status, 0, c.stderr);
    assert.deepEqual(lines(c, /Chromium not installed/), [NO_CHROMIUM]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--no-browser says nothing about Chromium', () => {
  const tmp = layout();
  try {
    const r = cli(tmp, tmp, '--no-browser');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lines(r, /Chromium/), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// The copied layout gets this repo's node_modules linked in as
// diagrams/node_modules, which is where the skill installs Playwright.
const NODE_MODULES = join(ENGINE, '..', '..', '..', 'node_modules');

test('export with chromium writes bbox.json, svgs and both pngs, and --check holds them to it', async (t) => {
  if (!(await requireChromium(t))) return;
  if (!existsSync(join(NODE_MODULES, '@playwright', 'test'))) return t.skip('playwright is not in the repo node_modules');
  const tmp = layout();
  try {
    symlinkSync(NODE_MODULES, join(tmp, 'diagrams', 'node_modules'), 'junction');
    const r = cli(tmp, tmp);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lines(r, /Chromium/), []);
    const out = join(tmp, 'diagrams', 'out');
    assert.deepEqual(readdirSync(out).sort(), ['demo-dark.png', 'demo-light.png', 'demo.svg', 'png-manifest.json']);
    const bbox = JSON.parse(readFileSync(join(tmp, 'diagrams', 'bbox.json'), 'utf8'));
    assert.deepEqual(Object.keys(bbox), ['demo']);
    // The 10x10 box at 0 0 in a 100x50 canvas: its centre is 45 left and 20 up of the canvas's.
    assert.deepEqual(bbox.demo, [-45, -20]);
    assert.match(readFileSync(join(out, 'demo.svg'), 'utf8'), /viewBox="-45 -20 100 50"/);

    const c = cli(tmp, tmp, '--check');
    assert.equal(c.status, 0, c.stderr);

    // A second export changes nothing, bbox.json included.
    const before = readFileSync(join(tmp, 'diagrams', 'bbox.json'), 'utf8');
    writeFileSync(join(tmp, 'diagrams', 'bbox.json'), before.trimEnd());
    const again = cli(tmp, tmp);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(readFileSync(join(tmp, 'diagrams', 'bbox.json'), 'utf8'), before.trimEnd(), 'unchanged values are not rewritten');

    writeFileSync(join(tmp, 'diagrams', 'bbox.json'), '{"demo":[0,0]}\n');
    const stale = cli(tmp, tmp, '--check');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /bbox\.json/);

    writeFileSync(join(tmp, 'diagrams', 'bbox.json'), before);
    rmSync(join(out, 'demo-dark.png'));
    const missing = cli(tmp, tmp, '--check');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /demo-dark\.png: missing/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('--only measures just its scene and leaves the other bbox.json entries alone', async (t) => {
  if (!(await requireChromium(t))) return;
  if (!existsSync(join(NODE_MODULES, '@playwright', 'test'))) return t.skip('playwright is not in the repo node_modules');
  const tmp = layout();
  try {
    symlinkSync(NODE_MODULES, join(tmp, 'diagrams', 'node_modules'), 'junction');
    writeFileSync(join(tmp, 'diagrams', 'scenes', 'index.mjs'), `import { el } from '../_engine/engine.mjs';
export const scenes = {
  a: { width: 100, height: 50, title: 't', desc: 'd', build: () => [el('rect', { x: 0, y: 0, width: 10, height: 10 })] },
  b: { width: 100, height: 50, title: 't', desc: 'd', build: () => { throw new Error('b is broken'); } },
};
`);
    const bboxPath = join(tmp, 'diagrams', 'bbox.json');
    writeFileSync(bboxPath, '{"a":[0,0],"b":[1,2],"gone":[3,4]}\n');
    const r = cli(tmp, tmp, '--only', 'a');
    assert.equal(r.status, 0, r.stderr);
    const bbox = JSON.parse(readFileSync(bboxPath, 'utf8'));
    assert.deepEqual(bbox, { a: [-45, -20], b: [1, 2], gone: [3, 4] });
    assert.ok(existsSync(join(tmp, 'diagrams', 'out', 'a-light.png')));

    const c = cli(tmp, tmp, '--check', '--only', 'a');
    assert.equal(c.status, 0, c.stderr);
    assert.match(c.stdout, /Diagrams up to date \(1\)\./);

    writeFileSync(bboxPath, '{"a":[0,0],"b":[1,2]}\n');
    const stale = cli(tmp, tmp, '--check', '--only', 'a');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /bbox\.json/);
    assert.equal(readFileSync(bboxPath, 'utf8'), '{"a":[0,0],"b":[1,2]}\n', '--check writes nothing');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
