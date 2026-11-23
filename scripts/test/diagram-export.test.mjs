import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { el, text, C } from '../../skills/create-diagram/engine/engine.mjs';
import { sha256 } from '../../skills/create-diagram/engine/hash.mjs';
import { run, staleWithoutBrowser, readOrigins, renderScene, themed, loadTokens, BODY_STACK, MONO_STACK } from '../../skills/create-diagram/engine/export.mjs';

const scene = (over = {}) => ({
  width: 100,
  height: 50,
  title: 'A title',
  desc: 'A description',
  build: () => [el('rect', { x: 0, y: 0, width: 10, height: 10 }), el('text', { x: 5, y: 5 }, [text('hi')])],
  ...over,
});
// alpha and beta deliberately share title and desc.
const fixtures = () => ({ alpha: scene(), beta: scene() });
const tmp = () => mkdtempSync(join(tmpdir(), 'diagrams-'));
const snapshot = (dir) =>
  existsSync(dir) ? Object.fromEntries(readdirSync(dir).sort().map((f) => [f, readFileSync(join(dir, f), 'utf8')])) : null;
const withDir = (fn) => () => {
  const d = tmp();
  try {
    fn(d);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
};

test('exporting twice produces byte-identical output', () => {
  const a = tmp();
  const b = tmp();
  try {
    run({ scenes: fixtures(), outDir: a });
    run({ scenes: fixtures(), outDir: b });
    run({ scenes: fixtures(), outDir: b });
    const sa = snapshot(a);
    assert.deepEqual(Object.keys(sa), ['alpha.svg', 'beta.svg']);
    assert.deepEqual(snapshot(b), sa);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test(
  'output is LF with one trailing newline, and ids come from the scene name',
  withDir((d) => {
    run({ scenes: fixtures(), outDir: d });
    const raw = readFileSync(join(d, 'alpha.svg'));
    assert.ok(!raw.includes(0x0d), 'no CR bytes');
    const s = raw.toString('utf8');
    assert.ok(s.endsWith('\n') && !s.endsWith('\n\n'));
    assert.match(s, /id="alpha-title"/);
    // same title+desc in another scene must not collide
    assert.match(readFileSync(join(d, 'beta.svg'), 'utf8'), /id="beta-title"/);
  }),
);

test(
  '--check exits 0 when committed files match',
  withDir((d) => {
    run({ scenes: fixtures(), outDir: d });
    const r = run({ scenes: fixtures(), outDir: d, check: true });
    assert.equal(r.ok, true);
    assert.deepEqual(r.problems, []);
  }),
);

test(
  '--check exits 1 and names the file when one differs, is missing or is orphaned',
  withDir((d) => {
    run({ scenes: fixtures(), outDir: d });
    writeFileSync(join(d, 'alpha.svg'), 'tampered\n');
    writeFileSync(join(d, 'gone.svg'), '<svg/>\n');
    const r = run({ scenes: { ...fixtures(), gamma: scene() }, outDir: d, check: true });
    assert.equal(r.ok, false);
    const msg = r.problems.join('\n');
    assert.match(msg, /alpha\.svg: differs/);
    assert.match(msg, /gamma\.svg: missing/);
    assert.match(msg, /gone\.svg: no matching scene/);
    assert.doesNotMatch(msg, /beta\.svg/);
  }),
);

test(
  '--check does not write to disk',
  withDir((d) => {
    run({ scenes: fixtures(), outDir: d });
    writeFileSync(join(d, 'alpha.svg'), 'tampered\n');
    writeFileSync(join(d, 'gone.svg'), '<svg/>\n');
    const before = snapshot(d);
    run({ scenes: { ...fixtures(), gamma: scene() }, outDir: d, check: true });
    assert.deepEqual(snapshot(d), before, 'no file created, changed or deleted');
    // a directory that does not exist must not be created either
    const nowhere = join(d, 'nested', 'out');
    assert.equal(run({ scenes: fixtures(), outDir: nowhere, check: true }).ok, false);
    assert.equal(existsSync(join(d, 'nested')), false);
  }),
);

test(
  'export removes orphaned svgs (and only svgs) so --check can pass',
  withDir((d) => {
    writeFileSync(join(d, 'gone.svg'), '<svg/>\n');
    writeFileSync(join(d, 'keep.txt'), 'x');
    const r = run({ scenes: fixtures(), outDir: d });
    assert.deepEqual(r.removed, ['gone.svg'], 'deletions are reported');
    assert.deepEqual(readdirSync(d).sort(), ['alpha.svg', 'beta.svg', 'keep.txt']);
    assert.equal(run({ scenes: fixtures(), outDir: d, check: true }).ok, true);
  }),
);

test(
  'export refuses to delete committed svgs when the registry is empty',
  withDir((d) => {
    run({ scenes: fixtures(), outDir: d });
    const before = snapshot(d);
    const r = run({ scenes: {}, outDir: d });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /registry is empty but 2 svgs exist/);
    assert.deepEqual(snapshot(d), before);
    // an empty registry over an empty directory is fine
    const e = tmp();
    try {
      assert.equal(run({ scenes: {}, outDir: e }).ok, true);
    } finally {
      rmSync(e, { recursive: true, force: true });
    }
  }),
);

for (const field of ['title', 'desc']) {
  for (const [label, value] of [['absent', undefined], ['empty', ''], ['whitespace-only', ' \t\n'], ['non-string', 42]]) {
    test(
      `a scene with ${label} ${field} fails the export and writes nothing`,
      withDir((d) => {
        const bad = scene({ [field]: value });
        const r = run({ scenes: { ...fixtures(), bad }, outDir: d });
        assert.equal(r.ok, false);
        assert.match(r.problems.join('\n'), new RegExp(`scene "bad": ${field} is required`));
        assert.deepEqual(readdirSync(d), [], 'valid scenes are not written either');
        assert.equal(run({ scenes: { bad }, outDir: d, check: true }).ok, false);
      }),
    );
  }
}

test('other malformed scenes fail with a named reason', () => {
  assert.throws(() => renderScene('x', scene({ width: 0 })), /width must be a positive number/);
  assert.throws(() => renderScene('x', scene({ height: NaN })), /height/);
  assert.throws(() => renderScene('x', scene({ build: undefined })), /build\(\) is required/);
  assert.throws(() => renderScene('x', scene({ build: () => 'nope' })), /must return an array/);
  assert.throws(() => renderScene('Bad Name', scene()), /name must match/);
  assert.throws(() => renderScene('../x', scene()), /name must match/);
  // these slug to the same svg id as 'a-b' / 'a', which would collide
  assert.throws(() => renderScene('a--b', scene()), /name must match/);
  assert.throws(() => renderScene('a-', scene()), /name must match/);
  assert.throws(() => renderScene('-a', scene()), /name must match/);
  assert.doesNotThrow(() => renderScene('a-b', scene()));
});

test('the rendered file holds no CR, so git eol=lf cannot change it', () => {
  // A vendored mark can carry CR inside its path data; .gitattributes pins the
  // generated svgs to eol=lf, so any CR that survived here would be rewritten on
  // commit and --check would fail on every fresh clone.
  const withCr = scene({
    build: () => [el('path', { d: 'M0,0\r\n\tL10,10\rZ' }), el('text', { x: 1, y: 2 }, [text('a\r\nb')])],
  });
  const out = renderScene('cr-test', withCr);
  assert.equal(out.includes('\r'), false);
});

// --------------------------------------------------- review fix pass: ids and errors

test('renderScene fails when two elements in a scene share an id', () => {
  const dup = scene({
    build: () => [el('rect', { id: 'thing' }), el('g', {}, [el('circle', { id: 'thing' })])],
  });
  assert.throws(() => renderScene('alpha', dup), /scene "alpha".*duplicate id.*thing/s);
});

test('renderScene allows a scene whose ids are all distinct', () => {
  const ok = scene({ build: () => [el('rect', { id: 'a' }), el('circle', { id: 'b' })] });
  assert.match(renderScene('alpha', ok), /id="a"/);
});

test('an error thrown inside build() names the scene', () => {
  const boom = scene({
    build: () => {
      throw new Error('no mark named "fluent-nope"');
    },
  });
  // Without the scene name an operator with 24 scenes cannot tell which one failed.
  assert.throws(() => renderScene('hosting-vms', boom), /scene "hosting-vms".*fluent-nope/s);
});

test('run() reports the scene name when build() throws', () => {
  const here = tmp();
  const { ok, problems } = run({
    scenes: {
      beta: scene({
        build: () => {
          throw new Error('kaboom');
        },
      }),
    },
    outDir: here,
  });
  assert.equal(ok, false);
  assert.match(problems.join('\n'), /scene "beta".*kaboom/s);
});

// The stacks hold double quotes, so inside an attribute they are written &quot;.
const q = (stack) => stack.replaceAll('"', '&quot;');
const tokens = loadTokens();
const DOC = (body = '<text>x</text>', fill = 'var(--d-blue)') =>
  `<svg viewBox="0 0 1 1"><title id="t">T</title><desc id="d">D</desc><rect fill="${fill}"/>${body}</svg>`;

test('run() requires outDir', () => {
  assert.throws(() => run({ scenes: fixtures() }), /outDir is required/);
});

test(
  'run() writes one themed svg per scene and nothing else',
  withDir((d) => {
    const r = run({ scenes: { alpha: scene({ build: () => [el('rect', { fill: C.navy })] }) }, outDir: d });
    assert.deepEqual(r.written, ['alpha.svg']);
    assert.deepEqual(readdirSync(d), ['alpha.svg']);
    assert.match(readFileSync(join(d, 'alpha.svg'), 'utf8'), /^<svg class="dapr-diagram-alpha"/);
  }),
);

test('every token used resolves in light and dark', () => {
  const out = themed(DOC('<text fill="var(--d-body)">x</text>'), 'demo', tokens);
  const [light, dark] = out.match(/<style>(.*)<\/style>/)[1].split('@media (prefers-color-scheme: dark)');
  for (const t of ['--d-blue', '--d-body']) {
    assert.ok(light.includes(`${t}:${tokens.light[t]}`), `${t} light`);
    assert.ok(dark.includes(`${t}:${tokens.dark[t]}`), `${t} dark`);
  }
  assert.notEqual(tokens.light['--d-body'], tokens.dark['--d-body']);
  assert.ok(out.indexOf('</desc><style>') > 0, 'style sits right after desc');
});

test('only the tokens the scene uses are included', () => {
  const out = themed(DOC(), 'demo', tokens);
  assert.ok(!out.includes('--d-orange:'));
});

test('a token whose value is another token pulls that token in, in both palettes', () => {
  const t = {
    light: { '--d-link': 'var(--d-blue)', '--d-blue': '#111111' },
    dark: { '--d-link': 'var(--d-blue)', '--d-blue': '#222222' },
  };
  const out = themed(DOC('', 'var(--d-link)'), 'demo', t);
  const [light, dark] = out.match(/<style>(.*)<\/style>/)[1].split('@media');
  assert.match(light, /--d-blue:#111111/);
  assert.match(dark, /--d-blue:#222222/);
  // same with the real tokens: --d-link is var(--d-blue) there
  const real = themed(DOC('', 'var(--d-link)'), 'demo', tokens);
  for (const m of real.matchAll(/var\((--d-[a-z0-9-]+)\)/g)) {
    assert.ok(real.includes(`${m[1]}:`), `${m[1]} is defined`);
  }
  assert.ok(real.includes(`--d-blue:${tokens.dark['--d-blue']}`));
});

test('style is scoped to the diagram class', () => {
  const out = themed(DOC(), 'demo', tokens);
  const css = out.match(/<style>(.*)<\/style>/)[1];
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
  assert.deepEqual(selectors, ['.dapr-diagram-demo', '@media (prefers-color-scheme: dark)', '.dapr-diagram-demo']);
  assert.ok(out.startsWith('<svg class="dapr-diagram-demo" '));
});

test('unknown token throws naming it', () => {
  assert.throws(() => themed(DOC('', 'var(--d-nope)'), 'demo', tokens), /--d-nope/);
  const onlyLight = { light: { '--d-x': '#000' }, dark: {} };
  assert.throws(() => themed(DOC('', 'var(--d-x)'), 'demo', onlyLight), /--d-x \(dark\)/);
});

test('font stacks are set', () => {
  const out = themed('<svg viewBox="0 0 1 1"><desc>D</desc><text font-family="var(--font-mono)">x</text></svg>', 'demo', tokens);
  assert.ok(out.includes(`font-family="${q(BODY_STACK)}"`));
  assert.ok(out.includes(`<text font-family="${q(MONO_STACK)}">`), out);
  assert.equal(out.split('font-family=').length, 3);
});

test('no var(--font- left, in either reference form', () => {
  assert.ok(!themed(DOC('<text font-family="var(--font-mono)">x</text>'), 'demo', tokens).includes('var(--font-'));
  assert.throws(() => themed(DOC('<text font-family="var(--font-head)">x</text>'), 'demo', tokens), /no font for var\(--font-head\)/);
  assert.throws(
    () => themed(DOC('<text font-family="var(--font-head, serif)">x</text>'), 'demo', tokens),
    /no font for var\(--font-head, serif\)/,
  );
});

test('a literal font-family is left alone', () => {
  assert.ok(themed(DOC('<text font-family="Comic Sans">x</text>'), 'demo', tokens).includes('<text font-family="Comic Sans">'));
});

test('themed throws when the document does not start with <svg', () => {
  for (const doc of [
    '\ufeff' + DOC(), // byte-order mark
    '<?xml version="1.0"?>' + DOC(), // xml prolog
    '\n' + DOC(), // leading newline
  ]) {
    assert.throws(() => themed(doc, 'demo', tokens), /does not start with <svg/, doc.slice(0, 20));
  }
});

test('themed rejects a bad name', () => {
  assert.throws(() => themed(DOC(), 'Bad Name', tokens), /name must match/);
});

test('a throwing scene blocks every write and is named', withDir((d) => {
  const out = join(d, 'out');
  const scenes = {
    one: scene(),
    two: scene({ build: () => { throw new Error('boom'); } }),
    three: scene(),
  };
  const r = run({ scenes, outDir: out });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /two/);
  assert.deepEqual(snapshot(out), null);
}));

test('--only renders one scene and removes nothing', withDir((d) => {
  run({ scenes: fixtures(), outDir: d });
  writeFileSync(join(d, 'stale.svg'), 'x');
  const r = run({ scenes: fixtures(), outDir: d, only: 'alpha' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.written, ['alpha.svg']);
  assert.deepEqual(r.removed, []);
  assert.ok(existsSync(join(d, 'stale.svg')));
  assert.ok(existsSync(join(d, 'beta.svg')));
}));

test('--only with an unknown name fails', withDir((d) => {
  const r = run({ scenes: fixtures(), outDir: d, only: 'nope' });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /nope/);
}));

test('missing bbox.json means origin 0 0', withDir((d) => {
  assert.deepEqual(readOrigins(join(d, 'bbox.json')), {});
  const a = join(d, 'a');
  const b = join(d, 'b');
  run({ scenes: fixtures(), outDir: a });
  run({ scenes: fixtures(), outDir: b, origins: { alpha: [0, 0] } });
  assert.deepEqual(snapshot(a), snapshot(b));
}));

test('origins are applied from run()', withDir((d) => {
  const a = join(d, 'a');
  const b = join(d, 'b');
  run({ scenes: { alpha: scene() }, outDir: a });
  run({ scenes: { alpha: scene() }, outDir: b, origins: { alpha: [7, 9] } });
  assert.notDeepEqual(snapshot(a), snapshot(b));
}));

test('check reports missing and stale files', withDir((d) => {
  run({ scenes: fixtures(), outDir: d });
  writeFileSync(join(d, 'alpha.svg'), 'stale');
  rmSync(join(d, 'beta.svg'));
  const r = run({ scenes: fixtures(), outDir: d, check: true });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /alpha\.svg: differs/.test(p)));
  assert.ok(r.problems.some((p) => /beta\.svg: missing/.test(p)));
}));

test('check passes on a CRLF copy of a current svg (Windows core.autocrlf)', withDir((d) => {
  run({ scenes: fixtures(), outDir: d });
  const file = join(d, 'alpha.svg');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
  const r = run({ scenes: fixtures(), outDir: d, check: true });
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
}));

test('check with a throwing scene among good ones names it and writes nothing', withDir((d) => {
  const out = join(d, 'out');
  run({ scenes: fixtures(), outDir: out });
  const before = snapshot(out);
  const scenes = { ...fixtures(), broken: scene({ build: () => { throw new Error('boom'); } }), gamma: scene() };
  const r = run({ scenes, outDir: out, check: true });
  assert.equal(r.ok, false);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /scene "broken": boom/);
  assert.deepEqual(r.written, []);
  assert.deepEqual(r.removed, []);
  assert.deepEqual(snapshot(out), before);
}));

test('staleWithoutBrowser lists changed scenes', () => {
  const manifest = { scenes: { a: sha256('x'), b: sha256('y') } };
  assert.deepEqual(staleWithoutBrowser(new Map([['a', 'x'], ['b', 'z']]), manifest), ['b']);
});

test('staleWithoutBrowser counts a scene the manifest has not seen, and sorts', () => {
  assert.deepEqual(staleWithoutBrowser(new Map([['z', 'x'], ['a', 'x']]), { scenes: {} }), ['a', 'z']);
});

test('staleWithoutBrowser with no manifest', () => {
  assert.deepEqual(staleWithoutBrowser(new Map([['a', 'x']]), null), []);
});
