import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireChromium } from './helpers/chromium.mjs';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'create-diagram');
const NAME = 'checkout-components';
// Where the skill installs Playwright is <diagramsDir>/node_modules; link this repo's.
const NODE_MODULES = join(SKILL, '..', '..', 'node_modules');

function project() {
  const tmp = mkdtempSync(join(tmpdir(), 'diagram-measure-'));
  const dir = join(tmp, 'my diagrams', 'diagrams');
  const setup = spawnSync(process.execPath, [join(SKILL, 'scripts', 'setup.mjs'), dir], { encoding: 'utf8' });
  assert.equal(setup.status, 0, setup.stderr);
  if (existsSync(NODE_MODULES)) symlinkSync(NODE_MODULES, join(dir, 'node_modules'), 'junction');
  copyFileSync(join(SKILL, 'examples', `${NAME}.mjs`), join(dir, 'scenes', `${NAME}.mjs`));
  writeFileSync(
    join(dir, 'scenes', 'index.mjs'),
    `import scene from './${NAME}.mjs';\nexport const scenes = { '${NAME}': scene };\n`,
  );
  return { tmp, dir };
}
const measure = (dir, cwd, name) =>
  spawnSync(process.execPath, [join(dir, '_engine', 'measure-labels.mjs'), name], { cwd, encoding: 'utf8' });

test('the script ships in the engine folder', () => {
  assert.ok(existsSync(join(SKILL, 'engine', 'measure-labels.mjs')));
});

test('prints label boxes', async (t) => {
  if (!(await requireChromium(t))) return;
  const { tmp, dir } = project();
  try {
    const run = measure(dir, tmp, NAME);
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stdout, /Redis state store/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('unknown scene', () => {
  const { tmp, dir } = project();
  try {
    const run = measure(dir, tmp, 'nope');
    assert.equal(run.status, 1, `${run.stdout}\n${run.stderr}`);
    assert.match(run.stderr, /no scene named "nope"/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
