// The exported SVG, measured in a face that is NOT Inter.
//
// An exported file carries no webfonts. Its root names the font STACK, and
// whatever machine opens it (a README, a blog, a slide tool) resolves that
// stack to whichever face it owns. The shapes, meanwhile, were sized against
// Inter's metrics. This check renders every label in a pinned substitute and
// fails a label that outgrows the shape it sits in.
//
// Ported from dapr/docs tests/standalone-font.spec.js. Three things make the
// pin work:
//
//   * The stack sits on the root <svg> as a PRESENTATION ATTRIBUTE, and any
//     CSS rule beats one, so `svg{font-family:...}` displaces it.
//   * A MONO label carries its own font-family attribute, which beats an
//     inherited value and loses only to a rule matching that element, so mono
//     labels get a rule of their own. It reaches <tspan> as well, because
//     richLabel() marks up one RUN of a mixed line as code.
//   * The page loads NO webfonts, so "Inter" and "Geist Mono" can never
//     resolve, whatever the machine has installed.
//
// `Arial, "Liberation Sans"` and `"Courier New", "Liberation Mono"` are
// metric-compatible pairs, so the verdict is the same on macOS, Windows and
// an Ubuntu runner.

import { withHarness } from './browser.mjs';

export const FALLBACK_STACK = 'Arial, "Liberation Sans", sans-serif';
// Courier New is the widest monospace a machine is likely to hand over
// (0.600 em a character against Consolas' 0.550), so a mono label that fits
// under this pin fits under the others too.
export const FALLBACK_MONO_STACK = '"Courier New", "Liberation Mono", monospace';
// Every mono stack the exporter bakes ends in the generic `monospace`.
export const MONO_LABEL = ':is(text, tspan)[font-family*="monospace"]';

// A label fails above this much of the room its shape leaves it: tight enough
// that a label drawn to Inter's width and read in Arial's trips it, loose
// enough that rounding between two metric-compatible faces cannot.
export const TOLERANCE = 1.05;

// Ten digits at font-size 100, in the two pinned faces. Arial's digits
// advance 1139/2048 em, Courier New's 1229/2048 em; Liberation Sans and
// Liberation Mono match them. Used by the tests to prove the pin took.
export const ARIAL_DIGIT_RUN = 556.16;
export const COURIER_DIGIT_RUN = 600.11;

// The style that pins both faces, ahead of the markup it applies to.
export function guardHtml(markup) {
  return `<style>svg{font-family:${FALLBACK_STACK}}svg ${MONO_LABEL}{font-family:${FALLBACK_MONO_STACK}}</style>${markup}`;
}

// Faces a <text> or <tspan> carries that neither rule above reaches. Such a
// label would be measured in the machine's own face, so the check could not
// vouch for it.
export function unpinnedFaces(svgText) {
  const out = [];
  for (const [, face] of svgText.matchAll(/<(?:text|tspan)\b[^>]*\sfont-family="([^"]*)"/g)) {
    if (!face.includes('monospace')) out.push(face.replaceAll('&quot;', '"'));
  }
  return out;
}

/**
 * Every label that sits in a shape and is wider than that shape leaves room
 * for. Runs in the page.
 *
 * "The shape a label sits in" is the nearest `g.d-step` or `g.d-tile`, or any
 * `<g>` holding exactly one `rect` or `circle`. A label only counts as IN that
 * shape when its own centre lies inside the shape's box, so a caption above or
 * below a shape is not read as overflowing it.
 *
 * The room a shape leaves is its width less half an em each side. A circle is
 * measured across its diameter. getBoundingClientRect, not getBBox, because a
 * label can sit under a transform its shape does not share; the SVG is drawn
 * at its natural size, so a client pixel is a scene unit.
 */
