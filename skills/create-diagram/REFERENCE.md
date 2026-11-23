# create-diagram reference

The detailed guide for drawing a Dapr diagram in the docs.dapr.io house
style. Read it while you build a scene: the design rules, how to turn a
source into a layout, the scene contract, the engine API, a worked example
and the traps that are easy to fall into.

A diagram is drawn in code, not stored as an image. A scene is an ES module
that builds a plain element tree. The exporter turns it into one SVG that
carries both palettes and follows the viewer's `prefers-color-scheme`, and,
when Chromium is available, into a light and a dark PNG. The engine uses Node
built-ins only. Every diagram is a still: no animation.

## Project layout and commands

Setup copies the engine into the user's project. `<diagramsDir>` is the folder
chosen at setup, `diagrams/` by default.

| Path | What it is |
| --- | --- |
| `<diagramsDir>/_engine/` | The engine. Do not edit it: setup replaces it on refresh, and an edit is lost |
| `<diagramsDir>/scenes/<name>.mjs` | One scene per diagram. It imports the engine relatively, from `../_engine/` |
| `<diagramsDir>/scenes/index.mjs` | The registry: `export const scenes = { '<name>': scene }` |
| `<diagramsDir>/out/<name>.svg` | The exported SVG, light and dark in one file |
| `<diagramsDir>/out/<name>-light.png`, `<name>-dark.png` | The PNGs, written only when Chromium is available |
| `<diagramsDir>/out/png-manifest.json` | The render settings and a hash per scene, so unchanged PNGs are not re-rendered |
| `<diagramsDir>/bbox.json` | The measured viewBox origin that centres each drawing, written only when Chromium is available |

```bash
node <diagramsDir>/_engine/export.mjs                  # export every scene
node <diagramsDir>/_engine/export.mjs --only <name>    # export one scene
node <diagramsDir>/_engine/export.mjs --check          # render and validate every scene, compare with out/
node <diagramsDir>/_engine/export.mjs --no-browser     # SVGs only, even when Chromium is installed
```

- **`out/` belongs to the exporter.** A full export removes any `*.svg`,
  `*-light.png` or `*-dark.png` there that no scene claims. Never put a
  hand-made file in `out/`.
- **`--check`** renders and validates every scene (title, desc, name,
  dimensions, duplicate ids, every colour token resolvable) and fails if a file
  in `out/` differs from a fresh render. With Chromium it also fails when
  `bbox.json` or a PNG is out of date.
- **`--only <name>`** writes that scene's SVG and PNGs and, with Chromium,
  measures only that scene. The other entries in `bbox.json` are left alone.
- **Scene names** are lowercase letters and digits in hyphen-separated words:
  `order-flow`, not `Order_Flow` or `order--flow`.

### With Chromium

When Playwright is installed in the diagrams folder (or a folder above it)
and its Chromium has been downloaded, the export does three more things. Only
the `@playwright/test` package (about 13 MB) lives in the diagrams folder; the
Chromium browser (about 150 MB) downloads once to the per-user Playwright
cache and is shared by every project.

1. **Centring.** It measures where each drawing sits in its canvas and writes
   the viewBox origin that centres it to `bbox.json` (only when a value
   changes). Text has no width until a font renders it, so this cannot be
   computed in plain Node.
2. **The fallback-font check.** A user's SVG usually renders where Inter is
   not installed: a README, a blog, another machine. After the SVGs are
   written, every label that sits in a box, pill, card, circle or step mark is
   measured with Arial (Liberation Sans) in place of Inter and Courier New
   (Liberation Mono) in place of Geist Mono. A label wider than 1.05 of the
   room its shape leaves fails the export. The SVGs are already on disk by
   then, so a failure means: widen the shape or shorten the label, then export
   again. On Linux this needs the metric-compatible fonts
   (`fonts-liberation`), or the check measures the wrong face.
3. **PNGs.** A light and a dark PNG per scene, trimmed to the drawing, at 2x,
   with a transparent background.

### Without Chromium

The export writes SVGs only and prints one line saying what it skipped. Two
things follow:

- **The drawing may sit slightly off-centre in its canvas.** It is exported
  at origin `0 0`. Keep the margins even by construction (derive positions
  from the canvas centre) since nothing measures them.
- **No font check ran.** Leave slack around every label: size a box, pill or
  card to its label's estimated width plus at least a character on each side,
  never to the exact width. As a rough guide, a body-font character at weight
  600 advances about 0.55 of the type size, and a mono character 0.6.

### Slides

PowerPoint, Keynote and Google Slides ignore the SVG's light and dark switch.
On a light slide background use `<name>-light.png`; on a dark one use
`<name>-dark.png`. The dark PNG has a transparent background and light text,
so it looks washed out in a light image viewer; check it on a dark ground.
The SVG is the right file for the web, docs sites and READMEs, where it
follows the viewer's colour scheme.

### Measuring labels

Several rules below say a width is measured, not guessed. With Chromium, put
this script in `<diagramsDir>/` (not in `_engine/`) and run
`node <diagramsDir>/measure-labels.mjs <name>`. It prints every label's box in
scene units, the same numbers the scene file uses.

```js
// Prints the measured box of every label in one scene, in scene units.
import { withHarness } from './_engine/browser.mjs';
import { renderScene } from './_engine/export.mjs';
import { scenes } from './scenes/index.mjs';

const name = process.argv[2];
if (!scenes[name]) throw new Error(`no scene named "${name}"`);
const body = `<div class="fig" style="width:900px">${renderScene(name, scenes[name])}</div>`;
const boxes = await withHarness((page) => page.$$eval('svg text:not([aria-hidden])', (all) => all.map((t) => {
  const b = t.getBBox();
  const r = (v) => Math.round(v * 10) / 10;
  return { text: t.textContent, x: r(b.x), y: r(b.y), w: r(b.width), h: r(b.height) };
})), { body });
console.table(boxes);
```

The boxes are measured before centring, so they compare directly with the
constants in the scene. Without Chromium, estimate and leave slack (see
above).

## Design rules

### Canvas and style

- **2D only. No backdrop, no glow, no shadow.**
- **Wireframe line art.** Outlines and arrows take one weight, `lineWidth()`.
  Fills are light tints at `fill-opacity: 0.6`, except where a rule below says
  solid. Hidden edges, such as the back of a cylinder's base, are faint and
  dashed.
- **A small band of air on every side, and no more.** Nothing touches the
  viewBox. Aim for 2 to 5% of the canvas on each axis, and never less than
  about 12 units. Keep everything at least 10 units inside the edges.
- **The drawing is centred in its canvas, and that is measured.** Parts land
  where the arithmetic puts them, and the air left over falls wherever it
  falls. With Chromium, the export measures this and moves the viewBox origin
  (`bbox.json`); you do not fix it by moving coordinates. Without Chromium,
  derive the layout from the canvas centre.
- **Padding is the only scale control, so put it on one axis.** The SVG
  scales to whatever width it is shown at, so how big a drawing renders is
  its ratio to the canvas. Extra air goes on the axis the drawing is widest
  against; trim the other back to the band. Air on both axes is dead space,
  not scale.
- **Landscape, ideally 16:9.** Diagrams get reused in slides. Treat 16:9 as a
  floor on the width-to-height ratio (with about 10% slack, so 1.6), never as
  a band: a drawing wider than 16:9 loses nothing, a taller one arrives as a
  stamp.
