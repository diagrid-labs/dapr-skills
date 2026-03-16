# Plan: Reduce Duplication Across Skill Files

## Problem

The three skill sets (dotnet, python, aspire) have significant content duplication across both SKILL.md and REFERENCE.md files. This makes maintenance harder — a single change (e.g., updating a Dapr version) requires editing multiple files.

## Duplication Analysis

### SKILL.md duplication

| Section | dotnet | python | aspire | Identical? |
|---------|--------|--------|--------|------------|
| Execution Order | Y | Y | Y | 100% identical |
| Step 2: Detect OS | Y | Y | Y | 100% identical |
| Check Docker/Podman | Y (Step 4) | Y (Step 5) | Y (Step 4) | 100% identical |
| Check Dapr CLI | Y (Step 5) | Y (Step 6) | Y (Step 5) | 100% identical |
| Check C# LSP | Y (Step 1) | - | Y (Step 1) | 100% identical (dotnet/aspire) |
| Check .NET SDK | Y (Step 3) | - | Y (Step 3) | 100% identical (dotnet/aspire) |
| Create README.md | Y | Y | Y | ~90% similar (minor endpoint/tool differences) |
| Show final message | Y | Y | Y | 100% identical pattern |

### REFERENCE.md duplication

| Section | dotnet | python | aspire | Identical? |
|---------|--------|--------|--------|------------|
| resources/statestore.yaml + key points | Y | Y | - | 100% identical (dotnet/python) |
| .NET Models + key points | Y | - | Y | 100% identical (dotnet/aspire) |
| .NET Workflow Class + key points | Y | - | Y | 100% identical (dotnet/aspire) |
| .NET Workflow determinism | Y | - | Y | 100% identical (dotnet/aspire) |
| .NET Workflow patterns (4 patterns) | Y | - | Y | 100% identical (dotnet/aspire) |
| .NET Activity Class + key points | Y | - | Y | 100% identical (dotnet/aspire) |
| local.http + key points | Y | Y | Y | ~95% similar |
| .gitignore | Y | Y | Y | Similar (different source URLs) |
| Running Locally | Y | Y | - | 100% identical (dotnet/python) |
| Running with Catalyst | Y | Y | - | 100% identical (dotnet/python) |

## Proposed Structure

Extract shared content into a `shared/` directory. Each REFERENCE.md references shared files for common sections and keeps only language/framework-specific content inline.

```
.claude/skills/
├── shared/
│   ├── prereq-detect-os.md                  # OS detection (Step 2)
│   ├── prereq-check-docker-podman.md        # Docker/Podman check
│   ├── prereq-check-dapr-cli.md             # Dapr CLI check
│   ├── prereq-check-dotnet-sdk.md           # .NET SDK check (dotnet + aspire)
│   ├── prereq-check-csharp-lsp.md           # C# LSP plugin check (dotnet + aspire)
│   ├── dapr-statestore.md                   # statestore.yaml + key points (dotnet + python)
│   ├── dotnet-models.md                     # .NET Models + key points (dotnet + aspire)
│   ├── dotnet-workflow-class.md             # .NET Workflow class + key points + determinism + patterns (dotnet + aspire)
│   ├── dotnet-activity-class.md             # .NET Activity class + key points (dotnet + aspire)
│   ├── dotnet-local-http.md                 # .NET local.http + key points (dotnet + aspire)
│   ├── dotnet-gitignore.md                  # .NET .gitignore reference (dotnet + aspire)
│   ├── running-locally-dapr.md              # Running locally with `dapr run` + Diagrid Dashboard (dotnet + python)
│   └── running-with-catalyst.md             # Running with Diagrid Catalyst (dotnet + python)
├── create-workflow-dotnet/
│   ├── SKILL.md                             # Slimmed down, references shared prereqs
│   └── REFERENCE.md                         # References shared files, keeps only dapr.yaml + launchSettings + .csproj + Program.cs
├── create-workflow-python/
│   ├── SKILL.md                             # Slimmed down, references shared prereqs
│   └── REFERENCE.md                         # References shared files, keeps only dapr.yaml + pyproject.toml + main.py + workflow.py + activities.py + python models
├── create-workflow-aspire/
│   ├── SKILL.md                             # Slimmed down, references shared prereqs
│   └── REFERENCE.md                         # References shared files, keeps only AppHost + Aspire-specific csproj + statestore variants + ServiceDefaults + Program.cs
```

## Referencing Convention

### SKILL.md → REFERENCE.md (no change)
Each SKILL.md already says "See `REFERENCE.md` for full example." This stays the same.

### REFERENCE.md → shared files
Each REFERENCE.md section that is shared will include a reference like:

```markdown
## Models

See [`../shared/dotnet-models.md`](../shared/dotnet-models.md) for the full example and key points.
```

This keeps the section heading in REFERENCE.md (preserving the overall structure) while pointing to the single source of truth.

### SKILL.md → shared prereq files
Prerequisite check steps that are identical will reference shared files:

```markdown
### Step 2: Detect Operating System

See [`../shared/prereq-detect-os.md`](../shared/prereq-detect-os.md).
```

## Implementation Steps

