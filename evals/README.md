# Skill evals

Test prompts and checks for every task skill in [`skills/`](../skills), in the [skill-creator](https://github.com/anthropics/skills/tree/main/skill-creator) `evals.json` format.

## Layout

```text
evals/
├── <skill-name>/
│   ├── evals.json      # 3-5 evals: happy path, variants, edge case
│   └── files/          # input fixtures (projects to review or migrate), when needed
└── triggering/
    └── queries.json    # which skill fires, across this plugin and catalyst-ai
```

- The evals live here, **not** inside `skills/<skill-name>/`, because installers (`npx skills`, the Claude Code and Copilot plugins) copy whole skill folders. Keeping evals out of them means users never install test fixtures, some of which contain deliberately broken code.
- `files` paths in `evals.json` are relative to the **repository root**.
- `dapr-shared` has no evals: it is a support skill that other skills read files from, not a skill that is invoked.
- `triggering/` is a different kind of check — see [Triggering check](#triggering-check) below. The per-skill evals grade what a skill *produces*; the triggering check grades which skill *fires*.

## evals.json

```json
{
  "skill_name": "review-workflow-determinism",
  "evals": [
    {
      "id": 1,
      "name": "dotnet-seeded-violations",
      "prompt": "Review the workflow in this project for determinism problems",
      "expected_output": "Report with DWF-DET-001 and DWF-DET-002 ...",
      "files": ["evals/review-workflow-determinism/files/dotnet-orders/"],
      "expectations": ["Report contains DWF-DET-002 for Guid.NewGuid() at Workflows/OrderWorkflow.cs", "..."]
    }
  ]
}
```

Each eval has a realistic `prompt`, a human-readable `expected_output`, and objectively checkable `expectations` that a grader verifies against the produced files, the final message, and the transcript.

## Running the evals

Use the skill-creator skill in Claude Code, for example:

> Use the skill-creator to run the evals in `evals/review-workflow-determinism/evals.json` against `skills/review-workflow-determinism`.

The skill-creator runs each prompt with and without the skill in a scratch workspace, grades the expectations, and opens a viewer with the outputs and a benchmark.

Notes:

- Run evals from a scratch folder, not from the repository root, so scaffolding skills don't create projects inside this repo.
- For evals with `files`, copy the fixture into the scratch folder first and point the prompt at the copy, so review skills see a project root and migration skills can't modify the fixture.
- The `Tool use` expectation in the review evals grades the run under test, not the harness. Copying the fixture into the scratch folder and saving the report use a shell and `Write`, and are excluded. Reading the project must use Read, Grep and Glob only: `cat` or `grep` through a shell fails the expectation. If a session has no Grep tool, fall back to Read and Glob instead of a shell.
- Review skills may ask the user a clarifying question during a review (scope, deployment target). Evals run non-interactively, so a question counts as unanswered and the checklist's default applies. Do not grade an eval on whether a question was asked.
- `migrate-workflow-typescript` needs a git repository: after copying `files/order-service/`, run `git init` and make one commit in the copy, because the skill checks for a clean working tree and creates a migration branch.
- `review-agent-memory/files/helpdesk-dotnet` intentionally fails `dotnet build`/`restore` with `NU1605` (package downgrade). That is the seeded `DAG-MEM-006` violation; the other .NET fixtures build.
- `create-pubsub-*` and `add-pubsub-*` have four evals each (one per subscription type plus an edge case).
- The `review-pubsub-*` fixtures contain deliberate violations marked `SEED <rule id>`; the `clean-*` fixtures must produce no critical or warning findings.
- The .NET `add-pubsub-dotnet` fixtures build; `inventory-service` is used for a hash check.
- Scaffolding and prerequisite evals need the prerequisites from the main [README](../README.md) (.NET 10, Python/uv, Node.js, Dapr CLI, Docker). Agent evals that run the generated app also need an LLM provider key.

## Triggering check

[`triggering/queries.json`](triggering/queries.json) checks **which** skill fires for a request when both this plugin and [catalyst-ai](https://github.com/diagridio/catalyst-ai) are installed. Five skill pairs across the two plugins overlap (workflow scaffolding, from-diagram, agent scaffolding, determinism, activity idempotency), and skill triggering is decided by the `description` front matter — Claude Code namespaces skill *names* per plugin, but defines no precedence when two descriptions match the same request.

The per-skill evals cannot catch a mis-route, because they assume the right skill already ran.

To run it, follow the `method` array in the file: collect the `description:` field from every SKILL.md in **both** plugins, give a model those descriptions and nothing else, and ask which single skill it would invoke per query. Give it no hint of the expected answer — the `expect` values are for you to compare against afterwards. Watch the confidence ratings as well as the verdicts: a medium-confidence answer that still matched `expect` is an early warning that two descriptions are drifting together.

Re-run it when:

- any `description` in this repo changes, especially on the five overlapping skills;
- `catalyst-ai` publishes a release, since that half of the wording lives in a repository we do not control;
- you add a skill whose purpose is close to one of theirs.

Update the `baseline` block with the date, model and result whenever the outcome changes. `docs/catalyst-ai-description-proposal.md` tracks the reciprocal wording changes suggested to the `catalyst-ai` maintainers.
