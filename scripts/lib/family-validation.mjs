// Vocabulary checks shared by the skill families. No dependencies; Node.js 22+.
//
// Each family pins its templates to one vocabulary file so a naming rule is
// stated once and enforced, rather than conveyed by example and drifting.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';

export const FAMILIES = new Map([
  [
    'pubsub',
    {
      label: 'pub/sub',
      vocabulary: 'dapr-shared/pubsub-placeholders.md',
      localPlaceholders: new Set([
        'app-id',
        'dead-letter-topic',
        'http-file',
        'project-path',
        'publisher-dapr-http-port',
        'publisher-port',
        'pubsub-name',
        'route-prefix',
        'scope_root',
        'solution-path',
        'subscriber-app-id',
        'subscriber-port',
      ]),
    },
  ],
  [
    'workflow',
    {
      label: 'workflow',
      vocabulary: 'dapr-shared/workflow-placeholders.md',
      // A dapr-shared file named agent-* belongs to the agent family even when
      // its name contains "workflow" (agent-statestore-workflow.md).
      sharedExclude: /^agent-/,
      // Workflow templates named after the SDK type rather than the family.
      sharedFiles: new Set(['dotnet-activity-class.md', 'dotnet-models.md']),
      localPlaceholders: new Set([
        'agent-name',
        'app-id',
        'app-port',
        'branch-name',
        'component-name',
        'event-name',
        'http-file',
        'instance-id',
        'jobName',
        'new_input',
        'project-name-kebab',
        'project-path',
        'scope_root',
        'solution-path',
        'workflow-route',
        // create-workflow-from-diagram/prompts/** is a prompt corpus with its own
        // placeholder language: IR schema fields, and per-language casings of the
        // authoring names. It is scanned (so <ActivityName> there is still checked)
        // but these tokens are local to it.
        'activityFn',
        'activity_fn',
        'data_object_id',
        'id_of_the_first_actual_task_or_gateway',
        'next_element_id',
        'participant_id',
        'refactored_code',
        'snake_case_label',
        'step_description',
        'step_number',
        'workflowName',
        'workflow_fn',
      ]),
    },
  ],
]);

// Unambiguous placeholder tokens: they start lowercase, or contain _ or -, so
// they can never be a C# generic argument or an XML tag.
const UNAMBIGUOUS =
  /<([a-z][A-Za-z0-9]*[_-][A-Za-z0-9_-]*|[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+|[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)>/g;

/** Every .md under a directory, recursively, as absolute paths. */
function walkMarkdown(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walkMarkdown(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}

/**
 * Markdown files belonging to one family: everything under its skill folders
 * (recursively), plus the shared templates it owns. A shared template is owned
 * either because its filename contains the family word, or because the family
 * lists it in `sharedFiles` — several workflow templates (dotnet-models.md,
 * dotnet-activity-class.md) are named after the SDK type, not the family, and
 * would otherwise go unchecked.
 */
export function familyMarkdown(skillsDir, family) {
  const config = FAMILIES.get(family);
  const owned = config.sharedFiles ?? new Set();
  const files = [];
  for (const folder of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const dir = join(skillsDir, folder.name);
    if (folder.name === 'dapr-shared') {
      for (const entry of readdirSync(dir)) {
        if (!entry.endsWith('.md')) continue;
        const byName = entry.includes(family) && !(config.sharedExclude && config.sharedExclude.test(entry));
        if (byName || owned.has(entry)) files.push(join(dir, entry));
      }
      continue;
    }
    if (folder.name.includes(family)) files.push(...walkMarkdown(dir));
  }
  return files.sort();
}

/**
 * Does `<name>` appear in the text as a placeholder rather than as a generic
 * type argument? A generic is preceded by an identifier character (`Task<T>`,
 * `ILogger<T>`); a placeholder stands alone or follows whitespace, punctuation
 * or another placeholder's closing bracket.
 */
export function placeholderUsed(text, name) {
  const token = `<${name}>`;
  let from = 0;
  for (;;) {
    const at = text.indexOf(token, from);
    if (at === -1) return false;
    const before = at === 0 ? '' : text[at - 1];
    if (!/[A-Za-z0-9_]/.test(before)) return true;
    from = at + 1;
  }
}

/** Placeholder names defined in a vocabulary file's tables. */
export function definedPlaceholders(vocabularyText) {
  const names = new Set();
  for (const line of vocabularyText.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    for (const m of line.split('|')[1].matchAll(/`<([A-Za-z_][A-Za-z0-9_-]*)>`/g)) names.add(m[1]);
  }
  return names;
}

/** Check — every placeholder a family uses is defined, and every defined one is used. */
export function checkFamilyVocabulary(skillsDir, family) {
  const config = FAMILIES.get(family);
  const vocabularyPath = join(skillsDir, config.vocabulary);
  if (!existsSync(vocabularyPath)) return [`${config.vocabulary} is missing`];
  const defined = definedPlaceholders(readFileSync(vocabularyPath, 'utf8'));
  if (defined.size === 0) return [`${config.vocabulary} defines no placeholders`];

  const failures = [];
  const used = new Set();
  for (const file of familyMarkdown(skillsDir, family)) {
    const where = relative(skillsDir, file).split(sep).join('/');
    const text = readFileSync(file, 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      for (const m of line.matchAll(UNAMBIGUOUS)) {
        if (where !== config.vocabulary) used.add(m[1]);
        if (config.localPlaceholders.has(m[1])) continue;
        if (where !== config.vocabulary && !defined.has(m[1])) {
          failures.push(`${where}:${index + 1} -> <${m[1]}> is not defined in ${config.vocabulary}`);
        }
      }
    });
    if (where === config.vocabulary) continue;
    // `<Name>` only counts as a use when it is a placeholder, not when it is a
    // C# generic argument that happens to spell the same word: `Task<WorkflowOutput>`
    // is the hard-coded sample type, and scoring it as a use lets a template keep
    // teaching by example while the check reports the placeholder as used.
    for (const name of defined) if (placeholderUsed(text, name)) used.add(name);
  }
  for (const name of [...defined].sort()) {
    if (!used.has(name)) failures.push(`${config.vocabulary} defines <${name}> but no ${config.label} file uses it`);
  }
  return failures;
}

/** Check — every shared template using placeholders links its vocabulary. */
export function checkFamilyVocabularyLinks(skillsDir, family) {
  const config = FAMILIES.get(family);
  const failures = [];
  for (const file of familyMarkdown(skillsDir, family)) {
    const where = relative(skillsDir, file).split(sep).join('/');
    if (!where.startsWith('dapr-shared/') || where === config.vocabulary) continue;
    const text = readFileSync(file, 'utf8');
    if ([...text.matchAll(UNAMBIGUOUS)].length === 0) continue;
    if (!text.includes(basename(config.vocabulary))) {
      failures.push(`${where} uses placeholders but does not link ${basename(config.vocabulary)}`);
    }
  }
  return failures;
}
