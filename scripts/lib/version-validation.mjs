// Dapr package pins, checked against the one table that declares them. No dependencies; Node.js 22+.
//
// Version drift is this repo's recurring bug: a skill keeps emitting a pin that was current when it
// was written, and nothing notices until a user's generated project fails to build. The pins live in
// `skills/dapr-shared/dapr-versions.md`, and this check fails when any skill or eval fixture pins a
// different version for a coordinate that table declares.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';

const VERSIONS_FILE = 'dapr-shared/dapr-versions.md';
const ECOSYSTEMS = new Set(['nuget', 'npm', 'pypi']);

// A concrete release, and nothing else. The trailing look-ahead is what makes `dapr==1.18.x` not a
// pin: skills say that about whatever version an existing project already carries, and a wildcard
// cannot be stale. Without it, `1.18.x` would be read as a pin of `1.18`.
const VERSION = '(\\d+(?:\\.\\d+)+(?:[-+][0-9A-Za-z.\\-]+)?)(?![\\w.\\-])';

/**
 * Rows of the version table as `{name, version, ecosystem}`.
 *
 * A row counts only when its middle cell is a version and its last cell names an ecosystem, which is
 * what separates the version table from the header, the `|---|` rule and the retired-distribution
 * table below it — that one carries replacement coordinates, not versions.
 */
function versionRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, ''));
    if (cells.length !== 3) continue;
    const [name, version, ecosystem] = cells;
    if (!/^\d+\.\d+\.\d+/.test(version)) continue;
    if (!ECOSYSTEMS.has(ecosystem.toLowerCase())) continue;
    rows.push({ name, version, ecosystem: ecosystem.toLowerCase() });
  }
  return rows;
}

/** The version table as package coordinate -> version. */
export function parseVersionTable(text) {
  return new Map(versionRows(text).map((r) => [r.name, r.version]));
}

/** Retired distributions as retired name -> the coordinate to pin instead. */
function retiredTable(text) {
  const retired = new Map();
  let inSection = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s/.test(line)) inSection = /retired/i.test(line);
    if (!inSection || !line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, ''));
    if (cells.length !== 2 || !cells[0].startsWith('dapr-ext-')) continue;
    retired.set(cells[0], cells[1]);
  }
  return retired;
}

/**
 * Pins on one line, as `{ecosystem, name, version}`.
 *
 * Each ecosystem is recognised by its own syntax, and a name is only ever a pin in the ecosystem whose
 * syntax carried it. That is what keeps `dapr --version 1.2.0` — the Dapr CLI printing its version —
 * from being read as a pin of the `dapr` PyPI package.
 */
function pinsOnLine(line) {
  const found = [];
  const add = (ecosystem, name, version) => found.push({ ecosystem, name, version });

  // NuGet: `dotnet add package <pkg> --version <v>`
  for (const m of line.matchAll(new RegExp(`([A-Za-z0-9_.\\-]+)\\s+--version\\s+v?${VERSION}`, 'g'))) add('nuget', m[1], m[2]);
  // NuGet: `<PackageReference Include="<pkg>" Version="<v>" />`
  const include = line.match(/Include="([^"]+)"/);
  const attr = line.match(new RegExp(`\\sVersion="v?${VERSION}"`));
  if (include && attr) add('nuget', include[1], attr[1]);
  // npm: `"<pkg>": "<v>"`
  for (const m of line.matchAll(new RegExp(`"(@?[A-Za-z0-9_./\\-]+)"\\s*:\\s*"[\\^~]?${VERSION}"`, 'g'))) add('npm', m[1], m[2]);
  // PyPI: `<pkg>==<v>`, with an optional extras bracket, quoted or bare
  for (const m of line.matchAll(new RegExp(`([A-Za-z0-9_.\\-]+(?:\\[[A-Za-z0-9_,\\-]+\\])?)==${VERSION}`, 'g'))) add('pypi', m[1], m[2]);

  // A retired distribution is a mistake however it is written, not only as `name==version`. The
  // regression worth catching is someone re-adding `pip install dapr-ext-workflow`, which carries no
  // version at all. Naming the package in prose stays legal, and so does `uv remove` — that is how
  // you drop it — so only an install command or a requirement specifier counts.
  for (const m of line.matchAll(/(?:pip install|pip3 install|uv add|poetry add|pdm add|pipenv install)\s+([^\n`]+)/g)) {
    for (const word of m[1].split(/\s+/)) {
      const name = word.replace(/^["']|["'].*$/g, '').split(/[<>=!~[]/)[0];
      if (name.startsWith('dapr-ext-')) add('retired', name, '');
    }
  }
  for (const m of line.matchAll(/(dapr-ext-[A-Za-z0-9_.\-]+)\s*(?:[<>!~]=|[<>]|~=)\s*\d/g)) add('retired', m[1], '');

  const seen = new Set();
  return found.filter((p) => {
    const key = `${p.ecosystem}|${p.name}|${p.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Every file under `dir` with one of `exts`, skipping any directory named in `skip`. */
function walk(dir, exts, skip) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skip.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path, exts, skip);
    return exts.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
  });
}

// `obj/` and `bin/` are untracked build output. `files/` holds an eval's fixture *projects*: the
// input an add skill is pointed at, deliberately older than the target so the eval can prove the
// skill offers the upgrade (evals/add-workflow-dotnet pins Dapr.AspNetCore 1.17.9 for exactly that
// reason). What a skill must emit is asserted in evals.json, and that is checked.
const SKILL_SKIP = new Set(['obj', 'bin']);
const EVAL_SKIP = new Set(['obj', 'bin', 'files']);

/** Check — every Dapr pin in the skills and the eval fixtures matches `dapr-versions.md`. */
export function checkVersionPins(skillsDir, evalsDir) {
  const tablePath = join(skillsDir, 'dapr-shared', 'dapr-versions.md');
  if (!existsSync(tablePath)) return [`${VERSIONS_FILE} is missing`];
  const text = readFileSync(tablePath, 'utf8');
  const rows = versionRows(text);
  if (rows.length === 0) return [`${VERSIONS_FILE} declares no package versions`];

  const expected = new Map(rows.map((r) => [`${r.ecosystem}|${r.name}`, r.version]));
  const retired = retiredTable(text);
  const root = dirname(skillsDir);

  const failures = [];
  for (const file of [...walk(skillsDir, ['.md'], SKILL_SKIP), ...walk(evalsDir, ['.json'], EVAL_SKIP)]) {
    const where = relative(root, file).split(sep).join('/');
    // The table declares the rule, so it has to be able to show what the rule forbids. Same reason
    // the placeholder vocabularies are excluded from their own undefined-placeholder check.
    if (file === tablePath) continue;
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, index) => {
        for (const pin of pinsOnLine(line)) {
          const replacement = retired.get(pin.name);
          if (replacement) {
            const found = pin.version ? ` instead of ${pin.name}==${pin.version}` : '';
            failures.push(`${where}:${index + 1} -> ${pin.name} is retired; use ${replacement}${found}`);
            continue;
          }
          const want = expected.get(`${pin.ecosystem}|${pin.name}`);
          if (want && want !== pin.version) {
            failures.push(
              `${where}:${index + 1} -> ${pin.name} pinned at ${pin.version}, expected ${want} (${VERSIONS_FILE})`,
            );
          }
        }
      });
  }
  return failures;
}
