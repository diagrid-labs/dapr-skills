# Review Report Format

Every `review-workflow-*` and `review-agent-*` skill emits a report that follows the exact shape below so that multiple reviews can be diffed and composed over time.

## Severity taxonomy

- **critical** — code is incorrect or will cause stuck/broken workflows or unsafe agents in production. Must be fixed.
- **warning** — code works today but violates a documented best practice or carries a known production risk.
- **info** — suggestion or stylistic improvement; no correctness impact.

A separate **Please verify** section collects findings the rule heuristic flagged with low confidence (for example, a name that matches a pattern but cannot be statically proven). Never mix low-confidence findings into Critical.

## Rule ids

Each rule has a stable id of the form `<PREFIX>-<AREA>-<NNN>`. Two prefix families are in use:

**Workflow reviews** (`DWF-*`):

- `DWF-DET-NNN` — determinism rules (`review-workflow-determinism`)
- `DWF-ACT-NNN` — activity rules (`review-workflow-activity`)
- `DWF-MGT-NNN` — management/endpoint rules (`review-workflow-management`)

**Agent reviews** (`DAG-*`):

- `DAG-TOOL-NNN` — agent tool rules (`review-agent-tools`)
- `DAG-MEM-NNN` — agent memory and state-store rules (`review-agent-memory`)
- `DAG-ORCH-NNN` — multi-agent orchestration rules (`review-agent-orchestration`)
- `DAG-OBS-NNN` — agent observability rules (`review-agent-observability`)

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
- [DAG-MEM-003] `<file>:<line>` — <one-line what, plus what to verify>

## Next steps
- <one or two short bullets pointing the user to the next review skill or to the affected files>
```

### Formatting rules

- File references use the `path/to/file.ext:line` form so editors and the Claude Code CLI can jump to the location.
- Each finding is exactly three lines (or two for "Please verify"): the bullet line, `Why:`, and `Fix:`. Keep each line under ~120 characters.
- Group findings by severity, then by rule id ascending, then by file path. This produces stable output across runs so users can diff reports.
- Do not summarize what the skill did, do not editorialize, do not emit any text after the `Next steps` section.
- If zero findings, the body is just `No issues found.` followed by `Next steps`.
