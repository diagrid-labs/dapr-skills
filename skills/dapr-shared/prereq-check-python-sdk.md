# Check Python SDK version

Run `python --version`. If that fails, retry with `python3 --version` (common on macOS and Linux, where `python` may not exist), and on Windows also with `powershell -Command "python --version"`. The output looks like `Python 3.12.4`.

Parse the version as `major.minor` and compare numerically (so `3.9` < `3.12` < `3.13`): the check passes when the version is **3.12 or newer** (for example `3.12.x`, `3.13.x`, `3.14.x`). Fail `3.11.x` and below.

If not installed or the version is below 3.12, inform the user they need to install the [Python 3.12+ SDK](https://www.python.org/downloads/).
