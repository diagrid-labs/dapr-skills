# Review Report Format

Every `review-workflow-*`, `review-agent-*` and `review-pubsub-*` skill emits a report that follows the exact shape below so that multiple reviews can be diffed and composed over time.

## Severity taxonomy

- **critical** — code is incorrect or will cause stuck/broken workflows or unsafe agents in production. Must be fixed.
- **warning** — code works today but violates a documented best practice or carries a known production risk.
- **info** — suggestion or stylistic improvement; no correctness impact.

A separate **Please verify** section collects findings the rule heuristic flagged with low confidence (for example, a name that matches a pattern but cannot be statically proven). Never mix low-confidence findings into Critical.

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
Language: <dotnet|aspire|python>
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
- [DWF-MGT-007] `<file>:<line>` — <one-line what>
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
- Commands and files in `Next steps` must exist in the reviewed project. Do not tell the user to run a script, compose file or endpoint the project does not have; point to the skill or doc that creates it instead.
- The report is the whole reply. The `# Dapr review` heading comes first; the only text allowed before it is a single `Reviewing <path>` scope line. If the user asked a question, answer it inside the report — through the findings, or in one `Next steps` bullet when the answer is "this is expected" — never in prose above the heading.
- Group findings by severity, then by rule id ascending, then by file path. This produces stable output across runs so users can diff reports.
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
- <one or two short bullets: widen or correct the scope, or point to the review skill that covers the files that were found>
```

Example reasons: `no workflow files found in <scope_root>`, `no tool definitions found`, `single-agent project, orchestration rules do not apply`. This `Nothing to review:` line is the only line in a report that may appear without a rule id. A missing file is reported as a rule finding only when a checklist defines a rule for it (for example `DWF-MGT-001` for a missing `/start` endpoint inside a management file that was found).
