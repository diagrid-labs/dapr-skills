// Validation helpers for the pub/sub skills. No dependencies; Node.js 22+.
//
// The pub/sub create and add skills build an application from the domain the
// user describes, filling in the placeholder vocabulary defined in
// skills/dapr-shared/pubsub-placeholders.md. These checks protect that
// contract: no sample domain leaks back into the instructions, every
// placeholder is defined and used, and the eval manifests stay well-formed.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { checkFamilyVocabulary, checkFamilyVocabularyLinks, FAMILIES } from './family-validation.mjs';

/** The file that defines the placeholder vocabulary, relative to skillsDir. */
export const VOCABULARY = 'dapr-shared/pubsub-placeholders.md';

/**
 * Identifiers from the order-processing scenario the pub/sub skills used to
 * scaffold by default. They are legitimate inside a worked example, and
 * nowhere else: an instruction that names one has stopped being a template.
 */
export const SAMPLE_DOMAIN = [
  'OrderPlaced',
  'OrderPublisher',
  'OrderPlacedHandler',
  'OrdersTopic',
  'OrdersDeadLetterTopic',
  'IProcessedOrders',
  'InMemoryProcessedOrders',
  'ORDERS_TOPIC',
  'ORDERS_DEAD_LETTER_TOPIC',
  'handle_order_event',
  'parse_order',
  'get_order_publisher',
  'publish_order_placed',
];

/**
 * Angle-bracketed names that are deliberately NOT part of the domain
 * vocabulary: paths, ports, app ids and the kebab-case placeholders that
 * individual component files declare and map locally (see the header of
 * dapr-pubsub-subscription.md). They describe the project or the
 * infrastructure, never the message the application publishes.
 */
// Re-exported from the family module so there is one live set, not two that drift.
export const LOCAL_PLACEHOLDERS = FAMILIES.get('pubsub').localPlaceholders;

const WORKED_EXAMPLE = /^#{1,6}\s+Worked example/im;

/** Markdown files under skillsDir that belong to a pub/sub skill. */
export function pubsubMarkdown(skillsDir) {
  const files = [];
  for (const folder of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const isPubsubSkill = /pubsub/.test(folder.name);
    const dir = join(skillsDir, folder.name);
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.md')) continue;
      const keep = isPubsubSkill || (folder.name === 'dapr-shared' && /pubsub/.test(entry));
      if (keep) files.push(join(dir, entry));
    }
  }
  return files.sort();
}

/**
 * The part of a Markdown file that is instruction rather than illustration:
 * everything before the first "Worked example" heading. A worked example shows
 * one resolved scenario on purpose, so it is exempt from the domain check.
 */
export function instructionalPart(text) {
  const match = WORKED_EXAMPLE.exec(text);
  return match ? text.slice(0, match.index) : text;
}

/**
 * Check — no sample-domain identifier appears in the instructional part of a
 * pub/sub skill file. Returns an array of failure strings "<file>:<line> -> <id>".
 */
export function checkNoSampleDomain(skillsDir) {
  const failures = [];
  for (const file of pubsubMarkdown(skillsDir)) {
    const where = relative(skillsDir, file).split(sep).join('/');
    if (where === VOCABULARY) continue; // names the identifiers in order to forbid them
    const lines = instructionalPart(readFileSync(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const id of SAMPLE_DOMAIN) {
        if (line.includes(id)) failures.push(`${where}:${index + 1} -> ${id}`);
      }
    });
  }
  return failures;
}

/**
 * Placeholder names defined in the vocabulary file, read from its tables
 * (rows that start with a single backticked `<Name>` cell).
 */
export { definedPlaceholders } from './family-validation.mjs';

// Angle-bracketed tokens that cannot be a C# generic argument or an XML tag,
// so finding one is unambiguous: it starts lowercase, or contains _ or -.
// PascalCase placeholders are covered by the "defined but unused" direction
// instead, because `<EventName>` and `<DeadLetterLogger>` are indistinguishable
// without parsing the surrounding code.
const UNAMBIGUOUS = /<([a-z][A-Za-z0-9]*[_-][A-Za-z0-9_-]*|[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+|[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)>/g;

/**
 * Check — every unambiguous placeholder used in a pub/sub file is defined in
 * the vocabulary, and every defined placeholder is used by at least one file.
 * Returns an array of failure strings.
 */
export function checkPlaceholderVocabulary(skillsDir) {
  return checkFamilyVocabulary(skillsDir, 'pubsub');
}

/**
 * Check — every pub/sub template in dapr-shared that contains a placeholder
 * links to the vocabulary file, so whoever copies it knows what to resolve.
 * Returns an array of failure strings.
 */
export function checkVocabularyLinks(skillsDir) {
  return checkFamilyVocabularyLinks(skillsDir, 'pubsub');
}

// A CEL `match` comparing a field with a number must wrap it in int(): JSON numbers are
// doubles, so an uncast comparison never fires. double() fires but breaks the convention,
// so the corpus must not show it either (see pubsub-placeholders.md).
const CEL_COMPARISON = /event\.data\.[A-Za-z_][A-Za-z0-9_]*\s*(?:>=|<=|>|<|==|!=)\s*-?\d/;
const CEL_DOUBLE = /double\s*\(\s*event\.data\./;

/**
 * Check — every CEL match example in the pub/sub corpus casts a numeric comparison with
 * int(), and none uses double(). Returns an array of failure strings.
 */
export function checkCelCasts(skillsDir) {
  const failures = [];
  for (const file of pubsubMarkdown(skillsDir)) {
    const where = relative(skillsDir, file).split(sep).join('/');
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (CEL_DOUBLE.test(line)) {
        failures.push(`${where}:${index + 1} -> double(event.data...) — use int()`);
        return;
      }
      if (CEL_COMPARISON.test(line) && !line.includes('int(event.data.')) {
        failures.push(`${where}:${index + 1} -> numeric match on event.data without int()`);
      }
    });
  }
  return failures;
}

const EVAL_KEYS = ['id', 'name', 'prompt', 'expected_output', 'files', 'expectations'];

/**
 * Check — every evals/<skill>/evals.json is valid JSON, names the folder it
 * sits in, has sequential ids from 1, and gives each case the same keys and at
 * least one expectation. Returns an array of failure strings.
 */
export function checkEvalManifests(evalsDir) {
  if (!existsSync(evalsDir)) return [];
  const failures = [];
  for (const folder of readdirSync(evalsDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const file = join(evalsDir, folder.name, 'evals.json');
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    const where = `evals/${folder.name}/evals.json`;
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      failures.push(`${where} is not valid JSON: ${err.message}`);
      continue;
    }
    if (data.skill_name !== folder.name) {
      failures.push(`${where} skill_name is "${data.skill_name}", expected "${folder.name}"`);
    }
    if (!Array.isArray(data.evals) || data.evals.length === 0) {
      failures.push(`${where} has no evals`);
      continue;
    }
    data.evals.forEach((item, index) => {
      if (item.id !== index + 1) failures.push(`${where} eval ${index + 1} has id ${item.id}`);
      const keys = Object.keys(item).sort();
      const missing = EVAL_KEYS.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !EVAL_KEYS.includes(k));
      if (missing.length) failures.push(`${where} eval ${item.id} is missing ${missing.join(', ')}`);
      if (extra.length) failures.push(`${where} eval ${item.id} has unexpected ${extra.join(', ')}`);
      if (!Array.isArray(item.expectations) || item.expectations.length === 0) {
        failures.push(`${where} eval ${item.id} has no expectations`);
      }
    });
  }
  return failures;
}
