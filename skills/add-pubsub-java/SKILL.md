---
name: add-pubsub-java
description: Adds Dapr pub/sub to an existing Spring Boot 4 Maven app after you approve a plan; keeps its subscription type. Use for "add pub/sub to my Spring Boot app" or "subscribe my Spring Boot app to a topic". For a new app use create-pubsub-java.
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

# Add Dapr pub/sub to an existing Spring Boot project

## Overview

This skill adds Dapr pub/sub (publisher, subscriber or both) to a Spring Boot 4.0 web application, built with Maven (single-module or multi-module), that already exists. It changes nothing before the user approves a written plan, edits existing files with the smallest possible change, follows the project's own conventions and the subscription type it already uses, builds the project after every step and runs the existing tests at the end. It never changes git state.

## Execution Order

You MUST follow these phases in strict order:
1. **Resolve target** — read-only inspection of the Maven project. Stops here for Gradle, Spring Boot other than 4.0.x, or a project without a Spring MVC web starter.
2. **Check specification** — role, subscription type, topic, message type, optional features.
3. **Check optional tools** — Diagrid Dapr Dev Dashboard check; never stops the skill.
4. **Plan and approval** — show the Add Pub/Sub Plan with its questions (dependency updates, publishing from an existing endpoint, and when they apply the application module and a security configuration) and wait for approval.
5. **Apply** — one step at a time, building after each.
6. **Final verification** — build and test the project.
7. **Write the run doc** — `DAPR-PUBSUB.md` in the application module folder.
8. **Show final message** — your output MUST end with EXACTLY the message in `## Show final message` followed by the Dev Dashboard recommendation. No other text after it.

## Prerequisites

The user must have installed:

- [JDK 17+](https://adoptium.net/) and [Maven 3.9+](https://maven.apache.org/download.cgi). The skill builds with the installed `mvn`; it never adds the Maven wrapper.
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) 1.19+ (not needed to build; needed to run; `dapr init` provides Redis)
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard). The skill only checks whether it is installed; it never installs it and never stops without it.

Background on delivery guarantees, CloudEvents and the subscription types: [`../dapr-shared/pubsub-concepts.md`](../dapr-shared/pubsub-concepts.md).
Java SDK behaviour every template follows: [`../dapr-shared/references/java/gotchas.md`](../dapr-shared/references/java/gotchas.md) §1, §2, §3, §6 and §8.

## Phase 1: Resolve target

Read-only. Follow **Detection** in `REFERENCE.md`. Check the three gates first, in this order, and stop at the first one that fails. A stop changes nothing, shows no plan and runs no `mvn` command; say what was found and what the user can do instead, using the stop messages in `REFERENCE.md`:

1. **Maven.** The project has a `pom.xml`. A Gradle build (`build.gradle`, `build.gradle.kts`, `settings.gradle*`) or no build file at all stops here.
2. **Spring Boot 4.0.x.** The `spring-boot-starter-parent` parent or an imported `spring-boot-dependencies` BOM is 4.0.x. Spring Boot 3.x stops here and names Dapr Java SDK 1.18.x, the line for Spring Boot 3; any other version, or one that cannot be found, stops too.
3. **Spring MVC web starter.** The project (in a multi-module build, the application module) depends on `spring-boot-starter-webmvc` (or the older name `spring-boot-starter-web`). A WebFlux-only project or one without a web starter stops here.

Then determine and remember:

