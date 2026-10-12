import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  parseFrontmatter,
  checkManifests,
  findReferences,
  checkLinks,
  dependencyReport,
  checkInstalledSet,
  installCommand,
} from '../lib/skills-validation.mjs';

/** Create a temporary skills folder from { 'relative/path.md': 'content' }. */
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'skills-validation-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const skillMd = (name, body = '') => `---\nname: ${name}\ndescription: Does ${name} things.\n---\n\n${body}\n`;

test('parseFrontmatter reads top-level keys and strips quotes', () => {
  const fm = parseFrontmatter('---\nname: "a-skill"\ndescription: Hello: world\nallowed-tools:\n  - Read\n---\nbody');
  assert.equal(fm.name, 'a-skill');
  assert.equal(fm.description, 'Hello: world');
});

test('parseFrontmatter handles CRLF and returns null without front-matter', () => {
  assert.equal(parseFrontmatter('---\r\nname: x\r\ndescription: y\r\n---\r\n').name, 'x');
  assert.equal(parseFrontmatter('# no front-matter'), null);
});

test('checkManifests passes for valid skills', (t) => {
  const dir = fixture({ 'alpha/SKILL.md': skillMd('alpha') });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkManifests(dir), []);
});

test('checkManifests reports missing SKILL.md, name mismatch, and missing description', (t) => {
  const dir = fixture({
    'nomanifest/notes.md': 'x',
    'beta/SKILL.md': skillMd('not-beta'),
    'gamma/SKILL.md': '---\nname: gamma\n---\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkManifests(dir), [
    'beta/SKILL.md: name "not-beta" does not match folder "beta"',
    'gamma/SKILL.md: missing description',
    'nomanifest/: missing SKILL.md',
  ]);
});

test('findReferences returns links and backticked paths, skipping fences, URLs, placeholders, globs, elisions, and extension-less paths', () => {
  const text = [
    'See [a](../dapr-shared/a.md) and [b](./b.md#section) and [web](https://x.io/a.md).',
    'Read `../dapr-shared/c.md`, not `../dapr-shared/prereq-*.md`, `../x/...`, `./observability/`, or `../<Name>/d.md`.',
    '```yaml',
    'see [inside](../fence.md) `../fence.md`',
    '```',
    '[anchor](#top)',
  ].join('\n');
  assert.deepEqual(
    findReferences(text).map((r) => [r.line, r.kind, r.target]),
    [
      [1, 'link', '../dapr-shared/a.md'],
      [1, 'link', './b.md'],
      [2, 'path', '../dapr-shared/c.md'],
    ],
  );
});

test('findReferences handles CRLF line endings, including fences', () => {
  const text = ['A [x](./x.md)', '```', '[y](./y.md)', '```', 'B `../z/z.md`', ''].join('\r\n');
  assert.deepEqual(
    findReferences(text).map((r) => [r.line, r.target]),
    [
      [1, './x.md'],
      [5, '../z/z.md'],
    ],
  );
});

test('checkLinks passes when all references resolve', (t) => {
  const dir = fixture({
    'alpha/SKILL.md': skillMd('alpha', 'Read [x](../dapr-shared/x.md) and `../dapr-shared/y.yaml`.'),
    'dapr-shared/SKILL.md': skillMd('dapr-shared'),
    'dapr-shared/x.md': 'See [y](./y.yaml).',
    'dapr-shared/y.yaml': 'k: v',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkLinks(dir), []);
});

test('checkLinks reports missing targets and markdown links that leave the skills folder', (t) => {
  const dir = fixture({
    'alpha/SKILL.md': skillMd('alpha', 'Read [x](../shared/x.md).\nAnd [out](../../README.md).\nExample `../../../etc/passwd`.'),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkLinks(dir), [
    'alpha/SKILL.md:6 -> ../shared/x.md',
    'alpha/SKILL.md:7 -> ../../README.md (outside skills folder)',
  ]);
});

test('dependencyReport follows references transitively across skill folders', (t) => {
  const dir = fixture({
    'review/SKILL.md': skillMd('review', 'Use [c](../dapr-shared/check.md).'),
    'create/SKILL.md': skillMd('create'),
    'create/REFERENCE.md': 'ref',
    'dapr-shared/SKILL.md': skillMd('dapr-shared'),
    'dapr-shared/check.md': 'Source: [ref](../create/REFERENCE.md).',
    'standalone/SKILL.md': skillMd('standalone'),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const report = dependencyReport(dir);
  assert.deepEqual(report.get('review'), ['create', 'dapr-shared']);
  assert.deepEqual(report.get('dapr-shared'), ['create']);
  assert.deepEqual(report.get('standalone'), []);
});

test('checkInstalledSet passes when the installed folders match the source skills', (t) => {
  const src = fixture({ 'alpha/SKILL.md': skillMd('alpha'), 'dapr-shared/SKILL.md': skillMd('dapr-shared') });
  const installed = fixture({ 'alpha/SKILL.md': skillMd('alpha'), 'dapr-shared/SKILL.md': skillMd('dapr-shared') });
  t.after(() => [src, installed].forEach((d) => rmSync(d, { recursive: true, force: true })));
  assert.deepEqual(checkInstalledSet(src, installed), []);
});

test('checkInstalledSet reports skills the CLI did not install and unexpected extra folders', (t) => {
  const src = fixture({ 'alpha/SKILL.md': skillMd('alpha'), 'dapr-shared/SKILL.md': skillMd('dapr-shared') });
  const installed = fixture({ 'alpha/SKILL.md': skillMd('alpha'), 'renamed/SKILL.md': skillMd('renamed') });
  t.after(() => [src, installed].forEach((d) => rmSync(d, { recursive: true, force: true })));
  assert.deepEqual(checkInstalledSet(src, installed), ['missing: dapr-shared', 'unexpected: renamed']);
});

test('installCommand quotes the repository path for the Windows shell only', () => {
  const win = installCommand('C:\Users\John Doe\repo', ['claude-code', 'codex'], 'win32');
  assert.equal(win.command, 'npx');
  assert.equal(win.shell, true);
  assert.equal(win.args[3], '"C:\Users\John Doe\repo"');
  assert.deepEqual(win.args.slice(4), ['--skill', '*', '-a', 'claude-code', '-a', 'codex', '--copy', '-y']);

  const linux = installCommand('/home/john doe/repo', ['codex'], 'linux');
  assert.equal(linux.shell, false);
  assert.equal(linux.args[3], '/home/john doe/repo');
});
