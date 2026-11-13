# Dapr package versions

The single source of truth for every Dapr package version the skills pin. `scripts/validate-skills.mjs`
fails when a skill or an eval fixture pins a version this table does not give (`versions: Dapr package
pins match dapr-versions.md`), so a pin and this table cannot drift apart unnoticed.

Verified against NuGet, npm and PyPI on 2026-11-11. Dapr runtime latest stable: 1.19.1, released
2026-10-31; docs.dapr.io serves v1.19 as "latest".

The .NET packages are at **1.19.1**, published 2026-11-10. npm `@dapr/dapr` and PyPI `dapr` have no
1.19.1, so they stay one patch behind by release, not by drift — the ecosystems do not ship in lockstep,
and each row is the latest stable of that package, not a shared number.

| Package | Version | Ecosystem |
|---|---|---|
| `Dapr.Workflow` | 1.19.1 | nuget |
| `Dapr.AspNetCore` | 1.19.1 | nuget |
| `Dapr.Client` | 1.19.1 | nuget |
| `Dapr.Actors` | 1.19.1 | nuget |
| `Dapr.Messaging` | 1.19.1 | nuget |
| `Dapr.Testcontainers` | 1.19.1 | nuget |
| `@dapr/dapr` | 3.19.0 | npm |
| `dapr` | 1.19.0 | pypi |
| `dapr[workflow]` | 1.19.0 | pypi |
| `dapr[fastapi]` | 1.19.0 | pypi |

## Verified by building, 2026-11-11 (TypeScript 2026-11-13)

These pins were not read off a registry and trusted — a project was generated from each skill and built.

- **.NET** — `dotnet new web` on the .NET 10.0.402 SDK, `dotnet add package Dapr.Workflow --version 1.19.1`,
  then a `Program.cs` with `AddDaprWorkflow()`, `AddDaprWorkflowVersioning()` and `using
  Dapr.Workflow.Versioning;`, plus a `Workflow<TIn, TOut>` calling `context.IsPatched("...")` and a
  `WorkflowActivity<TIn, TOut>`. **Build succeeded, 0 warnings, 0 errors.** So at 1.19.1 the versioning
  registration still exists, and `IsPatched` is real .NET API, not a proposal.
- **Python** — `uv sync` against `dapr[workflow]==1.19.0` on Python 3.13, then
  `import dapr.ext.workflow`. Resolved and imported cleanly. `DaprWorkflowContext.is_patched` and
  `WorkflowRuntime.versioned_workflow` both exist, and `WorkflowInstanceIdPage`,
  `WorkflowHistoryEvent` and `PropagatedHistory` are exported. The resolved environment contains
  **`dapr 1.19.0` and nothing else named `dapr*`** — no `dapr-ext-workflow`, and no separate
  `durabletask` distribution, because the wheel vendors it at `dapr/ext/workflow/_durabletask/`.
- **TypeScript** (added 2026-11-13) — every code sample in `create-workflow-typescript/REFERENCE.md`
  was extracted and compiled with `npx tsc --noEmit` on `strict: true` against `@dapr/dapr@3.19.0`:
  the five scaffold files, the workflow pattern snippets, and the 1.19 capabilities section.
  **0 errors.** Comparing the 3.18.0 and 3.19.0 type definitions showed the release is purely
  additive — no workflow or client API was removed or renamed — so the bump could not break a
  generated project. It did, however, make three of the skill's claims false: 3.19.0 added a Jobs
  client and server wrapper (`client.jobs.*`, `server.jobs.listen`), a `timeoutInSeconds` option on
  `waitForExternalEvent`, and `WorkflowContext.isPatched`. Those were corrected rather than left
  as a version bump that quietly contradicted its own documentation.

A pin is matched per ecosystem, so the same name in another ecosystem is left alone: `dapr --version`
prints the Dapr CLI version and is not a PyPI pin, and `dapr-agents>=1.0.9` is not pinned here at all.
A wildcard such as `dapr==1.18.x` is not a pin either — skills write that about whatever version an
existing project already carries.

What is checked: every `.md` under `skills/`, and every `evals/<skill>/evals.json`. Fixture projects
under `evals/<skill>/files/` are **not** checked, because an add-skill fixture is the input project and
is deliberately older than the target — that is what gives the skill an upgrade to offer.

## Retired distributions

From Dapr 1.19 the Python extensions are **extras of the `dapr` distribution**, not packages of their
own. The docs state it plainly: *"Starting with Dapr 1.19, this extension is an extra of the `dapr`
package. The `dapr-ext-workflow` package is no longer published."* The import path does not change —
`dapr.ext.workflow` and `dapr.ext.fastapi` stay exactly as they were, and only the install coordinate
moves.

| Retired package | Install instead |
|---|---|
| `dapr-ext-workflow` | `dapr[workflow]` |
| `dapr-ext-fastapi` | `dapr[fastapi]` |
| `dapr-ext-grpc` | `dapr[grpc]` |

**No skill may install or pin a retired package.** The newest release of each is 1.18.3 and there will
not be another, so the check fails on a retired name in any of three forms: a pin at any version
(`dapr-ext-workflow==1.18.3`), a requirement with any operator (`dapr-ext-fastapi>=1.18.0`), or an
install command (`pip install dapr-ext-workflow`, `uv add dapr-ext-fastapi`).

Naming one in prose stays legal, because the migration guidance has to be able to say the old name,
and so does `uv remove dapr-ext-fastapi` — that is how a project drops it.

`dapr` 1.18.3 declares no extras at all, so the bracketed form requires `dapr>=1.19.0`. There is no
version at which both shapes work, which makes the switch atomic for a project: never write
`dapr==1.19.0` beside a `dapr-ext-*` pin, or two copies of `dapr.ext.*` land on the import path and
which one wins depends on install order.

Quote the bracket in every shell command a skill emits — `uv add "dapr[workflow]==1.19.0"`,
`pip install "dapr[workflow]"` — because `[` is a glob character in POSIX shells and a wildcard in
PowerShell, and these skills run on macOS, Linux and Windows.
