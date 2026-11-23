// Rasterises each exported SVG to <name>-light.png and <name>-dark.png, for
// the places that ignore the SVG's own theme switch: PowerPoint, Keynote and
// Google Slides. A deck takes the PNG that matches its background.
//
// Each PNG is the drawing, not the canvas: the viewBox is trimmed to the
// drawing's box plus PNG_MARGIN, drawn at that natural size and captured at
// PNG_SCALE device pixels per unit with a transparent background.
//
// png-manifest.json records the render SETTINGS as well as a hash per scene.
// A hash only answers "did this drawing change"; it cannot answer "would a
// fresh render of the unchanged drawing come out different", which is what
// happens when the scale or a baked font stack moves. The manifest exists at
// all because unchanged PNGs are skipped: Chromium's raster output is not
// guaranteed byte-stable across versions, and re-rendering an unchanged scene
// would churn a binary in git for no visible change. `force` re-renders.

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withHarness } from './browser.mjs';
import { sha256 } from './hash.mjs';
import { BODY_STACK, MONO_STACK } from './export.mjs';

export const PNG_SCALE = 2;
// Scene units around the trimmed drawing. Not zero: getBBox() reports
// geometry without stroke width, and a stroke straddles its edge, so a tight
// crop would shave the outer half off every outline.
export const PNG_MARGIN = 12;
export const SCHEMES = ['light', 'dark'];
// Bumped by hand when something about the rasterising changes that the
// constants above do not describe.
export const GENERATOR = 1;

export function settings() {
  return {
    scale: PNG_SCALE, margin: PNG_MARGIN, schemes: SCHEMES.join(','), generator: GENERATOR, body: BODY_STACK, mono: MONO_STACK,
  };
}

export { sha256 };

const SUFFIX = new RegExp(`^(.+)-(${SCHEMES.join('|')})\\.png$`);
export const pngNames = {
  files: (name) => SCHEMES.map((s) => `${name}-${s}.png`),
  scene: (file) => SUFFIX.exec(file)?.[1] ?? null,
};

const sameSettings = (a, b) =>
  !!a && Object.keys(b).length === Object.keys(a).length && Object.keys(b).every((k) => a[k] === b[k]);

// The scenes needing a render. `hashes` is name -> svg hash for every scene
// to render; `present` is the names that have every PNG on disk, because a
// hash matching a file somebody deleted still needs rendering.
export function stale(manifest, hashes, wanted, present) {
  const names = Object.keys(hashes).sort();
  if (!sameSettings(manifest?.settings, wanted)) return names;
  const have = new Set(present);
  return names.filter((name) => manifest.scenes?.[name] !== hashes[name] || !have.has(name));
}

// Names the manifest still lists that no scene draws any more.
export function orphans(manifest, hashes) {
  return Object.keys(manifest?.scenes ?? {}).filter((name) => !Object.hasOwn(hashes, name)).sort();
}