- **When a layout has to give, give it width.** A column that runs off the
  bottom becomes two columns side by side; a long list splits into two
  shorter ones. Use a taller canvas only when the content is genuinely
  vertical, such as a sequence read top to bottom.
- **Canvas size:** `width` and `height` on the scene set the viewBox, and the
  scene's coordinates use it. A canvas is as wide as the distance between its
  parts, and every unit of that distance is a line a reader has to follow.
  Meeting the 16:9 floor by spreading parts out only moves the whitespace.
- **Label sizes are relative to the canvas.** The SVG is scaled to its
  container, so a label renders at `size x displayWidth / canvasWidth`. A
  13-unit label on a 680-wide canvas renders more than twice as large as the
  same label on a 1512-wide one, shown at the same width. Do not fight this by
  choosing different type sizes per scene. Keep canvases in one project close
  in width, and when a small canvas is embedded next to large ones, give it a
  narrower display width where it is placed (for example
  `<img src="out/name.svg" width="70%">`). A useful rule: display width is
  about `canvasWidth / 1100` of the column, capped at 100%.

### Colors

Every colour comes from `C` or `APP` in `_engine/engine.mjs`. Each one is a
`var(--d-*)` token with a light and a dark value, which is how one SVG follows
the colour scheme.

- **Never a literal hex in a scene.** The only hex values in a diagram are
  inside a vendored brand mark. The token set lives in `_engine/tokens.json`,
  which setup replaces, so a scene cannot add one: map what you need onto the
  roles below. The export fails on a token it cannot resolve.
- **App hexagons take `APP` in order, and every one is solid:** green, light
  blue, yellow, teal, dark blue. Each is outlined in `C.appInk` and carries
  its name on the fill, dark on green and yellow, white on the other three.
  These fills do not change with the theme. With more than five apps, colour
  by role, so apps of one kind share a colour.
- **White on the light blue and on the teal is under the contrast floor, and
  stays.** They measure about 2.6:1. That is a house decision in favour of the
  brand colours. Do not ink those two differently in one diagram: it makes a
  sixth app colour nothing else shares.
- **A colour names one application.** Two app hexagons share a fill only when
  they are the same app (two instances of one service) and then they share the
  name too, with a caption saying which instance is which.
- **Spread a whole palette entry; never pick properties off it.** Write
  `hex({ x, y, label, ...APP[0] })`. Each entry has four properties
  (`stroke`, `fill`, `ink`, `solid`); picking two drops the others, and the
  missing ones fall back to defaults that draw the wrong ink.
- **A data store is gold and a message broker is green,** both solid, outlined
  in `C.appInk`, named in dark ink. In a diagram with exactly one app, that app
  is the green, so the broker takes another standard fill (`C.appSky`). With
  two or more apps the broker stays green.
- **An app colour on something that is not an app says it belongs to that
  app.** Use `APP` fills only for apps.
- **Blue is the edge of the picture.** `C.blue` is Dapr's own (the sidecar,
  an API block, a Dapr service) and also the external systems Dapr connects
  to. `C.navy` is for what sits under the picture: the lines, the Dapr badge,
  infrastructure, a user.
- **An external system is a mark in that blue, never a filled shape.** It is
  outside the boundary: a glyph and a name in body ink.
- **A description is blue, not a second grey.** Names take `C.body`; the line
  explaining them takes `C.blue`. `C.caption` is for furniture: a dashed
  region's border, a heading over a band.
- **A blocked path is red and dashed**, with `fluent-dismiss-circle` beside it
  (not on top of it). An allowed path beside it stays solid navy, marked with
  `fluent-checkmark-circle` if marked at all. Never pair red with green: the
  dash and the colour carry the meaning together for readers who cannot tell
  red from green.
- **What the other colours mean:** `C.navy` arrows and Dapr badges; `C.mint`
  a workflow start; `C.orange` a workflow end, and the building block's own
  segment in an HTTP path; `C.red` a blocked or failed path; `C.blue` secure
  communication and resiliency; `C.caption` section captions; `C.body`
  labels.
- **A dashed region's border follows the theme.** `C.caption` is the right
  answer nearly always. Brand colours are the same in both themes, so a
  region bordered in one does not re-theme.
- **Teal, mint and green fail contrast as ink.** `label()` and `arrow()` refuse
  them, and an outlined shape refuses teal or mint unless it also carries a
  name. `panel()` allows teal, because a dashed grouping border is decoration.
- **Anything drawn on a plate takes `C.plateInk`, never `C.body`.** The plate
  is near-white in both themes, so body ink (near-white in dark) vanishes on
  it.
- **Use the palette; do not invent a colour to pass a contrast number.**
  `C.blue` and `C.orange` are under 4.5:1 as text. So a line in either is a
  second reading of something the diagram already says in body ink, never the
  only place a fact appears.
- **A colour in a source image is not permission to use it.** Map what the
  source means ("an app", "a second app") onto the palette, and note the swap
  in the scene's header comment.

### Labels

- **Font:** never set `font-family` in a scene. The one exception is code (a
  command, a path, a payload), which takes `mono: true` on `label()` or
  `richLabel()`. That sets the code font with ligatures off.
- **Sizes:** use `label()`: 11 units at weight 600 by default. Use `\n` for a
  second line; `label()` centres the block vertically on `y`.
- **One size constant for every label and description in a scene** (a `TEXT`
  constant, usually 13). A description a point smaller than the name above it
  reads as a different class of thing. Use a second size only for something
  that is a different class, such as a section caption.
- **Never below `MIN_LABEL`, 10 units.** `label()` throws below it, and
  `cardSizes()`, `serviceLabel()` and `cylinder()` refuse a shape too small for
  a legible name rather than shrinking the name. The fix is a bigger shape.
- **Text over any line gets `halo: true`**: an arrow, a bus or a dashed region
  border. The halo paints the page's ground behind the glyphs so the line
  stops at the word. It is invisible where nothing crosses, so it costs
  nothing.
- **A label sits under the thing it names, centred on it.** A line's label
  may sit above the line instead. Either way it is centred on the span: pass
  the midpoint of the run, not one end plus a guess.
- **Leave about two characters of clearance to every shape near a label**, not
  just to the two the span runs between. Two characters is about the label's
  own size in units. The shape that crowds a label is usually one the span
  never touches, such as a hexagon whose sloping edge hangs down beside it.
- **Measure clearance against the label's box, not its baseline.** A sloping
  edge is nearest the text at the top of the glyphs. `hexHalfWidthAt(r, dy)`
  gives a hexagon's half width at a height; `hexHalfWidth(r)` is the widest it
  ever gets, so a label cleared against it has not been cleared.
- **When the shapes leave too little room, break the centring, not the
  clearance.** Centre the label in what the nearest edges leave, and say in a
  comment why it is off-centre, or the next edit straightens it.
- **A label anchored `start` beside a repeated element overflows at the end of
  the row.** Stop the row short of the border rather than shrinking the text.
- **A free label is measured against the shapes beside it, not placed near
  them.** A name inside a shape is the builder's job; a label you position is
  yours. Measure its width and derive its x from the run it rides on.
- **A word above a shape clears the arrowhead, not the shape.** A head is
  drawn back from its tip along the line, so a word placed above the end of a
  vertical run sits on the head and its halo hides the direction. Where a word
  sits over the end of a run, give it its own constant (about 24 units above)
  and say why in a comment.
