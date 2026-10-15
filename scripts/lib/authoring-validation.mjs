// Validation helpers shared by every authoring skill. No dependencies; Node.js 22+.
//
// A create skill hands the user a project. These checks keep that project
// verified, the skill's tool declarations honest, and its review skills findable.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Create skills that deliberately run no build, and why. */
export const BUILD_EXEMPT = new Map([
  [
    'create-workflow-from-diagram',
    'SKILL.md states it does not run builds: no `uv sync`, `npm install`, `dotnet restore` / `build`, `go mod tidy` or `mvn`.',
  ],
]);

/** Commands that prove the generated project actually compiles. */
const BUILD_COMMANDS = [
  'dotnet build',
  'npx tsc',
  'tsc --noEmit',
  'compileall',
  'go build',
  'mvn ',
];

/** Skill folders whose name begins with `create-`, sorted. */
export function listCreateSkills(skillsDir) {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('create-'))
    .map((e) => e.name)
    .sort();
}

/**
 * The body of the `## Verify` section, from its heading to the next `## `
 * heading. Returns null when the file has no such section.
 */
export function verifySection(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Verify\s*$/.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^## /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * Check — every create skill has a `## Verify` section that tells the agent to
 * RUN the verification (not show it) and includes a command that compiles or
 * builds the generated project. Returns an array of failure strings.
 */
export function checkVerifyRuns(skillsDir) {
  const failures = [];
  for (const name of listCreateSkills(skillsDir)) {
    if (BUILD_EXEMPT.has(name)) continue;
    const file = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const where = `${name}/SKILL.md`;
    const section = verifySection(readFileSync(file, 'utf8'));
    if (section === null) {
      failures.push(`${where} -> has no \`## Verify\` section`);
      continue;
    }
    if (/MUST show\b/i.test(section)) {
      failures.push(`${where} -> Verify tells the agent to "show" instructions; it must run them`);
    } else if (!/MUST run\b/i.test(section)) {
      failures.push(`${where} -> Verify never says the agent MUST run the verification`);
    }
    if (/instruct the user to (run|execute|build)/i.test(section)) {
      failures.push(`${where} -> Verify hands the verification to the user; the agent must run it itself`);
    }
    if (!BUILD_COMMANDS.some((cmd) => section.includes(cmd))) {
      failures.push(`${where} -> Verify has no command that compiles or builds the generated project`);
    }
  }
  return failures;
}

/**
 * The `allowed-tools` entries of a SKILL.md, in order. Returns [] when the key
 * is absent — an absent key means the skill constrains nothing, which is valid.
 */
export function declaredTools(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const start = lines.findIndex((line) => /^allowed-tools:/.test(line));
  if (start === -1) return null;
  const flow = /^allowed-tools:\s*\[(.*)\]\s*$/.exec(lines[start]);
  if (flow) {
    return flow[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  const tools = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^\s*-\s+(.+?)\s*$/.exec(line);
    if (!item) break;
    tools.push(item[1]);
  }
  return tools;
}

/**
 * Check — a create skill that constrains its tools at all must declare the
 * tools it actually uses to write the project. Returns failure strings.
 */
export function checkDeclaredTools(skillsDir) {
  const failures = [];
  for (const name of listCreateSkills(skillsDir)) {
    const file = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const tools = declaredTools(readFileSync(file, 'utf8'));
    if (tools === null) continue; // no allowed-tools key: unconstrained, nothing to check
    const missing = ['Write', 'Edit'].filter((t) => !tools.includes(t));
    if (missing.length > 0) {
      failures.push(`${name}/SKILL.md -> creates files but does not declare ${missing.join(', ')} in allowed-tools`);
    }
  }
  return failures;
}

const FAMILY_PREFIXES = ['workflow', 'agent', 'pubsub'];

/** The review-skill prefix for a create skill, or '' when it has no family. */
export function reviewFamily(createSkillName) {
  const family = FAMILY_PREFIXES.find((f) => createSkillName.startsWith(`create-${f}`));
  return family ? `review-${family}-` : '';
}

/**
 * Check — a create skill names at least one review skill of its own family, so
 * the user who scaffolds a project learns the audit skills exist. Only enforced
 * when that family actually has review skills installed.
 */
export function checkReviewCrossLinks(skillsDir) {
  const folders = readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const failures = [];
  for (const name of listCreateSkills(skillsDir)) {
    const prefix = reviewFamily(name);
    if (!prefix) continue;
    const reviews = folders.filter((f) => f.startsWith(prefix));
    if (reviews.length === 0) continue;
    const file = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    if (!reviews.some((r) => text.includes(r))) {
      failures.push(`${name}/SKILL.md -> never names a ${prefix} skill, so the user cannot discover them`);
    }
  }
  return failures;
}

/** Every .md under a directory, recursively, as absolute paths. */
function walkMarkdown(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walkMarkdown(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}

/**
 * Check — every file under dapr-shared/references/ is linked by at least one
 * skill. Unlinked reference material is invisible to the skills that need it.
 */
export function checkNoOrphanedShared(skillsDir) {
  const root = join(skillsDir, 'dapr-shared', 'references');
  if (!existsSync(root)) return [];
  // Everything outside references/ is what may link into it.
  const corpus = walkMarkdown(skillsDir)
    .filter((p) => relative(root, p).startsWith('..'))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');
  const failures = [];
  for (const file of walkMarkdown(root)) {
    const rel = relative(join(skillsDir, 'dapr-shared'), file).split(sep).join('/');
    if (!corpus.includes(rel)) failures.push(`dapr-shared/${rel} -> no skill links it`);
  }
  return failures;
}
