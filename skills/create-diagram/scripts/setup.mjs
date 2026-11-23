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

  if (existsSync(dir) && !statSync(dir).isDirectory()) {
    err(`${dir} is a file, not a create-diagram folder; choose another name`);
    return 3;
  }
  const hasEngine = existsSync(join(dir, '_engine', 'VERSION'));
  if (existsSync(dir) && !hasEngine && readdirSync(dir).length > 0) {
    err(`${dir} is not a create-diagram folder; choose another name`);
    return 3;
  }

  if (!hasEngine) {
    mkdirSync(join(dir, 'scenes'), { recursive: true });
    mkdirSync(join(dir, 'out'), { recursive: true });
    copyEngine(engineSrc, join(dir, '_engine'));
    const scenes = join(dir, 'scenes', 'index.mjs');
    if (!existsSync(scenes)) writeFileSync(scenes, 'export const scenes = {};\n');
    const pkg = join(dir, 'package.json');
    if (!existsSync(pkg)) writeFileSync(pkg, '{"private":true,"type":"module"}\n');
    out(`Created ${dir} (engine ${skill.skill}). Next: ${next} --no-browser`);
  } else {
    const have = readVersion(join(dir, '_engine'));
    const cmp = compareVersions(have.skill, skill.skill);
    if (cmp > 0) {
      out(`Engine in ${dir} (${have.skill}) is newer than this skill's (${skill.skill}); leaving it alone.`);
    } else if (cmp === 0 && have.source === skill.source) {
      out(`Engine ${have.skill} is up to date.`);
    } else if (!refresh) {
      out(`Engine refresh available: project ${have.skill} (${have.source}), skill ${skill.skill} (${skill.source}). Re-run with --refresh.`);
      return 2;
    } else {
      replaceEngine(engineSrc, dir);
      out(`Refreshed engine ${have.skill} -> ${skill.skill}. Scenes and out/ untouched. Next: ${next}`);
    }
  }

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
