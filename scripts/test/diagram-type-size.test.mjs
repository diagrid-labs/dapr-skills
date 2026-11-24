// Ported from dapr/docs. The cases that walk the dapr/docs scene registry were
// dropped (the scenes are not vendored); only the scene-independent cases remain.

// A scene's BODY TYPE SIZE, which nothing checked until a scene shipped with
// the wrong one.
//
// `render-width.mjs` answers "how wide should this canvas be asked to render",
// and it is calibrated against a 13-unit label: give it a canvas and it
// returns the percentage that puts 13 units at the house size on the page.
// That contract has a second half nobody was holding up - the scene has to
// actually use 13. A scene that sets its body type to 15 renders 15% larger
// than everything around it at whatever width the formula returns, and every
// test passes: the scene exports, the width matches the formula, the labels
// clear their shapes, the canvas is centred.
//
// That is how `binding-output-kafka` was first drawn, at 15 units, and how
// `bindings-overview` sits at 15 today. Both were caught by eye at review,
// one after the other, which is the signal that it wants a test.
//
// WHAT "BODY TYPE" MEANS HERE, and it took a wrong answer to pin down. A
// shape's NAME is not body type: it belongs to the shape and scales with it,
// which is why hex() derives it from the radius. Counting it reads a scene
// backwards - `service-invocation-example` has two app names at 17 against one
// caption at 13, so counting everything made the MODE 17 and reported a scene
// whose body type was already correct as 31% oversized. Only the scene's own
// FREE labels count, and every shape builder tags its group with a `d-` class
// while group() does not, so the two are told apart by that.
//
// WHAT THIS DOES NOT CLAIM. SKILL.md says one type size across the set; the
// set does not have one. Measured when this test was written, 12 of 36 scenes
// set their free labels at 13 and 18 do not, from 10 to 17.25; 6 more place no
// free label at all and have no body type to check. So this is not a rule
// being enforced retroactively - it is a ratchet. Scenes already off 13 are
// listed below with the size they actually use, so a NEW scene cannot drift in
// and an OLD one cannot drift further without saying so. The list is the
// backlog, and every entry removed from it is a scene brought onto the house
// size.

import test from 'node:test';
import assert from 'node:assert/strict';
import { setIconScope } from '../../skills/create-diagram/engine/icons.mjs';
import { setCanvasWidth } from '../../skills/create-diagram/engine/shapes.mjs';

// The sizes of the scene's own FREE labels, from the built node tree.
//
// Text inside a shape is skipped, and that distinction is the whole point. A
// shape's name belongs to the shape and scales with it - hex() derives it from
// the radius - so it is not body type and must not be read as it. Counting it
// got this exactly backwards on a two-app scene: two app names at 17 against
// one caption at 13 made the MODE 17, and the test reported a scene whose body
// type was already 13 as being 31% oversized.
//
// Every shape builder tags its group with a `d-` class and `group()` does not,
// so "no `d-` ancestor" is precisely "a label the scene placed itself".
function fontSizes(node, out = [], inShape = false) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) fontSizes(child, out, inShape);
    return out;
  }
  const cls = node.attrs && node.attrs.class;
  const shape = inShape || (typeof cls === 'string' && cls.split(' ').some((c) => c.startsWith('d-')));
  const size = node.attrs && node.attrs['font-size'];
  if (!shape && size !== undefined && Number.isFinite(Number(size))) out.push(Number(size));
  if (node.children) fontSizes(node.children, out, shape);
  return out;
}

// The MODAL size, not the smallest. A scene's body type is the size most of
// its text is set in; the smallest is whatever its quietest annotation uses,
// and taking that would read a scene with one small tag as a small-type scene.
// Ties go to the smaller size, so the metric is deterministic.
function bodySize(name, scene) {
  setIconScope(name);
  setCanvasWidth(scene.width);
  let children;
  try {
    children = scene.build();
  } finally {
    setIconScope('');
    setCanvasWidth(null);
  }
  const sizes = fontSizes(children);
  if (!sizes.length) return null;
  const counts = new Map();
  for (const size of sizes) counts.set(size, (counts.get(size) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

test('bodySize() reads the modal size, not the smallest', () => {
  // Guards the metric itself: a scene with one tiny tag is not a small-type
  // scene, and a min-based reading would call it one.
  const scene = {
    width: 400,
    height: 200,
    build: () => [
      { tag: 'text', attrs: { 'font-size': 13 }, children: [] },
      { tag: 'text', attrs: { 'font-size': 13 }, children: [] },
      { tag: 'g', attrs: {}, children: [{ tag: 'text', attrs: { 'font-size': 10 }, children: [] }] },
    ],
  };
  assert.equal(bodySize('fixture', scene), 13);
});
