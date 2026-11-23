import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'create-diagram', 'engine');
const SCENES = `import { el } from '../_engine/engine.mjs';
export const scenes = { demo: { width: 100, height: 50, title: 't', desc: 'd', build: () => [el('rect', { x: 0, y: 0, width: 10, height: 10 })] } };
`;
const layout = () => {
  const tmp = mkdtempSync(join(tmpdir(), 'diagram-cli-'));
  cpSync(ENGINE, join(tmp, 'diagrams', '_engine'), { recursive: true });
  mkdirSync(join(tmp, 'diagrams', 'scenes'), { recursive: true });
  writeFileSync(join(tmp, 'diagrams', 'scenes', 'index.mjs'), SCENES);
  return tmp;
};
const cli = (tmp, cwd, ...args) =>
  spawnSync(process.execPath, [join(tmp, 'diagrams', '_engine', 'export.mjs'), ...args], { cwd, encoding: 'utf8' });

test('cli runs from a copied layout', () => {
  const tmp = layout();
  try {
    for (const cwd of [tmp, join(tmp, 'diagrams')]) {
      rmSync(join(tmp, 'diagrams', 'out'), { recursive: true, force: true });
      const r = cli(tmp, cwd, '--no-browser');
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /Exported 1 diagram\(s\) to /);
      assert.ok(existsSync(join(tmp, 'diagrams', 'out', 'demo.svg')));
    }
    const c = cli(tmp, tmp, '--check');
    assert.equal(c.status, 0, c.stderr);
    assert.match(c.stdout, /Diagrams up to date \(1\)/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cli rejects unknown flags, bad --only, missing scenes', () => {
  const tmp = layout();
  try {
    assert.equal(cli(tmp, tmp, '--bogus').status, 2);
    assert.equal(cli(tmp, tmp, '--only').status, 2);
    assert.equal(cli(tmp, tmp, '--only', 'nope').status, 2);
    assert.equal(cli(tmp, tmp, '--only', 'demo').status, 0);
    rmSync(join(tmp, 'diagrams', 'scenes', 'index.mjs'));
    const r = cli(tmp, tmp);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /scenes[\\/]index\.mjs/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