- **A word on a run names one run.** Two runs through one label name neither.
  Keep at least six units between any two free labels.

### Shapes and arrows

- **Apps are pointy-top hexagons.** An app that runs Dapr is drawn with its
  sidecar: `appSidecar()` draws the app and the Dapr hexagon overlapping it,
  bottom right. For an app on the right of a picture, `mirror: true` turns the
  sidecar inward so the line between two sidecars does not cross an app.
  `daprApp()` is the compact form with a small navy badge; it does not pass
  `ink` or `solid` through to the hexagon, so the app comes out tinted with
  body ink rather than solid. Prefer `appSidecar()`.
- **Centre a pair with `appSidecarCentre()`, never on the app hexagon.** The
  sidecar hangs off one side and below, so the pair's centre is not the app's.
- **Draw a line to a sidecar with `sidecarAt()`.** It returns the sidecar as an
  arrow descriptor, so the line and the drawing cannot drift apart.
- **An arrow starts at whoever acts,** not at where the data sits. When a step
  has a person in it, the person is in the picture. When an app calls a
  component through Dapr, the line to the component starts at the sidecar.
- **Arrows have an open 8-unit head and stop at the shape's edge.** Pass a
  shape descriptor (`{ x, y, r, hex: true }`, `{ x, y, r }` or
  `{ x, y, w, h }`) rather than a point wherever you can. `arrow()` throws when
  the shapes touch.
- **An elbowed line with a head is `elbowArrow()`,** not a `roundedPath()`
  with an `arrow()` laid over it. `heads` puts the chevron on the end, the
  start, both or neither. A feeder running into a bus takes `heads: 'none'`.
- **A line leaves a hexagon at a node, or square out of an edge, never along
  one.**
- **A line arriving at a hexagon's bottom node takes the place its name
  wanted.** Move the name through the component (`serviceHex({ side: 'right' })`),
  not with a label of your own.
- **A mark with its name under it has three sides, not four.** Count the lines
  a mark has to carry before choosing where its name goes; the name gets the
  side with no line. A line may arrive at the name: a mark and its name are
  one object.
- **A mark that annotates a line sits clear of it, and so does its name.**
  Stack the name under the mark rather than beside it.
- **Centring two marks on one axis spends that axis.** Before centring a
  third thing on a centre line, count what the line already carries.
- **A data store is a standing cylinder; a message broker is a pipe lying on
  its side.** `cylinder()` draws a store `STORE_RATIO` (1.2) wide to tall
  from a centre and a width, and refuses a store taller than it is wide.
  `pipe()` draws a broker two to three times as long as it is across and
  refuses anything else. Proportion is the only thing that tells them apart.
  Both carry their name inside; pick the pipe's length from its name, so the
  rounded caps stay clear of the letters.
- **A shape with no name needs a solid fill.** A tint with a dark outline
  disappears on the dark ground. Pass `solid: true` to `box()`, `decision()` or
  `hex()`.
- **A caption is centred on its border, so half of it hangs inside the box.**
  `region()` and `pod()` put the pill across the top edge. Pad a region's
  contents from the pill's lower edge: `captionReach()` gives that distance.
- **A pill is its text plus half an em at each end.** Size `captionW` as the
  measured text width plus `2 * captionPad(captionSize)`. Taking the text's
  width as the pill's width draws rounded ends that graze the letters.
- **A region's caption is set in the diagram's text size,** not `region()`'s
  default 15: pass `captionSize: TEXT`. In a flow diagram use `flowLane()`,
  which already does.
- **A flow diagram's lane is `flowLane()` and its annotations are `note()`**,
  both from `_engine/flow.mjs`. A note is a remark on the flow ("allowed",
  "denied"), one step smaller and lighter than a shape's name. Importing
  `flow.mjs` for one constant into a non-flow scene is a mistake; write the
  number and say what it is.
- **Two runs that share a stretch of path draw it once.** Two dashed runs laid
  over each other at different dash phases fill each other's gaps and the
  shared stretch comes out solid. Give the whole run to one end and let the
  other stop on it in a T with `heads: 'none'`.
- **A row of shapes between two fixed ends is `slots()`,** not accumulated
  offsets.
- **A Kubernetes pod is `pod()`:** a dashed sky region with the pod's name on
  its top edge. `captionX` moves the name along the edge, which it has to when
  a line leaves the shape underneath it.
- **A mark inside a shape is centred in it, both ways,** when the mark has no
  label of its own. Its name goes outside the shape, below it, in body ink.
- **Marks that stand together are fitted the same way, with `fit: 'ink'`.**
  `icon()` fits a mark's viewBox by default, and many marks leave margin inside
  it. `fit: 'ink'` sizes the mark by what it draws, from `_engine/icons/ink.json`.
- **Capability cards are square.** A square card with a two-line name needs
  `glyphDy` and `nameDy` set explicitly, or the second line lands on the bottom
  edge. Leave about twice the line height under the last line.
- **Overlap means overlap.** Two shapes drawn as one thing, such as an app and
  its sidecar, visibly overlap. Shapes that merely touch read as an error.
  Check the centre distance against the sum of the radii.
- **An interface is a ball and socket, with no arrowhead.** The side that
  provides it gets `lollipop()`; the side that requires it gets `socket()`
  cupping the same ball. Draw the socket first. Name the endpoint under the
  ball in the code font.
- **A note about the drawing is a `callout()`**: a white card, black border,
  dashed leader. It is the one line allowed to run at an angle, because it
  points rather than carries. Keep the card outside what it annotates and the
  leader clear of every shape in between.

### Compose, do not re-create

A scene is assembled from parts that already exist. Before drawing anything,
look at the scenes already in `scenes/` and at the builders in the engine API
below. A part that is reused is a part that cannot disagree with itself.

- **Survey first.** Search the scenes for the thing you are about to draw.
  Reuse what fits.
- **A motif used twice is a builder.** The second time you need something, do
  not copy the first: put it in a module of the project's own, such as
  `<diagramsDir>/parts.mjs`, and import it from both scenes. Never add it to
  `_engine/`, which setup replaces. A copy drifts, and nothing notices.
- **A builder owns its drawing.** Share decisions, not just shapes: if a
  caller can still pass something that changes the layout, nothing has been
  made consistent. `apiTile()` drops `glyphSize`, `glyphDy` and `nameDy` for
  this reason.
- **A component takes one size and derives the rest.** Express every offset
  inside it as a multiple of its one dimension. `serviceHex()` takes `r`; the
  name sits at `r * NAME_DY`. Resizing is then one number.
- **Derive from the side that constrains the part.** `apiTile()` takes its
  glyph from the card's short side, so a wide, short card does not get a glyph
  taller than itself.
- **A shape and its name are one component,** so the name scales with it.
- **Near-equal is a default, not a law.** A component may be drawn larger
  where the diagram around it is larger, as long as it scales as a whole. Say
  in the scene why it differs.
- **When a neighbour sets the radius, the name is chosen, not derived.** Pass
  `size` to `serviceHex()`, give every name under a hexagon in that scene the
  same size, and say which neighbour set the radius.
- **One line weight for everything, outlines included.** Every builder uses
  `lineWidth()`, which the exporter derives from the canvas width so lines
  render at the same apparent thickness (about 1.5px in a docs column) on
  every canvas. Do not pass your own `width`.
