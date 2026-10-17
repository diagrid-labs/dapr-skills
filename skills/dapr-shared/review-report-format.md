# Review Report Format

Every `review-workflow-*`, `review-agent-*` and `review-pubsub-*` skill emits a report that follows the exact shape below so that multiple reviews can be diffed and composed over time.

## Severity taxonomy

- **critical** — code is incorrect or will cause stuck/broken workflows or unsafe agents in production. Must be fixed.
- **warning** — code works today but violates a documented best practice or carries a known production risk.
- **info** — suggestion or stylistic improvement; no correctness impact.

A separate **Please verify** section collects findings the rule heuristic flagged with low confidence (for example, a name that matches a pattern but cannot be statically proven). Never mix low-confidence findings into Critical.

**A rule's declared severity fixes the section it is reported in. Do not re-judge it per finding.** The
severity column of the rule table is the whole decision:

| Declared severity | Section |
|---|---|
| critical | `## Critical` |
| warning | `## Warnings` |
| info | `## Suggestions` |
| any severity marked "reported under Please verify" | `## Please verify` |

The descriptions above explain why a rule carries the severity it does; they are not an invitation to
move a finding. A `warning` rule stays in `## Warnings` even when the offending code looks like a typo,
a one-character fix or a stylistic nit — the severity reflects the consequence, not the size of the fix.
Moving a finding also makes the `Found:` counts disagree with the rule tables, which is what makes two
reports of the same project impossible to diff.

## Rule ids

Each rule has a stable id of the form `<PREFIX>-<AREA>-<NNN>`. Three prefix families are in use:

**Workflow reviews** (`DWF-*`):

- `DWF-DET-NNN` — determinism rules (`review-workflow-determinism`)
- `DWF-ACT-NNN` — activity rules (`review-workflow-activity`)
- `DWF-MGT-NNN` — management/endpoint rules (`review-workflow-management`)

**Agent reviews** (`DAG-*`):

- `DAG-TOOL-NNN` — agent tool rules (`review-agent-tools`)
- `DAG-MEM-NNN` — agent memory and state-store rules (`review-agent-memory`)
- `DAG-ORCH-NNN` — multi-agent orchestration rules (`review-agent-orchestration`)
- `DAG-OBS-NNN` — agent observability rules (`review-agent-observability`)

**Pub/sub reviews** (`DPS-*`):

- `DPS-PUB-NNN` — publishing rules (`review-pubsub-publishing`)
- `DPS-SUB-NNN` — subscription and handler rules (`review-pubsub-subscriptions`)
- `DPS-CFG-NNN` — component, subscription, resiliency and run-configuration rules (`review-pubsub-components`)

Rule ids never change once published. New rules append; deprecated rules are kept reserved.

## Output template

The skill MUST emit exactly this structure (omit empty sections — do not print "none"):

```
# Dapr review — <skill-name>

Target: <files or folders scanned>
Language: <dotnet|aspire|python> (agent reviews report only dotnet or python)
Found: <n> critical, <n> warnings, <n> suggestions, <n> to verify

## Critical
- [DWF-DET-001] `<file>:<line>` — <one-line what>
  Why: <one-line why this is a problem>
  Fix: <one-line concrete fix, ideally referencing the safe API>

## Warnings
- [DAG-TOOL-004] `<file>:<line>` — <one-line what>
  Why: <one-line why>
  Fix: <one-line fix>

## Suggestions
- [DWF-MGT-015] `<file>:<line>` — <one-line what>
  Why: <one-line why>
  Fix: <one-line fix>

## Please verify
- [DAG-MEM-003] `<file>:<line>` — <one-line what>
  Verify: <one-line what the user should check to confirm or dismiss it>

## Next steps
- <one or two short bullets pointing the user to the next review skill or to the affected files>
```

### Formatting rules

