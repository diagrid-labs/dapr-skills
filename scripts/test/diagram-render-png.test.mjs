import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { el, text } from '../../skills/create-diagram/engine/engine.mjs';
import { renderScene, themed } from '../../skills/create-diagram/engine/export.mjs';
import { withHarness } from '../../skills/create-diagram/engine/browser.mjs';
import { requireChromium } from './helpers/chromium.mjs';
import {
  settings, stale, orphans, renderPngs, pngNames, PNG_SCALE, PNG_MARGIN, GENERATOR, SCHEMES,
} from '../../skills/create-diagram/engine/render-png.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'pngs-'));
// The manifest lives inside the redirected directory: the orphan sweep only
// looks at .png, so a json file beside them is invisible to it, and one
// rmSync clears the lot.
const withDir = (fn) => async (t) => {
  const d = tmp();
  try {
    await fn(d, join(d, 'png-manifest.json'), t);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
};
const needsChromium = (fn) => withDir(async (dir, manifestPath, t) => {
  if (!(await requireChromium(t))) return;
  return fn(dir, manifestPath, t);
});

const scene = (over = {}) => ({
  width: 100,
  height: 50,
  title: 'A title',
  desc: 'A description',
  build: () => [
    el('rect', { x: 10, y: 10, width: 40, height: 20, fill: 'var(--d-sky)' }),
    el('text', { x: 10, y: 45, 'font-size': 10, fill: 'var(--d-body)' }, [text('hi')]),
  ],
  ...over,
});

// A deliberately lopsided scene for the trim: one bar, 8:1, alone in the
// middle of a SQUARE canvas. Geometry only, no text, so its ink box is exactly
// these numbers rather than whatever a font measures to.
const INK = { x: 100, y: 450, w: 800, h: 100 };
const slab = () => ({
  width: 1000,
  height: 1000,
  title: 'A slab',
  desc: 'One wide bar alone on a square canvas',
  build: () => [el('rect', { x: INK.x, y: INK.y, width: INK.w, height: INK.h, fill: 'var(--d-sky)' })],
});

const svgs = (scenes) => new Map(Object.entries(scenes).map(([n, s]) => [n, themed(renderScene(n, s), n)]));
const manifest = (scenes, over = {}) => ({ settings: { ...settings(), ...over }, scenes });
const files = (dir) => readdirSync(dir).filter((f) => f.endsWith('.png')).sort();

test('the render settings carry the scale, the margin, the schemes, the generator and both font stacks', () => {
  assert.deepEqual(Object.keys(settings()).sort(), ['body', 'generator', 'margin', 'mono', 'scale', 'schemes']);
  assert.equal(settings().scale, PNG_SCALE);
  assert.equal(PNG_SCALE, 2);
  assert.equal(settings().margin, PNG_MARGIN);
  assert.equal(PNG_MARGIN, 12);
  assert.equal(settings().generator, GENERATOR);
  assert.deepEqual(SCHEMES, ['light', 'dark']);
  assert.equal(settings().schemes, 'light,dark');
  assert.match(settings().body, /^Inter,/);
  assert.match(settings().mono, /Geist Mono/);
});

test('pngNames maps a scene to its light and dark files and back', () => {
  assert.deepEqual(pngNames.files('alpha'), ['alpha-light.png', 'alpha-dark.png']);
  assert.equal(pngNames.scene('alpha-light.png'), 'alpha');
  assert.equal(pngNames.scene('a-light-dark.png'), 'a-light');
  assert.equal(pngNames.scene('alpha.png'), null);
});

test('stale names a scene whose svg hash moved', () => {
  const have = manifest({ alpha: 'aaa', beta: 'bbb' });
  assert.deepEqual(stale(have, { alpha: 'aaa', beta: 'CHANGED' }, settings(), ['alpha', 'beta']), ['beta']);
});

test('stale names a scene the manifest has never seen', () => {
  const have = manifest({ alpha: 'aaa' });
  assert.deepEqual(stale(have, { alpha: 'aaa', beta: 'bbb' }, settings(), ['alpha', 'beta']), ['beta']);
});

test('stale names a scene whose png files are gone', () => {
  const have = manifest({ alpha: 'aaa', beta: 'bbb' });
  assert.deepEqual(stale(have, { alpha: 'aaa', beta: 'bbb' }, settings(), ['alpha']), ['beta']);
});

test('stale names every scene when the settings differ', () => {
  const have = manifest({ alpha: 'aaa', beta: 'bbb' }, { scale: 1 });
  assert.deepEqual(stale(have, { alpha: 'aaa', beta: 'bbb' }, settings(), ['alpha', 'beta']), ['alpha', 'beta']);
});

test('stale names every scene when a font stack changes under unchanged hashes', () => {
  const have = manifest({ alpha: 'aaa' }, { mono: 'Courier' });
  assert.deepEqual(stale(have, { alpha: 'aaa' }, settings(), ['alpha']), ['alpha']);
});

test('stale names every scene when there is no manifest at all', () => {
  assert.deepEqual(stale(null, { alpha: 'aaa' }, settings(), ['alpha']), ['alpha']);
});

test('stale names nothing when hashes and settings match', () => {
  const have = manifest({ alpha: 'aaa', beta: 'bbb' });
  assert.deepEqual(stale(have, { alpha: 'aaa', beta: 'bbb' }, settings(), ['alpha', 'beta']), []);
});

test('orphans names a scene the manifest lists but nothing draws', () => {
  const have = manifest({ alpha: 'aaa', gone: 'ggg' });
  assert.deepEqual(orphans(have, { alpha: 'aaa' }), ['gone']);
  assert.deepEqual(orphans(have, { alpha: 'aaa', gone: 'ggg' }), []);
});

test('renderPngs needs outDir and manifestPath', async () => {
  await assert.rejects(() => renderPngs({ svgs: svgs({ alpha: scene() }) }), /outDir/);
  await assert.rejects(() => renderPngs({ svgs: svgs({ alpha: scene() }), outDir: tmpdir() }), /manifestPath/);
});

test('renderPngs --check reports missing pngs without opening a browser', withDir(async (dir, manifestPath) => {
  const out = await renderPngs({ svgs: svgs({ alpha: scene() }), outDir: dir, manifestPath, check: true });
  assert.equal(out.ok, false);
  assert.equal(out.problems.length, 1);
  assert.match(out.problems[0], /alpha-light\.png, alpha-dark\.png: missing/);
  assert.deepEqual(out.written, []);
  assert.equal(existsSync(manifestPath), false);
}));

test('renderPngs --check reports an orphan png without opening a browser', withDir(async (dir, manifestPath) => {
  writeFileSync(join(dir, 'gone-dark.png'), 'x');
  writeFileSync(join(dir, 'unrelated.png'), 'x');
  const out = await renderPngs({ svgs: new Map(), outDir: dir, manifestPath, check: true });
  assert.equal(out.ok, false);
  assert.deepEqual(out.problems, ['gone-dark.png: no matching scene (re-run the export)']);
}));

test('an emptied registry does not wipe the pngs', withDir(async (dir, manifestPath) => {
  writeFileSync(join(dir, 'alpha-light.png'), 'x');
  const out = await renderPngs({ svgs: new Map(), outDir: dir, manifestPath });
  assert.equal(out.ok, false);
  assert.match(out.problems.join('\n'), /registry is empty/);
  assert.equal(existsSync(join(dir, 'alpha-light.png')), true);
}));

// Width and height are big-endian uint32s at bytes 16 and 20 of the IHDR
// chunk, and the colour type at byte 25 is 6 for truecolour WITH alpha. A
// screenshot taken without omitBackground comes back as colour type 2, so
// that one byte is the whole transparency assertion.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = (file) => {
  const png = readFileSync(file);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), colour: png[25] };
};
const near = (got, want, slack = 2) =>
  assert.ok(Math.abs(got - want) <= slack, `expected ${want} +/-${slack}, got ${got}`);

