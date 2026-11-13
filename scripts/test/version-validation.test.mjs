import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { parseVersionTable, checkVersionPins } from '../lib/version-validation.mjs';

// The same shape as skills/dapr-shared/dapr-versions.md: one version table, then a
// retired-distribution table that carries replacements rather than versions.
const VERSIONS = `# Dapr package versions

| Package | Version | Ecosystem |
|---|---|---|
| \`Dapr.Workflow\` | 1.19.0 | nuget |
| \`Dapr.AspNetCore\` | 1.19.0 | nuget |
| \`Dapr.Client\` | 1.19.0 | nuget |
| \`Dapr.Actors\` | 1.19.0 | nuget |
| \`@dapr/dapr\` | 3.19.0 | npm |
| \`dapr\` | 1.19.0 | pypi |
| \`dapr[workflow]\` | 1.19.0 | pypi |
| \`dapr[fastapi]\` | 1.19.0 | pypi |

## Retired distributions

| Retired package | Install instead |
|---|---|
| \`dapr-ext-workflow\` | \`dapr[workflow]\` |
| \`dapr-ext-fastapi\` | \`dapr[fastapi]\` |
| \`dapr-ext-grpc\` | \`dapr[grpc]\` |
`;

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'version-validation-'));
  const all = { 'skills/dapr-shared/dapr-versions.md': VERSIONS, ...files };
  for (const [rel, content] of Object.entries(all)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

const check = (files) => {
  const dir = fixture(files);
  return checkVersionPins(join(dir, 'skills'), join(dir, 'evals'));
};

test('parseVersionTable reads package rows', () => {
  const table = parseVersionTable(VERSIONS);
  assert.equal(table.size, 8);
  assert.equal(table.get('Dapr.Workflow'), '1.19.0');
  assert.equal(table.get('@dapr/dapr'), '3.19.0');
  assert.equal(table.get('dapr'), '1.19.0');
  assert.equal(table.get('dapr[workflow]'), '1.19.0');
  // The retired table gives replacements, not versions; it must not become a version row.
  assert.equal(table.has('dapr-ext-workflow'), false);
});

test('checkVersionPins passes when every pin matches', () => {
  assert.deepEqual(
    check({
      'skills/a/SKILL.md': 'dotnet add package Dapr.Workflow --version 1.19.0\n',
      'skills/a/REFERENCE.md': '"@dapr/dapr": "3.19.0"\n\n    "dapr[workflow]==1.19.0",\n',
      'evals/a/files/App/App.csproj':
        '<PackageReference Include="Dapr.AspNetCore" Version="1.19.0" />\n',
      'evals/a/evals.json': '{"expect": "Dapr.Workflow --version 1.19.0"}\n',
    }),
    [],
  );
});

test('checkVersionPins reports a stale .NET pin', () => {
  const failures = check({
    'skills/a/SKILL.md': 'line one\ndotnet add package Dapr.Workflow --version 1.18.10\n',
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /skills\/a\/SKILL\.md:2/);
  assert.match(failures[0], /Dapr\.Workflow/);
  assert.match(failures[0], /1\.18\.10/);
  assert.match(failures[0], /1\.19\.0/);
});

test('checkVersionPins reports a stale npm pin', () => {
  const failures = check({ 'skills/a/REFERENCE.md': '"@dapr/dapr": "3.18.0"\n' });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /@dapr\/dapr/);
  assert.match(failures[0], /3\.18\.0/);
  assert.match(failures[0], /3\.19\.0/);
});

test('checkVersionPins reports a stale pypi pin', () => {
  const failures = check({
    'skills/a/REFERENCE.md': '    "dapr==1.18.0",\n',
    'skills/b/REFERENCE.md': '    "dapr[workflow]==1.18.3",\n',
  });
  assert.equal(failures.length, 2);
  const bare = failures.find((f) => f.includes('skills/a/'));
  const extra = failures.find((f) => f.includes('skills/b/'));
  assert.match(bare, /\bdapr\b/);
  assert.match(bare, /1\.18\.0/);
  // The extras coordinate is its own table row and must be named as such, not as `dapr`.
  assert.match(extra, /dapr\[workflow\]/);
  assert.match(extra, /1\.18\.3/);
});

test('checkVersionPins reports a retired dapr-ext-* pin', () => {
  const failures = check({ 'skills/a/REFERENCE.md': '    "dapr-ext-workflow==1.18.3",\n' });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /dapr-ext-workflow/);
  assert.match(failures[0], /retired/);
  assert.match(failures[0], /dapr\[workflow\]/);
});

test('checkVersionPins reports a retired pin at any version, including the current one', () => {
  const failures = check({ 'skills/a/REFERENCE.md': '    "dapr-ext-fastapi==1.19.0",\n' });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /dapr\[fastapi\]/);
});

