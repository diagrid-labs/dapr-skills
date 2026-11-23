// The one hash both the PNG manifest and the no-Chromium stale check use. It
// lives apart from render-png.mjs so export.mjs can read it without importing
// the browser modules.
import { createHash } from 'node:crypto';

export const sha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
