# Detect Review Target

Used by every `review-workflow-*` skill to locate the target language and the files in scope before any rules are applied.

## Step 1: Detect language and framework

Probe the project root (or the user-specified scope folder) for the markers below. Run these probes in parallel where possible.

| Marker file / pattern                              | Language target |
| -------------------------------------------------- | --------------- |
| `*.csproj` containing `Sdk="Microsoft.NET.Sdk.Web"` and `PackageReference Include="Dapr.Workflow"` | `dotnet`        |
| `*.csproj` referencing `CommunityToolkit.Aspire.Hosting.Dapr` or an `*.AppHost` project | `aspire` (treat as `dotnet` plus Aspire-specific notes) |
| `pyproject.toml` with `dapr-ext-workflow` dependency | `python`        |

If multiple targets exist (e.g., a `.NET` Aspire solution with a sibling Python app), confirm the scope with the user before continuing.

If no marker is found, stop the review and tell the user the target is not a recognized Dapr Workflow project.

## Step 2: Locate workflow, activity, and management code

Build three file lists. Globbing must be limited to the scope folder agreed in `review-scope-prompt.md`.

### .NET / Aspire targets

- **Workflow files** — files containing a class that derives from `Workflow<` (use `Grep` for `: Workflow<` or `: Workflow ` in `**/*.cs`). The conventional folder is `Workflows/`, but do not require it.
- **Activity files** — files containing a class that derives from `WorkflowActivity<` (use `Grep` for `: WorkflowActivity<` in `**/*.cs`). Conventional folder: `Activities/`.
- **Management endpoints** — files registering minimal-API routes that talk to `DaprWorkflowClient` (use `Grep` for `DaprWorkflowClient` and `Map(Get|Post|Put|Delete)` in `**/*.cs`, typically `Program.cs`).

### Python targets

- **Workflow files** — files containing `@wfr.workflow` or `@workflow_runtime.workflow` decorators (use `Grep` for `@.*\.workflow\(` in `**/*.py`). Conventional file: `workflow.py`.
- **Activity files** — files containing `@wfr.activity` or equivalent decorators (use `Grep` for `@.*\.activity\(` in `**/*.py`). Conventional file: `activities.py`.
- **Management endpoints** — files declaring HTTP routes that call `DaprWorkflowClient` methods (use `Grep` for `DaprWorkflowClient`, `schedule_new_workflow`, `get_workflow_state`, `terminate_workflow`, `pause_workflow`, `resume_workflow`, `raise_workflow_event` in `**/*.py`). Conventional file: `main.py`.

## Step 3: Record the target

Pass the following structured result back to the calling skill:

```
language: dotnet | aspire | python
workflow_files: [ ... ]
activity_files: [ ... ]
management_files: [ ... ]
scope_root: <absolute path>
```

Empty lists are valid. The calling skill decides whether an empty list is itself a finding (e.g., `review-workflow-management` reports a critical issue if no management endpoint file is found).
