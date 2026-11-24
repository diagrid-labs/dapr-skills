// Measures where each scene's DRAWING sits in its canvas, and works out the
// viewBox origin that centres it. The exporter writes those origins to
// bbox.json and passes each one to svg().
//
// A canvas is not a frame the drawing is centred in by construction: a scene
// places its parts at coordinates, and whatever air is left over lands
// wherever the arithmetic put it. That shows the moment a figure renders
// narrower than its column, where the drawing sits off to one side of its own
// white space.
//
// The drawing's extent cannot be computed from the scene: most of it is TEXT,
// and text has no width until a font renders it. So it is measured in a
// headless browser with the bundled faces loaded. Each scene is rendered at
// the origin 0 0 and the centring origin derived from that, so the answer
// does not depend on what bbox.json already says.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { withHarness } from './browser.mjs';
import { renderScene } from './export.mjs';

const round = (v) => +v.toFixed(2);

// name -> [x, y], sorted by name. Throws on a scene that fails to render or
// draws nothing measurable.
export async function measureOrigins(scenes) {
  const names = Object.keys(scenes);
  if (!names.length) return {};
  const body = names
    .map((name) => `<div class="fig" data-scene="${name}" style="width:900px">${renderScene(name, scenes[name])}</div>`)
    .join('');
  const measured = await withHarness((tab) => tab.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('.fig')].map((fig) => {
      const el = fig.querySelector('svg');
      const b = el.getBBox();
      const v = el.viewBox.baseVal;
      if (!(b.width > 0) || !(b.height > 0)) return [fig.dataset.scene, null];
      // The origin that puts the same amount of air on both sides: the
      // content's own centre, less half the canvas.
      return [fig.dataset.scene, [b.x + b.width / 2 - v.width / 2, b.y + b.height / 2 - v.height / 2]];
    }),
  )), { body });
  const out = {};
  for (const name of [...names].sort()) {
    const origin = measured[name];
    if (!origin || !Number.isFinite(origin[0]) || !Number.isFinite(origin[1])) {
      throw new Error(`scene "${name}": no measurable drawing to centre`);
    }
    // +0 turns -0 into 0, so a centred scene reads [0, 0] in the file.
    out[name] = origin.map((v) => round(v) + 0);
  }
  return out;
}

// True when bbox.json holds exactly these origins. Compared as values, so a
// file that differs only in whitespace counts as current.
export function originsCurrent(bboxPath, origins) {
  if (!existsSync(bboxPath)) return Object.keys(origins).length === 0;
  try {
    return JSON.stringify(JSON.parse(readFileSync(bboxPath, 'utf8'))) === JSON.stringify(origins);
  } catch {
    return false;
  }
}

// Writes bbox.json only when the values change, so an export that moves
// nothing leaves the file (and its git status) alone. Returns whether it wrote.
export function writeOrigins(bboxPath, origins) {
  if (originsCurrent(bboxPath, origins)) return false;
  writeFileSync(bboxPath, `${JSON.stringify(origins, null, 2)}\n`);
  return true;
}
