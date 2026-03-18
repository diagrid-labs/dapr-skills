# Detect Operating System

Run `uname -s 2>/dev/null || echo "Windows"` to determine the OS:
- **macOS**: `uname -s` returns `Darwin`. All tools are expected to be available in bash.
- **Linux**: `uname -s` returns `Linux`. All tools are expected to be available in bash.
- **Windows**: returns `Windows`. Tools may only be on the Windows PATH and not available in the bash shell. For each subsequent check, if the direct bash command fails, retry via `powershell -Command "<cmd>"` (Windows PowerShell) or `pwsh -Command "<cmd>"` (PowerShell 7+).
