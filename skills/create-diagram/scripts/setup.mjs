// Copies the diagram engine into a project as <diagramsDir>/_engine/, creates the
// scaffold, and refreshes the engine later without touching scenes or output.
// Usage: node setup.mjs <diagramsDir> [--refresh] [--with-browser]
// Exit codes: 0 created or up to date, 1 failure, 2 refresh available, 3 foreign folder.
import {
  cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync,
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
  // .gitattributes keeps a Windows clone (core.autocrlf) from rewriting the SVGs,
  // which would make --check report every diagram as changed.
  const files = [
    [join(dir, 'scenes', 'index.mjs'), 'export const scenes = {};\n', 'scenes/index.mjs'],
    [join(dir, 'package.json'), '{"private":true,"type":"module"}\n', 'package.json'],
    [join(dir, '.gitattributes'), 'out/*.svg text eol=lf\nout/*.png binary\n', '.gitattributes'],
    [join(dir, '.gitignore'), 'node_modules/\n', '.gitignore'],
  ];
  for (const [path, content, label] of files) {
    if (!existsSync(path)) {
      writeFileSync(path, content);
      restored.push(label);
    }
  }
  return restored;
}

// The two commands that put Playwright and its Chromium in the diagrams folder.
// They run with cwd set to the folder instead of taking it as --prefix, so no
// argument is a path: on Windows the .cmd shims need shell: true, and a path
// with spaces would otherwise have to be quoted for cmd.exe.
export function browserInstallCommands(dir, platform = process.platform) {
  const win = platform === 'win32';
  const options = { cwd: dir, stdio: 'inherit', shell: win };
  return [
    { cmd: win ? 'npm.cmd' : 'npm', args: ['install', '--save-exact', PLAYWRIGHT], options },
    { cmd: win ? 'npx.cmd' : 'npx', args: ['playwright', 'install', 'chromium'], options },
  ];
}

function installBrowser(dir) {
  for (const { cmd, args, options } of browserInstallCommands(dir)) {
    const r = spawnSync(cmd, args, options);
    if (r.status !== 0) return false;
  }
  return true;
}

// Returns an exit code; messages go to the given out/err writers.
export function setup(target, {
  refresh = false, withBrowser = false, engineSrc = SKILL_ENGINE, install = installBrowser,
} = {}, out = console.log, err = console.error) {
  const dir = resolve(target);
  const next = `node "${join(dir, '_engine', 'export.mjs')}"`;
  const skill = readVersion(engineSrc);
  let code = 0;
  let restored = [];

  if (existsSync(dir) && !statSync(dir).isDirectory()) {
    err(`${dir} is a file, not a create-diagram folder; choose another name`);
    return 3;
  }
  // Recover from an interrupted refresh: put the old engine back, drop a half copy.
  if (existsSync(dir)) {
    if (!existsSync(join(dir, '_engine')) && existsSync(join(dir, '_engine.old', 'VERSION'))) {
      renameSync(join(dir, '_engine.old'), join(dir, '_engine'));
    }
    if (existsSync(join(dir, '_engine', 'VERSION')) || existsSync(join(dir, '_engine.old', 'VERSION'))) {
      rmSync(join(dir, '_engine.new'), { recursive: true, force: true });
    }
  }
  const hasEngine = existsSync(join(dir, '_engine', 'VERSION'));
  // Dotfiles and dot-directories such as .gitkeep, .DS_Store or .vscode do not make a
  // folder someone else's. lstat keeps a broken symlink from throwing.
  const isDotfile = (f) => {
    if (!f.startsWith('.')) return false;
    try {
      const st = lstatSync(join(dir, f));
      return st.isFile() || st.isDirectory() || st.isSymbolicLink();
    } catch {
      return true;
    }
  };
  if (existsSync(dir) && !hasEngine && readdirSync(dir).some((f) => !isDotfile(f))) {
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
      const missing = ensureScaffold(dir);
      if (missing.length) out(`Restored missing scaffold: ${missing.join(', ')}`);
      return 2;
    } else {
      replaceEngine(engineSrc, dir);
      restored = ensureScaffold(dir);
      out(`Refreshed engine ${have.skill} -> ${skill.skill}. Scenes and out/ untouched. Next: ${next}`);
    }
  }

  if (restored.length) out(`Restored missing scaffold: ${restored.join(', ')}`);
  if (withBrowser) {
    if (install(dir)) {
      out('Chromium ready: PNGs, centring and the fallback-font check will run on the next export.');
    } else {
      err('Browser install failed. SVG export still works without it (--no-browser).');
      code = 1;
    }
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
