# Check Dapr CLI

Run `dapr --version` (on Windows, retry with `powershell -Command "dapr --version"` if needed). The output looks like:

```text
CLI version: 1.18.0
Runtime version: 1.18.0
```

Parse the `CLI version` line as `major.minor.patch` and compare numerically: the check passes when the CLI version is **1.18 or newer** (for example `1.18.0`, `1.18.2`, `1.19.0`, `2.0.0`). Fail versions below 1.18 (for example `1.17.x`, `1.9.x`). Do not require the output to contain the literal string `1.18` — newer versions are accepted.

If `Runtime version` is `n/a`, the CLI is installed but `dapr init` has not been run; report this as a note (the runtime is needed to run apps locally), not as a CLI failure.

If the command is not found or the CLI version is below 1.18, inform the user they need to install or upgrade the [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+).
