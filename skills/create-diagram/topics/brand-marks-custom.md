# Adding your own brand mark

The engine ships the marks in `_engine/icons/`. For one it does not ship, follow these rules.

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
