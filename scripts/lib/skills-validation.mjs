// Validation helpers for the skills/ folder. No dependencies; Node.js 22+.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep, basename, extname } from 'node:path';

/**
 * Parse the YAML front-matter of a SKILL.md into a flat { key: value } object.
 * Only top-level `key: value` lines are read; nested blocks and lists are ignored.
 * Returns null when the text has no front-matter block.
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    data[kv[1]] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return data;
}

/** List the immediate sub-folders of skillsDir (one per skill), sorted. */
export function listSkillFolders(skillsDir) {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Check 1 — every skill folder has a SKILL.md whose `name` equals the folder
 * name and whose `description` is non-empty. Returns an array of failure strings.
 */
export function checkManifests(skillsDir) {
  const failures = [];
  for (const folder of listSkillFolders(skillsDir)) {
    const file = join(skillsDir, folder, 'SKILL.md');
    if (!existsSync(file)) {
      failures.push(`${folder}/: missing SKILL.md`);
      continue;
    }
    const fm = parseFrontmatter(readFileSync(file, 'utf8'));
    if (!fm) {
      failures.push(`${folder}/SKILL.md: missing front-matter`);
      continue;
    }
    if (fm.name !== folder) {
      failures.push(`${folder}/SKILL.md: name "${fm.name ?? ''}" does not match folder "${folder}"`);
    }
    if (!fm.description) {
      failures.push(`${folder}/SKILL.md: missing description`);
    }
  }
  return failures;
}

function walkMarkdown(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walkMarkdown(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}

const LINK = /\]\(([^)\s]+)\)/g; // markdown link target: [text](target)
const TICK = /`(\.{1,2}\/[^`\s]+)`/g; // backticked ./ or ../ path

function isInside(root, abs) {
  const rel = relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel));
}

/**
 * Extract relative file references from one Markdown file's text.
 * Fenced code blocks are skipped. Returns [{ line, raw, target, kind }] where
 * kind is 'link' (markdown link) or 'path' (backticked ./ or ../ path).
 *
 * Skipped: URLs (any scheme), pure anchors, `<Placeholder>` paths, globs (`*`),
 * elisions (`...`), and backticked paths without a file extension (folders in
 * generated projects such as `./observability/`).
 */
export function findReferences(text) {
  const refs = [];
  let inFence = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    for (const m of line.matchAll(LINK)) {
      const target = m[1].split('#')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes('<')) continue;
      refs.push({ line: index + 1, raw: m[1], target, kind: 'link' });
    }
    for (const m of line.matchAll(TICK)) {
      const target = m[1];
      if (target.includes('*') || target.includes('...') || target.includes('<')) continue;
      if (!extname(basename(target))) continue;
      refs.push({ line: index + 1, raw: m[1], target, kind: 'path' });
    }
  });
  return refs;
}

/**
 * Check 2 — every reference in skillsDir/**\/*.md resolves to an existing file
 * or folder inside skillsDir. Markdown links that leave skillsDir are failures;
 * backticked paths that leave skillsDir are treated as examples and ignored.
 * Returns an array of failure strings "<file>:<line> -> <raw>".
 */
export function checkLinks(skillsDir) {
  const root = resolve(skillsDir);
  const failures = [];
  for (const file of walkMarkdown(root)) {
    for (const ref of findReferences(readFileSync(file, 'utf8'))) {
      const abs = resolve(dirname(file), ref.target);
      const where = `${relative(root, file).split(sep).join('/')}:${ref.line}`;
      if (!isInside(root, abs)) {
        if (ref.kind === 'link') failures.push(`${where} -> ${ref.raw} (outside skills folder)`);
        continue;
      }
      if (!existsSync(abs)) failures.push(`${where} -> ${ref.raw}`);
    }
  }
  return failures;
}

/**
 * Check 4 — for each skill folder, the other skill folders it depends on.
 * Starts from the skill's own Markdown files and follows references file by
 * file (transitively), so a skill only depends on what the files it actually
 * reaches link to. Returns a Map<skillFolder, string[]> (sorted, excluding the
 * skill itself).
 */
export function dependencyReport(skillsDir) {
  const root = resolve(skillsDir);
  const folderOf = (abs) => relative(root, abs).split(sep)[0];
  const edges = new Map(); // markdown file -> Set<resolved target path>
  for (const file of walkMarkdown(root)) {
    const targets = new Set();
    for (const ref of findReferences(readFileSync(file, 'utf8'))) {
      const abs = resolve(dirname(file), ref.target);
      if (isInside(root, abs) && existsSync(abs)) targets.add(abs);
    }
    edges.set(file, targets);
  }
  const report = new Map();
  for (const skill of listSkillFolders(root)) {
    const start = [...edges.keys()].filter((f) => folderOf(f) === skill);
    const seen = new Set(start);
    const queue = [...start];
    const deps = new Set();
    while (queue.length) {
      for (const target of edges.get(queue.shift()) ?? []) {
        const folder = folderOf(target);
        if (folder !== skill) deps.add(folder);
        if (!seen.has(target) && edges.has(target)) {
          seen.add(target);
          queue.push(target);
        }
      }
    }
    report.set(skill, [...deps].sort());
  }
  return report;
}

/**
 * After an install, the installed skills folder must contain exactly the
 * source skill folders (spec success criterion 1). Returns failure strings
 * "missing: <name>" and "unexpected: <name>".
 */
export function checkInstalledSet(skillsDir, installedDir) {
  const expected = new Set(listSkillFolders(skillsDir));
  const actual = new Set(listSkillFolders(installedDir));
  return [
    ...[...expected].filter((n) => !actual.has(n)).map((n) => `missing: ${n}`),
    ...[...actual].filter((n) => !expected.has(n)).map((n) => `unexpected: ${n}`),
  ];
}

/**
 * Build the `npx skills add` invocation. On Windows npx is a .cmd file and
 * needs a shell, which joins arguments unquoted, so the repository path is
 * wrapped in double quotes there (paths such as C:\Users\John Doe\...).
 */
export function installCommand(repoRoot, agents, platform = process.platform, cli = 'skills@1.7.2') {
  const windows = platform === 'win32';
  const source = windows ? `"${repoRoot}"` : repoRoot;
  return {
    command: 'npx',
    args: ['-y', cli, 'add', source, '--skill', '*', ...agents.flatMap((a) => ['-a', a]), '--copy', '-y'],
    shell: windows,
  };
}
