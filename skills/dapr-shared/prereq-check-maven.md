# Check Maven

Run `mvn -v` (on Windows, retry with `powershell -Command "mvn -v"` if needed). The first line looks like `Apache Maven 3.9.9 (...)`. Parse the version as `major.minor` and compare numerically: the check passes when the version is **3.9 or newer** (for example `3.9.9`, `3.10.x`, `4.0.x`). Fail `3.8.x` and below.

If not installed or the version is below 3.9, inform the user they need to install [Maven 3.9+](https://maven.apache.org/download.cgi).
