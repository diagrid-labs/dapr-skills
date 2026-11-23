#!/usr/bin/env node
// Prints the cross-plugin triggering prompt (see evals/README.md, "Triggering check").
// Usage: node scripts/triggering-prompt.mjs <path to diagrid skills dir>
// Skills with `disable-model-invocation: true` (e.g. dapr-shared) are hidden from the
// model in Claude Code, so they are left out of the prompt.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDescriptions } from './lib/frontmatter-validation.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Descriptions of the skills a model can see: drops disable-model-invocation skills. */
export function visibleDescriptions(skillsDir) {
  const out = {};
  for (const [name, description] of Object.entries(readDescriptions(skillsDir))) {
    const text = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8');
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
    if (/^disable-model-invocation:\s*true\s*$/m.test(front)) continue;
    out[name] = description;
  }
  return out;
}

/** One prompt: instructions, every skill description, then the numbered queries. No expectations. */
export function buildPrompt(data, ownSkills, otherSkills) {
  // Keep only the method lines that address the model; the rest are for the grader.
  const method = data.method.filter((l) => !/expect|accept|baseline|front matter|Compare/i.test(l));
  const lines = [
    'You are choosing which skill to invoke for a request. You see only each skill\'s name and description.',
    ...method,
    'Also give a confidence for each answer: high, medium or low.',
    '',
    'Skills:',
  ];
  for (const [name, d] of Object.entries(ownSkills)) lines.push(`- dapr-skills:${name}: ${d}`);
  for (const [name, d] of Object.entries(otherSkills)) lines.push(`- diagrid:${name}: ${d}`);
  lines.push('', 'Queries:');
  data.queries.forEach((q, i) => lines.push(`${i + 1}. ${q.query}`));
  return lines.join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  let other = {};
  try { other = dir ? visibleDescriptions(dir) : {}; } catch { /* reported below */ }
  if (!dir || Object.keys(other).length === 0) {
    console.error(`No skills found in ${dir ?? '(no directory given)'}`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(join(root, 'evals/triggering/queries.json'), 'utf8'));
  process.stdout.write(buildPrompt(data, visibleDescriptions(join(root, 'skills')), other));
}
