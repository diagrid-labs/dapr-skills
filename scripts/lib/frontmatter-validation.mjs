// Cross-CLI frontmatter and description checks. No dependencies; Node.js 22+.
//
// The skills install into Claude Code, Codex CLI and Copilot CLI, and only a few
// frontmatter keys mean the same thing in all three. Descriptions are also the
// one piece of every skill that sits in context on every turn: Codex budgets its
// whole skill list at 2% of the context window (8,000 characters when the window
// is unknown) and SHORTENS DESCRIPTIONS FIRST when it overflows, which is exactly
// what breaks implicit triggering. Claude Code truncates one skill's description
// at 1,536 characters.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './skills-validation.mjs';
import { declaredTools } from './authoring-validation.mjs';

/** The only frontmatter keys a skill may use. */
export const ALLOWED_FRONTMATTER_KEYS = ['name', 'description', 'allowed-tools'];

/**
 * Support skills hold shared files and must never be picked by a model. They
 * get the keys that hide them: `disable-model-invocation` (Claude Code and
 * Copilot CLI), `user-invocable` (the same two) and `agents/openai.yaml` with
 * `policy.allow_implicit_invocation: false` (Codex CLI, which reads neither key).
 */
export const SUPPORT_SKILLS = ['dapr-shared'];
const SUPPORT_SKILL_KEYS = ['disable-model-invocation', 'user-invocable'];

/**
 * Hard limits. They fail the build, so they sit at (or just above) today's
 * values and only ratchet down. TARGET_* are the goals; going over them is
 * reported as a warning. The length targets are met, so the hard limits now
 * equal them (the total target is Codex's list budget; the hard total keeps a
 * little headroom for new skills).
 */
export const MAX_DESCRIPTION_CHARS = 400;
export const MAX_TOTAL_DESCRIPTION_CHARS = 7000;
export const TARGET_DESCRIPTION_CHARS = 400;
export const TARGET_TOTAL_DESCRIPTION_CHARS = 8000;

/**
 * Two descriptions this alike (Jaccard on distinctive words) fail the build. The
 * limit sits just above the worst pair today, the language twins that share one
 * template (check-prereq-aspire / check-prereq-dotnet, 0.90); it only ratchets
 * down. Language twins (see isLanguageTwin) are expected to read alike, so the
 * target warning skips them and flags pairs that should differ by subject.
 */
export const MAX_DESCRIPTION_SIMILARITY = 0.91;
export const TARGET_DESCRIPTION_SIMILARITY = 0.5;

const STOPWORDS = new Set(
  `a an and are as at be but by can for from has have how if in into is it its make making no not of on or
that the their them then there these this to use used uses using want wants when where which who why with
without you your they what while does do so one two both each any all more most other another new same than
rather skill skills user asks ask similar`.split(/\s+/),
);

/** Product and ecosystem words shared by construction: they rank nothing. */
const PRODUCT_WORDS = new Set(['diagrid', 'catalyst', 'dapr', 'plugin', 'instead', 'existing']);

/** Folders that are skills (have a SKILL.md), sorted. */
function skillFolders(skillsDir) {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(skillsDir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

/** Frontmatter keys of a SKILL.md, in file order (nested or list lines excluded). */
export function frontmatterKeys(text) {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!match) return null;
  const keys = [];
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):/.exec(line);
    if (kv) keys.push(kv[1]);
  }
  return keys;
}

/**
 * Check — frontmatter uses only `name`, `description` and `allowed-tools`. Any
 * other key (`model`, `disable-model-invocation`, ...) is honoured by one client
 * and ignored or rejected by another. Returns failure strings.
 */
