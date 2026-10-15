import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  VOCABULARY,
  SAMPLE_DOMAIN,
  LOCAL_PLACEHOLDERS,
  pubsubMarkdown,
  instructionalPart,
  definedPlaceholders,
  checkNoSampleDomain,
  checkPlaceholderVocabulary,
  checkVocabularyLinks,
  checkEvalManifests,
} from '../lib/pubsub-validation.mjs';

/** Create a temporary folder from { 'relative/path': 'content' }. */
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'pubsub-validation-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

/** A minimal vocabulary file defining the given placeholder names. */
const vocabulary = (...names) =>
  `# Pub/sub placeholder vocabulary\n\n| Placeholder | Meaning | Example |\n|---|---|---|\n` +
  names.map((n) => `| \`<${n}>\` | the ${n} | x |\n`).join('');

const evalsJson = (skill, evals) => JSON.stringify({ skill_name: skill, evals }, null, 2);
const evalCase = (over = {}) => ({
  id: 1,
  name: 'a-case',
  prompt: 'do the thing',
  expected_output: 'the thing is done',
  files: [],
  expectations: ['it did the thing'],
  ...over,
});

test('pubsubMarkdown collects pub/sub skill files and pub/sub shared files only', (t) => {
  const dir = fixture({
    'create-pubsub-dotnet/SKILL.md': '# a',
    'create-pubsub-dotnet/REFERENCE.md': '# b',
    'create-workflow-dotnet/SKILL.md': '# c',
    'dapr-shared/dotnet-pubsub-publisher.md': '# d',
    'dapr-shared/dotnet-workflow-class.md': '# e',
    'dapr-shared/notes.txt': 'f',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const names = pubsubMarkdown(dir).map((p) => p.split(/[\\/]/).slice(-2).join('/'));
  assert.deepEqual(names, [
    'create-pubsub-dotnet/REFERENCE.md',
    'create-pubsub-dotnet/SKILL.md',
    'dapr-shared/dotnet-pubsub-publisher.md',
  ]);
});

test('instructionalPart stops at the first Worked example heading', () => {
  const text = '# Title\n\ninstructions\n\n## Worked example: one resolved scenario\n\nOrderPlaced\n';
  assert.equal(instructionalPart(text).includes('OrderPlaced'), false);
  assert.equal(instructionalPart(text).includes('instructions'), true);
  assert.equal(instructionalPart('# Title\n\nno example here\n').includes('no example here'), true);
});

test('checkNoSampleDomain passes when the sample domain appears only in a worked example', (t) => {
  const dir = fixture({
    'create-pubsub-dotnet/SKILL.md':
      '# Create\n\nAsk which event the app publishes.\n\n## Worked example\n\nOrderPlaced on the orders topic.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkNoSampleDomain(dir), []);
});

test('checkNoSampleDomain reports a sample-domain identifier in instructional content', (t) => {
  const dir = fixture({
    'dapr-shared/dotnet-pubsub-publisher.md': '# Publisher\n\nPublish an OrderPlaced event.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkNoSampleDomain(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /dotnet-pubsub-publisher\.md:3 -> OrderPlaced/);
});

test('checkNoSampleDomain covers every identifier in SAMPLE_DOMAIN', (t) => {
  const dir = fixture({
    'dapr-shared/x-pubsub.md': `# X\n\n${SAMPLE_DOMAIN.join('\n')}\n`,
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const reported = checkNoSampleDomain(dir).join('\n');
  // Every identifier is reported; OrderPlacedHandler also matches OrderPlaced,
  // so the count is at least SAMPLE_DOMAIN.length rather than equal to it.
  for (const id of SAMPLE_DOMAIN) assert.match(reported, new RegExp(`-> ${id}$`, 'm'));
});

test('definedPlaceholders reads names from the vocabulary tables', () => {
  const names = definedPlaceholders(vocabulary('EventName', 'event_name', 'root-kebab'));
  assert.deepEqual([...names].sort(), ['EventName', 'event_name', 'root-kebab']);
});

test('checkPlaceholderVocabulary passes when every placeholder is defined and used', (t) => {
  const dir = fixture({
    [VOCABULARY]: vocabulary('EventName', 'event_name'),
    'dapr-shared/a-pubsub.md': 'See pubsub-placeholders.md. Use <EventName> and <event_name>.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkPlaceholderVocabulary(dir), []);
});

test('checkPlaceholderVocabulary reports an undefined placeholder', (t) => {
  const dir = fixture({
    [VOCABULARY]: vocabulary('EventName'),
    'dapr-shared/a-pubsub.md': 'pubsub-placeholders.md — use <EventName> and <mystery_field>.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkPlaceholderVocabulary(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /<mystery_field> is not defined/);
});

test('checkPlaceholderVocabulary reports a defined placeholder nothing uses', (t) => {
  const dir = fixture({
    [VOCABULARY]: vocabulary('EventName', 'unused_thing'),
    'dapr-shared/a-pubsub.md': 'pubsub-placeholders.md — use <EventName>.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkPlaceholderVocabulary(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /defines <unused_thing> but no pub\/sub file uses it/);
});

test('checkPlaceholderVocabulary ignores C# generics and local placeholders', (t) => {
  const dir = fixture({
    [VOCABULARY]: vocabulary('EventName'),
    'dapr-shared/a-pubsub.md':
      'pubsub-placeholders.md\n\n```csharp\nITopicHandler<T>, Task<IResult>, ILogger<DeadLetterLogger>, <EventName>\n```\n' +
      `Run \`dotnet build "<solution-path>"\` and scope to <${[...LOCAL_PLACEHOLDERS][0]}>.\n`,
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkPlaceholderVocabulary(dir), []);
});

test('checkPlaceholderVocabulary reports a missing vocabulary file', (t) => {
  const dir = fixture({ 'dapr-shared/a-pubsub.md': 'no vocabulary here\n' });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.match(checkPlaceholderVocabulary(dir)[0], /is missing/);
});

test('checkVocabularyLinks requires a shared template with placeholders to link the vocabulary', (t) => {
  const dir = fixture({
    [VOCABULARY]: vocabulary('event_name'),
    'dapr-shared/linked-pubsub.md': 'See pubsub-placeholders.md — use <event_name>.\n',
    'dapr-shared/unlinked-pubsub.md': 'Use <event_name> with no pointer.\n',
    'dapr-shared/prose-pubsub.md': 'No placeholders at all.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkVocabularyLinks(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /unlinked-pubsub\.md uses placeholders but does not link/);
});

test('checkVocabularyLinks does not require the link in a skill folder', (t) => {
  const dir = fixture({
    [VOCABULARY]: vocabulary('event_name'),
    'create-pubsub-python/REFERENCE.md': 'Use <event_name>.\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkVocabularyLinks(dir), []);
});

test('checkEvalManifests passes for a well-formed manifest', (t) => {
  const dir = fixture({
    'create-pubsub-dotnet/evals.json': evalsJson('create-pubsub-dotnet', [evalCase(), evalCase({ id: 2 })]),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkEvalManifests(dir), []);
});

test('checkEvalManifests reports bad JSON, a wrong skill_name and non-sequential ids', (t) => {
  const dir = fixture({
    'broken/evals.json': '{ not json',
    'mismatch/evals.json': evalsJson('other-name', [evalCase()]),
    'gap/evals.json': evalsJson('gap', [evalCase(), evalCase({ id: 7 })]),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkEvalManifests(dir).join('\n');
  assert.match(failures, /broken\/evals\.json is not valid JSON/);
  assert.match(failures, /skill_name is "other-name", expected "mismatch"/);
  assert.match(failures, /gap\/evals\.json eval 2 has id 7/);
});

test('checkEvalManifests reports missing keys, extra keys and empty expectations', (t) => {
  const noExpectations = evalCase({ expectations: [] });
  const missing = evalCase({ id: 2 });
  delete missing.expected_output;
  const extra = evalCase({ id: 3, runs: 5 });
  const dir = fixture({ 'x/evals.json': evalsJson('x', [noExpectations, missing, extra]) });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkEvalManifests(dir).join('\n');
  assert.match(failures, /eval 1 has no expectations/);
  assert.match(failures, /eval 2 is missing expected_output/);
  assert.match(failures, /eval 3 has unexpected runs/);
});

test('checkEvalManifests ignores a missing evals folder', () => {
  assert.deepEqual(checkEvalManifests(join(tmpdir(), 'pubsub-validation-no-such-dir')), []);
});
