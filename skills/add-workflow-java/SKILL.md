---
name: add-workflow-java
description: Adds Dapr Workflow to an existing Spring Boot 4 app built with Maven, after you approve a plan. Use for "add a workflow to my Spring Boot app" or "make this Java process a durable workflow". For a new app use create-workflow-java.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(diagrid-dev-dashboard --version)
  - Bash(mvn -q -DskipTests package)
  - Bash(mvn -q test)
  - Bash(git status)
---

# Add Dapr Workflow to an existing Spring Boot project

## Overview

This skill adds Dapr Workflow to a Spring Boot 4 web application, built with Maven, that already exists. It changes nothing before the user approves a written plan, edits existing files with the smallest possible change, follows the project's own conventions, builds the project after every step and runs the existing tests at the end. It never changes git state.

## Execution Order

You MUST follow these phases in strict order:
1. **Resolve target** — read-only inspection of the Maven project. Stops here for Gradle, Spring Boot other than 4.0.x, or a project without a Spring MVC web starter.
2. **Check specification** — what the workflow should do.
3. **Check optional tools** — Diagrid Dapr Dev Dashboard check; never stops the skill.
4. **Plan and approval** — show the Add Workflow Plan with its two questions (dependency updates, starting the workflow from an existing endpoint) and wait for approval.
5. **Apply** — one step at a time, building after each.
6. **Final verification** — build and test the project.
7. **Write the run doc** — `DAPR-WORKFLOW.md` in the Maven project folder.
8. **Show final message** — your output MUST end with EXACTLY the message in `## Show final message` followed by the Dev Dashboard recommendation. No other text after it.

## Prerequisites

The user must have installed:

- [JDK 17+](https://adoptium.net/) and [Maven 3.9+](https://maven.apache.org/download.cgi). The skill builds with the installed `mvn`; it never adds the Maven wrapper.
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) 1.19+ (not needed to build; needed to run)
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard). The skill only checks whether it is installed; it never installs it and never stops without it.

## Phase 1: Resolve target

Read-only. Follow **Detection** in `REFERENCE.md`. Check the three gates first, in this order, and stop at the first one that fails. A stop changes nothing, shows no plan and runs no `mvn` command; say what was found and what the user can do instead, using the stop messages in `REFERENCE.md`:

1. **Maven.** The project has a `pom.xml`. A Gradle build (`build.gradle`, `build.gradle.kts`, `settings.gradle*`) or no build file at all stops here.
2. **Spring Boot 4.0.x.** The `spring-boot-starter-parent` parent or an imported `spring-boot-dependencies` BOM is 4.0.x. Spring Boot 3.x stops here and names Dapr Java SDK 1.18.x, the line for Spring Boot 3; any other version, or one that cannot be found, stops too.
3. **Spring MVC web starter.** The project depends on `spring-boot-starter-webmvc` (or the older name `spring-boot-starter-web`). A WebFlux-only project or one without a web starter stops here.

Then determine and remember:

- The Maven project folder (the one with the `pom.xml` that has the Spring Boot parent) and the application module in a multi-module build. If more than one module qualifies, ask which one (one question) and wait.
- The `@SpringBootApplication` class and its package (the base package), whether it already has `@EnableDaprWorkflows`, and the code style: controllers with `@RequestMapping` on the class or not, constructor injection, records or classes for payloads.
- Existing Dapr dependencies (`io.dapr` and `io.dapr.spring`) and their versions: a `dapr-spring-bom` import, a `dapr-spring-boot-4-starter` (the 1.18 Boot 4 starter, which 1.19 replaces with `dapr-spring-boot-starter`), artifacts with their own `<version>` or a version property. Remember every version below 1.19.1 as **newer version available**.
- Existing workflows: classes implementing `io.dapr.workflows.Workflow` or `WorkflowActivity`. Never add a second `@EnableDaprWorkflows`.
- The app port: `server.port` in `src/main/resources/application.properties`, `application.yml` or `application.yaml`; 8080 when none sets it.
- Trigger endpoints: `@PostMapping` handlers that create or accept the thing the workflow is about (for example `POST /loans` for a loan review workflow). Read-only handlers (`@GetMapping`) never qualify, and neither does a handler that only records something related to the workflow's subject. When in doubt, treat the project as having no trigger endpoint. Remember the best match, and whether a test calls it over HTTP (`MockMvc`, `@WebMvcTest`, `@AutoConfigureMockMvc`, `TestRestTemplate`, `RestTestClient`, `WebTestClient`).
- Existing Dapr files: `dapr.yaml` in the project folder or a parent folder (how far up to look is in **Detection** in `REFERENCE.md`), the resources folder its `resourcesPath` points to (`resources/` or `components/`), any component with `actorStateStore: "true"`, and whether another app in `dapr.yaml` already uses the app port.
- Test classes under `src/test/java`, and whether any is a slice test (`@WebMvcTest`, `@DataJpaTest`, `@JsonTest`, … — see **Detection** in `REFERENCE.md`). For each `@WebMvcTest`, whether it names its controllers or is bare: a bare one also loads the new workflow controller and fails without a `DaprWorkflowClient` bean.
- `git status` (read-only). Remember whether the tree has uncommitted changes.

