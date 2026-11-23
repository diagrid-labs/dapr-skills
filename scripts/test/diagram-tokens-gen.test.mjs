import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTokens } from '../diagram-tokens.mjs';

const tokensJson = new URL('../../skills/create-diagram/engine/tokens.json', import.meta.url);

test('parseTokens reads :root as light and [data-bs-theme="dark"] as dark', () => {
  const scss = `:root {
  --d-blue: #0D2192;
  --other: red;
}
[data-bs-theme="dark"] {
  --d-blue: #abc;
}`;
  const { light, dark } = parseTokens(scss);
  assert.equal(light['--d-blue'], '#0D2192');
  assert.equal(dark['--d-blue'], '#abc');
  assert.equal(light['--other'], undefined);
});

test('parseTokens throws when the dark block is missing', () => {
  assert.throws(() => parseTokens(':root { --d-blue: #000; }'), /dark/);
});

test('dark inherits light values the dark block does not override', () => {
  const { dark } = parseTokens(':root {\n  --d-a: 1;\n  --d-b: 2;\n}\n[data-bs-theme="dark"] {\n  --d-a: 9;\n}');
  assert.deepEqual(dark, { '--d-a': '9', '--d-b': '2' });
});

test('dark has every light key', () => {
  const { light, dark } = JSON.parse(readFileSync(tokensJson, 'utf8'));
  for (const k of Object.keys(light)) assert.ok(k in dark, `${k} missing from dark`);
});

// The source defines 40 --d- tokens (the brief guessed 80+); --d-radius is not
// overridden in dark and is inherited from :root.
test('tokens.json has 40 or more --d- keys per theme', () => {
  const { light, dark } = JSON.parse(readFileSync(tokensJson, 'utf8'));
  for (const t of [light, dark]) {
    const keys = Object.keys(t);
    assert.ok(keys.length >= 40, `only ${keys.length} keys`);
    assert.ok(keys.every((k) => k.startsWith('--d-')));
  }
});
