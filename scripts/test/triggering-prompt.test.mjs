import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt } from '../triggering-prompt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(readFileSync(join(root, 'evals/triggering/queries.json'), 'utf8'));
const own = { 'create-diagram': 'Draws diagrams.', 'review-workflow-determinism': 'Audits replay safety.' };
const other = { 'diagrid-debug': 'Debugs a Catalyst project.' };

test('prompt has every query and no expectations', () => {
  const prompt = buildPrompt(data, own, other);
  assert.equal(data.queries.length, 26);
  for (const q of data.queries) assert.ok(prompt.includes(q.query), q.query);
  for (const bad of ['expect', 'baseline', 'AMBIGUOUS"']) assert.ok(!prompt.includes(bad), bad);
  // Skill names legitimately appear in the skill list, so check the query section and rationales.
  const queries = prompt.slice(prompt.indexOf('Queries:'));
  for (const q of data.queries) {
    assert.ok(!queries.includes(q.expect), q.expect);
    assert.ok(!prompt.includes(q.rationale), q.rationale);
  }
});

test('skills are namespaced', () => {
  const prompt = buildPrompt(data, own, other);
  assert.ok(prompt.includes('dapr-skills:create-diagram:'));
  assert.ok(prompt.includes('diagrid:diagrid-debug:'));
});
