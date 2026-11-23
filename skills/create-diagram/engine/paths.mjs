import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The engine is copied to <project>/diagrams/_engine/, so every project path is
// resolved from the engine's own location, never from the working directory.
export function projectPaths(engineDir = dirname(fileURLToPath(import.meta.url))) {
  const root = dirname(engineDir);
  const out = join(root, 'out');
  return {
    root,
    scenes: join(root, 'scenes', 'index.mjs'),
    out,
    bbox: join(root, 'bbox.json'),
    pngManifest: join(out, 'png-manifest.json'),
  };
}