### Step 1: Create shared prerequisite files
Extract from any SKILL.md (all identical):
- `shared/prereq-detect-os.md` — OS detection logic
- `shared/prereq-check-docker-podman.md` — Docker/Podman check
- `shared/prereq-check-dapr-cli.md` — Dapr CLI version check
- `shared/prereq-check-dotnet-sdk.md` — .NET SDK version check
- `shared/prereq-check-csharp-lsp.md` — C# LSP plugin check

### Step 2: Create shared REFERENCE content files
Extract from dotnet REFERENCE.md:
- `shared/dapr-statestore.md` — statestore.yaml + key points
- `shared/dotnet-models.md` — Models section + key points
- `shared/dotnet-workflow-class.md` — Workflow class + key points + determinism + all 4 patterns
- `shared/dotnet-activity-class.md` — Activity class + key points
- `shared/dotnet-local-http.md` — local.http + key points
- `shared/dotnet-gitignore.md` — .gitignore reference
- `shared/running-locally-dapr.md` — Running Locally section (dapr run + dashboard)
- `shared/running-with-catalyst.md` — Running with Catalyst section

### Step 3: Update create-workflow-dotnet SKILL.md
- Replace Steps 1, 2, 4, 5 with references to shared prereq files
- Keep Steps 3 (.NET SDK) as reference to shared file
- Keep Project Setup, Verify, Create README, Show final message (these have dotnet-specific details)

### Step 4: Update create-workflow-dotnet REFERENCE.md
- Replace Models, Workflow Class, Activity Class, local.http, .gitignore, Running Locally, Running with Catalyst sections with references to shared files
- Keep dapr.yaml, launchSettings.json, .csproj, Program.cs inline (dotnet-specific config)

### Step 5: Update create-workflow-python SKILL.md
- Replace Steps 2, 5, 6 with references to shared prereq files
- Keep Steps 1 (pyright LSP), 3 (uv), 4 (Python SDK) inline (python-specific)
- Keep Project Setup, Verify, Create README, Show final message inline

### Step 6: Update create-workflow-python REFERENCE.md
- Replace statestore.yaml, local.http, .gitignore, Running Locally, Running with Catalyst sections with references to shared files
- Keep dapr.yaml, pyproject.toml, main.py, models.py, workflow.py, activities.py inline (python-specific)

### Step 7: Update create-workflow-aspire SKILL.md
- Replace Steps 1, 2, 4, 5 with references to shared prereq files
- Keep Step 3 (.NET SDK) as reference to shared file, Step 6 (Aspire CLI) inline
- Keep Project Setup, Verify, Create README, Show final message inline

### Step 8: Update create-workflow-aspire REFERENCE.md
- Replace Models, Workflow Class, Activity Class, .gitignore sections with references to shared files
- Keep AppHost.cs, AppHost .csproj, statestore.yaml (Aspire variant), statestore-dashboard.yaml, ApiService Program.cs, ApiService .csproj, ServiceDefaults, .http file inline (Aspire-specific)

### Step 9: Update CLAUDE.md
- Add `shared/` to the repository structure description
- Add guideline: "Shared content goes in `.claude/skills/shared/`; REFERENCE.md files reference shared files to avoid duplication"

## What Changes for Each Skill

| Skill | Sections moved to shared | Sections kept inline |
|-------|--------------------------|---------------------|
| **dotnet SKILL.md** | 4 prereq steps | Overview, Prerequisites list, Project Setup, Verify, README, Final message |
| **dotnet REFERENCE.md** | 7 sections | dapr.yaml, launchSettings, .csproj, Program.cs |
| **python SKILL.md** | 3 prereq steps | Overview, Prerequisites list, LSP/uv/Python checks, Project Setup, Verify, README, Final message |
| **python REFERENCE.md** | 5 sections | dapr.yaml, pyproject.toml, main.py, models.py, workflow.py, activities.py |
| **aspire SKILL.md** | 4 prereq steps | Overview, Prerequisites list, Aspire CLI check, Project Setup, Verify, README, Final message |
| **aspire REFERENCE.md** | 4 sections | AppHost.cs, AppHost .csproj, 2x statestore, ApiService Program.cs, ApiService .csproj, ServiceDefaults, .http |

## Version Number Maintenance

After this refactoring, updating a version number requires editing fewer files:
- **Dapr SDK version (1.17.4)**: Update in `shared/dotnet-models.md` or relevant shared file + dotnet SKILL.md + aspire SKILL.md (Prerequisites list)
- **Dapr CLI version (1.17)**: Update only `shared/prereq-check-dapr-cli.md`
- **Statestore.yaml**: Update only `shared/dapr-statestore.md` (dotnet/python share it; aspire has its own variant)
- **Workflow patterns**: Update only `shared/dotnet-workflow-class.md` (dotnet + aspire both use it)

## Risks / Considerations

- Claude Code loads SKILL.md and REFERENCE.md when a skill is invoked. It's unclear whether it will automatically follow relative file references in those files. **Mitigation**: Test with one skill first to confirm Claude follows `../shared/` references. If not, the shared files may need to be inlined via a build step or the references made more explicit with instructions like "Read the file at `../shared/dotnet-models.md` for this section's content."
- Section headings must remain in REFERENCE.md even when content is extracted, so the document structure stays navigable.
