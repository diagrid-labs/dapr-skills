import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { countFindings, checkReportExampleCounts } from '../lib/review-validation.mjs';

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'review-validation-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const report = ({ found, body }) => `# Dapr review — review-x\n\nFound: ${found}\n\n${body}\n## Next steps\n- Run the next skill.\n`;

test('countFindings counts findings per section and stops at Next steps', () => {
  const text = [
    '## Critical',
    '- [DPS-PUB-001] `a.cs:1` — one',
    '- [DPS-PUB-002] `a.cs:2` — two',
    '## Warnings',
    '- [DPS-PUB-006] `a.cs:3` — three',
    '## Next steps',
    '- [DPS-PUB-999] this bullet is after the report and must not count',
  ].join('\n');
  assert.deepEqual(countFindings(text), [2, 1, 0, 0]);
});

test('countFindings does not bleed into a following example', () => {
  const text = [
    '## Critical',
    '- [DPS-PUB-001] `a.cs:1` — one',
    '## Next steps',
    '- next',
    '',
    '## Python worked example',
    '## Critical',
    '- [DPS-PUB-004] `b.py:7` — belongs to the next example',
  ].join('\n');
  assert.deepEqual(countFindings(text), [1, 0, 0, 0]);
});

test('countFindings counts two findings sharing a rule id as two', () => {
  const text = ['## Critical', '- [DPS-PUB-004] `a.py:1` — one', '- [DPS-PUB-004] `a.py:2` — two', '## Next steps'].join('\n');
  assert.deepEqual(countFindings(text), [2, 0, 0, 0]);
});

test('checkReportExampleCounts passes when every example agrees with its bullets', (t) => {
  const dir = fixture({
    'review-thing/REFERENCE.md': report({
      found: '1 critical, 2 warnings, 0 suggestions, 1 to verify',
      body: [
        '## Critical',
        '- [DWF-DET-001] `a.cs:1` — x',
        '## Warnings',
        '- [DWF-DET-002] `a.cs:2` — y',
        '- [DWF-DET-003] `a.cs:3` — z',
        '## Please verify',
        '- [DWF-DET-004] `a.cs:4` — q',
      ].join('\n'),
    }),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkReportExampleCounts(dir), []);
});

test('checkReportExampleCounts reports a Found line that undercounts its bullets', (t) => {
  const dir = fixture({
    'review-thing/REFERENCE.md': report({
      found: '1 critical, 1 warnings, 0 suggestions, 0 to verify',
      body: ['## Critical', '- [DWF-DET-001] `a.cs:1` — x', '## Warnings', '- [DWF-DET-002] `a.cs:2` — y', '- [DWF-DET-003] `a.cs:3` — z'].join('\n'),
    }),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkReportExampleCounts(dir);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /says 1 warnings, 2 printed/);
});

test('checkReportExampleCounts reports every mismatched column', (t) => {
  const dir = fixture({
    'review-thing/REFERENCE.md': report({
      found: '0 critical, 0 warnings, 0 suggestions, 0 to verify',
      body: ['## Critical', '- [DWF-DET-001] `a.cs:1` — x', '## Suggestions', '- [DWF-DET-002] `a.cs:2` — y'].join('\n'),
    }),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const failures = checkReportExampleCounts(dir).join('\n');
  assert.match(failures, /says 0 critical, 1 printed/);
  assert.match(failures, /says 0 suggestions, 1 printed/);
});

test('checkReportExampleCounts accepts the singular "1 suggestion" form and clean reports', (t) => {
  const dir = fixture({
    'review-thing/REFERENCE.md':
      report({ found: '0 critical, 0 warnings, 1 suggestion, 0 to verify', body: '## Suggestions\n- [DWF-DET-002] `a.cs:2` — y' }) +
      report({ found: '0 critical, 0 warnings, 0 suggestions, 0 to verify', body: 'No issues found.\n' }),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkReportExampleCounts(dir), []);
});

test('checkReportExampleCounts ignores skills that are not review skills', (t) => {
  const dir = fixture({
    'create-thing/REFERENCE.md': report({ found: '9 critical, 0 warnings, 0 suggestions, 0 to verify', body: '## Critical\n' }),
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(checkReportExampleCounts(dir), []);
});

test('checkReportExampleCounts ignores a missing skills folder', () => {
  assert.deepEqual(checkReportExampleCounts(join(tmpdir(), 'review-validation-no-such-dir')), []);
});
