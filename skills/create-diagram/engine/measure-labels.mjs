// Prints the measured box of every label in one scene, in scene units.
// Usage: node <diagramsDir>/_engine/measure-labels.mjs <name>
// Local addition to the engine (not from dapr/docs); setup copies it with the rest.
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectPaths } from './paths.mjs';

export const NO_CHROMIUM_MEASURE = 'measure-labels needs Chromium: run the create-diagram setup with --with-browser';

// The measured box of every <text> in the scene, before centring, so the
// numbers compare directly with the constants the scene file uses.
export async function measureLabels(name, scene) {
  const { withHarness } = await import('./browser.mjs');
  const { renderScene } = await import('./export.mjs');
  const body = `<div class="fig" style="width:900px">${renderScene(name, scene)}</div>`;
  return withHarness((page) => page.$$eval('svg text:not([aria-hidden])', (all) => all.map((t) => {
    const b = t.getBBox();
    const r = (v) => Math.round(v * 10) / 10;
    return { text: t.textContent, x: r(b.x), y: r(b.y), w: r(b.width), h: r(b.height) };
  })), { body });
}

async function main(argv) {
  const name = argv[0];
  if (!name) {
    console.error('Usage: node _engine/measure-labels.mjs <name>');
    return 2;
  }
  const paths = projectPaths();
  if (!existsSync(paths.scenes)) {
    console.error(`Scenes file not found: ${paths.scenes}`);
    return 1;
  }
  const mod = await import(pathToFileURL(paths.scenes).href);
  const scenes = mod.scenes ?? {};
  // The scene is checked before the browser is loaded, so a typo is reported even without Chromium.
  if (!Object.hasOwn(scenes, name)) {
    console.error(`no scene named "${name}"`);
    return 1;
  }
  const { loadChromium } = await import('./browser.mjs');
  if (!(await loadChromium({ root: paths.root }))) {
    console.error(NO_CHROMIUM_MEASURE);
    return 1;
  }
  console.table(await measureLabels(name, scenes[name]));
  return 0;
}

const isEntry = () => {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (isEntry()) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, (e) => {
    console.error(e && e.stack ? e.stack : String(e));
    process.exitCode = 1;
  });
}
