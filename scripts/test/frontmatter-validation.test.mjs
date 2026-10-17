import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  frontmatterKeys,
  checkFrontmatterKeys,
  toolProblem,
  checkAllowedTools,
  checkSupportSkillsHidden,
  checkDescriptionBudget,
  distinctiveWords,
  descriptionSimilarity,
  checkDescriptionSimilarity,
} from '../lib/frontmatter-validation.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'frontmatter-validation-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const skill = (name, description, extra = '') => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\nbody\n`;

test('frontmatterKeys lists top-level keys and skips list items', () => {
  assert.deepEqual(frontmatterKeys(skill('a', 'd', 'allowed-tools:\n  - Read\nmodel: opus\n')), ['name', 'description', 'allowed-tools', 'model']);
  assert.equal(frontmatterKeys('no frontmatter'), null);
});

test('checkFrontmatterKeys accepts name, description and allowed-tools', () => {
  const dir = fixture({ 'a/SKILL.md': skill('a', 'd', 'allowed-tools:\n  - Read\n') });
  assert.deepEqual(checkFrontmatterKeys(dir), []);
});

test('checkFrontmatterKeys rejects model and invocation flags', () => {
  const dir = fixture({ 'a/SKILL.md': skill('a', 'd', 'model: opus\nuser-invocable: false\n') });
  const failures = checkFrontmatterKeys(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /model, user-invocable/);
});

test('toolProblem flags wildcard shell and MCP tools only', () => {
  assert.match(toolProblem('Bash(dotnet:*)'), /wildcard/);
  assert.match(toolProblem('Bash'), /wildcard/);
  assert.match(toolProblem('mcp__ide__getDiagnostics'), /MCP/);
  assert.equal(toolProblem('Bash(uname -s)'), null);
  assert.equal(toolProblem('Write'), null);
});

test('checkAllowedTools reports each offending entry', () => {
  const dir = fixture({
    'a/SKILL.md': skill('a', 'd', 'allowed-tools:\n  - Write\n  - Bash(dapr:*)\n  - mcp__x__y\n  - Bash(uname -s)\n'),
    'b/SKILL.md': skill('b', 'd'),
  });
  assert.equal(checkAllowedTools(dir).length, 2);
});

test('checkDescriptionBudget enforces the per-skill and total limits', () => {
  const dir = fixture({ 'a/SKILL.md': skill('a', 'x'.repeat(30)), 'b/SKILL.md': skill('b', 'y'.repeat(30)) });
  assert.deepEqual(checkDescriptionBudget(dir, { maxEach: 30, maxTotal: 60 }), []);
  assert.equal(checkDescriptionBudget(dir, { maxEach: 29, maxTotal: 60 }).length, 2);
  assert.equal(checkDescriptionBudget(dir, { maxEach: 30, maxTotal: 59 }).length, 1);
});

test('distinctiveWords drops stopwords and product names', () => {
  const words = distinctiveWords('This skill creates a Dapr workflow for Diagrid Catalyst');
  assert.deepEqual([...words].sort(), ['creates', 'workflow']);
});

test('descriptionSimilarity is 1 for identical text and 0 for disjoint text', () => {
  assert.equal(descriptionSimilarity('creates workflow', 'creates workflow').similarity, 1);
  assert.equal(descriptionSimilarity('creates workflow', 'audits subscriptions').similarity, 0);
  assert.deepEqual(descriptionSimilarity('creates python workflow', 'creates dotnet workflow').shared, ['creates', 'workflow']);
});

test('checkDescriptionSimilarity names the pair and the shared words', () => {
  const dir = fixture({
    'a/SKILL.md': skill('a', 'creates workflow application locally'),
    'b/SKILL.md': skill('b', 'creates workflow application locally'),
    'c/SKILL.md': skill('c', 'audits broker subscriptions'),
  });
  const failures = checkDescriptionSimilarity(dir, 0.5);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^a \/ b/);
  assert.match(failures[0], /shared: application, creates, locally, workflow/);
});

test('checkFrontmatterKeys lets a support skill hide itself, and only a support skill', () => {
  const hide = 'disable-model-invocation: true\nuser-invocable: false\n';
  const dir = fixture({ 'dapr-shared/SKILL.md': skill('dapr-shared', 'd', hide), 'a/SKILL.md': skill('a', 'd', hide) });
  const failures = checkFrontmatterKeys(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^a\/SKILL.md/);
});

test('checkSupportSkillsHidden needs the SKILL.md flags and the Codex policy', () => {
  const hide = 'disable-model-invocation: true\nuser-invocable: false\n';
  const policy = 'policy:\n  allow_implicit_invocation: false\n';
  const ok = fixture({ 'dapr-shared/SKILL.md': skill('dapr-shared', 'd', hide), 'dapr-shared/agents/openai.yaml': policy });
  assert.deepEqual(checkSupportSkillsHidden(ok), []);
  const bare = fixture({ 'dapr-shared/SKILL.md': skill('dapr-shared', 'd') });
  assert.equal(checkSupportSkillsHidden(bare).length, 3);
  const yamlTrue = fixture({ 'dapr-shared/SKILL.md': skill('dapr-shared', 'd', hide), 'dapr-shared/agents/openai.yaml': 'policy:\n  allow_implicit_invocation: true\n' });
  assert.equal(checkSupportSkillsHidden(yamlTrue).length, 1);
});
