// Validation helpers for the review skills' report format. No dependencies; Node.js 22+.
//
// Every review skill emits a report whose `Found:` line must equal the findings
// printed beneath its section headings (see skills/dapr-shared/review-report-format.md).
// The example reports in the skill documentation are what a model patterns off, so an
// example whose counts drift teaches the error. This check keeps them honest.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const FOUND = /^Found: (\d+) critical, (\d+) warnings?, (\d+) suggestions?, (\d+) to verify\s*$/gm;
const SECTION = /^#{2,3} (Critical|Warnings|Suggestions|Please verify)\s*$/;
const NEXT_STEPS = /^#{2,3} Next steps\s*$/m;
const FINDING = /^- \[[A-Z]{3}-[A-Z]+-\d+\]/;
const ANY_HEADING = /^#{1,6} /;

/** Markdown files that may contain example review reports. */
function reportDocs(skillsDir) {
  const files = [];
  for (const folder of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const dir = join(skillsDir, folder.name);
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.md')) continue;
      if (folder.name.startsWith('review-') || entry.startsWith('review-')) files.push(join(dir, entry));
    }
  }
  return files.sort();
}

/**
 * Count the findings under each section of one example report. The report runs
 * from its `Found:` line to its `## Next steps`, which the format defines as the
 * last section — without that boundary the count bleeds into the next example.
 * Returns [critical, warnings, suggestions, toVerify].
 */
export function countFindings(blockText) {
  const end = NEXT_STEPS.exec(blockText);
  const block = end ? blockText.slice(0, end.index) : blockText;
  const counts = { Critical: 0, Warnings: 0, Suggestions: 0, 'Please verify': 0 };
  let section = null;
  for (const line of block.split(/\r?\n/)) {
    const heading = SECTION.exec(line);
    if (heading) {
      section = heading[1];
      continue;
    }
    if (ANY_HEADING.test(line)) {
      section = null;
      continue;
    }
    if (section && FINDING.test(line)) counts[section] += 1;
  }
  return [counts.Critical, counts.Warnings, counts.Suggestions, counts['Please verify']];
}

/**
 * Check — every example report in the review skills' documentation has a `Found:`
 * line that matches the findings printed beneath its headings.
 * Returns an array of failure strings.
 */
export function checkReportExampleCounts(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  const failures = [];
  const labels = ['critical', 'warnings', 'suggestions', 'to verify'];
  for (const file of reportDocs(skillsDir)) {
    const text = readFileSync(file, 'utf8');
    const where = relative(skillsDir, file).split(sep).join('/');
    FOUND.lastIndex = 0;
    let match;
    while ((match = FOUND.exec(text)) !== null) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      const claimed = match.slice(1, 5).map(Number);
      const actual = countFindings(text.slice(match.index + match[0].length));
      for (let i = 0; i < 4; i += 1) {
        if (claimed[i] !== actual[i]) {
          failures.push(`${where}:${line} -> says ${claimed[i]} ${labels[i]}, ${actual[i]} printed`);
        }
      }
    }
  }
  return failures;
}
