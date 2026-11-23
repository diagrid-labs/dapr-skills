#!/usr/bin/env node
// Generates skills/create-diagram/engine/tokens.json from dapr/docs' _tokens.scss.
// Usage: node scripts/diagram-tokens.mjs <path/to/_tokens.scss>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const TOKENS_JSON = join(here, '..', 'skills', 'create-diagram', 'engine', 'tokens.json');

const DARK_MARK = '[data-bs-theme="dark"]';

function defs(block) {
  const out = {};
  for (const m of block.matchAll(/^\s*(--d-[a-z-]+)\s*:\s*([^;]+);/gm)) out[m[1]] = m[2].trim();
  return out;
}

// :root is the light theme, the [data-bs-theme="dark"] block is the dark one.
// Tokens the dark block does not override (e.g. --d-radius) inherit the :root
// value, as they do in the cascade, so dark is always a complete set.
export function parseTokens(scss) {
  const at = scss.indexOf(DARK_MARK);
  if (at < 0) throw new Error(`no ${DARK_MARK} block found: cannot read dark tokens`);
  const light = defs(scss.slice(0, at));
  return { light, dark: { ...light, ...defs(scss.slice(at)) } };
}

// Tokens the engine needs that dapr/docs' _tokens.scss does not define. They are merged
// over the parsed result when the CLI writes tokens.json, so regenerating keeps them.
// --d-brand-python: the Python mark's blue (#3776AB). The dark value is Python's lighter
// blue, #4B8BBE: 5.28:1 on --d-ground and 4.94:1 on --d-panel.
export const EXTRA_TOKENS = Object.freeze({
  light: Object.freeze({ '--d-brand-python': '#3776AB' }),
  dark: Object.freeze({ '--d-brand-python': '#4B8BBE' }),
});

export function withExtraTokens({ light, dark }) {
  return { light: { ...light, ...EXTRA_TOKENS.light }, dark: { ...dark, ...EXTRA_TOKENS.dark } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: node scripts/diagram-tokens.mjs <path/to/_tokens.scss>');
    process.exit(2);
  }
  const tokens = withExtraTokens(parseTokens(readFileSync(src, 'utf8')));
  writeFileSync(TOKENS_JSON, JSON.stringify(tokens, null, 2) + '\n');
  console.log(`wrote ${TOKENS_JSON} (${Object.keys(tokens.light).length} light, ${Object.keys(tokens.dark).length} dark)`);
}