function labelsOverflowing({ tolerance }) {
  const svg = document.querySelector('svg');
  const containerFor = (text) => {
    for (let g = text.parentElement; g && g !== svg; g = g.parentElement) {
      if (g.tagName !== 'g') continue;
      if (g.classList.contains('d-step') || g.classList.contains('d-tile')) return g;
      if ([...g.children].filter((c) => c.tagName === 'rect' || c.tagName === 'circle').length === 1) return g;
    }
    return null;
  };
  const out = [];
  let labels = 0;
  for (const text of svg.querySelectorAll('text')) {
    if (text.getAttribute('aria-hidden') === 'true') continue;
    const g = containerFor(text);
    if (!g) continue;
    // Its own rect or circle, not a descendant's: a tile holding an icon holds
    // that icon's rects too.
    const shape = [...g.children].find((c) => c.tagName === 'rect' || c.tagName === 'circle');
    if (!shape) continue;
    const t = text.getBoundingClientRect();
    const s = shape.getBoundingClientRect();
    if (!t.width || !s.width) continue;
    const cx = (t.left + t.right) / 2;
    const cy = (t.top + t.bottom) / 2;
    if (cx < s.left || cx > s.right || cy < s.top || cy > s.bottom) continue;
    labels += 1;
    const em = parseFloat(getComputedStyle(text).fontSize) || 0;
    const room = Math.max(1, s.width - em);
    const ratio = t.width / room;
    if (ratio > tolerance) {
      out.push({ label: (text.textContent || '').replace(/\s+/g, ' ').trim(), ratio: +ratio.toFixed(3) });
    }
  }
  return { out, labels };
}

// Whether the two pinned stacks resolved to Arial and Courier New metrics (or
// their Liberation twins). Without them every overflow verdict would measure
// some third face, so the caller skips the check rather than report it.
export async function probePins(tab) {
  const run = await tab.evaluate((markup) => {
    document.body.innerHTML = markup;
    const len = (id) => document.getElementById(id).getComputedTextLength();
    return [len('probe-sans'), len('probe-mono')];
  }, guardHtml(
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300">'
    + '<text><tspan id="probe-sans" x="10" y="100" font-size="100">0123456789</tspan></text>'
    + '<text><tspan id="probe-mono" x="10" y="250" font-size="100" font-family="&quot;Times New Roman&quot;, Times, monospace">0123456789</tspan></text></svg>',
  ));
  const near = (got, want) => Math.abs(got - want) / want < 0.01;
  return near(run[0], ARIAL_DIGIT_RUN) && near(run[1], COURIER_DIGIT_RUN);
}

// What the check found across every scene: problems (an overflowing label or
// an unpinned face), how many labels it measured, and whether the pinned faces
// are installed. When they are not, overflow is not reported at all.
export async function fallbackFontReport(svgs, { tolerance = TOLERANCE, probe = probePins } = {}) {
  const problems = [];
  for (const [name, svgText] of svgs) {
    for (const face of unpinnedFaces(svgText)) {
      problems.push(`${name}: a label sets font-family "${face}", which the fallback-font check cannot pin; use mono: true or no font-family`);
    }
  }
  if (!svgs.size) return { problems, labels: 0, pinned: true };
  let labels = 0;
  let pinned = true;
  await withHarness(async (tab) => {
    pinned = await probe(tab);
    if (!pinned) return;
    for (const [name, svgText] of svgs) {
      await tab.evaluate((markup) => {
        document.body.innerHTML = markup;
        // The file has a viewBox and no size, which lays out at 300x150 and
        // scales everything. Natural size keeps client pixels in scene units.
        const el = document.querySelector('svg');
        const vb = el.viewBox.baseVal;
        el.style.width = `${vb.width}px`;
        el.style.height = `${vb.height}px`;
      }, guardHtml(svgText));
      const found = await tab.evaluate(labelsOverflowing, { tolerance });
      labels += found.labels;
      for (const { label, ratio } of found.out) {
        problems.push(`${name}: label "${label}" is ${ratio}x the room its shape leaves in a fallback font (limit ${tolerance}); widen the shape or shorten the label`);
      }
    }
  }, { fonts: false });
  return { problems, labels, pinned };
}

// One problem string per overflowing label or unpinned face, across every
// scene. Empty means every label fits without Inter.
export async function checkFallbackFonts(svgs, tolerance = TOLERANCE) {
  return (await fallbackFontReport(svgs, { tolerance })).problems;
}