// Where the paint actually reaches, which is the only place the trim is
// visible. Decoded in the browser because Chromium is already loaded and a
// png decoder is not a dependency; a data: url does not taint the canvas.
async function inkExtent(file) {
  const url = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  return withHarness((tab) => tab.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (d[((y * canvas.width + x) * 4) + 3] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    return { minX, minY, maxX, maxY };
  }, url), { fonts: false });
}

// The RGBA of the pixel at the centre of a png, decoded in the browser.
async function centrePixel(file) {
  const url = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  return withHarness((tab) => tab.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(img.naturalWidth >> 1, img.naturalHeight >> 1, 1, 1).data];
  }, url), { fonts: false });
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const TOKENS = JSON.parse(readFileSync(new URL('../../skills/create-diagram/engine/tokens.json', import.meta.url), 'utf8'));

test('light and dark pngs differ and are PNGs', needsChromium(async (dir, manifestPath) => {
  // One block filled with a token whose light and dark values differ.
  const block = scene({ build: () => [el('rect', { x: 10, y: 10, width: 60, height: 30, fill: 'var(--d-body)' })] });
  const out = await renderPngs({ svgs: svgs({ alpha: block }), outDir: dir, manifestPath });
  assert.deepEqual(out.problems, []);
  assert.deepEqual(out.written, ['alpha-light.png', 'alpha-dark.png']);
  const light = readFileSync(join(dir, 'alpha-light.png'));
  const dark = readFileSync(join(dir, 'alpha-dark.png'));
  assert.deepEqual(light.subarray(0, 8), PNG_SIGNATURE);
  assert.deepEqual(dark.subarray(0, 8), PNG_SIGNATURE);
  assert.notDeepEqual(light, dark);
  // Bytes can differ for reasons other than colour; the paint is what matters.
  assert.deepEqual(await centrePixel(join(dir, 'alpha-light.png')), [...hex(TOKENS.light['--d-body']), 255]);
  assert.deepEqual(await centrePixel(join(dir, 'alpha-dark.png')), [...hex(TOKENS.dark['--d-body']), 255]);
  const written = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(written.settings, settings());
  assert.deepEqual(Object.keys(written.scenes), ['alpha']);
}));

