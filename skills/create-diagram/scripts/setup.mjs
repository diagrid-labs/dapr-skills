// Copies the diagram engine into a project as <diagramsDir>/_engine/, creates the
// scaffold, and refreshes the engine later without touching scenes or output.
// Usage: node setup.mjs <diagramsDir> [--refresh] [--with-browser]
// Exit codes: 0 created or up to date, 1 failure, 2 refresh available, 3 foreign folder.
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLAYWRIGHT = '@playwright/test@1.56.1';
const SKILL_ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine');

export function readVersion(engineDir) {
  return JSON.parse(readFileSync(join(engineDir, 'VERSION'), 'utf8'));
}

// Numeric, dot-separated comparison. Returns -1, 0 or 1.
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const copyEngine = (src, dst) =>
  cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('.DS_Store') });

// Swap in a new engine so a failed copy leaves the old one intact. Renaming over a
// non-empty directory fails on Windows, so move the old one aside first.
function replaceEngine(src, dir) {
  const engine = join(dir, '_engine');
  const fresh = join(dir, '_engine.new');
  const old = join(dir, '_engine.old');
  rmSync(fresh, { recursive: true, force: true });
  rmSync(old, { recursive: true, force: true });
  copyEngine(src, fresh);
  renameSync(engine, old);
  try {
    renameSync(fresh, engine);
  } catch (e) {
    renameSync(old, engine);
    rmSync(fresh, { recursive: true, force: true });
    throw e;
  }
  rmSync(old, { recursive: true, force: true });
}

// Creates only what is missing; returns what it restored.
export function ensureScaffold(dir) {
  const restored = [];
  for (const sub of ['scenes', 'out']) {
    if (!existsSync(join(dir, sub))) {
      mkdirSync(join(dir, sub), { recursive: true });
      restored.push(`${sub}/`);
    }
  }
  const files = [
    [join(dir, 'scenes', 'index.mjs'), 'export const scenes = {};\n', 'scenes/index.mjs'],
    [join(dir, 'package.json'), '{"private":true,"type":"module"}\n', 'package.json'],
  ];
  for (const [path, content, label] of files) {
    if (!existsSync(path)) {
      writeFileSync(path, content);
      restored.push(label);
    }
  }
  return restored;
}

function installBrowser(dir) {
  const win = process.platform === 'win32';
  const steps = [
    [win ? 'npm.cmd' : 'npm', ['install', '--prefix', dir, PLAYWRIGHT]],
    [win ? 'npx.cmd' : 'npx', ['--prefix', dir, 'playwright', 'install', 'chromium']],
  ];
  for (const [cmd, args] of steps) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', shell: win });
    if (r.status !== 0) return false;
  }
  return true;
}

// Returns an exit code; messages go to the given out/err writers.
export function setup(target, { refresh = false, withBrowser = false, engineSrc = SKILL_ENGINE } = {}, out = console.log, err = console.error) {
  const dir = resolve(target);
  const next = `node ${join(dir, '_engine', 'export.mjs')}`;
  const skill = readVersion(engineSrc);
  let code = 0;
  let restored = [];

  if (existsSync(dir) && !statSync(dir).isDirectory()) {
    err(`${dir} is a file, not a create-diagram folder; choose another name`);
    return 3;
  }
  // Recover from an interrupted refresh: put the old engine back, drop a half copy.
  if (existsSync(dir)) {
    if (!existsSync(join(dir, '_engine')) && existsSync(join(dir, '_engine.old'))) {
      renameSync(join(dir, '_engine.old'), join(dir, '_engine'));
    }
    rmSync(join(dir, '_engine.new'), { recursive: true, force: true });
  }
  const hasEngine = existsSync(join(dir, '_engine', 'VERSION'));
  if (existsSync(dir) && !hasEngine && readdirSync(dir).length > 0) {
    err(`${dir} is not a create-diagram folder; choose another name`);
    return 3;
  }

  if (!hasEngine) {
    mkdirSync(dir, { recursive: true });
    copyEngine(engineSrc, join(dir, '_engine'));
    ensureScaffold(dir);
    out(`Created ${dir} (engine ${skill.skill}). Next: ${next} --no-browser`);
  } else {
    const have = readVersion(join(dir, '_engine'));
    const cmp = compareVersions(have.skill, skill.skill);
    if (cmp > 0) {
      out(`Engine in ${dir} (${have.skill}) is newer than this skill's (${skill.skill}); leaving it alone.`);
      restored = ensureScaffold(dir);
    } else if (cmp === 0 && have.source === skill.source) {
      out(`Engine ${have.skill} is up to date.`);
      restored = ensureScaffold(dir);
    } else if (!refresh) {
      out(`Engine refresh available: project ${have.skill} (${have.source}), skill ${skill.skill} (${skill.source}). Re-run with --refresh.`);
      return 2;
    } else {
      replaceEngine(engineSrc, dir);
      restored = ensureScaffold(dir);
      out(`Refreshed engine ${have.skill} -> ${skill.skill}. Scenes and out/ untouched. Next: ${next}`);
    }
  }

  if (restored.length) out(`Restored missing scaffold: ${restored.join(', ')}`);
  if (withBrowser && !installBrowser(dir)) {
    err('Browser install failed. SVG export still works without it (--no-browser).');
    code = 1;
  }
  return code;
}

const isEntry = () => {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (isEntry()) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('Usage: node setup.mjs <diagramsDir> [--refresh] [--with-browser]');
    process.exitCode = 1;
  } else {
    try {
      process.exitCode = setup(target, { refresh: args.includes('--refresh'), withBrowser: args.includes('--with-browser') });
    } catch (e) {
      console.error(e && e.stack ? e.stack : String(e));
      process.exitCode = 1;
    }
  }
}
