# create-diagram reference

The detailed guide for drawing a Dapr diagram in the docs.dapr.io house
style. Read it while you build a scene: the design rules, how to turn a
source into a layout, the scene contract, a worked example and the traps
that are easy to fall into. The engine API, the full examples and the
specialised topics are separate files that SKILL.md says when to open.

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
| `<diagramsDir>/scenes/<name>.mjs` | One scene per diagram. It imports the engine relatively, from `../_engine/` |
| `<diagramsDir>/scenes/index.mjs` | The registry: `export const scenes = { '<name>': scene }` |
| `<diagramsDir>/out/png-manifest.json` | The render settings and a hash per scene, so unchanged PNGs are not re-rendered |
| `<diagramsDir>/bbox.json` | The measured viewBox origin that centres each drawing, written only when Chromium is available |

- **`--check`** renders and validates every scene (title, desc, name,
  dimensions, duplicate ids, every colour token resolvable) and fails if a file
  in `out/` differs from a fresh render. With Chromium it also fails when
  `bbox.json` or a PNG is out of date.
- **`--no-browser`** exports SVGs only, even when Chromium is installed.
- **A full export** removes any `*.svg`, `*-light.png` or `*-dark.png` in
  `out/` that no scene claims.
- **`--only <name>`** measures only that scene with Chromium and leaves the
  other entries in `bbox.json` alone.
- **Scene names** are lowercase letters and digits in hyphen-separated words:
  `order-flow`, not `Order_Flow` or `order--flow`.
- **Slides:** see [topics/slides.md](topics/slides.md).

### With Chromium

With Playwright (in the diagrams folder or a folder above it) and its Chromium installed, the export does three more things.

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

### Measuring labels

Rules below say a width is measured, not guessed. With Chromium, run
`node "<diagramsDir>/_engine/measure-labels.mjs" <name>`. It prints every
label's box (text, x, y, w, h) in scene units, before centring.

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
- **A label beside a vertical run is anchored `start` on the right** (`end` on
  the left), about one character (12 units at 13) clear of the line, centred on
  the run between the two shape edges, on the side away from the nearest shape
  and clear of the 8-unit head.
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
- **A pipe or a store is an arrow target by its bounding rect,** given in the
  `pipe()` and `cylinder()` rows of [API.md](API.md). A diagonal stops at the
  rect, short of the cap or rim, so run lines along the axes.
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
- **Equal ink weight means equal `size`.** A Fluent glyph's stroke scales with
  the glyph, so marks at 52 and 64 side by side differ in weight. Give every
  standalone mark in a scene one size and every mark in a card another, as
  constants.
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

- **Dapr API blocks and the HTTP call:** see [topics/api-blocks.md](topics/api-blocks.md).

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
- **When one branch hangs off one side, check the four quarters.** Move the
  branch under the centre on an elbow, mirror it, or trim the canvas. Never
  add a shape to fill space. If a corner stays empty, say why in a comment.
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
mark is the Simple Icons mark, tinted `C.pythonBrand`. There is no
Java mark: name Java with a text label.

- **Prefer a shipped mark.** Redis is `redis` (tint it with `C.redisBrand`, or
  `C.appInk` when it sits on a solid fill), Kafka is `kafka` (full colour),
  Kubernetes is `kubernetes` (tint `C.kubernetes`), the Dapr logo is
  `logo-blue`.
- **A mark the engine does not ship** goes in `<diagramsDir>/icons/`, never in
  `_engine/icons/`. See [topics/brand-marks-custom.md](topics/brand-marks-custom.md).

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

To match an existing diagram: [topics/matching.md](topics/matching.md). To
convert a Mermaid block: [topics/mermaid.md](topics/mermaid.md).

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

## Worked example

The full scenes are files in [examples/](examples/): copy one into
`<diagramsDir>/scenes/`, register it and export.
[checkout-components.mjs](examples/checkout-components.mjs) is one app whose
sidecar saves state to Redis and publishes to Kafka;
[orders-payments.mjs](examples/orders-payments.mjs) is two apps talking through
Kafka, with Orders also saving state to Redis.

### Key points: checkout-components.mjs

- **Every position is derived,** from `sidecarAt()` and one shared left edge
  for the store and the broker. Both runs leave the sidecar as one trunk and
  fork on a bus.
- **One app, so the broker is sky, not green.** The Redis mark takes `C.appInk`
  on the solid gold store; the 140 by 60 pipe is inside `pipe()`'s 2 to 3.
- **Names sit outside their shapes; labels on runs have halos.** The canvas is
  16:9 and centred by construction, so it looks the same without Chromium.

### Key points: orders-payments.mjs

- **Mirrored pairs from the canvas centre.** Payments takes `mirror: true`, so
  the sidecars face the pipe and one straight line runs through it. Two apps
  take `APP[0]` and `APP[1]`; the broker stays the house green.
- **Balanced by moving, not adding.** Redis hangs under the pipe on an elbow
  from the Orders sidecar, so every quarter holds a shape. "Save state" sits
  beside the vertical leg; the pipe and store are rect targets.

## Traps already hit

- **A clean export is not a correct diagram.** The export checks structure,
  not looks. Render it and look at both themes: open the SVG in a browser
  with light and dark schemes, or look at both PNGs (the dark one on a dark
  ground).
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
- **`getBBox()` on a transformed element returns its local box.** Every mark
  sits in a translated, scaled group. Measure untransformed elements (a
  `<text>`, a `<rect>` you placed) with `getBBox()`, and anything transformed
  with `getBoundingClientRect()`.