- **Keep the dimension itself close across diagrams.** Once type is derived
  from a radius, a component at r = 30 on one diagram and r = 44 on another
  has names at two sizes. Pick radii near the reference: `SERVICE_R` is 34,
  an app 42.5 to 60.
- **A part beside a component copies its offsets,** so names in one column
  line up.
- **One exception, named, beats a free option.** Where a scene must differ
  (for example to match a drawing published elsewhere), pass the one value and
  say in a comment why, or the next person "fixes" it.

| Part | Builder |
| --- | --- |
| A card: a box with a mark and a name | `card()` in `_engine/cards.mjs` |
| A Dapr API block | `apiTile()` in `_engine/apis.mjs` |
| A hexagon with a mark in it (a Dapr service, a sidecar, a container) | `markHex()` in `_engine/icons.mjs` |
| A Dapr control plane service | `serviceHex()` in `_engine/services.mjs` |
| An app with its sidecar | `appSidecar()` in `_engine/app.mjs` |
| An app without Dapr | `hex()` in `_engine/shapes.mjs` |
| A dashed region with a caption on its border | `region()`, or `pod()`, or `flowLane()` |
| A strip of vendor marks in a captioned region | `logoStrip()` in `_engine/icons.mjs` |
| Evenly spaced centres | `slots()` |
| A brand mark on a plate | `brand()`, `plate()` |
| The SDK language or cloud marks | `LANGUAGES`, `CLOUDS`, `cloudMark()` in `_engine/brands.mjs` |
| An HTTP request and response | `httpCard()` |
| A file or a few lines of code | `codeCard()` |

### Dapr API blocks

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

#### The HTTP call

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

### Grouping and centering

Most "that looks slightly off" notes are one mistake: a part was positioned
instead of the group it belongs to.

- **Centre the group, not the parts.** A glyph with a name under it is one
  thing. Measure the stack (glyph, gap, name block) and centre the total.
  `tile()` does this when given `glyphSize`.
- **A region's contents are centred in it on both axes.** Derive both from the
  region box, not from an inset that looked right.
- **Contents under a caption pill centre in the space it leaves.** The pill
  hangs into the region by half its height, so centre between the pill's
  lower edge and the far border:

  ```js
  const PILL_BOTTOM = REGION.y + CAPTION_H / 2;
  const Y = (PILL_BOTTOM + REGION.y + REGION.h) / 2;
  ```

  Half the intrusion is the whole nudge. This is the vertical axis only:
  sideways, a label moved off centre to dodge something reads as a miss.
- **A line that threads through a region does not move its contents off
  centre.** Widen the region until both fit.
- **`slots()` spaces centres, so it is for items of one size.** Items of
  different widths are spaced by equal gaps:

  ```js
  const GAP = (ROW_W - 2 * EDGE - items.reduce((a, i) => a + i.w, 0)) / (items.length - 1);
  ```

  A mark plus a name beside it is one item, so its width is mark plus gap
  plus measured name. Padding that is invisible in one theme, such as a plate
  behind a wordmark, is not part of the width.
- **`slots()` decides spacing within a span, not the span.** It leaves half a
  pitch of margin at each end. Hand it the whole canvas and that half-pitch
  becomes padding you did not choose. Lay a grid out from a left edge by
  pitch when the margin matters.
- **Centre a region, and a row of regions, in its container.** Derive the
  position from the container's centre and the group's width:

  ```js
  const ROW_W = n * BOX_W + (n - 1) * GAP;
  const X0 = BOX.x + (BOX.w - ROW_W) / 2 + BOX_W / 2; // first box's centre
  ```

- **Bands stacked on one axis are read by the gaps between them,** so derive
  the gaps from one constant. Unequal gaps make a claim about which bands are
  related.
- **Compacting a drawing means taking the same amount off the canvas.**
  Pulling a band in by 24 and leaving the canvas alone turns 24 units of
  drawing into 24 units of air.
- **After centring, re-check whatever extends beyond the group's boxes,** such
  as labels anchored `start` beside each item.
- **Centre a repeated group by computing its extent,** from the first shape's
  top to the last label's bottom:

  ```js
  const GROUP_H = (count - 1) * PITCH + R + LABEL_DY + 4;
  const TOP = REGION.y + REGION.h / 2 - GROUP_H / 2 + R;
  ```

- **When a group is asymmetric, derive its anchor from its own extent:**

  ```js
  const APP_X = BOX_CX - (GROUP_R - GROUP_L) / 2;
  const APP_Y = BOX_CY - (GROUP_B - GROUP_T) / 2;
  ```

  For an app and its sidecar, `pairExtent()` and `appSidecarCentre()` do this.
- **Over a short run, alignment beats centring.** A lean of fifteen units is
  invisible over a long arrow and obvious over a short one. Align the shape to
  what it points at.
- **Align shapes by a named feature, not by eye.** A pointy-top hexagon's
  leftmost point is `x - hexHalfWidth(r)` and its lowest is `y + r`.

**Measure the result.** Read the numbers back (with the label script above, or
by looking at the PNG) rather than deciding from the picture in your head.

### Laying out connections

- **Run lines along the axes.** Leave a shape on one of its axes, run along,
  and turn into the target with an elbow. A short diagonal between two shapes
  with nothing between them can stand; once there are two, or one is long
  enough to pass something, they all become elbows.
- **A line turns with an arc, never a mitre.** `roundedPath()` and
  `elbowArrow()` round every corner. 14 units is the house radius for a bus,
  10 for a small elbow; the radius clamps to half the shortest leg.
- **A turn means the run is one path, not two that touch.** Draw the whole run
  as one `roundedPath()`. Only joins in the middle of a run are real T-joins,
  and those stay square.
- **Lines that arrive at the same place arrive on the same line.** Pick the
  trunk (the source already square to the target) and route the rest onto it,
  so one line arrives once with one head.
- **Collect parallel connections onto one bus,** close to the column it
  serves, so the horizontal runs stay short.
- **Keep a central element equidistant from the buses on either side.**
- **An arrow ends on something.** An arrow to a bare coordinate looks broken.
  Check it does not cut through whatever sits between its ends.
- **A label on an arrow rides above the line** when the arrow is long enough.
- **Two things that talk both ways share one line with a head at each end,**
  not two parallel lines. Put the two shapes at the same height so the line is
  straight.
- **Two dashed regions need a clear gap,** several times the dash pitch.
- **A region and its caption are one object: use `region()`.** The pill takes
  the region's stroke. The caption's text is body ink, whatever the region's
  colour.
- **A caption and what it captions need a drawn relationship.** A heading
  floating over a row of marks is just a heading near some marks; put both in
  one region with the caption on its border.
- **An annotation with nothing attached reads as lost.** If a thing acts on
  something, draw the arrow, routed clear of what is there.
- **A repeated element's box is narrower than its pitch,** or neighbours touch.
  Name the margin once as a constant (`const EDGE = 24`) and derive from it.
- **A row of marks is plated or not, never half and half.** A full-colour mark
  needs a plate to stay legible on the dark ground, and once one has one, the
  rest of the row needs one too. A plated mark takes `C.plateInk`.
- **Never hand-draw a company's logo.** Use its official file (see Brand
  marks).
- **Generic icons** (a key, a clock, a database) are Fluent UI System Icons,
  already in `_engine/icons/` as `fluent-<name>`. Draw one with
  `icon({ name: 'fluent-<name>', color })`. One glyph means one thing across a
  set of diagrams: check what a glyph already stands for before reusing it.

