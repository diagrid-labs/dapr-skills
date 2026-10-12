# Review Scope Prompt

Used by every `review-workflow-*` and `review-agent-*` skill before any file is read, so the user knows exactly which code is about to be analysed. The calling skill decides which target-detection file runs next.

## When to skip the prompt

If the user has already named a folder, file, or solution in the request (for example "review the OrderService workflow", "audit `src/Workflows/OrderWorkflow.cs`", or "check the tools in `agents/support`"), use that as the scope and skip directly to the target-detection step of the calling skill. Echo back the resolved scope in one short line so the user can correct it.

## When to ask

If the request is generic ("review my workflow code", "audit my agent", "audit this project"), ask the user a single clarifying question with up to four options, in this order:

1. The whole repository (the current working directory).
2. The folder that contains the most code of the kind the calling skill reviews (workflows, activities, endpoints, or agents), if obvious from a quick `Glob` (for example `**/*Workflow*.cs` and `**/workflow*.py` for workflow reviews, `**/*Agent*.cs` and `**/*agent*.py` for agent reviews).
3. A specific file or folder of the user's choice.
4. Cancel — the user wants to refine the scope themselves first.

Do not enumerate every file in scope. The point of the prompt is to set a single `scope_root` for the rest of the review, not to negotiate per-file coverage.

## After the user answers

- Resolve the scope to a single absolute path (`scope_root`).
- Confirm the path back to the user in one line: `Reviewing <scope_root>`.
- Pass `scope_root` to the target-detection file named by the calling skill (for example `review-detect-target.md` for workflow reviews, `review-detect-target-agent.md` for agent reviews).

## Multi-language repositories

If the scope contains both .NET and Python code of the reviewed kind, run the review once per language. Emit one report per language so the severity counts and rule ids stay coherent.
