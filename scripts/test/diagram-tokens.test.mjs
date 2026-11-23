import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { C, APP } from '../../skills/create-diagram/engine/engine.mjs';

const tokens = JSON.parse(readFileSync(new URL('../../skills/create-diagram/engine/tokens.json', import.meta.url), 'utf8'));
const light = new Set(Object.keys(tokens.light));
const darkSet = new Set(Object.keys(tokens.dark));

const used = [...new Set([...Object.values(C), ...APP.flatMap((a) => [a.stroke, a.fill])]
  .map((v) => /var\((--d-[a-z-]+)\)/.exec(v)[1]))];

test('every token C references is defined in tokens.json light', () => {
  assert.ok(light.size > 0);
  for (const t of used) assert.ok(light.has(t), `${t} missing from light`);
});

test('every diagram token is defined in tokens.json dark too', () => {
  for (const t of used) assert.ok(darkSet.has(t), `${t} missing from dark`);
});