test('checkVersionPins reports a retired package in an install command', () => {
  // The regression this check most needs to catch: re-introducing the pre-1.19 install line.
  const failures = check({
    'skills/a/REFERENCE.md': 'Run `pip install dapr dapr-ext-workflow` to get started.\n',
    'skills/b/REFERENCE.md': '- uv: `uv add "dapr-ext-fastapi"`\n',
  });
  assert.equal(failures.length, 2);
  assert.match(failures.find((f) => f.includes('skills/a/')), /dapr-ext-workflow.*retired.*dapr\[workflow\]/);
  assert.match(failures.find((f) => f.includes('skills/b/')), /dapr-ext-fastapi.*retired.*dapr\[fastapi\]/);
});

test('checkVersionPins reports a retired package pinned with any operator', () => {
  const failures = check({ 'skills/a/REFERENCE.md': 'dapr-ext-workflow>=1.18.3\n' });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /retired/);
});

test('checkVersionPins allows naming a retired package in prose', () => {
  // The migration guidance has to be able to say the old name, and `uv remove` is how you drop it.
  assert.deepEqual(
    check({
      'skills/a/REFERENCE.md': [
        'A project still carrying `dapr-ext-fastapi` is pre-1.19.',
        'Run `uv remove dapr-ext-fastapi` first so the retired package does not stay in the lock file.',
        '| `pyproject.toml` with `dapr[workflow]` (1.19+) or `dapr-ext-workflow` (pre-1.19) | `python` |',
      ].join('\n'),
    }),
    [],
  );
});

test('checkVersionPins does not check dapr-versions.md itself', () => {
  // The file that declares the rule has to be able to show what the rule forbids, the same way
  // the placeholder vocabularies are excluded from their own "undefined placeholder" check.
  const dir = fixture({
    'skills/dapr-shared/dapr-versions.md':
      VERSIONS + '\nThe check fails on `pip install dapr-ext-workflow`, on `dapr-ext-fastapi>=1.18.0`,\n' +
      'and on a stale pin such as `dapr==1.18.0`.\n',
  });
  assert.deepEqual(checkVersionPins(join(dir, 'skills'), join(dir, 'evals')), []);
});

test('checkVersionPins ignores non-Dapr versions', () => {
  assert.deepEqual(
    check({
      'skills/a/SKILL.md': [
        '"dapr-agents>=1.0.9"',
        'aspire add Aspire.Hosting.Dapr --version 13.0.0',
        'some-tool --version 1.2.0',
        // `dapr` is a pypi row; the Dapr CLI is not that package.
        'dapr --version 1.2.0',
        '"fastapi==0.118.2"',
      ].join('\n'),
    }),
    [],
  );
});

test('checkVersionPins ignores a version inside a URL or a changelog line', () => {
  assert.deepEqual(
    check({
      'skills/a/SKILL.md': [
        'See https://www.nuget.org/packages/Dapr.Workflow/1.18.10 for the release notes.',
        'Dapr.Workflow 1.18.10 was the previous pin; @dapr/dapr 3.18.0 before that.',
        'The dapr 1.18.0 release predates the extras.',
      ].join('\n'),
    }),
    [],
  );
});

test('checkVersionPins ignores a placeholder version', () => {
  // `dapr==1.18.x` is prose about whatever an existing project already pins, not a pin this repo emits.
  assert.deepEqual(
    check({
      'skills/a/REFERENCE.md': 'A `dapr==1.18.x` pin sets the version for the extra too.\n',
    }),
    [],
  );
});

test('checkVersionPins ignores eval fixture projects under files/', () => {
  // An add-skill fixture is the *input* project, deliberately older than the target: the eval proves
  // the skill offers the upgrade. Only the expectations in evals.json state what the skill must emit.
  assert.deepEqual(
    check({
      'evals/add-workflow-dotnet/files/notify-service/NotifyService.csproj':
        '<PackageReference Include="Dapr.AspNetCore" Version="1.17.9" />\n',
      'evals/add-workflow-dotnet/files/legacy/pyproject.toml.json': '{"dep": "dapr==1.18.0"}\n',
    }),
    [],
  );
});

test('checkVersionPins still checks expectations in evals.json', () => {
  const failures = check({
    'evals/create-workflow-python/evals.json':
      '{\n  "expectations": ["pyproject.toml pins dapr==1.18.0"]\n}\n',
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /evals\/create-workflow-python\/evals\.json:2/);
});

test('checkVersionPins skips build output under obj/ and bin/', () => {
  assert.deepEqual(
    check({
      'evals/a/files/App/obj/Release/App.csproj':
        '<PackageReference Include="Dapr.Workflow" Version="1.18.10" />\n',
      'evals/a/files/App/bin/Debug/expectations.json':
        '{"expect": "Dapr.Workflow --version 1.18.10"}\n',
    }),
    [],
  );
});
