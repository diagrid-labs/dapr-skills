import test from 'node:test';
import assert from 'node:assert/strict';
import { el, text } from '../../skills/create-diagram/engine/engine.mjs';
import { FACES, fontCss, harnessHtml, loadChromium, withHarness } from '../../skills/create-diagram/engine/browser.mjs';
import { requireChromium } from './helpers/chromium.mjs';
import { measureOrigins } from '../../skills/create-diagram/engine/measure-bbox.mjs';

test('fontCss declares every face in FACES, served from /fonts/', () => {
  assert.equal(FACES.length, 9);
  assert.equal(fontCss.match(/@font-face/g).length, FACES.length);
  for (const [family, weight, file] of FACES) {
    assert.ok(
      fontCss.includes(`font-family:"${family}";font-weight:${weight};font-display:block;src:url("/fonts/${file}")`),
      `${family} ${weight} should be served from /fonts/${file}`,
    );
  }
});

test('harnessHtml sets the three font variables and the body face', () => {
  const html = harnessHtml('');
  for (const name of ['--font-head', '--font-body', '--font-mono']) {
    assert.ok(html.includes(`${name}:`), `${name} should be set`);
  }
  assert.ok(html.includes('body{margin:0;font-family:var(--font-body)}'));
  assert.ok(html.includes('.fig svg{display:block;width:100%;height:auto}'));
});

test('harnessHtml puts the given body inside the document', () => {
  assert.match(harnessHtml('<p id="x">'), /<body><p id="x"><\/body>/);
});

test('harnessHtml with fonts: false declares no @font-face', () => {
  const html = harnessHtml('', { fonts: false });
  assert.doesNotMatch(html, /@font-face/);
  assert.doesNotMatch(html, /woff2/);
});

test('loadChromium returns the same answer on every call', async () => {
  assert.equal(await loadChromium(), await loadChromium());
});

test('withHarness loads the bundled faces', async (t) => {
  if (!(await requireChromium(t))) return;
  const loaded = await withHarness((tab) => tab.evaluate(async () => {
    await document.fonts.load('16px Inter');
    await document.fonts.load('16px "Geist Mono"');
    return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('"', ''));
  }));
  assert.ok(loaded.includes('Inter'), `loaded: ${loaded}`);
  assert.ok(loaded.includes('Geist Mono'), `loaded: ${loaded}`);
});

test('withHarness with fonts: false declares no webfont', async (t) => {
  if (!(await requireChromium(t))) return;
  const count = await withHarness((tab) => tab.evaluate(() => document.fonts.size), { fonts: false });
  assert.equal(count, 0);
});

test('withHarness applies colorScheme and scale', async (t) => {
  if (!(await requireChromium(t))) return;
  const got = await withHarness(
    (tab) => tab.evaluate(() => [matchMedia('(prefers-color-scheme: dark)').matches, devicePixelRatio]),
    { colorScheme: 'dark', scale: 2 },
  );
  assert.deepEqual(got, [true, 2]);
});

test('withHarness rejects with the error fn throws and can be used again', async (t) => {
  if (!(await requireChromium(t))) return;
  await assert.rejects(() => withHarness(() => { throw new Error('boom'); }), /boom/);
  assert.equal(await withHarness(() => 42), 42);
});

const lopsided = () => ({
  width: 200,
  height: 100,
  title: 'Lopsided',
  desc: 'One box hard against the left edge',
  build: () => [el('rect', { x: 0, y: 25, width: 50, height: 50, fill: 'var(--d-sky)' })],
});

test('measureOrigins centres an off-centre drawing', async (t) => {
  if (!(await requireChromium(t))) return;
  const origins = await measureOrigins({ lopsided: lopsided() });
  assert.deepEqual(Object.keys(origins), ['lopsided']);
  const [x, y] = origins.lopsided;
  assert.ok(x < 0, `x origin should be negative, got ${x}`);
  // Box centre 25, canvas centre 100: the viewBox moves 75 left; vertically it is already centred.
  assert.ok(Math.abs(x + 75) < 0.5, `x origin ${x}`);
  assert.ok(Math.abs(y) < 0.5, `y origin ${y}`);
});

test('measureOrigins throws on a scene with nothing to measure', async (t) => {
  if (!(await requireChromium(t))) return;
  await assert.rejects(
    () => measureOrigins({ empty: { ...lopsided(), build: () => [el('text', { x: 0, y: 0 }, [text('')])] } }),
    /empty/,
  );
});
