import test from 'node:test';
import assert from 'node:assert/strict';
import { el, text } from '../../skills/create-diagram/engine/engine.mjs';
import { renderScene, themed } from '../../skills/create-diagram/engine/export.mjs';
import { loadChromium, withHarness } from '../../skills/create-diagram/engine/browser.mjs';
import {
  checkFallbackFonts, unpinnedFaces, guardHtml, TOLERANCE, ARIAL_DIGIT_RUN, COURIER_DIGIT_RUN,
} from '../../skills/create-diagram/engine/font-guard.mjs';

// A box with one label centred in it. The label's centre lies inside the box,
// so the guard counts it as sitting IN the box whatever its width.
const boxed = (boxWidth, label, extra = {}) => ({
  width: 400,
  height: 100,
  title: 'Boxed',
  desc: 'One labelled box',
  build: () => [
    el('g', {}, [
      el('rect', { x: 200 - boxWidth / 2, y: 30, width: boxWidth, height: 40, fill: 'var(--d-sky)' }),
      el('text', { x: 200, y: 55, 'text-anchor': 'middle', 'font-size': 12, ...extra }, [text(label)]),
    ]),
  ],
});
const svgs = (scenes) => new Map(Object.entries(scenes).map(([n, s]) => [n, themed(renderScene(n, s), n)]));

test('the tolerance is 1.05', () => {
  assert.equal(TOLERANCE, 1.05);
});

test('unpinnedFaces names a label with a baked face the guard does not pin', () => {
  const svg = '<svg><text font-family="Georgia, serif">x</text><text font-family="&quot;Geist Mono&quot;, monospace">y</text>'
    + '<text>z</text><tspan font-family="Papyrus">w</tspan></svg>';
  assert.deepEqual(unpinnedFaces(svg), ['Georgia, serif', 'Papyrus']);
  assert.deepEqual(unpinnedFaces(svgs({ ok: boxed(200, 'Fits') }).get('ok')), []);
});

test('font guard flags a label wider than its box', async (t) => {
  if (!(await loadChromium())) return t.skip('no chromium');
  const label = 'A label thirty characters long';
  assert.equal(label.length, 30);
  const problems = await checkFallbackFonts(svgs({ narrow: boxed(40, label) }));
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.match(problems[0], /narrow/);
  assert.ok(problems[0].includes(label), problems[0]);
});

test('font guard passes a label with slack', async (t) => {
  if (!(await loadChromium())) return t.skip('no chromium');
  assert.deepEqual(await checkFallbackFonts(svgs({ roomy: boxed(200, 'Fits') })), []);
});

test('font guard measures a mono label in Courier New, not the sans face', async (t) => {
  if (!(await loadChromium())) return t.skip('no chromium');
  // 20 mono characters at 12: about 144 units in Courier New, about 100 in
  // Times. A 140-unit box leaves 128 of room, so only the mono pin makes this
  // overflow. The label names a proportional face ahead of `monospace`: on a
  // machine whose own monospace is Courier-wide, a real mono stack would
  // overflow with or without the pin and prove nothing.
  const label = 'abcdefghijklmnopqrst';
  const scene = boxed(140, label, { 'font-family': '"Times New Roman", Times, monospace' });
  const problems = await checkFallbackFonts(svgs({ mono: scene }));
  assert.equal(problems.length, 1, problems.join('\n'));
  assert.ok(problems[0].includes(label));
});

test('font guard reports a label with a face it cannot pin', async (t) => {
  if (!(await loadChromium())) return t.skip('no chromium');
  const problems = await checkFallbackFonts(svgs({ serif: boxed(200, 'Fits', { 'font-family': 'Georgia, serif' }) }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /serif.*Georgia/);
});

// The premise of every verdict above: the pinned rule beats the baked
// presentation attribute, and what it resolves to has Arial's (and Courier
// New's) metrics. If this fails, the machine has neither Arial nor
// Liberation Sans, and the guard is measuring some third face.
const digitRun = (attrs) => withHarness((tab) => tab.evaluate(() => document.getElementById('probe').getComputedTextLength()), {
  fonts: false,
  body: guardHtml(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200"${attrs.root ?? ''}>`
    + `<text${attrs.text ?? ''}><tspan id="probe" x="10" y="100" font-size="100"${attrs.tspan ?? ''}>0123456789</tspan></text></svg>`),
});

test('the pinned fallback face displaces the baked font stack', async (t) => {
  if (!(await loadChromium())) return t.skip('no chromium');
  const run = await digitRun({ root: ' font-family="Inter, &quot;Segoe UI&quot;, Roboto, Helvetica, Arial, sans-serif"' });
  assert.ok(Math.abs(run - ARIAL_DIGIT_RUN) / ARIAL_DIGIT_RUN < 0.01, `ten digits ran ${run}, not Arial's ${ARIAL_DIGIT_RUN}`);
});

test("the pinned fallback face reaches a mono tspan's own font-family", async (t) => {
  if (!(await loadChromium())) return t.skip('no chromium');
  // A proportional face ahead of `monospace`, for the reason given above.
  const run = await digitRun({ tspan: ' font-family="&quot;Times New Roman&quot;, Times, monospace"' });
  assert.ok(Math.abs(run - COURIER_DIGIT_RUN) / COURIER_DIGIT_RUN < 0.01, `ten mono digits ran ${run}, not Courier New's ${COURIER_DIGIT_RUN}`);
});
