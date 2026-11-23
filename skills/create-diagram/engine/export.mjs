// Renders every registered scene to <outDir>/<name>.svg, one themed file each.
import { existsSync, realpathSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { svg } from './engine.mjs';
import { projectPaths } from './paths.mjs';
import { setIconScope } from './icons.mjs';
import { setCanvasWidth } from './shapes.mjs';

// Measured centring origins, keyed by scene name. Missing file means none measured yet.
export function readOrigins(bboxPath) {
  if (!existsSync(bboxPath)) return {};
  return JSON.parse(readFileSync(bboxPath, 'utf8'));
}
// The colour tokens, light and dark, generated from dapr/docs' _tokens.scss by
// scripts/diagram-tokens.mjs. Read from tokens.json so a token renamed there
// fails loudly below rather than leaving a var() in the file.
export function loadTokens() {
  return JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
}

// The faces the exported file declares. Scenes set no font-family on body
// text so the inlined copy inherits the page's face, and code labels point at
// var(--font-mono), which only exists on a Dapr page. Outside it both fall back
// to the browser's serif, so the file names them outright.
export const BODY_STACK = 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const MONO_STACK = '"Geist Mono", ui-monospace, "Cascadia Mono", Consolas, monospace';
// Both stacks sit inside a double-quoted attribute, so their quotes are escaped.
const attr = (stack) => stack.replaceAll('"', '&quot;');

// Turn a rendered scene into ONE file that carries both palettes. The scene
// paints in var(--d-*); this adds a <style> that defines every token it uses
// on .dapr-diagram-<name>, light first, then the dark values inside
// prefers-color-scheme, so the file follows the viewer wherever it is opened
// and, inlined into HTML, stays scoped to its own class. A token value can
// itself be a var(--d-*) (--d-link is var(--d-blue)), so the tokens a used
// token points at are included too, or that var() would not resolve.
// Throws on a token with no light or dark value, a font the file cannot name,
// or a document that does not start with <svg.
export function themed(svgText, name, tokens = loadTokens()) {
  if (!NAME.test(name)) throw new Error(`themed svg: name must match ${NAME}`);
  const used = new Set();
  const missing = [];
  const visit = (token) => {
    if (used.has(token)) return;
    used.add(token);
    for (const mode of ['light', 'dark']) {
      const value = Object.hasOwn(tokens[mode] ?? {}, token) ? tokens[mode][token] : undefined;
      if (value === undefined) {
        missing.push(`${token} (${mode})`);
        continue;
      }
      for (const m of value.matchAll(/var\((--d-[a-z0-9-]+)\)/g)) visit(m[1]);
    }
  };
  for (const m of svgText.matchAll(/var\((--d-[a-z0-9-]+)\)/g)) visit(m[1]);
  if (missing.length) throw new Error(`themed svg: no value for ${[...new Set(missing)].join(', ')}`);

  // Mono text sets its own font-family, which wins over the root attribute
  // below, so the root only has to cover the body text that sets none.
  const fonted = svgText.replaceAll('var(--font-mono)', attr(MONO_STACK));
  // Both shapes a token reference can take: the bare var(--font-x) a scene
  // writes, and the fallback form var(--font-x, y).
  const fonts = new Set(fonted.match(/var\(--font-[^")]*\)?/g));
  if (fonts.size) throw new Error(`themed svg: no font for ${[...fonts].join(', ')}`);

  const cls = `dapr-diagram-${name}`;
  // Sorted so the output does not depend on the order a scene happens to draw in.
  const decls = (mode) => [...used].sort().map((t) => `${t}:${tokens[mode][t]}`).join(';');
  const style =
    `<style>.${cls}{${decls('light')}}` +
    `@media (prefers-color-scheme: dark){.${cls}{${decls('dark')}}}</style>`;

  // The class and body font are attributes on the ROOT, so they only land if
  // the document really starts with `<svg`. A BOM, an XML prolog or a leading
  // newline would make this replace a silent no-op.
  const rooted = fonted.replace(/^<svg(?=[ >])/, `<svg class="${cls}" font-family="${attr(BODY_STACK)}"`);
  if (rooted === fonted) throw new Error('themed svg: document does not start with <svg');
  const at = rooted.indexOf('</desc>');
  if (at < 0) throw new Error('themed svg: no <desc> to put the style after');
  const end = at + '</desc>'.length;
  return rooted.slice(0, end) + style + rooted.slice(end);
}

// No doubled or trailing hyphens: those slug to the same svg id as their tidy twin.
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const blank = (v) => typeof v !== 'string' || !v.trim();

// The first id drawn twice anywhere in a scene, or null. Ids reach the page
// verbatim once the shortcode inlines the svg, so a collision here is invalid
// HTML on a real docs page - and it is not otherwise detectable, because every
// guard upstream of this one looks at a single mark rather than a whole scene.
function duplicateIds(nodes) {
  const seen = new Set();
  const visit = (n) => {
    if (!n || typeof n !== 'object' || n.text !== undefined) return null;
    const id = n.attrs && n.attrs.id;
    if (id !== undefined) {
      if (seen.has(id)) return id;
      seen.add(id);
    }
    for (const c of n.children ?? []) {
      const hit = visit(c);
      if (hit) return hit;
    }
    return null;
  };
  for (const n of nodes) {
    const hit = visit(n);
    if (hit) return hit;
  }
  return null;
}

// Render one scene to the exact file content (LF, trailing newline).
// The scene name is passed as svg()'s id so accessible-name ids are unique
// by construction and stable under title edits.
export function renderScene(name, scene, origin = [0, 0]) {
  const fail = (m) => {
    throw new Error(`scene "${name}": ${m}`);
  };
  if (!NAME.test(name)) fail(`name must match ${NAME}`);
  if (!scene || typeof scene !== 'object') fail('scene must be an object');
  if (blank(scene.title)) fail('title is required (non-empty string)');
  if (blank(scene.desc)) fail('desc is required (non-empty string)');
  for (const k of ['width', 'height']) {
    if (!Number.isFinite(scene[k]) || scene[k] <= 0) fail(`${k} must be a positive number`);
  }
  if (typeof scene.build !== 'function') fail('build() is required');
  // Scope icon ids to this scene for the duration of the build, so two diagrams
  // on one page cannot emit the same ids, and so no scene has to remember to.
  let children;
  setIconScope(name);
  // Arrows, buses and dashed borders take their weight from the canvas, so
  // one rendered thickness holds across diagrams of different widths.
  setCanvasWidth(scene.width);
  try {
    children = scene.build();
  } catch (e) {
    // A bare "no mark named ..." tells an operator with 24 scenes nothing about
    // which one failed, and build() is where most failures happen.
    fail(e && e.message ? e.message : String(e));
  } finally {
    setIconScope('');
    setCanvasWidth(null);
  }
  if (!Array.isArray(children)) fail('build() must return an array of nodes');
  const dup = duplicateIds(children);
  if (dup) fail(`duplicate id "${dup}" - two elements cannot share one id once the svg is inlined into a page`);
  const out = svg({
    width: scene.width,
    height: scene.height,
    title: scene.title,
    desc: scene.desc,
    id: name,
    children,
    origin,
  });
  // Some vendored marks carry CR inside their path data (java.svg has CR CR LF),
  // and .gitattributes pins these files to eol=lf, so git rewrites those bytes on
  // commit and a fresh clone would never match a fresh render. Normalise here
  // instead. CR, LF and tab are all just whitespace wherever they appear in these
  // documents, so no renderer sees a difference.
  const lf = out.replace(/\r\n?/g, '\n');
  return lf.endsWith('\n') ? lf : `${lf}\n`;
}

// Returns { ok, problems[], written[], removed[] } (removed = orphans deleted).
// Renders everything before touching disk, so a bad scene leaves outDir untouched.
export function run({ scenes, outDir, origins = {}, only, check = false } = {}) {
  if (!outDir) throw new Error('run(): outDir is required');
  const problems = [];
  const rendered = new Map();
  if (only !== undefined && !Object.hasOwn(scenes, only)) {
    problems.push(`no scene named "${only}" (known: ${Object.keys(scenes).join(', ') || 'none'})`);
    return { ok: false, problems, written: [], removed: [] };
  }
  try {
    const tokens = loadTokens();
    for (const [name, scene] of Object.entries(scenes)) {
      if (only !== undefined && name !== only) continue;
      try {
        rendered.set(name, themed(renderScene(name, scene, origins[name] ?? [0, 0]), name, tokens));
      } catch (e) {
        problems.push(e.message);
      }
    }
  } catch (e) {
    problems.push(e.message);
  }
  if (problems.length) return { ok: false, problems, written: [], removed: [] };

  const existing = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith('.svg')) : [];
  const orphans = only !== undefined ? [] : existing.filter((f) => !rendered.has(f.slice(0, -4)));

  if (check) {
    const fix = '(re-run the export)';
    for (const [name, content] of rendered) {
      const file = join(outDir, `${name}.svg`);
      if (!existsSync(file)) problems.push(`${name}.svg: missing ${fix}`);
      else if (readFileSync(file, 'utf8') !== content) problems.push(`${name}.svg: differs from a fresh render ${fix}`);
    }
    for (const f of orphans) problems.push(`${f}: no matching scene ${fix}`);
    return { ok: problems.length === 0, problems, written: [], removed: [] };
  }

  // An emptied registry (typo, bad merge) must not silently wipe every committed diagram.
  if (rendered.size === 0 && orphans.length) {
    problems.push(`registry is empty but ${orphans.length} svgs exist in ${outDir}; refusing to delete them`);
    return { ok: false, problems, written: [], removed: [] };
  }

  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [name, content] of rendered) {
    writeFileSync(join(outDir, `${name}.svg`), Buffer.from(content, 'utf8'));
    written.push(`${name}.svg`);
  }
  for (const f of orphans) unlinkSync(join(outDir, f));
  return { ok: true, problems: [], written, removed: orphans };
}

const USAGE = 'Usage: node _engine/export.mjs [--check] [--only <name>] [--no-browser]';

async function main(argv) {
  let check = false;
  let only;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') check = true;
    else if (a === '--no-browser') { /* browser features arrive with the PNG step */ }
    else if (a === '--only') {
      only = argv[++i];
      if (!only || only.startsWith('--')) {
        console.error(`--only needs a scene name\n${USAGE}`);
        return 2;
      }
    } else {
      console.error(`Unknown argument: ${a}\n${USAGE}`);
      return 2;
    }
  }
  const paths = projectPaths();
  if (!existsSync(paths.scenes)) {
    console.error(`Scenes file not found: ${paths.scenes}\nCreate it with: export const scenes = { '<name>': scene }`);
    return 1;
  }
  const mod = await import(pathToFileURL(paths.scenes).href);
  if (!mod.scenes || typeof mod.scenes !== 'object') {
    console.error(`${paths.scenes} must export "scenes" (an object of name -> scene)`);
    return 1;
  }
  const { scenes } = mod;
  if (only !== undefined && !Object.hasOwn(scenes, only)) {
    console.error(`No scene named "${only}" (known: ${Object.keys(scenes).join(', ') || 'none'})`);
    return 2;
  }
  const { ok, problems, written, removed } = run({ scenes, outDir: paths.out, origins: readOrigins(paths.bbox), only, check });
  if (!ok) {
    console.error(check ? 'Diagram check failed:' : 'Diagram export failed:');
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  for (const f of removed) console.log(`Removed orphan: ${f}`);
  console.log(check ? `Diagrams up to date (${Object.keys(scenes).length}).` : `Exported ${written.length} diagram(s) to ${paths.out}`);
  return 0;
}

// realpath on both sides: a symlinked project folder (macOS /var -> /private/var) must still count as the entry point.
const isEntry = () => {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (isEntry()) {
  process.exitCode = await main(process.argv.slice(2));
}
