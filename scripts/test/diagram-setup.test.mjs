import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserInstallCommands, PLAYWRIGHT, setup } from '../../skills/create-diagram/scripts/setup.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SETUP = join(HERE, '..', '..', 'skills', 'create-diagram', 'scripts', 'setup.mjs');
const ENGINE = join(HERE, '..', '..', 'skills', 'create-diagram', 'engine');
const run = (...args) => spawnSync(process.execPath, [SETUP, ...args], { encoding: 'utf8' });
const tmpRoot = () => mkdtempSync(join(tmpdir(), 'diagram-setup-'));
const read = (p) => readFileSync(p, 'utf8');
const setVersion = (dir, v) => writeFileSync(join(dir, '_engine', 'VERSION'), JSON.stringify(v));

test('creates the layout in an empty dir', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'diagrams');
    mkdirSync(dir);
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(join(dir, '_engine', 'VERSION')), read(join(ENGINE, 'VERSION')));
    assert.ok(existsSync(join(dir, '_engine', 'export.mjs')));
    assert.equal(read(join(dir, 'scenes', 'index.mjs')).trim(), 'export const scenes = {};');
    assert.ok(existsSync(join(dir, 'out')));
    assert.deepEqual(JSON.parse(read(join(dir, 'package.json'))), { private: true, type: 'module' });
    assert.match(r.stdout, /export\.mjs/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('create keeps an existing package.json, scenes index and out', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    mkdirSync(join(dir, 'scenes'), { recursive: true });
    // no _engine/VERSION but non-empty => foreign, so seed via a first setup instead
    assert.equal(run(join(tmp, 'x')).status, 0);
    writeFileSync(join(tmp, 'x', 'package.json'), '{"mine":true}');
    writeFileSync(join(tmp, 'x', 'scenes', 'index.mjs'), 'export const scenes = {a:1};');
    rmSync(join(tmp, 'x', '_engine'), { recursive: true });
    mkdirSync(join(tmp, 'x', '_engine'));
    writeFileSync(join(tmp, 'x', '_engine', 'VERSION'), '{"skill":"0.0.1","source":"s"}');
    run(join(tmp, 'x'), '--refresh');
    assert.equal(read(join(tmp, 'x', 'package.json')), '{"mine":true}');
    assert.equal(read(join(tmp, 'x', 'scenes', 'index.mjs')), 'export const scenes = {a:1};');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('refuses a foreign diagrams folder', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'other');
    mkdirSync(dir);
    writeFileSync(join(dir, 'notes.txt'), 'x');
    const r = run(dir);
    assert.equal(r.status, 3);
    assert.match(r.stderr + r.stdout, /not a create-diagram folder; choose another name/);
    assert.ok(!existsSync(join(dir, '_engine')));
    assert.ok(!existsSync(join(dir, 'package.json')));
    const file = join(tmp, 'afile');
    writeFileSync(file, 'x');
    assert.equal(run(file).status, 3);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('same version is a no-op', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    assert.equal(run(dir).status, 0);
    const r = run(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /up to date/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('older version exits 2 without --refresh and names both versions', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    run(dir);
    setVersion(dir, { skill: '0.9.0', source: 'old' });
    const r = run(dir);
    assert.equal(r.status, 2);
    assert.match(r.stdout + r.stderr, /0\.9\.0/);
    assert.match(r.stdout + r.stderr, /1\.31\.0/);
    assert.equal(JSON.parse(read(join(dir, '_engine', 'VERSION'))).skill, '0.9.0');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a different source alone offers a refresh', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    run(dir);
    const v = JSON.parse(read(join(ENGINE, 'VERSION')));
    setVersion(dir, { skill: v.skill, source: 'elsewhere' });
    assert.equal(run(dir).status, 2);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a newer project engine is never downgraded', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    run(dir);
    setVersion(dir, { skill: '99.0.0', source: 'future' });
    for (const args of [[], ['--refresh']]) {
      const r = run(dir, ...args);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(JSON.parse(read(join(dir, '_engine', 'VERSION'))).skill, '99.0.0');
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('refresh replaces _engine only', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    run(dir);
    setVersion(dir, { skill: '0.9.0', source: 'old' });
    writeFileSync(join(dir, '_engine', 'stale.mjs'), 'x');
    mkdirSync(join(dir, '_engine.new'));
    writeFileSync(join(dir, 'scenes', 'a.mjs'), 'scene a');
    writeFileSync(join(dir, 'bbox.json'), '{"a":1}');
    writeFileSync(join(dir, 'out', 'a.svg'), '<svg/>');
    const r = run(dir, '--refresh');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(join(dir, 'scenes', 'a.mjs')), 'scene a');
    assert.equal(read(join(dir, 'bbox.json')), '{"a":1}');
    assert.equal(read(join(dir, 'out', 'a.svg')), '<svg/>');
    assert.equal(read(join(dir, '_engine', 'VERSION')), read(join(ENGINE, 'VERSION')));
    assert.ok(!existsSync(join(dir, '_engine', 'stale.mjs')));
    assert.ok(!existsSync(join(dir, '_engine.new')));
    assert.ok(!existsSync(join(dir, '_engine.old')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('end to end: setup, one scene, export svg', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'diagrams');
    assert.equal(run(dir).status, 0);
    writeFileSync(join(dir, 'scenes', 'index.mjs'), `import { el } from '../_engine/engine.mjs';
import * as shapes from '../_engine/shapes.mjs';
void shapes;
export const scenes = { demo: { width: 100, height: 50, title: 't', desc: 'd', build: () => [el('rect', { x: 0, y: 0, width: 10, height: 10 })] } };
`);
    const r = spawnSync(process.execPath, [join(dir, '_engine', 'export.mjs'), '--no-browser'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(dir, 'out', 'demo.svg')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('re-running restores a missing scaffold and keeps existing scenes', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    run(dir);
    rmSync(join(dir, 'scenes', 'index.mjs'));
    rmSync(join(dir, 'package.json'));
    rmSync(join(dir, 'out'), { recursive: true });
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(join(dir, 'scenes', 'index.mjs')).trim(), 'export const scenes = {};');
    assert.deepEqual(JSON.parse(read(join(dir, 'package.json'))), { private: true, type: 'module' });
    assert.ok(existsSync(join(dir, 'out')));
    writeFileSync(join(dir, 'scenes', 'index.mjs'), 'export const scenes = {z:1};');
    assert.equal(run(dir).status, 0);
    assert.equal(read(join(dir, 'scenes', 'index.mjs')), 'export const scenes = {z:1};');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('recovers from an interrupted refresh', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    run(dir);
    setVersion(dir, { skill: '0.9.0', source: 'old' });
    renameSync(join(dir, '_engine'), join(dir, '_engine.old'));
    mkdirSync(join(dir, '_engine.new'));
    let r = run(dir);
    assert.equal(r.status, 2, r.stderr);
    assert.equal(JSON.parse(read(join(dir, '_engine', 'VERSION'))).skill, '0.9.0');
    assert.ok(!existsSync(join(dir, '_engine.old')));
    assert.ok(!existsSync(join(dir, '_engine.new')));
    rmSync(join(dir, '_engine'), { recursive: true });
    mkdirSync(join(dir, '_engine.old'));
    writeFileSync(join(dir, '_engine.old', 'VERSION'), read(join(ENGINE, 'VERSION')));
    r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(dir, '_engine', 'VERSION')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a foreign folder with bare _engine.old/_engine.new is refused untouched', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'f');
    mkdirSync(join(dir, '_engine.old'), { recursive: true });
    mkdirSync(join(dir, '_engine.new'));
    writeFileSync(join(dir, 'mine.txt'), 'keep');
    const r = run(dir);
    assert.equal(r.status, 3);
    assert.equal(read(join(dir, 'mine.txt')), 'keep');
    assert.ok(existsSync(join(dir, '_engine.old')));
    assert.ok(existsSync(join(dir, '_engine.new')));
    assert.ok(!existsSync(join(dir, '_engine')));
    assert.deepEqual(readdirSync(dir).sort(), ['_engine.new', '_engine.old', 'mine.txt']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('the engine copy carries NOTICE and the Apache licence', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'diagrams');
    assert.equal(run(dir).status, 0);
    assert.ok(existsSync(join(dir, '_engine', 'NOTICE')));
    assert.ok(existsSync(join(dir, '_engine', 'LICENSE-APACHE-2.0')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('setup writes .gitattributes and .gitignore and never overwrites them', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    assert.equal(run(dir).status, 0);
    assert.equal(read(join(dir, '.gitattributes')), 'out/*.svg text eol=lf\nout/*.png binary\n');
    assert.equal(read(join(dir, '.gitignore')), 'node_modules/\n');
    writeFileSync(join(dir, '.gitattributes'), 'mine\n');
    writeFileSync(join(dir, '.gitignore'), 'mine too\n');
    assert.equal(run(dir).status, 0);
    assert.equal(read(join(dir, '.gitattributes')), 'mine\n');
    assert.equal(read(join(dir, '.gitignore')), 'mine too\n');
    rmSync(join(dir, '.gitignore'));
    const r = run(dir);
    assert.match(r.stdout, /Restored missing scaffold: .*\.gitignore/);
    assert.equal(read(join(dir, '.gitignore')), 'node_modules/\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a folder holding only dotfiles counts as empty and keeps them', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'diagrams');
    mkdirSync(dir);
    writeFileSync(join(dir, '.gitkeep'), '');
    writeFileSync(join(dir, '.DS_Store'), 'x');
    writeFileSync(join(dir, '.gitattributes'), 'keep me\n');
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(dir, '_engine', 'VERSION')));
    assert.ok(existsSync(join(dir, '.gitkeep')));
    assert.equal(read(join(dir, '.DS_Store')), 'x');
    assert.equal(read(join(dir, '.gitattributes')), 'keep me\n');
    // A dot-folder is not a dotfile: that is still someone else's folder.
    const other = join(tmp, 'other');
    mkdirSync(join(other, '.git'), { recursive: true });
    assert.equal(run(other).status, 3);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('browserInstallCommands runs in the folder with no path argument and pins exactly', () => {
  const dir = join(tmpdir(), 'a folder with spaces', 'diagrams');
  assert.equal(PLAYWRIGHT, '@playwright/test@1.56.1');
  for (const [platform, npm, npx, shell] of [['win32', 'npm.cmd', 'npx.cmd', true], ['darwin', 'npm', 'npx', false], ['linux', 'npm', 'npx', false]]) {
    const steps = browserInstallCommands(dir, platform);
    assert.deepEqual(steps.map((s) => s.cmd), [npm, npx], platform);
    assert.deepEqual(steps[0].args, ['install', '--save-exact', '@playwright/test@1.56.1'], platform);
    assert.deepEqual(steps[1].args, ['playwright', 'install', 'chromium'], platform);
    for (const s of steps) {
      assert.equal(s.options.cwd, dir, platform);
      assert.equal(s.options.shell, shell, platform);
      assert.equal(s.options.stdio, 'inherit', platform);
      assert.ok(!s.args.some((a) => a.includes(dir) || a === '--prefix'), platform);
    }
  }
});

test('a successful browser install says what the next export will do', () => {
  const tmp = tmpRoot();
  try {
    const dir = join(tmp, 'd');
    const out = [];
    const err = [];
    let installedIn;
    const code = setup(dir, { withBrowser: true, install: (d) => { installedIn = d; return true; } }, (m) => out.push(m), (m) => err.push(m));
    assert.equal(code, 0, err.join('\n'));
    assert.equal(installedIn, dir);
    assert.equal(out.at(-1), 'Chromium ready: PNGs, centring and the fallback-font check will run on the next export.');
    const failed = [];
    assert.equal(setup(dir, { withBrowser: true, install: () => false }, (m) => failed.push(m), () => {}), 1);
    assert.ok(!failed.some((m) => m.startsWith('Chromium ready')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
