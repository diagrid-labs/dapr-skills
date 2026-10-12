# Migration Assessment Report Format

Every `migrate-workflow-*` skill emits an assessment report in the shape below before touching any file, so the user can approve, adjust, or reject the plan while it's still just a report.

This format is the migration-family counterpart to [`review-report-format.md`](review-report-format.md) — same spirit (stable rule ids, scannable groups, diffable across runs), different taxonomy, because a migration finding is a *recommendation to change working code*, not a *hazard in Dapr-authored code*.

## Confidence/benefit taxonomy

- **Recommended** — a clear, high-confidence mapping onto a Dapr building block with a clear benefit (retries, mTLS, observability, portability across backing infra) and low structural risk.
- **Optional** — a valid mapping, but the net benefit is marginal relative to the change (e.g. a single one-off outbound call) or the confidence in the detected pattern is moderate. Migrate if the user wants consistency; skip without cost otherwise.
- **Not recommended** — a pattern that superficially resembles a building block candidate but is a poor fit (e.g. relational/transactional data forced into a key-value state store; a low-latency in-process call mistaken for a cross-service one). List these explicitly so the user knows they were considered and deliberately excluded, not missed.
- **Needs manual review** — a candidate was found but confidence is too low to act on automatically (dynamic dispatch, generated code, a pattern that could be either a saga step or an independent worker). Never silently promote one of these into Recommended.

## Rule ids

Each finding has a stable id of the form `MIG-<AREA>-<NNN>`:

- `MIG-INVOKE-NNN` — service invocation candidates
- `MIG-PUBSUB-NNN` — pub/sub candidates
- `MIG-BINDING-NNN` — input/output binding candidates
- `MIG-JOB-NNN` — scheduled/recurring work candidates
- `MIG-STATE-NNN` — state management candidates
- `MIG-SECRET-NNN` — secrets candidates
- `MIG-WORKFLOW-NNN` — long-running/saga orchestration candidates

Rule ids never change once published. New rules append; deprecated rules are kept reserved.

## Output template

```
# Dapr migration assessment — <repo or scope root>

Target: <files or folders scanned>
Stack: <language/framework, e.g. TypeScript / Express>
Existing Dapr adoption: <none | partial — list what's already present>
Found: <n> recommended, <n> optional, <n> not recommended, <n> needs manual review

## Recommended
- [MIG-INVOKE-001] `<file>:<line>` — <current pattern> → <building block + Dapr API>
  Why: <one-line benefit>
  Existing infra: <what backs it today, if relevant, e.g. "calls http://pricing-service:4000 directly">

## Optional
- [MIG-BINDING-004] `<file>:<line>` — <current pattern> → <building block + Dapr API>
  Why: <one-line trade-off>

## Not recommended
- [MIG-STATE-002] `<file>:<line>` — <pattern that looks like a fit but isn't>
  Why: <one-line reason to leave it alone>

## Needs manual review
- [MIG-WORKFLOW-001] `<file>:<line>` — <what was found, and what's ambiguous>

## Next steps
- <one or two short bullets: which items to confirm, and the proposed migration order>
```

### Formatting rules

- File references use the `path/to/file.ext:line` form.
- Each finding is 2–3 lines: the bullet line, `Why:`, and (for Recommended items touching an existing backend) `Existing infra:`. Keep each line under ~120 characters.
- Group findings by bucket in the order above, then by rule id ascending, then by file path.
- Do not apply any change while producing this report — it is read-only output. Applying confirmed items is a separate, later phase (see the calling skill's Execution Order).
- If zero findings in a bucket, omit that section — do not print "none" for populated categories, but do state plainly if the whole scan found nothing to migrate.
