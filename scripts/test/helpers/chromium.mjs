import { loadChromium } from '../../../skills/create-diagram/engine/browser.mjs';

// Gate for browser tests. With REQUIRE_CHROMIUM=1 (CI) a missing browser is a
// failure, so the job cannot go green by skipping every browser test.
export async function requireChromium(t, { load = loadChromium, env = process.env } = {}) {
  if (await load()) return true;
  if (env.REQUIRE_CHROMIUM === '1') {
    throw new Error('Chromium is required (REQUIRE_CHROMIUM=1) but did not load');
  }
  t.skip('no chromium');
  return false;
}
