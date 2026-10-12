# Check Aspire CLI

Run `aspire --version`. If the command is not found, retry with the default install locations before concluding the CLI is missing, because the install directory is not always on `PATH` in a fresh shell:

- `~/.aspire/bin/aspire --version` (installed via the aspire.dev install script)
- `~/.dotnet/tools/aspire --version` (installed as a .NET global tool)
- On Windows, also retry with `powershell -Command "aspire --version"`.

If none of these succeed, inform the user they need to install the [Aspire CLI](https://aspire.dev/get-started/install-cli/):

- macOS/Linux: `curl -sSL https://aspire.dev/install.sh | bash`
- Windows (PowerShell): `irm https://aspire.dev/install.ps1 | iex`
- Alternatively, as a .NET global tool: `dotnet tool install -g Aspire.Cli`
