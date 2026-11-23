# create-diagram engine API

The lookup tables for the engine modules. Open this while you write a scene.

Every builder takes one options object and returns a plain node; builders are
pure, so the same input gives byte-identical output. Every builder takes
`x, y` as the shape's **centre**, except `panel()`, `region()` and `pod()`,
which take the top-left corner because a region is placed by its extent.
Coordinates are in the scene's canvas.

## `_engine/engine.mjs`

| Export | Returns |
| --- | --- |
| `el(tag, attrs, children)` | A node; children may be nodes or strings |
| `text(content)` | A text node, escaped on serialize |
| `serialize(node)` | A string; attributes keep insertion order |
| `svg({ width, height, title, desc, id, children, origin })` | A complete document with `<title>` and `<desc>` wired to `role="img"`. The exporter calls it |
| `C` | The colour tokens: `navy`, `blue`, `orange`, `teal`, `mint`, `red`, `lavender`, `grey`, `caption`, `green`, `appInk`, `appSky`, `appGold`, `appTeal`, `appBlue`, `paper`, `kubernetes`, `redisBrand`, `markPlate`, `body`, `bg`, `plate`, `plateInk`, `tealFill`, `blueFill`, `navyFill` |
| `APP` | Five `{ stroke, fill, ink, solid }` entries: green, light blue, yellow, teal, dark blue |

## `_engine/shapes.mjs`

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

## `_engine/app.mjs`

| Export | Returns |
| --- | --- |
| `appSidecar(o)` | `x, y, r` (54), `label` (`'App'`), `size, mirror, sub, subSize`, plus a spread `APP[n]`: the app hexagon with the Dapr sidecar overlapping it |
| `sidecarAt(o)` | Same options: the sidecar as an arrow descriptor `{ x, y, r, hex: true }` |
| `pairExtent(o)` | The pair's `{ left, right, top, bottom }` about the app's centre |
| `appSidecarCentre(o)` | `{ x, y }` for the app so that the whole pair is centred on the given point |
| `sidecarDx(r)` | How far right of the app's centre the sidecar sits |
| `SIDECAR_R`, `SIDECAR_CLEARANCE`, `SIDECAR_GAP` | 0.75 of `r`; 0.15 of `r` below the app's lowest point; 7 units under the name |

## `_engine/icons.mjs`

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

## `_engine/cards.mjs` and `_engine/apis.mjs`

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

## `_engine/services.mjs`

| Export | Returns |
| --- | --- |
| `serviceHex(o)` | `key, x, y, r` (`SERVICE_R`, 34), `role, wrap, size, side` (`'below'` or `'right'`): a Dapr hexagon with the service's name, and its role in blue |
| `SERVICES`, `service(key)` | `placement`, `scheduler`, `sentry`, `operator`, `injector` |
| `serviceLabel(r)` | The name size for a radius, for a neighbour that is not a Dapr service; throws below 10 |
| `NAME_DY`, `ROLE_DY`, `NAME_DX` | The name's and role's offsets as multiples of `r` |

## `_engine/brands.mjs`

| Export | Returns |
| --- | --- |
| `LANGUAGES` | `nodejs`, `python`, `dotnet`, `go`, `php`, `rust`, each `{ name, w, h, content, color }` |
| `CLOUDS` | `azure`, `aws`, `google-cloud`, `kubernetes` |
| `scaleMarks(marks, k)` | Every size in a row scaled by one factor, so the marks stay in proportion |
| `cloudMark(o)` | `mark, x, y, k` (1): one cloud mark with its backing and name |
| `LANG_PLATE_H`, `CLOUD_LABEL`, `CLOUD_TEXT_DX`, `MARK_PLATE_H`, `MARK_PLATE_PAD` | 80, 15, 21, 56, 16 |

## `_engine/flow.mjs`

| Export | Returns |
| --- | --- |
| `FLOW` | `W` 172, `H` 46, `SIZE` 13, `CAPTION_SIZE` 13, `NOTE_SIZE` 12, `PAD`, `LANE_TERMINAL_H`, `LANE_ACTIVITY_H`, `GAP_X` 58, `GAP_Y` 28, `NODE_R` 30, and the styles `start`, `end`, `step`, `wait` to spread into `node()` or `box()` |
| `flowLane(o)` | `x, y, w, h, caption, captionW, captionX`: a lane, a `region()` with the flow caption size |
| `note(o)` | `x, y, text, anchor, halo`: a remark on the flow |