- File references use the `path/to/file.ext:line` form so editors and the Claude Code CLI can jump to the location.
- Each finding is exactly three lines: the bullet line, `Why:` and `Fix:`. A "Please verify" finding is exactly two lines: the bullet line and `Verify:`. Keep each line under ~120 characters.
- The `:line` in a file reference is the line of the offending code itself (the argument, assignment or call that breaks the rule), not the first line of the enclosing statement. For example, a topic loop on `publish_topic="x"` cites the `publish_topic=` line, not the `serve(` line above it.
- Only cite files that exist. A finding about a missing file (no `README.md`, no tracing Configuration) cites the existing file that should reference or contain it — usually `dapr.yaml` — or the project folder without a line (`<folder>/`), and names the missing file in the `what` text.
- A finding about something missing inside a file that exists (a missing key, endpoint, section or attribute) cites the first line of the construct that should contain it: the component's `metadata.name` line, the app entry in `dapr.yaml`, or the class or method declaration. Use line 1 only when the file has no such construct.
- A rule that reports once for several sites (its checklist says "report once", or it fires on a repeated literal) cites the first site, ordered by file path and then line, and names the other sites in the `what` text. A duplicate (two apps with the same port or id) cites the later site and names the earlier one.
- A checklist note that asks for "a note" about a rule that is satisfied but fragile goes in one `Next steps` bullet. The report has no other place for notes.
- Commands and files in `Next steps` must exist in the reviewed project. Do not tell the user to run a script, compose file or endpoint the project does not have; point to the skill or doc that creates it instead.
- Clarifying questions are always allowed while a review is in progress: scope, the deployment target, or anything a checklist's confidence note says to confirm. Ask, wait for the answer, then emit the report. The question is never part of the report, and when no answer is available the checklist's default applies.
- The report is the whole reply. The `# Dapr review` heading comes first; the only text allowed before it is a single `Reviewing <path>` scope line. If the user asked a question, answer it inside the report — through the findings, or in one `Next steps` bullet when the answer is "this is expected" — never in prose above the heading.
- Group findings by severity, then by rule id ascending, then by file path. This produces stable output across runs so users can diff reports.
- **The `Found:` line is derived, never estimated.** Write the sections first, then count the `- [RULE-ID]` bullets under each of `## Critical`, `## Warnings`, `## Suggestions` and `## Please verify`, and copy those four numbers into the line. Each number must equal the bullets actually printed under its heading. Two findings that share a rule id count as two. A section with no findings is omitted and contributes `0`. Re-read the four counts against the sections before emitting the report: a `Found:` line that disagrees with its own bullets makes every downstream diff and total wrong.
- Do not summarize what the skill did, do not editorialize, do not emit any text after the `Next steps` section.
- If zero findings, the body is just `No issues found.` followed by `Next steps`.

### Nothing to review

When target detection succeeds but the calling skill has nothing to apply its rules to (for example no workflow files for a determinism review, no tool definitions for a tool review, or a single-agent project for an orchestration review), the review stops without applying any rule. This is not a finding: it carries no rule id and does not count toward the `Found:` totals. The calling skill supplies a short reason string. Emit:

```
# Dapr review — <skill-name>

Target: <scope_root>
Language: <detected language>
Found: 0 critical, 0 warnings, 0 suggestions, 0 to verify

Nothing to review: <reason supplied by the calling skill>.

## Next steps
- <one or two short bullets: widen or correct the scope, or name the review skill that covers the files that were found. Point to the project folder (for example `Activities/` or `Program.cs`) only when it exists, and omit a bullet whose files the project does not have>
```

Example reasons: `no workflow files found in <scope_root>`, `no tool definitions found`, `single-agent project, orchestration rules do not apply`. This `Nothing to review:` line is the only line in a report that may appear without a rule id. A missing file is reported as a rule finding only when a checklist defines a rule for it (for example `DWF-MGT-001` for a missing `/start` endpoint inside a management file that was found).
