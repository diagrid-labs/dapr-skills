// The worked example in skills/create-diagram/REFERENCE.md is a real scene: it
// is set up, registered and exported exactly as the reference tells an agent
// to, and the export must succeed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'create-diagram');
const NAME = 'checkout-components';

// The first fenced js block after the `## Worked example` heading.
export function workedExample(markdown) {
  const at = markdown.search(/^## Worked example$/m);
  if (at < 0) throw new Error('REFERENCE.md has no "## Worked example" heading');
  const block = /^```js\n([\s\S]*?)^```$/m.exec(markdown.slice(at));
  if (!block) throw new Error('no fenced js block under "## Worked example"');
  return block[1];
}

test('reference example exports', () => {
  const scene = workedExample(readFileSync(join(SKILL, 'REFERENCE.md'), 'utf8'));
  const tmp = mkdtempSync(join(tmpdir(), 'diagram-reference-'));
  const dir = join(tmp, 'diagrams');
  try {
    const setup = spawnSync(process.execPath, [join(SKILL, 'scripts', 'setup.mjs'), dir], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr);
    writeFileSync(join(dir, 'scenes', `${NAME}.mjs`), scene);
    writeFileSync(
      join(dir, 'scenes', 'index.mjs'),
      `import scene from './${NAME}.mjs';\nexport const scenes = { '${NAME}': scene };\n`,
    );
    const exp = (...args) =>
      spawnSync(process.execPath, [join(dir, '_engine', 'export.mjs'), ...args], { cwd: tmp, encoding: 'utf8' });
    const run = exp();
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.ok(existsSync(join(dir, 'out', `${NAME}.svg`)));
    const check = exp('--check');
    assert.equal(check.status, 0, `${check.stdout}\n${check.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
