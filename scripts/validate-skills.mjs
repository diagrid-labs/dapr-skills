#!/usr/bin/env node
// Validates the skills/ folder for `npx skills add` and the Claude Code plugin.
//
//   node scripts/validate-skills.mjs                 # all checks (needs network for npx)
//   node scripts/validate-skills.mjs --skip-install  # manifests, links, dependency report only
//
// Exit code 0 when every check passes, 1 otherwise.
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  checkManifests,
  checkLinks,
  checkInstalledSet,
  dependencyReport,
  installCommand,
} from './lib/skills-validation.mjs';
import {
  checkNoSampleDomain,
  checkPlaceholderVocabulary,
  checkVocabularyLinks,
  checkEvalManifests,
} from './lib/pubsub-validation.mjs';

// Pinned on purpose; bump deliberately after checking the CLI's install layout.
export const SKILLS_CLI = 'skills@1.7.2';
const AGENTS = ['claude-code', 'codex', 'github-copilot'];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(repoRoot, 'skills');
const evalsDir = join(repoRoot, 'evals');
const skipInstall = process.argv.includes('--skip-install');

let failed = false;
function report(title, failures) {
  if (failures.length === 0) {
    console.log(`PASS  ${title}`);
    return;
  }
  failed = true;
  console.log(`FAIL  ${title} (${failures.length})`);
  for (const f of failures) console.log(`      ${f}`);
}

report('manifests: every skill folder has a valid SKILL.md', checkManifests(skillsDir));
report('links: references resolve in the repository', checkLinks(skillsDir));
report('pubsub: no sample domain in instructions', checkNoSampleDomain(skillsDir));
report('pubsub: placeholders are defined and used', checkPlaceholderVocabulary(skillsDir));
report('pubsub: templates link the placeholder vocabulary', checkVocabularyLinks(skillsDir));
report('evals: manifests are well-formed', checkEvalManifests(evalsDir));

if (!skipInstall) {
  const tmp = mkdtempSync(join(tmpdir(), 'skills-install-'));
  try {
    const { command, args, shell } = installCommand(repoRoot, AGENTS, process.platform, SKILLS_CLI);
    const result = spawnSync(command, args, {
      cwd: tmp,
      encoding: 'utf8',
      shell,
      timeout: 300_000, // fail instead of hanging when npx or the network stalls
      env: { ...process.env, DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1' },
    });
    if (result.error || result.status !== 0) {
      report('install: npx skills add', [
        result.error ? `could not run npx: ${result.error.message}` : `exit ${result.status}`,
        (result.stderr || result.stdout || '').trim(),
      ].filter(Boolean));
    } else {
      // Claude Code installs to .claude/skills; Codex and GitHub Copilot share .agents/skills.
      for (const sub of ['.claude/skills', '.agents/skills']) {
        const installed = join(tmp, sub);
        if (!existsSync(installed)) {
          report(`install: ${sub}`, ['folder not created by npx skills add']);
          continue;
        }
        report(`install: every skill installed in ${sub}`, checkInstalledSet(skillsDir, installed));
        report(`install: references resolve in ${sub}`, checkLinks(installed));
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('\nDependencies (skill -> other skills it links to, transitively):');
for (const [skill, deps] of dependencyReport(skillsDir)) {
  console.log(`  ${skill}: ${deps.length ? deps.join(', ') : '-'}`);
}

process.exit(failed ? 1 : 0);