- The root folder and the **application module folder**, as [`../dapr-shared/java-existing-project.md`](../dapr-shared/java-existing-project.md) defines them (the same folder in a single-module project). Every path below is in the application module folder unless it says otherwise. When several modules qualify, the plan asks which one (see that file).
- The `@SpringBootApplication` class and its package (the base package), whether it already has `@EnableConfigurationProperties` (and with which classes), and the code style: controllers with `@RequestMapping` on the class or not, constructor injection, records or classes for payloads.
- Existing Dapr dependencies (`io.dapr` and `io.dapr.spring`) and their versions: a `dapr-spring-bom` import, a `dapr-spring-boot-4-starter` (the 1.18 Boot 4 starter, which 1.19 replaces with `dapr-spring-boot-starter`), artifacts with their own `<version>` or a version property. Remember every version below 1.19.1 as **newer version available**.
- Existing subscriptions, as `(pubsub, topic)` pairs with their type: `@Topic` methods (programmatic), `subscribeToTopic(` or `subscribeToEvents(` streams (streaming), and `kind: Subscription` YAML scoped to this app or unscoped (declarative). Resolve `${...}` names from the application properties. Also existing publish code (`publishEvent(`, `DaprMessagingTemplate`), an existing `DaprPreviewClient` bean, existing `TopicEventStatus`, `ProcessedEvents` or `UnreadableEventAdvice` classes, and existing `@RestControllerAdvice` / `@ControllerAdvice` classes that handle `HttpMessageNotReadableException` or extend `ResponseEntityExceptionHandler`.
- The application properties file (`src/main/resources/application.properties`, `application.yml` or `application.yaml`), its existing `dapr.pubsub.name` and topic keys, and the app port: `server.port` per **Properties file and app port** in `java-existing-project.md`; 8080 when none sets it.
- Trigger endpoints: `@PostMapping` handlers that create or accept the thing the event is about (for example `POST /shipments` for a shipment-created event). Read-only handlers (`@GetMapping`) never qualify. Remember the best match, whether a test calls it over HTTP (`MockMvc`, `@WebMvcTest`, `@AutoConfigureMockMvc`, `TestRestTemplate`, `RestTestClient`, `WebTestClient`), and whether a `@WebMvcTest` names the trigger controller.
- Existing Dapr files, per **An existing dapr.yaml** in `java-existing-project.md`: the nearest `dapr.yaml`, this app's entry (its `appID` and `appPort`) and app id, the resources folders this app's sidecar loads (including `~/.dapr/components` when `dapr.yaml` names none), every component there with `type: pubsub.` and its `scopes`, every `kind: Resiliency` file, and whether another app in `dapr.yaml` already uses the app port.
- Spring Security: `spring-boot-starter-security` or a `SecurityFilterChain` bean (see **Spring Security** in `java-existing-project.md`), and the routes the existing chains already permit.
- Test classes under `src/test/java`, and for each `@WebMvcTest` whether it names its controllers or is bare (see **Detection** in `REFERENCE.md`).
- `git status` (read-only). Remember whether the tree has uncommitted changes.

Run Maven as exactly `mvn -q -DskipTests package` and `mvn -q test` from the root folder (the aggregator in a multi-module build, so sibling modules build first) when the session's working directory is that folder, so they match the allowed commands (the same on macOS, Linux and Windows). Otherwise use `mvn -q -f "<project-path>/pom.xml" -DskipTests package` with the root folder's `pom.xml` (and the same `-f` form for `test`); the user is then asked to approve it. Never add `-pl`, `-am` or `install`. Never prefix a command with `cd`, and never chain commands with `&&`.

## Phase 2: Check specification

Infer from the request first; otherwise ask, one question at a time:

1. **Role** — publisher, subscriber or both.
2. **Subscription type** (subscriber roles only) — follow the type the code already uses; else the request ("streaming", "pull", "no inbound port" → streaming; "programmatic" or `@Topic` → programmatic; "declarative" or "subscription YAML" → declarative); else ask, default **declarative**. Mixed types already in the app are allowed: ask which one the new topic uses (default: the most used type). One type per topic per app: never subscribe a `(pubsub, topic)` pair that already exists; ask whether to extend the existing handler or use another topic.
3. **Topic**, **event** and **its fields** — derived from the project's own domain, never from a sample scenario. Reuse an existing domain record as the message type when one fits; otherwise ask which event the app publishes, which fields it carries and which field identifies it (the handler deduplicates on that one). Ask what the subscriber should do with it, and never invent a side effect. These answers resolve the template placeholders; the vocabulary is in [`../dapr-shared/pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md), and the add-specific values (package, property keys, routes, class names) are in **Resolving the placeholders** in `REFERENCE.md`.
4. Routing, TTL and raw payload only when mentioned. Routing with a streaming subscription is unsupported: offer declarative for that subscription (default yes).
5. The dead-letter topic is on unless declined.

## Phase 3: Check optional tools