### Brand marks

The engine ships the marks in `_engine/icons/`, each recorded with its source
and licence in [engine/icons/README.md](engine/icons/README.md). The Python
mark is the Simple Icons mark, tinted `var(--d-brand-python)`. There is no
Java mark: name Java with a text label.

- **Prefer a shipped mark.** Redis is `redis` (tint it with `C.redisBrand`, or
  `C.appInk` when it sits on a solid fill), Kafka is `kafka` (full colour),
  Kubernetes is `kubernetes` (tint `C.kubernetes`), the Dapr logo is
  `logo-blue`.
- **A mark the engine does not ship goes in `<diagramsDir>/icons/`,** never in
  `_engine/icons/`, which setup replaces. Draw it with `icon({ name, dir })`,
  where `dir` is that folder's absolute path:

  ```js
  import { fileURLToPath } from 'node:url';
  const MY_ICONS = fileURLToPath(new URL('../icons/', import.meta.url));
  icon({ name: 'acme', dir: MY_ICONS, x, y, size: 32 });
  ```

  `fit: 'ink'` reads only the engine's measurements, so a project mark uses
  the default `fit: 'box'`; give it `w` and `h` that match its drawn shape.
- **Source, in order of preference:** [Simple Icons](https://simpleicons.org)
  (CC0, single colour, tinted with `color`); Wikimedia Commons for company
  logos and full-colour marks; the vendor's official architecture icon set
  ([Azure](https://learn.microsoft.com/azure/architecture/icons/),
  [AWS](https://aws.amazon.com/architecture/icons/),
  [Google Cloud](https://cloud.google.com/icons)).
- **Keep the file unmodified, byte for byte.** Vendor terms forbid cropping,
  recolouring or distorting. The engine changes only its in-memory copy.
- **Record every mark you add** in `<diagramsDir>/icons/README.md`: the file,
  what it is, the source URL, the licence, single or full colour.
- **A mark that is not freely licensed** needs the user's explicit go-ahead.
  If no official file can be found, ask before using a substitute.
- **Wide logos and wordmarks keep their proportions:** give `icon()` a `w` and
  `h`. A logo that carries its own name needs no label beside it.
- **A dark wordmark cannot be recoloured for dark mode.** Put it on a backing
  in `C.markPlate`, which is transparent in light mode and a light plate in
  dark.
- **A logo published as a raster inside an SVG wrapper** is allowed when it is
  the official mark. It does not scale crisply, adds its payload to the file,
  and must have an alpha channel or it shows as a rectangle in one theme. It is
  never tinted.
- **Every file is screened on load:** no `<script>`, no event handlers, no
  external `href`, only an allowlist of elements. A `<style>` with a bare
  element selector is refused, because it would restyle the page the SVG is
  inlined into. If removing that one element is the only change needed and it
  does not change how the mark draws, remove it and record the edit in the
  README; otherwise find another file.

### Accessibility and copy

- **Every scene needs a `title` and a `desc`.** The export fails without them.
  `title` names the diagram; `desc` describes what it shows, plainly and
  accurately, as a screen reader will read it.
- **No em dashes or en dashes** in titles, descriptions or labels.
- **Alpha APIs:** name them alpha close to each mention, in a sentence of
  their own.
- **Ids are scoped to the scene** by the exporter, and the export fails if two
  elements share an id. Several diagrams on one page is normal.
- **Use the terms docs.dapr.io uses** for Dapr concepts: "Publish &
  subscribe", "State management", "Configuration". A diagram that names an API
  differently from the docs teaches a name the reader will not find elsewhere.

## Turning a source into a layout

**Confirm with the user what the diagram claims before drawing.** List the
components and connections you read from the source and check anything that
looks wrong or ambiguous. Do not resolve a disagreement silently, and do not
change the content to match a source image. Where a row repeats across
several groups (the same four services on three machines), say it once, beside
the row, rather than labelling every copy.

When the diagram replaces one readers already know, it is a redraw, not a
redesign. Keep what the source shows and its arrangement; change what is
wrong and what the house style draws differently. A regrouping that reads
better is a proposal to make before drawing it.

Start by shopping, not drawing. List what the diagram needs, find each item
in the existing scenes and the builder tables below, and design only what is
new.

1. **Components:** every one the source names: apps, Dapr, brokers, stores,
   external systems, people, workflow steps.
2. **Connections:** how they connect, and in which direction.
3. **Shapes:** map each component to a builder. For a branded product use its
   mark. With no matching shape, pick the nearest or write a builder in a
   project module, not in the scene.
4. **Layout:** the main flow on one axis, side services on the other.

   | Element | Measurement |
   | --- | --- |
   | Space between app centres | about 140 to 150, up to about 250 when the arrow between them carries a mark |
   | App radius | 42.5 normally, 32 in a crowded scene, up to 60 in a sparse one |
   | Arrow length | 30 to 110, between shape edges |
   | Workflow activity box | `FLOW.W` x `FLOW.H` (172 x 46) |
   | Margins | at least 10 from the edges, plus room for labels under shapes |

5. **Derive constants from each other instead of repeating a number.** A row's
   centre line comes from its band (`const ROW_Y = BAND.y + BAND.h / 2`), and
   one size constant drives every tile that should match.

### Matching an existing diagram

When a diagram exists somewhere and this one should look like it, read its
source if you have it, not a screenshot.

- **Carry its numbers, scaled.** Put its coordinates and sizes through one
  factor (`const S = ourPanelWidth / theirPanelWidth`) and a helper that maps
  its x into ours, rather than re-laying it out by eye. Hand-placed, unevenly
  spaced positions are not reproduced by nudging an even layout.
- **The vertical may not scale with the horizontal.** If the canvas keeps a
  different aspect, scale what reads as proportion and hand-fit the rest.
- **A reference is not automatically right.** Check contrast on anything you
  copy, and keep a departure only with its reason written in the scene.

### Converting a Mermaid block

A Mermaid block has no arrangement to match: its positions are the layout
engine's output, not anybody's decision. What it gives you is the graph.

**First, decide whether it converts at all.** A flowchart that draws a
mechanism (participants, calls between them, a decision with outcomes)
converts. A sequence diagram stays Mermaid: this engine has no lifelines. Two
participants whose messages strictly alternate can be drawn as two columns
with horizontal runs read top to bottom, but five participants with looping
messages cannot. A gantt chart stays Mermaid. Tell the user which blocks you
will not convert and why.

1. **Read the graph, not the picture:** node ids and text, every edge with its
   label and direction, and the `subgraph` blocks. A subgraph is a lane:
   `flowLane()`.
2. **Take the axis from the declaration.** `flowchart LR` puts lanes side by
   side; `TD` stacks them. A subgraph's own `direction TB` means that lane runs
   down while the diagram runs across.
3. **Take the order from the surrounding text.** It outranks the Mermaid.
   Where the two disagree, ask the user.
4. **Map each node to the house shape for what it is,** not the bracket it was
   written in. A box labelled "Dapr sidecar" is `markHex()`.
5. **The house constraints apply, Mermaid's do not.** `decision()` holds one
   short word, with the condition above it as a `note()`.

## The scene contract

A scene module default-exports one object:

| Field | Type | Rule |
| --- | --- | --- |
| `width`, `height` | number | Positive. They set the viewBox, and the scene's coordinates use them |
| `title` | string | Non-empty. Names the diagram |
| `desc` | string | Non-empty. Describes what the diagram shows |
| `build()` | function | Returns an array of nodes. Nested arrays and `null` entries are fine, so `.map()` and conditionals need no ceremony |

Register it in `scenes/index.mjs` under its name:

```js
import checkoutComponents from './checkout-components.mjs';

export const scenes = {
  'checkout-components': checkoutComponents,
};
```

Above the scene, write a comment saying what it shows and any place it
deliberately departs from its source, with the reason. Before exporting, read
back through Grouping and centering and Laying out connections against what
you drew.

The exporter validates before writing anything: the name, a non-empty
`title` and `desc`, positive dimensions, that `build()` returns an array, that
no two elements share an id, and that every colour token resolves. A scene
that throws leaves `out/` untouched and names the scene in the error.

## Engine API

Every builder takes one options object and returns a plain node; builders are
pure, so the same input gives byte-identical output. Every builder takes
`x, y` as the shape's **centre**, except `panel()`, `region()` and `pod()`,
which take the top-left corner because a region is placed by its extent.
Coordinates are in the scene's canvas.

### `_engine/engine.mjs`

| Export | Returns |
| --- | --- |
| `el(tag, attrs, children)` | A node; children may be nodes or strings |
| `text(content)` | A text node, escaped on serialize |
| `serialize(node)` | A string; attributes keep insertion order |
| `svg({ width, height, title, desc, id, children, origin })` | A complete document with `<title>` and `<desc>` wired to `role="img"`. The exporter calls it |
| `C` | The colour tokens: `navy`, `blue`, `orange`, `teal`, `mint`, `red`, `lavender`, `grey`, `caption`, `green`, `appInk`, `appSky`, `appGold`, `appTeal`, `appBlue`, `paper`, `kubernetes`, `redisBrand`, `markPlate`, `body`, `bg`, `plate`, `plateInk`, `tealFill`, `blueFill`, `navyFill` |
| `APP` | Five `{ stroke, fill, ink, solid }` entries: green, light blue, yellow, teal, dark blue |

### `_engine/shapes.mjs`

| Builder | Options (defaults) | Draws |
| --- | --- | --- |
| `group(children)` | an array, or `{ children, ...attrs }` | A `<g>` |
| `slots(x0, x1, n)` | | `n` evenly spaced centres across the span (numbers) |
| `label(o)` | `x, y, text, size` (11), `weight` (600), `color` (`C.body`), `halo`, `anchor` (`'middle'`), `mono` | Text; `\n` starts a line; `y` is the block's vertical centre |
| `richLabel(o)` | `x, y, parts, size` (13), `weight` (400), `color`, `anchor` (`'start'`), `mono` | One line whose `parts` (`{ text, color, weight, mono }`) differ in colour or weight |
| `hex(o)` | `x, y, r` (42.5), `stroke, fill, ink, solid, label` (`'App'`), `size` (r/3), `labelDx, labelDy, sub, subSize` | A pointy-top app hexagon with its name; `sub` is a code line under the name |
| `hexPoints(x, y, r)` | | The six points as a `points` string |
| `hexHalfWidth(r)`, `hexHalfWidthAt(r, dy)`, `hexEdgeAt(r, dx)` | | Half width; half width at height `dy`; the boundary's depth at offset `dx` |
| `badge(o)` | `x, y, r` (19), `mark` | The small solid navy Dapr hexagon |
| `daprApp(o)` | `x, y, r` (42.5), `stroke, fill, label, size, labelDx, badgeLeft, mark` | An app with the badge docked bottom right (or left). Does not pass `ink` or `solid` |
| `stepMark(o)` | `x, y, step, r` (15), `size` | A numbered disc |
| `box(o)` | `x, y, w` (194), `h` (30), `label, stroke` (`C.teal`), `fill` (`C.tealFill`), `size` (11), `labelDx, solid` | A workflow activity rectangle |
| `decision(o)`, `decisionPoints(o)` | `x, y, w` (92), `h` (64), `label, stroke, fill` (`C.appGold`), `size, solid` | A diamond; its four points by name |
| `node(o)` | `x, y, r` (16), `stroke, fill, label, labelDy, labelInside, ink, size` | A workflow start or end circle |
| `cylinder(o)` | `x, y, w`, or `x, top, bottom, rx, ry`; `label, ink, size` (14), `stroke, fill` (`C.appGold`) | A standing data store, `STORE_RATIO` (1.2) wide to tall |
| `pipe(o)` | `x1, x2, y, ry` (34), `rx` (14), `label, ink, size` (14), `stroke, fill` (`C.green`) | A broker lying down; body 2 to 3 diameters long; drawn from `x1 - rx` to `x2 + rx` |
| `callout(o)` | `x, y, w` (210), `h` (54), `text, size` (13), `to` | A note card with a dashed leader to `to` |
| `envelope(o)`, `broker(o)` | `x, y, w, label, labelDy, stroke, fill` | A message; two stacked envelopes |
| `lockBox(o)`, `secureLock(o)` | `x, y, size` (44), `stroke, fill, label, labelDy` | A secret store; secure communication (sky shield) |
| `panel(o)` | `x, y, w, h, stroke` (`C.caption`), `r` (10) | A dashed rounded area; top-left corner |
| `region(o)` | `x, y, w, h, stroke, r, caption, captionW, captionX, captionH` (26), `captionSize` (15) | A dashed area with its name on the top border |
| `pod(o)` | `x, y, w, h, name` (`'Pod'`), `captionW` (56), `captionX, size` (13) | A Kubernetes pod |
| `pill(o)` | `x, y, w, h` (26), `text, color` (`C.navy`), `filled, size` (15) | A rounded caption tag |
| `tile(o)` | `x, y, icon, label, color, filled, size` (99), `w, h, inline, tag, labelSize, glyphSize, glyphGap, glyphDy, nameDy, desc, descSize, inlinePad, inlineGap` | A card with an icon over or beside a label. Prefer `card()` or `apiTile()` |
| `httpCard(o)`, `httpCardH(o)` | `x, y, w, h, method, url, status, request, body, size` (13), `statusW` | An HTTP exchange; the least height it needs |
| `codeCard(o)` | `x, y, w, h, title, code, size` (12), `titleSize` (13), `pad` (14) | A file or code in a bordered card, name above |
| `indentCode(code)` | | Leading spaces turned non-breaking, so indentation survives |
| `roundedPath(o)` | `points, r` (10), `color` (`C.navy`), `width, dash` | A run that turns each corner with an arc |
| `elbowArrow(o)` | `points, r` (12), `color` (`C.navy`), `heads` (`'end'`, `'start'`, `'both'`, `'none'`), `dash` | A turning line with its chevron, as one path |
| `arrow(o)` | `from, to, head` (true), `color` (`C.navy`), `gap` (2), `dash` | A straight arrow between shape edges |
| `lollipop(o)`, `socket(o)` | `x, y, to, toY, elbowX, r`; `x, y, from, r` | A UML provided interface; the socket that cups it |
| `lineWidth()` | | The stroke for this canvas |
| `captionReach()`, `captionPad(size)` | | How far a pill hangs inside its region (13); a pill's end padding |
| Constants | | `MIN_LABEL` 10, `HEAD` 8, `FILL_OPACITY` 0.6, `CAPTION_H` 26, `CAPTION_INSET` 20, `STORE_RATIO` 1.2, `BALL_R` 10, `SOCKET_R` 21, `STEP_R` 15, `MONO` |

`arrow()`'s `from` and `to` take a point `[x, y]` (used as is) or a shape
descriptor: a circle `{ x, y, r }`, a hexagon `{ x, y, r, hex: true }` or a
rectangle `{ x, y, w, h }`.

### `_engine/app.mjs`

| Export | Returns |
| --- | --- |
| `appSidecar(o)` | `x, y, r` (54), `label` (`'App'`), `size, mirror, sub, subSize`, plus a spread `APP[n]`: the app hexagon with the Dapr sidecar overlapping it |
| `sidecarAt(o)` | Same options: the sidecar as an arrow descriptor `{ x, y, r, hex: true }` |
| `pairExtent(o)` | The pair's `{ left, right, top, bottom }` about the app's centre |
| `appSidecarCentre(o)` | `{ x, y }` for the app so that the whole pair is centred on the given point |
| `sidecarDx(r)` | How far right of the app's centre the sidecar sits |
| `SIDECAR_R`, `SIDECAR_CLEARANCE`, `SIDECAR_GAP` | 0.75 of `r`; 0.15 of `r` below the app's lowest point; 7 units under the name |

### `_engine/icons.mjs`

| Export | Returns |
| --- | --- |
| `icon(o)` | `name, x, y, size` (32), `w, h, color` (`C.body`), `label, labelDy, labelSize` (13), `dir, fit` (`'box'` or `'ink'`). The mark fitted into the box, aspect kept. `color` tints single-colour marks only |
| `markHex(o)` | `x, y, r, mark, size, stroke` (`C.blue`), `fill, color`: a hexagon with a mark centred in it. `logo-blue` needs no `size` |
| `plate(o)`, `brand(o)` | A neutral backing; a mark on its plate, with an optional name inside |
| `logoStrip(o)`, `logoStripSize(o)` | `x, y, marks` (`{ mark, name, color }`), `caption, cols, markSize` (30), `size` (13), `plated`: vendor marks with names in a captioned region; its size |
| `serviceInvocation(o)` | The service-invocation glyph, sized by ink |
| `listMarks(dir)` | Every mark name in a folder |
| `DAPR_MARK`, `MARK_IN_HEX`, `PLATE_H`, `PLATE_PAD` | 4/3 and 0.8 of the radius; 68; 28 |
| `IconError` | Thrown for a missing mark, a bad name, or a file that fails the screen |

### `_engine/cards.mjs` and `_engine/apis.mjs`

| Export | Returns |
| --- | --- |
| `card(o)` | `mark, name, w, h, inline, color` (`C.blue`), `filled, tag`, plus `tile()` options: a card with the mark and name sized from it |
| `cardSizes(o)` | `{ glyph, label }` for a card; throws below the 10-unit floor |
| `APIS`, `CROSS_CUTTING` | The 16 APIs and the 3 cross-cutting concerns, each `{ key, mark, name, wrap, tag }` |
| `api(key)` | One entry; throws on an unknown key |
| `apiTile(o)` | `key, wrap, glyph`, plus `card()` options: the API block |

Keys: `workflows`, `pubsub`, `service-invocation`, `state`, `actors`, `jobs`,
`configuration`, `secrets`, `bindings`, `middleware`, `cryptography`,
`distributed-lock`, `conversation`, `binary-store`, `search`, `vector`, and
`observability`, `security`, `resiliency`.

### `_engine/services.mjs`

| Export | Returns |
| --- | --- |
| `serviceHex(o)` | `key, x, y, r` (`SERVICE_R`, 34), `role, wrap, size, side` (`'below'` or `'right'`): a Dapr hexagon with the service's name, and its role in blue |
| `SERVICES`, `service(key)` | `placement`, `scheduler`, `sentry`, `operator`, `injector` |
| `serviceLabel(r)` | The name size for a radius, for a neighbour that is not a Dapr service; throws below 10 |
| `NAME_DY`, `ROLE_DY`, `NAME_DX` | The name's and role's offsets as multiples of `r` |

### `_engine/brands.mjs`

| Export | Returns |
| --- | --- |
| `LANGUAGES` | `nodejs`, `python`, `dotnet`, `go`, `php`, `rust`, each `{ name, w, h, content, color }` |
| `CLOUDS` | `azure`, `aws`, `google-cloud`, `kubernetes` |
| `scaleMarks(marks, k)` | Every size in a row scaled by one factor, so the marks stay in proportion |
| `cloudMark(o)` | `mark, x, y, k` (1): one cloud mark with its backing and name |
| `LANG_PLATE_H`, `CLOUD_LABEL`, `CLOUD_TEXT_DX`, `MARK_PLATE_H`, `MARK_PLATE_PAD` | 80, 15, 21, 56, 16 |

### `_engine/flow.mjs`

| Export | Returns |
| --- | --- |
| `FLOW` | `W` 172, `H` 46, `SIZE` 13, `CAPTION_SIZE` 13, `NOTE_SIZE` 12, `PAD`, `LANE_TERMINAL_H`, `LANE_ACTIVITY_H`, `GAP_X` 58, `GAP_Y` 28, `NODE_R` 30, and the styles `start`, `end`, `step`, `wait` to spread into `node()` or `box()` |
| `flowLane(o)` | `x, y, w, h, caption, captionW, captionX`: a lane, a `region()` with the flow caption size |
| `note(o)` | `x, y, text, anchor, halo`: a remark on the flow |

## Worked example

An app with its Dapr sidecar that saves state to Redis and publishes to
Kafka. Save it as `<diagramsDir>/scenes/checkout-components.mjs`, register it
in `scenes/index.mjs` as `'checkout-components'`, and export.

```js
// An app with its Dapr sidecar, saving state to Redis and publishing to Kafka.
// One app, so it takes APP[0] (green) and the broker takes sky instead of the
// house green. The sidecar is what reaches the components, so both runs start
// at the sidecar, as one trunk that forks on a bus.
import { C, APP } from '../_engine/engine.mjs';
import { cylinder, elbowArrow, group, hexHalfWidth, label, pipe, STORE_RATIO } from '../_engine/shapes.mjs';
import { appSidecar, sidecarAt } from '../_engine/app.mjs';
import { icon } from '../_engine/icons.mjs';

const W = 560; // 16:9, the extra air on the long axis
const H = 315;

const TEXT = 13; // the labels on the runs
const NAME = 15; // every shape's name, so the three names match

// The app and its sidecar. sidecarAt() says where the sidecar lands, so the
// runs start on the drawing rather than on a copy of its offsets.
const APP_R = 54;
const APP_X = 103;
const APP_Y = 92;
const SIDE = sidecarAt({ x: APP_X, y: APP_Y, r: APP_R, size: NAME });

// One trunk leaves the sidecar square out of its right edge and forks at BUS_X.
const TRUNK_X0 = SIDE.x + hexHalfWidth(SIDE.r) + 2;
const BUS_X = TRUNK_X0 + 44;
const SPREAD = 86; // each component sits this far above or below the trunk
const LEG = 120; // bus to component: the label's width plus two characters each side

// Both components share a left edge, so both legs are the same length.
const LEFT = BUS_X + LEG;

const STORE_W = 120;
const STORE_X = LEFT + STORE_W / 2;
const STORE_Y = SIDE.y - SPREAD;
const STORE_H = STORE_W / STORE_RATIO;

const PIPE_RX = 12;
const PIPE_RY = 30;
const PIPE_X1 = LEFT + PIPE_RX;
const PIPE_X2 = PIPE_X1 + 140; // 2.33 diameters, inside pipe()'s 2 to 3
const PIPE_X = (PIPE_X1 + PIPE_X2) / 2;
const PIPE_Y = SIDE.y + SPREAD;

const MARK = 40; // both marks, fitted to their ink so they weigh the same
const WORD_DY = 14; // a label rides this far above its run
const NAME_DY = 18; // a name sits this far below its shape

const run = (y) => [[TRUNK_X0, SIDE.y], [BUS_X, SIDE.y], [BUS_X, y], [LEFT - 2, y]];
const SPAN_X = (BUS_X + LEFT) / 2; // labels centre on the leg they name

export default {
  width: W,
  height: H,
  title: 'An app saving state and publishing messages through its Dapr sidecar',
  desc:
    'A green hexagon named Checkout with its Dapr sidecar overlapping its lower right. '
    + 'From the sidecar one line forks in two. The upper branch, labelled Save state, ends at '
    + 'a gold data store holding the Redis mark, named Redis state store. The lower branch, '
    + 'labelled Publish, ends at a blue message broker lying on its side, holding the Kafka '
    + 'mark, named Kafka pub/sub broker.',

  build() {
    return [
      // Runs first, so the shapes paint over their ends.
      elbowArrow({ points: run(STORE_Y) }),
      elbowArrow({ points: run(PIPE_Y) }),
      label({ x: SPAN_X, y: STORE_Y - WORD_DY, text: 'Save state', size: TEXT, halo: true }),
      label({ x: SPAN_X, y: PIPE_Y - WORD_DY, text: 'Publish', size: TEXT, halo: true }),

      appSidecar({ x: APP_X, y: APP_Y, r: APP_R, label: 'Checkout', size: NAME, ...APP[0] }),

      group([
        cylinder({ x: STORE_X, y: STORE_Y, w: STORE_W }),
        icon({ name: 'redis', x: STORE_X, y: STORE_Y, size: MARK, color: C.appInk, fit: 'ink' }),
        label({ x: STORE_X, y: STORE_Y + STORE_H / 2 + NAME_DY, text: 'Redis state store', size: NAME }),
      ]),

      group([
        pipe({ x1: PIPE_X1, x2: PIPE_X2, y: PIPE_Y, ry: PIPE_RY, rx: PIPE_RX, fill: C.appSky }),
        icon({ name: 'kafka', x: PIPE_X, y: PIPE_Y, size: MARK, fit: 'ink' }),
        label({ x: PIPE_X, y: PIPE_Y + PIPE_RY + NAME_DY, text: 'Kafka pub/sub broker', size: NAME }),
      ]),
    ];
  },
};
```

### Key points

- **Every position is derived.** The sidecar comes from `sidecarAt()`, the
  legs from the sidecar's edge, the store and the broker from one shared left
  edge. Moving the app moves everything with it.
- **One trunk, one fork.** Both runs leave the sidecar on the same line and
  split on a bus, rather than two arrows leaving the sidecar at two angles.
- **One app, so the broker is sky, not green.** The store is the house gold,
  and the Redis mark on it takes `C.appInk` because it sits on a solid fill.
- **Proportions are the builders'.** `cylinder()` takes a width and derives the
  height; the pipe is 140 long and 60 across, inside the 2 to 3 range
  `pipe()` enforces.
- **Labels on runs have halos and sit on their own leg,** centred on the span
  between the bus and the shapes' shared left edge.
- **Names sit outside their shapes,** because the marks fill the inside.
  `appSidecar()` sets the app's name on its solid fill.
- **The canvas is 16:9 and the drawing is centred by construction.** The
  measured origin in `bbox.json` comes out under half a unit, so the scene
  looks the same with or without Chromium. The spare air is on the long axis,
  left and right.

## Traps already hit

- **A clean export is not a correct diagram.** The export checks structure,
  not looks. Render it and look at both themes: open the SVG in a browser
  with light and dark schemes, or look at both PNGs (the dark one on a dark
  ground).
- **Equal ink weight means equal `size`.** A Fluent glyph's stroke scales with
  the glyph, so marks at 52 and 64 side by side differ in weight. Give every
  standalone mark in a scene one size and every mark in a card another, as
  constants. And a mark's viewBox is not its content (`go` draws 24x9 inside a
  24x24 box), so fit shipped marks with `fit: 'ink'`.
- **A definition copied into a scene drifts, and nothing tells you.** Two
  scenes each carrying their own list of APIs ended up with different lengths
  while every check passed. Shared facts belong in one module the scenes
  import.
- **Check contrast before copying a colour pair,** even from a diagram that
  ships somewhere. A pair that works on a light page may fail on a dark one.
  Navy is the safe filled colour.
- **A token is chosen against the surface it lands on,** not against the page.
  That is why `C.plateInk` exists.
- **Fluent glyphs paint `fill="currentColor"`.** `icon()` sets `color` as well
  as `fill` for single-colour marks. If you wrap a glyph yourself, do the same.
- **Never inline a vendored SVG by hand.** Its ids collide with other marks and
  with the page; `icon()` prefixes and de-duplicates them.
- **Passing a left edge to a centre-based builder** hangs the shape off by half
  its width. Only `panel()`, `region()` and `pod()` take a top-left corner.
- **Shrinking the canvas and a shape together changes nothing you can see.**
  Only ratios inside the scene are visible. When a shape is too big beside
  another, change the two sizes against each other, name the shape everything
  is sized against, and write the ratio in the scene.
- **Scene coordinates are not frame coordinates once a scene has an origin.**
  `bbox.json` centres a drawing by moving the viewBox. A margin computed from
  scene numbers is off by that origin at both ends, in opposite directions,
  which looks exactly like a drawing that leans.
- **A measurement that comes back unchanged after a change usually means the
  change did not land.** A failed export leaves the previous SVG in `out/`.
  Read the export's output before concluding a fix had no effect.
- **Only leading spaces survive in `codeCard()` and `httpCard()`.** A run of
  spaces in the middle of a line collapses to one. Write payloads with single
  spaces.
- **A name set on a shape's fill has to clear that shape's own ends.** At the
  short end of `pipe()`'s range the caps clip the first letter of a long name.
- **A column is not a tall card.** `card()` places its mark and name by
  proportion, which pulls them apart on a very tall shape. `box()` centres its
  name, which is what a labelled column wants.
- **A tall diagram has to earn its width back.** Nine rows at a comfortable
  pitch fail the 16:9 floor at a width chosen from the longest label. Size the
  span from the aspect first, then check the longest label fits.
- **Ligatures off only works as a `style`.** `font-variant-ligatures` is a CSS
  property, not an SVG attribute, and as an attribute it is silently ignored.
  `label()` and `richLabel()` handle it for `mono` text; do the same if you set
  code text yourself.
- **A label wider than its own card passes every structural check.** Only the
  fallback-font check, measuring or looking catches it, and raising a label or
  glyph size is exactly the change that causes it.
- **`getBBox()` on a transformed element returns its local box.** Every mark
  sits in a translated, scaled group. Measure untransformed elements (a
  `<text>`, a `<rect>` you placed) with `getBBox()`, and anything transformed
  with `getBoundingClientRect()`.
