---
name: check-prereq-java
description: Checks prerequisites for building Dapr workflow and pub/sub apps in Java with Spring Boot. Use for "check prerequisites for Java" or "verify Java environment".
allowed-tools:
  - Bash(uname -s)
  - Bash(java -version)
  - Bash(powershell -Command "java -version")
  - Bash(mvn -v)
  - Bash(powershell -Command "mvn -v")
  - Bash(docker info)
  - Bash(podman info)
  - Bash(powershell -Command "docker info")
  - Bash(powershell -Command "podman info")
  - Bash(dapr --version)
  - Bash(powershell -Command "dapr --version")
  - Read
---

# Check Prerequisites for Dapr Java

## Overview

This skill checks whether all prerequisites are installed for building Dapr Workflow and pub/sub applications in Java with Spring Boot. Run it only when you ask for it, for example before using the `create-workflow-java` or `create-pubsub-java` skill. It is never run automatically as a pre-step.

## Prerequisites

The following must be installed:

- [JDK 17+](https://adoptium.net/)
- [Maven 3.9+](https://maven.apache.org/download.cgi)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)

## Prerequisite Checks

**Run ALL of these checks. Check steps 2-5 in parallel. Track which checks pass and which fail.**

### Step 1: Detect Operating System

Read the file at [`../dapr-shared/prereq-detect-os.md`](../dapr-shared/prereq-detect-os.md) and follow those instructions.

### Step 2: Check JDK version

Read the file at [`../dapr-shared/prereq-check-java-sdk.md`](../dapr-shared/prereq-check-java-sdk.md) and follow those instructions.

### Step 3: Check Maven

Read the file at [`../dapr-shared/prereq-check-maven.md`](../dapr-shared/prereq-check-maven.md) and follow those instructions.

### Step 4: Check Docker or Podman

Read the file at [`../dapr-shared/prereq-check-docker-podman.md`](../dapr-shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 5: Check Dapr CLI

Read the file at [`../dapr-shared/prereq-check-dapr-cli.md`](../dapr-shared/prereq-check-dapr-cli.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-workflow-java` or `create-pubsub-java` skill.