// svgs: name -> exported SVG text. Returns { ok, problems[], written[], removed[] }.
// prune: false (for a single-scene export) leaves other scenes' PNGs and
// manifest entries alone.
export async function renderPngs({ svgs, outDir, manifestPath, check = false, force = false, prune = true } = {}) {
  if (!outDir) throw new Error('renderPngs(): outDir is required');
  // Required rather than defaulted, so a render into a temp directory can
  // never stamp a real project's manifest.
  if (!manifestPath) throw new Error('renderPngs(): manifestPath is required');

  const hashes = Object.fromEntries([...svgs].map(([name, text]) => [name, sha256(text)]));
  let manifest = null;
  try {
    manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  } catch {
    // An unreadable manifest just means everything renders again.
  }
  const onDisk = existsSync(outDir) ? readdirSync(outDir).filter((f) => pngNames.scene(f) !== null) : [];
  const disk = new Set(onDisk);
  const present = Object.keys(hashes).filter((name) => pngNames.files(name).every((f) => disk.has(f)));
  const wanted = settings();
  const behind = stale(manifest, hashes, wanted, present);
  // A PNG with no scene, from the manifest and from the directory both: an
  // entry left behind and a file left behind are halves of one mistake.
  const deadScenes = prune ? orphans(manifest, hashes) : [];
  const deadFiles = prune ? onDisk.filter((f) => !Object.hasOwn(hashes, pngNames.scene(f))).sort() : [];

  if (check) {
    const fix = '(re-run the export)';
    const problems = [];
    for (const name of behind) {
      const missing = pngNames.files(name).filter((f) => !disk.has(f));
      problems.push(missing.length ? `${missing.join(', ')}: missing ${fix}` : `${pngNames.files(name).join(', ')}: stale ${fix}`);
    }
    for (const f of deadFiles) problems.push(`${f}: no matching scene ${fix}`);
    const fileScenes = new Set(deadFiles.map(pngNames.scene));
    for (const name of deadScenes.filter((n) => !fileScenes.has(n))) {
      problems.push(`png-manifest.json: lists "${name}", which no scene draws ${fix}`);
    }
    return { ok: problems.length === 0, problems, written: [], removed: [] };
  }

  // An emptied registry (typo, bad merge) must not silently wipe every PNG.
  if (svgs.size === 0 && deadFiles.length) {
    const problem = `registry is empty but ${deadFiles.length} png(s) exist in ${outDir}; refusing to delete them`;
    return { ok: false, problems: [problem], written: [], removed: [] };
  }

  // Rasterise everything before touching disk, so a scene that cannot be
  // measured leaves the output directory as it found it.
  const todo = force ? Object.keys(hashes).sort() : behind;
  const shots = todo.length ? await rasterise(todo.map((name) => [name, svgs.get(name)])) : new Map();

  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [file, bytes] of shots) {
    writeFileSync(join(outDir, file), bytes);
    written.push(file);
  }
  const removed = [];
  for (const f of deadFiles) {
    unlinkSync(join(outDir, f));
    removed.push(f);
  }

  // Last, once every file is on disk: a crash mid-render leaves the manifest
  // describing the previous render, so the next run redoes what did not land.
  const kept = !prune && sameSettings(manifest?.settings, wanted) ? manifest.scenes ?? {} : {};
  const entries = { ...kept, ...hashes };
  const next = Object.fromEntries(Object.keys(entries).sort().map((n) => [n, entries[n]]));
  const body = `${JSON.stringify({ settings: wanted, scenes: next }, null, 2)}\n`;
  const current = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  if (body !== current && (current !== null || Object.keys(next).length)) {
    writeFileSync(manifestPath, body);
  }
  return { ok: true, problems: [], written, removed };
}

// file name -> png bytes, all through one browser and one page. The page has
// the bundled faces loaded: the exported SVG names Inter and Geist Mono
// outright, and a PNG drawn in a fallback face would not match the SVG.
async function rasterise(jobs) {
  return withHarness(async (tab) => {
    const out = new Map();
    for (const [name, svgText] of jobs) {
      for (const colorScheme of SCHEMES) {
        await tab.emulateMedia({ colorScheme });
        const size = await tab.evaluate(({ markup, margin }) => {
          document.body.innerHTML = markup;
          const root = document.querySelector('svg');
          // getBBox() on the root is the union of its children in the root's
          // own user space, which is what a replacement viewBox is written in.
          const ink = root.getBBox();
          if (!(ink.width > 0) || !(ink.height > 0)) return null;
          const w = ink.width + margin * 2;
          const h = ink.height + margin * 2;
          root.setAttribute('viewBox', `${ink.x - margin} ${ink.y - margin} ${w} ${h}`);
          root.setAttribute('width', w);
          root.setAttribute('height', h);
          // Inline by default, which gives it a line box and a fractional offset.
          root.style.display = 'block';
          return { w, h };
        }, { markup: svgText, margin: PNG_MARGIN });
        if (!size) throw new Error(`scene "${name}": no measurable drawing to rasterise`);
        await tab.setViewportSize({ width: Math.max(1000, Math.ceil(size.w) + 40), height: Math.max(900, Math.ceil(size.h) + 40) });
        await tab.evaluate(() => document.fonts.ready);
        // omitBackground is the transparency: without it the page comes back
        // opaque white. Fills inside the drawing stay opaque either way.
        out.set(`${name}-${colorScheme}.png`, await tab.locator('body > svg').screenshot({ omitBackground: true }));
      }
    }
    return out;
  }, { scale: PNG_SCALE });
}
