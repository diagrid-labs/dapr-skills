# Dapr API blocks and the HTTP call

## Dapr API blocks

A Dapr API is always drawn the same way: a rounded square, its Fluent mark,
its name in blue, and `alpha` in the corner where that applies. That drawing
is `apiTile()`, and the definitions behind it are `APIS` and `CROSS_CUTTING` in
`_engine/apis.mjs`.

- **Never re-declare a mark or a name in a scene.** Name the API and let the
  catalogue supply both: `apiTile({ key: 'pubsub', x, y, w, h })`.
- **An unknown key throws.** A typo would otherwise draw a tile with no mark
  and the word `undefined` on it.
- **Two forms of each name:** `name` is the one-line form; `wrap: true` asks
  for the agreed two-line break for a narrow tile.
- **The `alpha` tag comes from the catalogue,** so no tile ships untagged.
- **`glyph` is the mark's drawn size** and is separate from `tile()`'s own
  `glyphSize`.
- **Descriptions stay in the scene.** They are broken to a card width, so they
  are layout, not identity.

### The HTTP call

When the diagram sits next to the HTTP call it describes, show the call. Take
it from the user's own code or docs, character for character.

- **Three lines, one block:** the method above (weight 700, `C.blue`), the
  path in the middle (`richLabel()` with `mono: true`, the building block's
  own segment in `C.orange` at weight 700), and the request body below
  (`label()`, `mono: true`, weight 400). Omit the body where the call sends
  none.
- **The path only. Leave the host and port off.** The port is whatever the
  reader's `dapr run` chose.
- **It sits under the app that makes the call, never on the arrow to the
  component.** The app calls its own sidecar; the sidecar then speaks the
  component's protocol. On that arrow it would read as the app calling Redis
  directly, which is exactly what Dapr stops being true.
- **Clamp it to the margin:** centre it on the app but never past the edge,
  `Math.max(EDGE + width / 2, appX)`. The width is measured.
- **The bare block shows the request and nothing else.** A value the call
  returns does not belong in it.
- **`httpCard()` is the block with a border,** for an exchange: request above
  a status chip, response below. Take the status and the payloads from the
  docs (saving state answers `204 No Content`, not `200 OK`). A payload of
  several lines is set left with its indentation kept. Size the card with
  `httpCardH()`; it refuses a card too shallow for its contents. Cards in a
  row share a top and each take their own depth.
