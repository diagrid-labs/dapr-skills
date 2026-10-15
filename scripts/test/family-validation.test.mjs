import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { FAMILIES, familyMarkdown, checkFamilyVocabulary, checkFamilyVocabularyLinks } from '../lib/family-validation.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'family-validation-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const vocabulary = (...names) =>
  '# Vocabulary\n\n| Placeholder | Meaning | Example |\n|---|---|---|\n' +
  names.map((n) => `| \`<${n}>\` | the ${n} | x |\n`).join('');

test('FAMILIES defines both the pubsub and workflow families', () => {
  assert.ok(FAMILIES.has('pubsub'));
  assert.ok(FAMILIES.has('workflow'));
  assert.equal(FAMILIES.get('workflow').vocabulary, 'dapr-shared/workflow-placeholders.md');
});

test("familyMarkdown selects only that family's files", (t) => {
  const dir = fixture({
    'create-workflow-dotnet/SKILL.md': '# a',
    'create-pubsub-dotnet/SKILL.md': '# b',
    'dapr-shared/dotnet-workflow-class.md': '# c',
    'dapr-shared/dotnet-pubsub-publisher.md': '# d',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const names = familyMarkdown(dir, 'workflow').map((p) => p.split(/[\\/]/).slice(-2).join('/'));
  assert.deepEqual(names, ['create-workflow-dotnet/SKILL.md', 'dapr-shared/dotnet-workflow-class.md']);
});

test('familyMarkdown excludes an agent- shared file whose name contains the family word', (t) => {
  const dir = fixture({
    'dapr-shared/dotnet-workflow-class.md': '# in',
    'dapr-shared/agent-statestore-workflow.md': '# out: belongs to the agent family',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const names = familyMarkdown(dir, 'workflow').map((p) => p.split(/[\\/]/).pop());
  assert.deepEqual(names, ['dotnet-workflow-class.md']);
});

test('familyMarkdown includes shared templates whose filename lacks the family word', (t) => {
  const dir = fixture({
    'dapr-shared/dotnet-workflow-class.md': '# has the word',
    'dapr-shared/dotnet-activity-class.md': '# does not, but is a workflow template',
    'dapr-shared/dotnet-models.md': '# does not, but is a workflow template',
    'dapr-shared/dotnet-pubsub-publisher.md': '# belongs to pubsub',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const names = familyMarkdown(dir, 'workflow').map((p) => p.split(/[\\/]/).pop());
  assert.deepEqual(names, ['dotnet-activity-class.md', 'dotnet-models.md', 'dotnet-workflow-class.md']);
});

test('familyMarkdown descends into subfolders of a family skill', (t) => {
  const dir = fixture({
    'create-workflow-from-diagram/SKILL.md': '# top',
    'create-workflow-from-diagram/prompts/languages/java.md': 'uses <ActivityName>',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const names = familyMarkdown(dir, 'workflow').map((p) => p.split(/[\\/]/).pop());
  assert.deepEqual(names, ['SKILL.md', 'java.md'].sort());
});

test('checkFamilyVocabulary does not count a C# generic as a use of the placeholder', (t) => {
  const dir = fixture({
    'dapr-shared/workflow-placeholders.md': vocabulary('WorkflowOutput'),
    'dapr-shared/dotnet-workflow-class.md': 'workflow-placeholders.md\n\n```csharp\npublic Task<WorkflowOutput> RunAsync()\n```\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkFamilyVocabulary(dir, 'workflow');
  assert.match(failures.join('\n'), /defines <WorkflowOutput> but no workflow file uses it/);
});

test('checkFamilyVocabulary reports an undefined placeholder in the workflow family', (t) => {
  const dir = fixture({
    'dapr-shared/workflow-placeholders.md': vocabulary('WorkflowName'),
    'dapr-shared/dotnet-workflow-class.md': 'workflow-placeholders.md — uses <WorkflowName> and <mystery_name>.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkFamilyVocabulary(dir, 'workflow');
  assert.equal(failures.length, 1);
  assert.match(failures[0], /<mystery_name> is not defined/);
});

test('checkFamilyVocabulary reports a defined placeholder nothing uses', (t) => {
  const dir = fixture({
    'dapr-shared/workflow-placeholders.md': vocabulary('WorkflowName', 'unused_thing'),
    'dapr-shared/dotnet-workflow-class.md': 'workflow-placeholders.md — uses <WorkflowName>.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.match(checkFamilyVocabulary(dir, 'workflow')[0], /defines <unused_thing> but no workflow file uses it/);
});

test('checkFamilyVocabularyLinks requires a shared template to link its vocabulary', (t) => {
  const dir = fixture({
    'dapr-shared/workflow-placeholders.md': vocabulary('workflow_name'),
    'dapr-shared/dotnet-workflow-class.md': 'uses <workflow_name> with no pointer.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.match(checkFamilyVocabularyLinks(dir, 'workflow')[0], /does not link workflow-placeholders\.md/);
});
