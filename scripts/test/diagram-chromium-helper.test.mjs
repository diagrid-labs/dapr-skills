import test from 'node:test';
import assert from 'node:assert/strict';
import { requireChromium } from './helpers/chromium.mjs';

const fakeT = () => {
  const calls = [];
  return { calls, skip: (m) => calls.push(m) };
};

test('requireChromium skips without REQUIRE_CHROMIUM', async () => {
  const t = fakeT();
  const ok = await requireChromium(t, { load: async () => null, env: {} });
  assert.equal(ok, false);
  assert.deepEqual(t.calls, ['no chromium']);
});

test('requireChromium throws when required', async () => {
  const t = fakeT();
  await assert.rejects(
    requireChromium(t, { load: async () => null, env: { REQUIRE_CHROMIUM: '1' } }),
    /REQUIRE_CHROMIUM=1/,
  );
  assert.deepEqual(t.calls, []);
});

test('requireChromium passes a loaded browser', async () => {
  const t = fakeT();
  const ok = await requireChromium(t, { load: async () => ({}), env: {} });
  assert.equal(ok, true);
  assert.deepEqual(t.calls, []);
});
