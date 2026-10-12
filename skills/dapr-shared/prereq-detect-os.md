# Detect Operating System

Run `uname -s` and classify the result. Match on the prefix, because on Windows the value includes a version suffix:

| Output of `uname -s` | OS | Shell |
| --- | --- | --- |
| `Darwin` | macOS | bash/zsh |
| `Linux` (also inside WSL) | Linux | bash |
| starts with `MINGW` (e.g. `MINGW64_NT-10.0-26200`), `MSYS` (e.g. `MSYS_NT-10.0-26200`) or `CYGWIN` (e.g. `CYGWIN_NT-10.0-26200`) | Windows | Git Bash / MSYS2 / Cygwin |
| command not found, or any other error | Windows | PowerShell or cmd |

If the session environment already states the platform (for example `win32`, `darwin` or `linux`), use it to confirm the result; the platform value wins if the two disagree.

How to run the remaining checks per OS:

- **macOS / Linux**: all tools are expected to be on the `PATH` of the shell. Run the commands directly.
- **Windows (any shell)**: tools may only be on the Windows `PATH` and not visible to Git Bash, MSYS2 or Cygwin. For each subsequent check, if the direct command fails, retry it via `powershell -Command "<cmd>"` (Windows PowerShell) before concluding the tool is missing. Treat "command not found" from the bash shell as inconclusive on Windows, not as a failed check.
