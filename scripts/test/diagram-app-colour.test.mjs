// Ported from dapr/docs. The cases that walk the dapr/docs scene registry were
// dropped (the scenes are not vendored); only the scene-independent cases remain.

// APP COLOURS WITHIN A SCENE, which nothing checked until a scene nearly
// shipped two different applications painted the same green.
//
// THE RULE. `APP` in engine.mjs is an ordered palette, and the apps in one
// scene take its entries in order: the first app is APP[0], the second APP[1],
// and so on. The colour is how a reader tells one application from another
// when both are hexagons of the same size with short names on them -
// `service-invocation-example` and `pubsub-publish-raw` both lean on it.
//
// THE EXCEPTION, which is why this is a test and not just a sentence in
// SKILL.md. A scene may draw the SAME application more than once - two
// instances of one app competing for a lock, the same service shown at two
// moments - and then sharing a colour is not a mistake, it is the whole
// point: differently coloured hexagons would say two applications, and on
// `distributed-lock-overview` that would say two app ids, which would mean
// two separate locks and no contention at all.
//
// So the rule this enforces is the one that distinguishes those two cases:
//
//   two app hexagons in one scene may share a fill ONLY IF they carry the
//   same name.
//
// Same app, same name, same colour - fine. Different names, different
// colours - fine. Different names on the same colour is the mistake, and it
// is invisible to every other check in the suite: both hexagons draw, both
// names are legible, the canvas is the right size and the theme resolves.
//
// WHAT AN APP HEXAGON IS, in the built tree. hex() tags its group
// `d-hex d-hex-solid` when it is drawn solid, which is what every APP entry
// asks for, and puts the fill on the polygon and the name in the first label
// inside the same group. appSidecar() composes hex(), so a combined app and
// sidecar is found the same way. The Dapr sidecar's own hexagon is NOT solid
// and so is never counted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { APP } from '../../skills/create-diagram/engine/engine.mjs';

const PALETTE = new Set(APP.map((a) => a.fill));

test('the palette has no duplicate fills, so taking entries in order is enough', () => {
  // The rule above is only worth anything if distinct entries are distinct
  // colours. If two APP entries ever resolve to the same token, a scene could
  // follow the rule to the letter and still draw two apps the same.
  assert.equal(PALETTE.size, APP.length);
});
