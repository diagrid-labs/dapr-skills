# Check JDK version

Run `java -version` (on Windows, retry with `powershell -Command "java -version"` if needed). The output goes to stderr and looks like `openjdk version "21.0.4" 2024-07-16`. Run `mvn -v` as well (see [`prereq-check-maven.md`](prereq-check-maven.md)); its `Java version:` line shows the JDK Maven builds with, which can differ from the one `java -version` reports (for example when `JAVA_HOME` points elsewhere).

Parse each version by its leading number as the major version (`17.0.12` is 17, `21.0.4` is 21, `1.8.0_402` is 8) and compare numerically: the check passes when the **major version is 17 or higher** (for example `17.0.x`, `21.0.x`, `25.0.x`). Fail major versions below 17 (for example `11.0.x`, `1.8.0_x`).

Maven's JDK is the one that counts for builds. If the `java -version` and `mvn -v` majors differ, judge the check on the `mvn -v` value and mention both in the report. If `mvn -v` is unavailable, judge on `java -version` alone.

If not installed or the major version is below 17, inform the user they need to install a [JDK 17+](https://adoptium.net/) (and, if `JAVA_HOME` points at an older JDK, point Maven at the newer one).
