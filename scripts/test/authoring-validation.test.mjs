import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  listCreateSkills,
  verifySection,
  checkVerifyRuns,
  BUILD_EXEMPT,
  declaredTools,
  checkDeclaredTools,
  reviewFamily,
  checkReviewCrossLinks,
  checkNoOrphanedShared,
} from '../lib/authoring-validation.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'authoring-validation-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const skill = (name, body) => `---\nname: ${name}\ndescription: Does ${name} things.\n---\n\n${body}\n`;
const verify = (lead, steps) => `## Verify\n\n**IMPORTANT: After Project Setup you MUST ${lead}:**\n\n${steps}\n\n## Create README.md\n`;

test('listCreateSkills returns only create- folders, sorted', (t) => {
  const dir = fixture({
    'create-b/SKILL.md': skill('create-b', ''),
    'create-a/SKILL.md': skill('create-a', ''),
    'add-thing/SKILL.md': skill('add-thing', ''),
    'review-thing/SKILL.md': skill('review-thing', ''),
    'dapr-shared/SKILL.md': skill('dapr-shared', ''),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(listCreateSkills(dir), ['create-a', 'create-b']);
});

test('verifySection extracts the Verify body and tolerates CRLF', () => {
  const lf = '# T\n\n## Verify\n\nRun `dotnet build`.\n\n## Create README.md\n\nlater\n';
  assert.match(verifySection(lf), /Run `dotnet build`\./);
  assert.doesNotMatch(verifySection(lf), /later/);
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.match(verifySection(crlf), /Run `dotnet build`\./);
  assert.equal(verifySection('# T\n\nno verify here\n'), null);
});

test('checkVerifyRuns passes when the section says run and builds', (t) => {
  const dir = fixture({
    'create-good/SKILL.md': skill('create-good', verify('run these exact verification instructions', '1. Run `dotnet build` on the solution. It must succeed; fix any errors and rebuild.')),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkVerifyRuns(dir), []);
});

test('checkVerifyRuns reports a Verify section that only shows instructions', (t) => {
  const dir = fixture({
    'create-shows/SKILL.md': skill('create-shows', verify('show these exact verification instructions', '1. Run `dotnet build` on the csproj file.')),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkVerifyRuns(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /create-shows\/SKILL\.md -> Verify tells the agent to "show" instructions; it must run them/);
});

test('checkVerifyRuns reports a Verify section with no build or compile command', (t) => {
  const dir = fixture({
    'create-thin/SKILL.md': skill('create-thin', verify('run these exact verification instructions', '1. Run `uv venv`.\n2. Run `uv sync`.')),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkVerifyRuns(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /no command that compiles or builds/);
});

test('checkVerifyRuns reports a reworded "show" that evades the literal phrase', (t) => {
  const dir = fixture({
    'create-reworded/SKILL.md': skill('create-reworded', verify('show the user these exact verification instructions', '1. Run `dotnet build` on the csproj file.')),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.notDeepEqual(checkVerifyRuns(dir), []);
});

test('checkVerifyRuns reports a Verify that tells the agent to hand the build to the user', (t) => {
  const dir = fixture({
    'create-handoff/SKILL.md': skill('create-handoff', verify('run these exact verification instructions', '1. Instruct the user to run `dotnet build` themselves.')),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.notDeepEqual(checkVerifyRuns(dir), []);
});

test('checkVerifyRuns does not accept an optional getDiagnostics line as the build', (t) => {
  const dir = fixture({
    'create-diag/SKILL.md': skill('create-diag', verify('run these exact verification instructions', '1. Run `uv venv` then `uv sync`.\n2. When `mcp__ide__getDiagnostics` is available, check the files.')),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.match(checkVerifyRuns(dir).join('\n'), /no command that compiles or builds/);
});

test('checkVerifyRuns reports a create skill with no Verify section', (t) => {
  const dir = fixture({ 'create-none/SKILL.md': skill('create-none', '## Overview\n\nnothing else') });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.match(checkVerifyRuns(dir)[0], /has no `## Verify` section/);
});

test('checkVerifyRuns exempts a skill listed in BUILD_EXEMPT and states the reason', (t) => {
  const name = [...BUILD_EXEMPT.keys()][0];
  const dir = fixture({ [`${name}/SKILL.md`]: skill(name, '## Overview\n\nno verify by design') });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkVerifyRuns(dir), []);
  assert.match(BUILD_EXEMPT.get(name), /does not run builds/);
});

test('checkVerifyRuns ignores add and review skills', (t) => {
  const dir = fixture({
    'add-thing/SKILL.md': skill('add-thing', '## Phase 6: Final verification\n\nRun `dotnet build`.'),
    'review-thing/SKILL.md': skill('review-thing', '## Overview\n\nread-only'),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkVerifyRuns(dir), []);
});

const frontMatter = (name, tools) =>
  `---\nname: ${name}\ndescription: d\n` + (tools === null ? '' : `allowed-tools:\n${tools.map((x) => `  - ${x}`).join('\n')}\n`) + '---\n\nbody\n';

test('declaredTools reads the allowed-tools list, and returns null when there is no key', () => {
  assert.deepEqual(declaredTools(frontMatter('x', ['Write', 'Bash(dotnet:*)'])), ['Write', 'Bash(dotnet:*)']);
  // null means "no allowed-tools key", which the caller skips. An empty array would
  // mean "the key is there and declares nothing", which is a finding, not a skip.
  assert.equal(declaredTools(frontMatter('x', null)), null);
  assert.equal(declaredTools('# no front matter\n'), null);
});

test('declaredTools stops at the next front-matter key', () => {
  const text = '---\nname: x\ndescription: d\nallowed-tools:\n  - Write\nmodel: opus\n---\n\nbody\n';
  assert.deepEqual(declaredTools(text), ['Write']);
});

test('checkDeclaredTools passes when a create skill declares Write and Edit', (t) => {
  const dir = fixture({ 'create-ok/SKILL.md': frontMatter('create-ok', ['Write', 'Edit']) });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkDeclaredTools(dir), []);
});

test('checkDeclaredTools reports a create skill missing Write or Edit', (t) => {
  const dir = fixture({ 'create-bad/SKILL.md': frontMatter('create-bad', ['Bash(dotnet:*)']) });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkDeclaredTools(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /create-bad\/SKILL\.md -> creates files but does not declare Write, Edit/);
});

test('checkDeclaredTools ignores a skill with no allowed-tools key at all', (t) => {
  const dir = fixture({ 'create-open/SKILL.md': frontMatter('create-open', null) });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkDeclaredTools(dir), []);
});

test('declaredTools reads a zero-indent YAML block list', () => {
  const text = '---\nname: x\ndescription: d\nallowed-tools:\n- Bash(dotnet:*)\n- Read\n---\n\nbody\n';
  assert.deepEqual(declaredTools(text), ['Bash(dotnet:*)', 'Read']);
});

test('declaredTools reads a flow-style list', () => {
  const text = '---\nname: x\ndescription: d\nallowed-tools: [Bash(dotnet:*), Read]\n---\n\nbody\n';
  assert.deepEqual(declaredTools(text), ['Bash(dotnet:*)', 'Read']);
});

test('declaredTools tolerates a UTF-8 BOM before the front matter', () => {
  const text = '﻿---\nname: x\ndescription: d\nallowed-tools:\n  - Write\n---\n\nbody\n';
  assert.deepEqual(declaredTools(text), ['Write']);
});

test('checkDeclaredTools reports zero-indent, flow-style and BOM skills that omit Write and Edit', (t) => {
  const dir = fixture({
    'create-zero/SKILL.md': '---\nname: create-zero\ndescription: d\nallowed-tools:\n- Bash(dotnet:*)\n---\n\nbody\n',
    'create-flow/SKILL.md': '---\nname: create-flow\ndescription: d\nallowed-tools: [Bash(dotnet:*)]\n---\n\nbody\n',
    'create-bom/SKILL.md': '﻿---\nname: create-bom\ndescription: d\nallowed-tools:\n  - Bash(dotnet:*)\n---\n\nbody\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(checkDeclaredTools(dir).length, 3);
});

test('reviewFamily maps a create skill to its review prefix', () => {
  assert.equal(reviewFamily('create-workflow-dotnet'), 'review-workflow-');
  assert.equal(reviewFamily('create-workflow-from-diagram'), 'review-workflow-');
  assert.equal(reviewFamily('create-agent-python'), 'review-agent-');
  assert.equal(reviewFamily('create-pubsub-dotnet'), 'review-pubsub-');
  assert.equal(reviewFamily('create-something-else'), '');
});

test('checkReviewCrossLinks passes when the skill names a review skill of its family', (t) => {
  const dir = fixture({
    'create-workflow-x/SKILL.md': skill('create-workflow-x', 'Next steps: run `review-workflow-determinism`.'),
    'review-workflow-determinism/SKILL.md': skill('review-workflow-determinism', 'audit'),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkReviewCrossLinks(dir), []);
});

test('checkReviewCrossLinks reports a create skill that names none', (t) => {
  const dir = fixture({
    'create-workflow-x/SKILL.md': skill('create-workflow-x', 'No pointer to any audit skill.'),
    'review-workflow-determinism/SKILL.md': skill('review-workflow-determinism', 'audit'),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkReviewCrossLinks(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /create-workflow-x\/SKILL\.md -> never names a review-workflow- skill/);
});

test('checkReviewCrossLinks does not require a link when the family has no review skills', (t) => {
  const dir = fixture({ 'create-workflow-x/SKILL.md': skill('create-workflow-x', 'nothing') });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkReviewCrossLinks(dir), []);
});

test('checkReviewCrossLinks never demands a create skill for an unmatched review skill', (t) => {
  const dir = fixture({ 'review-workflow-management/SKILL.md': skill('review-workflow-management', 'audit') });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkReviewCrossLinks(dir), []);
});

test('checkNoOrphanedShared passes when every shared reference file is linked', (t) => {
  const dir = fixture({
    'dapr-shared/references/core/determinism.md': '# determinism\n',
    'review-workflow-determinism/REFERENCE.md': 'See [determinism](../dapr-shared/references/core/determinism.md).\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkNoOrphanedShared(dir), []);
});

test('checkNoOrphanedShared reports a reference file nothing links', (t) => {
  const dir = fixture({
    'dapr-shared/references/core/determinism.md': '# determinism\n',
    'dapr-shared/references/core/orphan.md': '# orphan\n',
    'review-workflow-determinism/REFERENCE.md': 'See [determinism](../dapr-shared/references/core/determinism.md).\n',
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkNoOrphanedShared(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /references\/core\/orphan\.md -> no skill links it/);
});

test('checkNoOrphanedShared ignores a repo with no references folder', (t) => {
  const dir = fixture({ 'create-x/SKILL.md': '# x\n' });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkNoOrphanedShared(dir), []);
});
