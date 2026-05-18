# Check Dapr Agents SDK (Python)

Run `uv pip show dapr-agents 2>/dev/null | grep -i '^Version:' || echo "not installed"` (Windows fallback: `powershell -Command "uv pip show dapr-agents 2>$null | Select-String -Pattern 'Version'"` — report `not installed` if empty).

Interpret the output:

- **Installed with version `1.0.0` or higher** → check passes. Report the version.
- **Installed with version below `1.0.0`** → check fails. Inform the user to upgrade via `uv pip install --upgrade dapr-agents` (or `uv add dapr-agents` inside a project).
- **Not installed** → check passes **with a note**: actual installation happens inside the project during `uv sync` (run by `create-agent-python`). A missing global install is not an error — but surface the note so the user knows what to expect.

This check verifies whether `dapr-agents` is available in the current Python environment. If it is not, the final installation still happens inside the scaffolded project via `uv sync` — this check is informational rather than a hard blocker.

Do not use `uv pip index versions` / `pip index versions` — those require network access to PyPI and conflate "reachable on the index" with "installed locally".
