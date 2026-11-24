---
name: create-workflow-java
description: Creates a local Dapr workflow app in Java with Spring Boot. Use for "create a workflow in Java" or "build a Spring Boot workflow app". For Diagrid use the diagrid plugin.
allowed-tools:
  - Write
  - Edit
  - Bash(diagrid-dev-dashboard --version)
  - Bash(mvn -q -DskipTests package)
---

# Create Dapr Workflow Java Application

## Overview

This skill describes how to create a Dapr Workflow application in Java with Spring Boot 4 and Maven.

## Execution Order

You MUST follow these phases in strict order:
1. **Check specification** - Check if the user specified what needs to be built.
2. **Check optional tools** — Check whether the Diagrid Dapr Dev Dashboard is installed and remember the result. Never stop, ask or install for this.
3. **Project Setup** — Create all files and folders.
4. **Verify** — Verify that the project builds.
5. **Create README.md** — Create a readme that summarizes what is built and how to run & test the application. Do not provide instructions at the end of this phase.
6. **Show final message** - Your LAST output MUST be EXACTLY the message defined in the `## Show final message` section: the closing sentence followed by the Dev Dashboard recommendation. Do NOT add any other text, summary, or commentary.

## Check specification

If you don't have enough context what to build, ask the user the following clarifying questions one by one using an interview style:

1. What is the purpose of the workflow application?
2. Describe how workflow should work. Which patterns should be used?
3. Specify the input and output objects of the workflow.
4. What's the name of this project? This will be used as the folder name. Don't use any spaces in this name.

### Resolving the names

Before creating any file, write out the resolved names and restate them to the user in two or three lines,
so a wrong reading is caught before it is scaffolded. Resolve them exactly as
[`../dapr-shared/workflow-placeholders.md`](../dapr-shared/workflow-placeholders.md) defines them:
`<WorkflowName>` from the purpose, `<WorkflowInput>` and `<WorkflowOutput>` from its stem, one
`<ActivityName>` per step with its `<ActivityInput>` and `<ActivityOutput>`, and `<javaPackage>` from
`<ProjectRoot>` (`Ship-Track` gives `com.example.shiptrack`). If the lowercased name starts with a digit,
put `app` in front of it (`com.example.app2048`), because a package segment cannot start with a digit.

## Prerequisites

The following must be installed by the user before this skill can run:

- [JDK 17+](https://adoptium.net/)
- [Maven 3.9+](https://maven.apache.org/download.cgi) (the project has no Maven wrapper)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)

Additional runtime dependencies (handled during project setup):

- Maven: parent `org.springframework.boot:spring-boot-starter-parent` `4.0.8`, the BOM
  `io.dapr.spring:dapr-spring-bom` `1.19.1` imported in `dependencyManagement`, and
  `io.dapr.spring:dapr-spring-boot-starter` without a version. Maven downloads them on the first build.
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) for inspecting workflow runs locally. The skill only checks whether it is installed (see `## Check optional tools`); it never installs it and never stops without it.

## Check optional tools

Check once whether the optional [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) is installed by following the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`). Remember the result (`DevDashboardInstalled`) for the final message. This check never stops the skill: do not ask the user about it, do not install anything, and continue with the next step whether or not the dashboard is installed.

## Project Setup

Create the project root folder inside the current location where the terminal is open:

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
```

The <ProjectName> should start with the <ProjectRoot> and end with `-app`: <ProjectRoot>-app. Write every file
directly; there is no generator command. `<app-id>` is `<ProjectName>` in lowercase, and `<app-port>` is a
free port for the app, for example `8080`.

### Folder structure

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── resources/
│   └── statestore.yaml
└── <ProjectName>/
    ├── pom.xml
    └── src/main/
        ├── resources/
        │   └── application.properties
        └── java/<javaPackage>/        (one folder per segment: com/example/...)
            ├── Application.java
            ├── <WorkflowName>.java
            ├── <ActivityName>.java      (one per activity)
            ├── <WorkflowInput>.java     (one file per record)
            ├── StatusResponse.java
            └── <WorkflowName>Controller.java
```

### .gitignore

Ignores Maven's `target/`, the `.dapr/` log folders and IDE files. See [`../dapr-shared/java-workflow-project.md`](../dapr-shared/java-workflow-project.md).

### dapr.yaml

Multi-app run file in the project root. Runs the app with `mvn spring-boot:run` and points to the resources folder. See `REFERENCE.md` for the full example and key points.

### resources/statestore.yaml

Dapr Workflow requires a state store component (with `actorStateStore` set to `"true"`). See [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md).

### pom.xml

Maven project with the Spring Boot 4.0.8 parent, `java.version` 17, the Dapr Spring BOM 1.19.1 and the `dapr-spring-boot-starter`, `spring-boot-starter-webmvc` and `spring-boot-starter-actuator` dependencies. See [`../dapr-shared/java-workflow-project.md`](../dapr-shared/java-workflow-project.md).

### application.properties

Sets `spring.application.name` and `server.port`, which must equal `appPort` in `dapr.yaml`. Use `application.properties`, not `application.yml`, and add no `dapr.client.*` properties. See [`../dapr-shared/java-workflow-project.md`](../dapr-shared/java-workflow-project.md).

### Application.java

The `@SpringBootApplication` class, which also carries `@EnableDaprWorkflows`. See [`../dapr-shared/java-workflow-project.md`](../dapr-shared/java-workflow-project.md).

### Records

One top-level `record` per workflow and activity input and output, each in its own file, plus `StatusResponse` for the status endpoint. Never classes with getters and setters, never nested types. See [`../dapr-shared/java-models.md`](../dapr-shared/java-models.md).

### Workflow class

A top-level `@Component` implementing `Workflow`. It calls each activity with `ctx.callActivity(<ActivityName>.class.getName(), input, <ActivityOutput>.class).await()`, logs through `ctx.getLogger()` and finishes with `ctx.complete(...)`. See [`../dapr-shared/java-workflow-class.md`](../dapr-shared/java-workflow-class.md) for the example, key points and determinism rules, and `REFERENCE.md` for the patterns (chaining, fan-out/fan-in, child workflows, monitor, external event, saga) and retry policies.

### Activity classes

One top-level `@Component` implementing `WorkflowActivity` per activity, with collaborators taken through the constructor into `final` fields. See [`../dapr-shared/java-activity-class.md`](../dapr-shared/java-activity-class.md).

### Controller

One `@RestController` with the management endpoints `POST /start`, `GET /status/{instanceId}`, `POST /pause/{instanceId}`, `POST /resume/{instanceId}`, `POST /terminate/{instanceId}` and, only when the workflow waits for an external event, `POST /raise-event/{instanceId}/{eventName}`. It takes `DaprWorkflowClient` through its constructor. See [`../dapr-shared/java-workflow-endpoints.md`](../dapr-shared/java-workflow-endpoints.md).

### local.http

HTTP request file for testing the workflow endpoints: `start`, `status`, `pause`, `resume`, `terminate`, and a `raise-event` request when the workflow waits for an event. Uses the `<app-port>` from `application.properties`. See [`../dapr-shared/java-local-http.md`](../dapr-shared/java-local-http.md).

## Verify

**IMPORTANT: After Project Setup you MUST run these checks:**

1. Run `mvn -q -DskipTests package` in the `<ProjectName>` folder. It must exit with code 0; fix any error and run it again until it does. Never report the project as created while the build fails. The first build downloads the dependencies and can take a few minutes.
2. Tell the user how to start the app: `dapr run -f .` in the project root.

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md file inside the <ProjectRoot> folder.

The README contains the following sections:
1. Summary of what this folder contains.
2. Architecture description that explains the technology stack (Spring Boot 4, Java 17, Maven, the Dapr Spring Boot starter) and prerequisites to run it locally. **DO NOT suggest to run Redis separately since it's part of the Dapr installation and is running in a container already.**
3. A mermaid diagram that explains the workflow.
4. How to start the application using the Dapr CLI (`dapr run -f .` in the project root; the first start downloads the Maven dependencies).
5. List the available endpoints in the controller and provide examples how to call these using curl. Also include a link to the `local.http` file.
6. The **Diagrid Dapr Dev Dashboard** section, copied from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md): why it is useful, the install command for each OS (macOS / Linux and Windows) and the run command (`diagrid-dev-dashboard`, http://localhost:9090).
7. How to run the application with Diagrid to visually inspect the workflow.
8. Next steps: run the `review-workflow-determinism`, `review-workflow-activity` and `review-workflow-management` skills to audit the generated code.

See `REFERENCE.md` for additional instructions on running locally and running with Diagrid.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below followed by the Dev Dashboard recommendation — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> workflow application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (installed → start it; not installed → install it). Use it as written, including the link and the commands. Nothing may follow it.