Run Maven as exactly `mvn -q -DskipTests package` and `mvn -q test` when the session's working directory is the Maven project folder, so they match the allowed commands (the same on macOS, Linux and Windows). Otherwise use `mvn -q -f "<project-path>/pom.xml" -DskipTests package` (and the same `-f` form for `test`); the user is then asked to approve it. Never prefix a command with `cd`, and never chain commands with `&&`.

## Phase 2: Check specification

If the request does not say what the workflow should do, ask, one question at a time: its purpose; the steps and pattern (task chaining, fan-out/fan-in, external event / approval, timer, child workflow); the input and output. Then resolve the names as [`../dapr-shared/workflow-placeholders.md`](../dapr-shared/workflow-placeholders.md) defines them (`<WorkflowName>`, `<WorkflowInput>`, `<WorkflowOutput>`, one `<ActivityName>` per step with its `<ActivityInput>` and `<ActivityOutput>`), and `<workflow-route>` as the kebab-case workflow name without the `Workflow` suffix (`LoanReviewWorkflow` gives `loan-review`). `<javaPackage>` is the base package of the existing application, not a derived one. Reuse existing domain records as workflow input or output when they fit. A reused record can be `<WorkflowInput>` only when it has an id component the start route can use as the instance id (`input.id()`, or the entity's own id accessor such as `input.invoiceId()`); otherwise add a new `<WorkflowInput>` record that carries the entity id and the fields the workflow needs.

## Phase 3: Check optional tools

Follow the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`) and remember `DevDashboardInstalled`. Do not ask about it, install it or stop because of it.

## Phase 4: Plan and approval

Emit the **Add Workflow Plan** using the template in `REFERENCE.md`. It lists the target, every file to add, every file to edit with a one-line description of the edit, the dependency changes in `pom.xml`, the app port and where it was read, the Dapr ports, what is reused (an existing actor state store, an existing `dapr.yaml`), what is left alone, the baseline test run (default yes), a port-collision warning when another app in `dapr.yaml` already uses the app port, the **Risk** line for each bare `@WebMvcTest` (see the template in `REFERENCE.md`), and an uncommitted-changes warning when Phase 1 found one.

The plan ends with a **Questions** section. Ask these before any file is created or changed, each with its default. Number only the questions that apply, starting at 1:

1. **Dependency updates** — only when Phase 1 found a newer version available: list each change (`dapr-spring-bom` 1.18.1 → 1.19.1, `dapr-spring-boot-4-starter` → `dapr-spring-boot-starter`, …) and ask whether to make them. Default: **Yes, update.** The workflow code in this skill is written against 1.19.1, and one BOM governs every Dapr artifact, so the project cannot keep the old version and gain the new one.
2. **Where the workflow starts** — only when Phase 1 found a trigger endpoint: the new `POST /workflows/<workflow-route>/start` route is always added; ask whether the existing endpoint (`POST /loans`) should also start the workflow after its existing work succeeds. Default: **Yes.** Exception: when a test calls that endpoint over HTTP, the default is **No**, and the plan adds the **Risk** line from the template: the test would then need a running Dapr sidecar or a mocked `DaprWorkflowClient`. When no endpoint qualifies, write "No existing endpoint starts the workflow; use the new start route." instead of asking.

Write the plan's file lists as if every default is accepted, and mark which items depend on a question.

Then ask the user to approve, change or stop. A plan is not consent: change nothing until the user says yes. A plain "yes" accepts the plan with the defaults; the user may answer a question differently in the same reply. When the user's request already says to go ahead without asking, still show the plan with its questions first, then continue with the defaults. When question 1 is answered no, stop without changes and say why (see **Edge cases** in `REFERENCE.md`).

## Phase 5: Apply

If the baseline test run was kept, run `mvn -q test` once now and remember which tests failed before any change.

Apply the approved items in this fixed order, one step at a time:

1. `pom.xml` — the `dapr-spring-bom` 1.19.1 import and the `dapr-spring-boot-starter` dependency (see **pom.xml edits** in `REFERENCE.md`), plus the dependency updates when question 1 was answered yes.
2. Dapr wiring — `dapr.yaml` and the state store component, or reuse of the existing ones (see **Dapr wiring** in `REFERENCE.md`), with `appPort` set to the app port from Phase 1.
3. `@EnableDaprWorkflows` on the existing `@SpringBootApplication` class, per **Adding to an existing project** in [`../dapr-shared/java-workflow-endpoints.md`](../dapr-shared/java-workflow-endpoints.md). When the project has slice tests, put it on a new `DaprWorkflowConfiguration` `@Configuration` class in the base package instead, and leave the application class unchanged: on the application class it breaks every slice test's context.
4. Records, activities and the workflow class — new top-level files in the base package (or a sub-package of it), following [`../dapr-shared/java-models.md`](../dapr-shared/java-models.md), [`../dapr-shared/java-activity-class.md`](../dapr-shared/java-activity-class.md) and [`../dapr-shared/java-workflow-class.md`](../dapr-shared/java-workflow-class.md), with the patterns from [`../dapr-shared/references/java/patterns.md`](../dapr-shared/references/java/patterns.md).
5. Endpoints — the controller from [`../dapr-shared/java-workflow-endpoints.md`](../dapr-shared/java-workflow-endpoints.md), mapped under `@RequestMapping("/workflows/<workflow-route>")`; its start route answers 409 Conflict for an instance id that is still active. When question 2 was answered yes, also edit the trigger endpoint per **Starting the workflow from an existing endpoint** in the same file.
6. Requests file — append to an existing `*.http` file in the project folder, or add `workflow.http` (see **Requests file** in `REFERENCE.md`).

Rules for every step:

- Edit existing files with `Edit` and the smallest change; never rewrite an existing file with `Write`. Never change files the plan does not list.
- Follow the project's style: indentation, package layout, `final` fields, records.
- Never add a second component with `actorStateStore: "true"`; never replace an existing `dapr.yaml` (append an app entry when needed); never add a second `@EnableDaprWorkflows` or a second application class; keep existing Dapr beans and dependencies.
- Never change `server.port`. A collision with another app in `dapr.yaml` is reported in the plan and in `DAPR-WORKFLOW.md`, not fixed.
- Generated code follows the Java rules of the shared templates and [`../dapr-shared/references/java/gotchas.md`](../dapr-shared/references/java/gotchas.md): records for every payload, constructor injection with `final` fields (never field `@Autowired`), top-level `@Component` workflows and activities called with `<ActivityName>.class.getName()`, `getWorkflowState` plus `readOutputAs`, no `getInstanceState`, `waitForInstanceCompletion`, `purgeInstance` or `WorkflowInstanceStatus`. Workflow code is deterministic: no `Instant.now()`, `UUID.randomUUID()`, `Thread`, `CompletableFuture`, I/O or Spring beans inside a workflow, and only `TaskFailedException` / `TaskCanceledException` are caught there. Loops are bounded. Secrets never pass through workflow inputs or outputs.
- After each step run `mvn -q -DskipTests package`. If it fails, fix that step or undo that step's edits, tell the user what happened, and stop. Never continue past a failing build.
- Never run `git` commands other than `git status`.

## Phase 6: Final verification

Run `mvn -q -DskipTests package` and, when test classes exist, `mvn -q test`. Adding the starter does not need a sidecar for the tests: a `@SpringBootTest` context starts, and the workflow worker keeps retrying the connection in the background. Report failures that also failed in the baseline run as pre-existing. A bare `@WebMvcTest` that the plan's **Risk** line named fails as predicted: report it as caused by the change, with the fix from the Risk line. Never edit tests to make them pass. Do not start `dapr run`.

## Phase 7: Write the run doc

Create `DAPR-WORKFLOW.md` in the Maven project folder using the template in `REFERENCE.md`. Never edit an existing `README.md`.

## Show final message

**IMPORTANT: This is the LAST step. Your output MUST end with the message below followed by the Dev Dashboard recommendation — keep anything before it to one short line (details belong in `DAPR-WORKFLOW.md`). Replace `<ProjectName>` with the Maven project folder name:**

Dapr Workflow is added to <ProjectName>. Open DAPR-WORKFLOW.md in the <ProjectName> folder for what changed and how to run it.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled`. Nothing may follow it.