Follow the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`) and remember `DevDashboardInstalled`. Do not ask about it, install it or stop because of it.

## Phase 4: Plan and approval

Emit the **Add Pub/Sub Plan** using the template in `REFERENCE.md`. It lists the target, role, subscription type with the reason, the existing subscriptions found, the topics, every file to add, every file to edit with a one-line description of the edit, the dependency changes in `pom.xml`, the app port and where it was read, the Dapr wiring (component reused or new, resiliency, Subscription file, `dapr.yaml`), what is left alone, the baseline test run (default yes), a port-collision warning when another app in `dapr.yaml` already uses the app port, a **Risk** line for each test the change breaks (see the template), the Spring Security **Risk** line when Phase 1 found Spring Security, and an uncommitted-changes warning when Phase 1 found one. A reused pub/sub component whose `scopes` lack the app id gets the app id added (an edited file). For a streaming subscription the plan states that the app cannot choose RETRY or DROP (gotchas §3).

The plan ends with a **Questions** section. Ask these before any file is created or changed, each with its default. Number only the questions that apply, starting at 1:

1. **Dependency updates** — only when Phase 1 found a newer version available: list each change (`dapr-spring-bom` 1.18.1 → 1.19.1, `dapr-spring-boot-4-starter` → `dapr-spring-boot-starter`, …) and ask whether to make them. Default: **Yes, update.** The pub/sub code in this skill is written against 1.19.1, and one BOM governs every Dapr artifact, so the project cannot keep the old version and gain the new one.
2. **Publish from the existing endpoint** — only for the publisher or both role when Phase 1 found a trigger endpoint: the new `POST /pubsub/<PublishRoute>` endpoint is always added; ask whether the existing endpoint (`POST /shipments`) should also publish the event after its existing work succeeds. When the request names the trigger endpoint ("from POST /shipments") or says the event is published when the thing that endpoint does happens ("when a shipment is created" and the endpoint creates shipments), the default is **Yes** even when a test calls that endpoint over HTTP; the plan then carries the **Risk** line from the template. When the request does not say when the event is published ("publish ShipmentCreated events"), or names a moment no existing endpoint handles, the default is **Yes**, but **No** when a test calls that endpoint over HTTP, because that test would then need a running Dapr sidecar or a `@MockitoBean DaprClient`; say so in the question. When a `@WebMvcTest` names the trigger controller but does not call that endpoint, the default stays as above, and the plan adds the named-controller **Risk** line from the template: the edited controller needs a `DaprClient` bean that slice tests do not create. When no endpoint qualifies, write "No existing endpoint publishes the event; use the new publish endpoint." instead of asking.
3. **Application module** — only when several modules qualify: which module gets pub/sub. Default: the one the plan is written for.
4. **Security configuration** — only when Phase 1 found Spring Security and the existing chains do not already let the sidecar's routes through: add `DaprSecurityConfiguration`. Default: **No.** See **Spring Security** in `java-existing-project.md`. Never edit security configuration without this item approved.

Write the plan's file lists as if every default is accepted, and mark which items depend on a question.

Then ask the user to approve, change or stop. A plan is not consent: change nothing until the user says yes. A plain "yes" accepts the plan with the defaults; the user may answer a question differently in the same reply. When the user's request already says to go ahead without asking, still show the plan with its questions first, then continue with the defaults. When question 1 is answered no, stop without changes and say why (see **Edge cases** in `REFERENCE.md`).

## Phase 5: Apply

If the baseline test run was kept, run `mvn -q test` once now and remember which tests failed before any change.

Apply the approved items in this fixed order, one step at a time:

1. `pom.xml` — the `dapr-spring-bom` 1.19.1 import and the `dapr-spring-boot-starter` dependency in the application module's pom (see **pom.xml edits** in `REFERENCE.md`; in a multi-module build the BOM may go in the root pom), plus the dependency updates when question 1 was answered yes.
2. Dapr wiring — `dapr.yaml`, the pub/sub component, `resiliency.yaml` and, for declarative, `subscription.yaml`, or reuse of the existing ones (and the app id added to a reused component's `scopes`), see **Dapr wiring** in `REFERENCE.md`, with `appPort` set to the app port from Phase 1.
3. Properties and application class — append `dapr.pubsub.name` and the topic keys to the existing properties file (see **Properties** in `REFERENCE.md`). Publisher roles: add `DaprPubSubProperties` to `@EnableConfigurationProperties` on the `@SpringBootApplication` class.
4. Records and handler files — new top-level files in the base package (or a sub-package of it): the `<EventName>` record, and for subscribers `TopicEventStatus`, `ProcessedEvents`, `InMemoryProcessedEvents` and `<EventName>Handler` from [`../dapr-shared/java-pubsub-handler.md`](../dapr-shared/java-pubsub-handler.md), reusing any of them the app already has.
5. Subscriber — the files for the chosen type: [declarative](../dapr-shared/java-pubsub-subscriber-declarative.md) or [programmatic](../dapr-shared/java-pubsub-subscriber-programmatic.md) routes under `/events/<pubsub>/<topic>` plus `UnreadableEventAdvice` scoped to the new controller and ordered first (`@Order(Ordered.HIGHEST_PRECEDENCE)`), or the [streaming](../dapr-shared/java-pubsub-subscriber-streaming.md) `StreamingConfiguration` (`@Bean(defaultCandidate = false)`) and `SmartLifecycle` subscriber with a `@Qualifier`-ed `DaprPreviewClient`, copied as the template has them (see **Subscriber in an existing app** in `REFERENCE.md`).
6. Publisher — the `POST /pubsub/<PublishRoute>` controller from [`../dapr-shared/java-pubsub-publisher.md`](../dapr-shared/java-pubsub-publisher.md), and the trigger endpoint edit when question 2 was answered yes (see **Publishing from an existing endpoint** in `REFERENCE.md`).
7. Security — only when the security question was answered yes: `DaprSecurityConfiguration` from **Spring Security** in [`../dapr-shared/java-existing-project.md`](../dapr-shared/java-existing-project.md), with `/events/<pubsub>/**` for the component name.
8. Requests file — append to an existing `*.http` file in the application module folder, or add `pubsub.http` (see **Requests file** in `REFERENCE.md`).

Rules for every step:

- Edit existing files with `Edit` and the smallest change; never rewrite an existing file with `Write`. Never change files the plan does not list.
- Follow the project's style: indentation, package layout, `final` fields, records.
- Never add a second pub/sub component, a second `dapr.yaml`, a second `@SpringBootApplication` class, a second `DaprPreviewClient` bean or a second subscription for an existing `(pubsub, topic)` pair; never replace an existing `dapr.yaml` or resiliency file (append); keep existing Dapr beans, subscriptions and dependencies.
- Never change `server.port`. A collision with another app in `dapr.yaml` is reported in the plan and in `DAPR-PUBSUB.md`, not fixed.
- Generated code follows the Java rules of the shared templates and [`../dapr-shared/references/java/gotchas.md`](../dapr-shared/references/java/gotchas.md): records for every payload, constructor injection with `final` fields (never field `@Autowired`), publishing with `daprClient.publishEvent(pubSubProperties.getName(), topic, event).block()` and never `DaprMessagingTemplate`, subscriber routes that take `@RequestBody CloudEvent<T>` and answer `{"status": ...}` (never 404), topic and pub/sub names from properties, and a streaming consumer that catches `RuntimeException` inside `doOnNext` with `retryWhen` before `subscribe()`. A declarative `scopes` entry equals the `appID`; the raw payload key is `rawPayload`, never `isRawPayload`.
- After each step run `mvn -q -DskipTests package`. If it fails, fix that step or undo that step's edits, tell the user what happened, and stop. Never continue past a failing build.
- Never run `git` commands other than `git status`.

## Phase 6: Final verification

Run `mvn -q -DskipTests package` and, when test classes exist, `mvn -q test`. Adding the starter does not need a sidecar for the tests: a `@SpringBootTest` context starts, and a streaming subscription keeps retrying its connection in the background. Report failures that also failed in the baseline run as pre-existing. A test that a plan **Risk** line named (bare `@WebMvcTest`, or one that calls or names the trigger controller when question 2 was answered yes) fails as predicted: report it as caused by the change, with the fix from the Risk line, not as pre-existing. Never edit tests to make them pass. Do not start `dapr run`.

## Phase 7: Write the run doc

Create `DAPR-PUBSUB.md` in the application module folder using the template in [`../dapr-shared/pubsub-run-doc.md`](../dapr-shared/pubsub-run-doc.md) with the values in **Add Pub/Sub run doc** in `REFERENCE.md`. Never edit an existing `README.md`.

## Show final message

**IMPORTANT: This is the LAST step. Your output MUST end with the message below followed by the Dev Dashboard recommendation — keep anything before it to one short line (details belong in `DAPR-PUBSUB.md`). Replace `<ProjectName>` with the application module folder name:**

Dapr pub/sub is added to <ProjectName>. Open DAPR-PUBSUB.md in the <ProjectName> folder for what changed and how to run it.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled`. Nothing may follow it.
