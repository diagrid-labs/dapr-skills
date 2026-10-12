# Skill evals

Test prompts and checks for every task skill in [`skills/`](../skills), in the [skill-creator](https://github.com/anthropics/skills/tree/main/skill-creator) `evals.json` format.

## Layout

```text
evals/
└── <skill-name>/
    ├── evals.json      # 3 evals: happy path, variant, edge case
    └── files/          # input fixtures (projects to review or migrate), when needed
```

- The evals live here, **not** inside `skills/<skill-name>/`, because installers (`npx skills`, the Claude Code and Copilot plugins) copy whole skill folders. Keeping evals out of them means users never install test fixtures, some of which contain deliberately broken code.
- `files` paths in `evals.json` are relative to the **repository root**.
- `dapr-shared` has no evals: it is a support skill that other skills read files from, not a skill that is invoked.

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
- `migrate-workflow-typescript` needs a git repository: after copying `files/order-service/`, run `git init` and make one commit in the copy, because the skill checks for a clean working tree and creates a migration branch.
- `review-agent-memory/files/helpdesk-dotnet` intentionally fails `dotnet build`/`restore` with `NU1605` (package downgrade). That is the seeded `DAG-MEM-006` violation; the other .NET fixtures build.
- Scaffolding and prerequisite evals need the prerequisites from the main [README](../README.md) (.NET 10, Python/uv, Node.js, Dapr CLI, Docker). Agent evals that run the generated app also need an LLM provider key.