export function checkFrontmatterKeys(skillsDir) {
  const failures = [];
  for (const name of skillFolders(skillsDir)) {
    const keys = frontmatterKeys(readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8'));
    if (keys === null) continue; // checkManifests reports a missing block
    const allowed = SUPPORT_SKILLS.includes(name) ? [...ALLOWED_FRONTMATTER_KEYS, ...SUPPORT_SKILL_KEYS] : ALLOWED_FRONTMATTER_KEYS;
    const extra = keys.filter((k) => !allowed.includes(k));
    if (extra.length > 0) {
      failures.push(
        `${name}/SKILL.md -> frontmatter keys not allowed: ${extra.join(', ')} (allowed: ${ALLOWED_FRONTMATTER_KEYS.join(', ')})`,
      );
    }
  }
  return failures;
}

/**
 * Check — every support skill is hidden from model selection in all three CLIs:
 * `disable-model-invocation: true` and `user-invocable: false` in SKILL.md, and
 * `allow_implicit_invocation: false` in agents/openai.yaml. Returns failure strings.
 */
export function checkSupportSkillsHidden(skillsDir) {
  const failures = [];
  for (const name of SUPPORT_SKILLS) {
    const md = join(skillsDir, name, 'SKILL.md');
    if (!existsSync(md)) continue;
    const fm = parseFrontmatter(readFileSync(md, 'utf8')) ?? {};
    if (fm['disable-model-invocation'] !== 'true') failures.push(`${name}/SKILL.md -> missing \`disable-model-invocation: true\` (Claude Code, Copilot CLI)`);
    if (fm['user-invocable'] !== 'false') failures.push(`${name}/SKILL.md -> missing \`user-invocable: false\` (Claude Code, Copilot CLI)`);
    const yaml = join(skillsDir, name, 'agents', 'openai.yaml');
    const text = existsSync(yaml) ? readFileSync(yaml, 'utf8') : '';
    if (!/^\s+allow_implicit_invocation:\s*false\s*$/m.test(text)) {
      failures.push(`${name}/agents/openai.yaml -> missing \`policy.allow_implicit_invocation: false\` (Codex CLI)`);
    }
  }
  return failures;
}

/**
 * Check — a description is a YAML plain scalar, and a colon followed by a space
 * ends it: the frontmatter then fails to parse in a strict client although this
 * repo's flat parser reads it. Returns failure strings.
 */
export function checkDescriptionYaml(skillsDir) {
  const failures = [];
  for (const name of skillFolders(skillsDir)) {
    const text = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8');
    const raw = /^description:[ \t]*(.*)$/m.exec(text)?.[1].trim() ?? '';
    const quoted = /^(['"])[\s\S]*\1$/.test(raw);
    if (!quoted && /: |:$/.test(raw)) {
      failures.push(`${name}/SKILL.md -> description has ': ' in an unquoted value, which is invalid YAML (rephrase it)`);
    }
  }
  return failures;
}

/** Why an `allowed-tools` entry is rejected, or null when it is fine. */
export function toolProblem(tool) {
  if (tool.startsWith('mcp__')) {
    return 'is an MCP tool of one client; keep skills independent of any MCP server';
  }
  if (/^Bash\b/.test(tool) && (tool === 'Bash' || tool.includes('*'))) {
    return 'is a wildcard shell grant; list exact commands instead';
  }
  return null;
}

/**
 * Check — `allowed-tools` holds no wildcard shell tools (`Bash`, `Bash(dotnet:*)`)
 * and no MCP tools. Exact commands such as `Bash(uname -s)` are fine. Returns
 * failure strings.
 */
export function checkAllowedTools(skillsDir) {
  const failures = [];
  for (const name of skillFolders(skillsDir)) {
    const tools = declaredTools(readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8'));
    for (const tool of tools ?? []) {
      const problem = toolProblem(tool);
      if (problem) failures.push(`${name}/SKILL.md -> allowed-tools entry \`${tool}\` ${problem}`);
    }
  }
  return failures;
}

/** { skill: description } for every skill that has one. */
export function readDescriptions(skillsDir) {
  const out = {};
  for (const name of skillFolders(skillsDir)) {
    const fm = parseFrontmatter(readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8'));
    if (fm?.description) out[name] = fm.description;
  }
  return out;
}

/**
 * Check — each description is within `maxEach` characters and all descriptions
 * together within `maxTotal`. Defaults are the hard limits; pass the TARGET_*
 * values to list what is still above the goal. Returns failure strings.
 */
export function checkDescriptionBudget(
  skillsDir,
  { maxEach = MAX_DESCRIPTION_CHARS, maxTotal = MAX_TOTAL_DESCRIPTION_CHARS } = {},
) {
  const failures = [];
  const descriptions = readDescriptions(skillsDir);
  let total = 0;
  for (const [name, d] of Object.entries(descriptions)) {
    total += d.length;
    if (d.length > maxEach) failures.push(`${name}/SKILL.md -> description is ${d.length} characters, over ${maxEach}`);
  }
  if (total > maxTotal) {
    failures.push(`skills/ -> descriptions total ${total} characters, over ${maxTotal} (Codex lists skills within ~8000 and shortens descriptions first)`);
  }
  return failures;
}

/** The words of a description that carry trigger signal. */
export function distinctiveWords(description) {
  const words = description.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w) && !PRODUCT_WORDS.has(w)));
}

/** Jaccard similarity of two descriptions' distinctive words, and what they share. */
export function descriptionSimilarity(a, b) {
  const wa = distinctiveWords(a);
  const wb = distinctiveWords(b);
  const shared = [...wa].filter((w) => wb.has(w)).sort();
  const union = new Set([...wa, ...wb]).size;
  return { similarity: union === 0 ? 0 : shared.length / union, shared };
}

const LANGUAGE_SUFFIX = /-(dotnet|python|aspire|typescript)$/;

/** Skills that differ only by a language suffix (create-workflow-dotnet / -python) read alike on purpose. */
export function isLanguageTwin(a, b) {
  return a !== b && a.replace(LANGUAGE_SUFFIX, '') === b.replace(LANGUAGE_SUFFIX, '');
}

/** Every pair of skills with its similarity, most alike first. */
export function similarityPairs(skillsDir) {
  const descriptions = readDescriptions(skillsDir);
  const names = Object.keys(descriptions);
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const { similarity, shared } = descriptionSimilarity(descriptions[names[i]], descriptions[names[j]]);
      pairs.push({ a: names[i], b: names[j], similarity, shared });
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity);
}

/**
 * Check — no two descriptions are more than `max` alike. Skills with alike
 * descriptions compete for the same trigger and the model picks by wording, not
 * subject. Returns failure strings that list the shared words.
 */
export function checkDescriptionSimilarity(
  skillsDir,
  max = MAX_DESCRIPTION_SIMILARITY,
  { ignoreLanguageTwins = false } = {},
) {
  return similarityPairs(skillsDir)
    .filter((p) => p.similarity > max && !(ignoreLanguageTwins && isLanguageTwin(p.a, p.b)))
    .map(
      (p) =>
        `${p.a} / ${p.b} -> descriptions ${Math.round(p.similarity * 100)}% alike, over ${Math.round(max * 100)}% (shared: ${p.shared.join(', ')})`,
    );
}
