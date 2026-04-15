# Review Report Format

Every `review-workflow-*` skill emits a report that follows the exact shape below so that multiple reviews can be diffed and composed over time.

## Severity taxonomy

- **critical** — code is incorrect or will cause stuck/broken workflows in production. Must be fixed.
- **warning** — code works today but violates a documented best practice or carries a known production risk.
- **info** — suggestion or stylistic improvement; no correctness impact.

A separate **Please verify** section collects findings the rule heuristic flagged with low confidence (for example, a name that matches a pattern but cannot be statically proven). Never mix low-confidence findings into Critical.

## Rule ids

Each rule has a stable id of the form `DWF-<AREA>-<NNN>`:

- `DWF-DET-NNN` — determinism rules (`review-workflow-determinism`)
- `DWF-ACT-NNN` — activity rules (`review-workflow-activity`)
- `DWF-MGT-NNN` — management/endpoint rules (`review-workflow-management`)

Rule ids never change once published. New rules append; deprecated rules are kept reserved.

## Output template

The skill MUST emit exactly this structure (omit empty sections — do not print "none"):

```
# Dapr Workflow review — <skill-name>

Target: <files or folders scanned>
Language: <dotnet|aspire|python>
Found: <n> critical, <n> warnings, <n> suggestions, <n> to verify

## Critical
- [DWF-DET-001] `<file>:<line>` — <one-line what>
  Why: <one-line why this is a problem>
  Fix: <one-line concrete fix, ideally referencing the safe API>

## Warnings
- [DWF-ACT-004] `<file>:<line>` — <one-line what>
  Why: <one-line why>
  Fix: <one-line fix>

## Suggestions
- [DWF-MGT-007] `<file>:<line>` — <one-line what>
  Why: <one-line why>
  Fix: <one-line fix>

## Please verify
- [DWF-DET-009] `<file>:<line>` — <one-line what, plus what to verify>

## Next steps
- <one or two short bullets pointing the user to the next review skill or to the affected files>
```

### Formatting rules

- File references use the `path/to/file.ext:line` form so editors and the Claude Code CLI can jump to the location.
- Each finding is exactly three lines (or two for "Please verify"): the bullet line, `Why:`, and `Fix:`. Keep each line under ~120 characters.
- Group findings by severity, then by rule id ascending, then by file path. This produces stable output across runs so users can diff reports.
- Do not summarize what the skill did, do not editorialize, do not emit any text after the `Next steps` section.
- If zero findings, the body is just `No issues found.` followed by `Next steps`.
