# Check .NET SDK

Run `dotnet --version` (on Windows, retry with `powershell -Command "dotnet --version"` if needed). Parse the leading number before the first `.` as the major version and compare numerically: the check passes when the **major version is 10 or higher** (for example `10.0.100`, `10.0.201`, `11.0.100-preview.1`). Fail major versions below 10 (for example `8.0.400`, `9.0.100`).

If not installed or the major version is below 10, inform the user they need to install the [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download).
