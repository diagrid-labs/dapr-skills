// The files the create-diagram skill ships are checked as shipped: every
// example is a real scene that is set up, registered and exported exactly as
// the reference tells an agent to, and the reference stays small and linked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'create-diagram');
const EXAMPLES = join(SKILL, 'examples');
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
