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
  checkCelCasts,
} from './lib/pubsub-validation.mjs';
import { checkReportExampleCounts } from './lib/review-validation.mjs';
import { checkFamilyVocabulary, checkFamilyVocabularyLinks } from './lib/family-validation.mjs';
import {
  checkVerifyRuns,
  checkDeclaredTools,
  checkReviewCrossLinks,
  checkNoOrphanedShared,
} from './lib/authoring-validation.mjs';
import {
  checkFrontmatterKeys,
  checkAllowedTools,
  checkSupportSkillsHidden,
  checkDescriptionBudget,
  checkDescriptionSimilarity,
  checkDescriptionYaml,
  TARGET_DESCRIPTION_CHARS,
  TARGET_TOTAL_DESCRIPTION_CHARS,
  TARGET_DESCRIPTION_SIMILARITY,
} from './lib/frontmatter-validation.mjs';

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

// Advisory: never fails the build. Lists what is still above the target.
function warn(title, items) {
  if (items.length === 0) return;
  console.log(`WARN  ${title} (${items.length})`);
  for (const i of items) console.log(`      ${i}`);
}

report('manifests: every skill folder has a valid SKILL.md', checkManifests(skillsDir));
report('links: references resolve in the repository', checkLinks(skillsDir));
report('pubsub: no sample domain in instructions', checkNoSampleDomain(skillsDir));
report('pubsub: placeholders are defined and used', checkPlaceholderVocabulary(skillsDir));
report('pubsub: templates link the placeholder vocabulary', checkVocabularyLinks(skillsDir));
report('pubsub: CEL matches cast with int()', checkCelCasts(skillsDir));
report('workflow: placeholders are defined and used', checkFamilyVocabulary(skillsDir, 'workflow'));
report('workflow: templates link the placeholder vocabulary', checkFamilyVocabularyLinks(skillsDir, 'workflow'));
report('reviews: example Found: lines match their findings', checkReportExampleCounts(skillsDir));
report('cross-cli: frontmatter keys are name, description, allowed-tools (support skills may also hide themselves)', checkFrontmatterKeys(skillsDir));
report('cross-cli: support skills are hidden from model selection', checkSupportSkillsHidden(skillsDir));
report('cross-cli: allowed-tools has no wildcard shell or MCP tools', checkAllowedTools(skillsDir));
report('cross-cli: description length and total budget', checkDescriptionBudget(skillsDir));
report('cross-cli: descriptions are valid YAML', checkDescriptionYaml(skillsDir));
report('cross-cli: descriptions are distinct', checkDescriptionSimilarity(skillsDir));
warn(
  `cross-cli: descriptions above the target (${TARGET_DESCRIPTION_CHARS} each, ${TARGET_TOTAL_DESCRIPTION_CHARS} total)`,
  checkDescriptionBudget(skillsDir, { maxEach: TARGET_DESCRIPTION_CHARS, maxTotal: TARGET_TOTAL_DESCRIPTION_CHARS }),
);
warn(
  `cross-cli: descriptions more than ${TARGET_DESCRIPTION_SIMILARITY * 100}% alike (language twins excepted)`,
  checkDescriptionSimilarity(skillsDir, TARGET_DESCRIPTION_SIMILARITY, { ignoreLanguageTwins: true }),
);
report('evals: manifests are well-formed', checkEvalManifests(evalsDir));
report('authoring: create skills verify their output', checkVerifyRuns(skillsDir));
report('authoring: create skills declare Write and Edit', checkDeclaredTools(skillsDir));
report('authoring: create skills point at their review skills', checkReviewCrossLinks(skillsDir));
report('authoring: shared reference files are linked', checkNoOrphanedShared(skillsDir));

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
