// The files the create-diagram skill ships are checked as shipped: every
// example is a real scene that is set up, registered and exported exactly as
// the reference tells an agent to, and the reference stays small and linked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, copyFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requireChromium } from './helpers/chromium.mjs';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'create-diagram');
const EXAMPLES = join(SKILL, 'examples');
// Where the skill installs Playwright is <diagramsDir>/node_modules; link this repo's.
const NODE_MODULES = join(SKILL, '..', '..', 'node_modules');
const exampleFiles = existsSync(EXAMPLES) ? readdirSync(EXAMPLES).filter((f) => f.endsWith('.mjs')) : [];

test('there is at least one example', () => {
  assert.ok(exampleFiles.includes('checkout-components.mjs'), 'examples/checkout-components.mjs is missing');
});

for (const file of exampleFiles) {
  test(`example ${file} exports`, () => {
    const name = basename(file, '.mjs');
    const tmp = mkdtempSync(join(tmpdir(), 'diagram-reference-'));
    // A space in the folder name: the example must work from a path like "My Drive/diagrams".
    const dir = join(tmp, 'diagram ref', 'diagrams');
    try {
      const setup = spawnSync(process.execPath, [join(SKILL, 'scripts', 'setup.mjs'), dir], { encoding: 'utf8' });
      assert.equal(setup.status, 0, setup.stderr);
      copyFileSync(join(EXAMPLES, file), join(dir, 'scenes', file));
      writeFileSync(
        join(dir, 'scenes', 'index.mjs'),
        `import scene from './${name}.mjs';\nexport const scenes = { '${name}': scene };\n`,
      );
      const exp = (...args) =>
        spawnSync(process.execPath, [join(dir, '_engine', 'export.mjs'), ...args], { cwd: tmp, encoding: 'utf8' });
      const run = exp();
      assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
      assert.ok(existsSync(join(dir, 'out', `${name}.svg`)));
      const check = exp('--check');
      assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}

// The top-level shapes the balance check counts: apps, sidecars, stores,
// pipes and brokers. These are the classes the engine's own builders put on
// each shape's group (hexagon(), the sidecar mark, cylinder(), pipe(),
// broker()), so the check needs nothing from the scene and labels never count.
const SHAPES = '.d-hex, .d-mark-hex, .d-cylinder, .d-pipe, .d-broker';

// Every quarter of the drawing, split around the centre of its measured box,
// must hold part of a shape. Returns the quarters that hold none.
async function emptyQuarters(file) {
  const name = basename(file, '.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'diagram-balance-'));
  const dir = join(tmp, 'diagram ref', 'diagrams');
  try {
    const setup = spawnSync(process.execPath, [join(SKILL, 'scripts', 'setup.mjs'), dir], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr);
    if (existsSync(NODE_MODULES)) symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'junction');
    copyFileSync(join(EXAMPLES, file), join(dir, 'scenes', file));
    const url = (p) => pathToFileURL(join(dir, p)).href;
    const { default: scene } = await import(url(`scenes/${file}`));
    const { renderScene } = await import(url('_engine/export.mjs'));
    const { withHarness } = await import(url('_engine/browser.mjs'));
    const body = `<div class="fig" style="width:900px">${renderScene(name, scene)}</div>`;
    return await withHarness((tab) => tab.evaluate((selector) => {
      const svg = document.querySelector('svg');
      // The same measure measure-bbox.mjs centres by.
      const all = svg.getBBox();
      const cx = all.x + all.width / 2;
      const cy = all.y + all.height / 2;
      const boxes = [...svg.querySelectorAll(selector)].map((g) => g.getBBox());
      const quarters = {
        'top-left': [all.x, all.y, cx, cy],
        'top-right': [cx, all.y, all.x + all.width, cy],
        'bottom-left': [all.x, cy, cx, all.y + all.height],
        'bottom-right': [cx, cy, all.x + all.width, all.y + all.height],
      };
      const hits = ([x1, y1, x2, y2]) => boxes.some((b) =>
        b.x < x2 && b.x + b.width > x1 && b.y < y2 && b.y + b.height > y1);
      return Object.keys(quarters).filter((q) => !hits(quarters[q]));
    }, SHAPES), { body });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('orders-payments is balanced', async (t) => {
  if (!(await requireChromium(t))) return;
  const empty = await emptyQuarters('orders-payments.mjs');
  assert.deepEqual(empty, [], `no shape in the ${empty.join(', ')} quarter(s): rebalance the scene`);
});

test('REFERENCE core stays small', () => {
  const lines = readFileSync(join(SKILL, 'REFERENCE.md'), 'utf8').split('\n').length;
  assert.ok(lines <= 700, `REFERENCE.md has ${lines} lines (limit 700): move a topic into topics/`);
});

test('every split file is linked from SKILL.md', () => {
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const topics = join(SKILL, 'topics');
  const files = existsSync(topics) ? readdirSync(topics).filter((f) => f.endsWith('.md')) : [];
  assert.ok(files.length >= 5, `expected at least 5 topic files, found ${files.length}`);
  for (const needle of ['API.md', 'examples/', ...files]) {
    assert.ok(skill.includes(needle), `SKILL.md does not mention ${needle}`);
  }
});

// GitHub's heading anchors: lowercase, backticks and punctuation dropped
// (hyphens and spaces kept), spaces become hyphens.
const slugify = (h) => h.trim().toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
const headingSlugs = (file) => {
  const slugs = new Set();
  const seen = new Map();
  let fence = false;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const base = slugify(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slugs.add(n ? `${base}-${n}` : base);
  }
  return slugs;
};
// Returns the anchors that point at a heading that does not exist.
const brokenAnchors = (files) => {
  const broken = [];
  for (const file of files) {
    let fence = false;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (fence) return;
      for (const m of line.matchAll(/\]\(([^)\s]*)#([^)\s]+)\)/g)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue;
        const target = m[1] ? join(dirname(file), m[1]) : file;
        if (!existsSync(target)) continue;
        if (!headingSlugs(target).has(m[2])) broken.push(`${basename(file)}:${i + 1} -> ${m[1]}#${m[2]}`);
      }
    });
  }
  return broken;
};
const linkSources = () => {
  const topics = join(SKILL, 'topics');
  return [
    join(SKILL, 'SKILL.md'), join(SKILL, 'REFERENCE.md'), join(SKILL, 'API.md'),
    ...readdirSync(topics).filter((f) => f.endsWith('.md')).map((f) => join(topics, f)),
  ];
};

test('every #anchor link points at a real heading', () => {
  assert.deepEqual(brokenAnchors(linkSources()), []);
});

test('the anchor check goes red on a broken anchor', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'diagram-anchor-'));
  try {
    writeFileSync(join(tmp, 'a.md'), '# Top\n\n## The `thing` (1)\n\nsee [x](#the-thing-1) and [y](#nope)\n');
    assert.deepEqual(brokenAnchors([join(tmp, 'a.md')]), ['a.md:5 -> #nope']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