test('png is 2x the scene width, trimmed to the drawing, with an alpha channel', needsChromium(async (dir, manifestPath) => {
  await renderPngs({ svgs: svgs({ slab: slab() }), outDir: dir, manifestPath });
  const trimmed = { w: INK.w + PNG_MARGIN * 2, h: INK.h + PNG_MARGIN * 2 };
  for (const scheme of SCHEMES) {
    const file = join(dir, `slab-${scheme}.png`);
    const { width, height, colour } = ihdr(file);
    near(width, PNG_SCALE * trimmed.w);
    // The BAR plus its margin, not the square canvas the bar sits in.
    near(height, PNG_SCALE * trimmed.h);
    assert.equal(colour, 6);
    // And the bar fills that frame edge to edge but for the margin. Leave the
    // viewBox untrimmed and the square canvas would be letterboxed instead.
    const gap = PNG_SCALE * PNG_MARGIN;
    const { minX, minY, maxX, maxY } = await inkExtent(file);
    assert.ok(minX > 0, 'the drawing is flush with the left edge');
    near(minX, gap);
    near(maxX, width - 1 - gap);
    near(minY, gap);
    near(maxY, height - 1 - gap);
  }
}));

test('a second render writes nothing and leaves the pngs byte-identical', needsChromium(async (dir, manifestPath) => {
  const input = svgs({ alpha: scene() });
  await renderPngs({ svgs: input, outDir: dir, manifestPath });
  const before = readFileSync(join(dir, 'alpha-dark.png'));
  const again = await renderPngs({ svgs: input, outDir: dir, manifestPath });
  assert.deepEqual(again.written, []);
  assert.deepEqual(readFileSync(join(dir, 'alpha-dark.png')), before);
  assert.equal((await renderPngs({ svgs: input, outDir: dir, manifestPath, check: true })).ok, true);
  const forced = await renderPngs({ svgs: input, outDir: dir, manifestPath, force: true });
  assert.deepEqual(forced.written, ['alpha-light.png', 'alpha-dark.png']);
  assert.deepEqual(readFileSync(join(dir, 'alpha-dark.png')), before);
}));

test('--check reports a png whose svg changed as stale', needsChromium(async (dir, manifestPath) => {
  await renderPngs({ svgs: svgs({ alpha: scene() }), outDir: dir, manifestPath });
  const moved = svgs({ alpha: scene({ width: 120 }) });
  const out = await renderPngs({ svgs: moved, outDir: dir, manifestPath, check: true });
  assert.equal(out.ok, false);
  assert.match(out.problems.join('\n'), /alpha-light\.png, alpha-dark\.png: stale/);
}));

test('rendering throws on a scene with no measurable drawing and writes nothing', needsChromium(async (dir, manifestPath) => {
  await assert.rejects(
    () => renderPngs({ svgs: svgs({ empty: scene({ build: () => [] }) }), outDir: dir, manifestPath }),
    /empty/,
  );
  assert.deepEqual(readdirSync(dir), []);
}));

test('pngs whose scene is gone are deleted and dropped from the manifest', needsChromium(async (dir, manifestPath) => {
  await renderPngs({ svgs: svgs({ alpha: scene(), beta: scene() }), outDir: dir, manifestPath });
  const out = await renderPngs({ svgs: svgs({ alpha: scene() }), outDir: dir, manifestPath });
  assert.deepEqual(out.removed, ['beta-dark.png', 'beta-light.png']);
  assert.deepEqual(files(dir), ['alpha-dark.png', 'alpha-light.png']);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).scenes), ['alpha']);
}));

test('prune: false keeps other scenes and their manifest entries', needsChromium(async (dir, manifestPath) => {
  await renderPngs({ svgs: svgs({ alpha: scene(), beta: scene() }), outDir: dir, manifestPath });
  const out = await renderPngs({ svgs: svgs({ alpha: scene({ width: 120 }) }), outDir: dir, manifestPath, prune: false });
  assert.deepEqual(out.written, ['alpha-light.png', 'alpha-dark.png']);
  assert.deepEqual(out.removed, []);
  assert.deepEqual(files(dir), ['alpha-dark.png', 'alpha-light.png', 'beta-dark.png', 'beta-light.png']);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).scenes), ['alpha', 'beta']);
}));

test('a manifest entry whose pngs already went by hand is pruned', needsChromium(async (dir, manifestPath) => {
  await renderPngs({ svgs: svgs({ alpha: scene() }), outDir: dir, manifestPath });
  const have = JSON.parse(readFileSync(manifestPath, 'utf8'));
  writeFileSync(manifestPath, JSON.stringify({ ...have, scenes: { ...have.scenes, ghost: 'ggg' } }));
  const out = await renderPngs({ svgs: svgs({ alpha: scene() }), outDir: dir, manifestPath });
  assert.deepEqual(out.written, []);
  assert.deepEqual(out.removed, []);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).scenes), ['alpha']);
}));
