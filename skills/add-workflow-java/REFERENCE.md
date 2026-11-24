# Reference: add Dapr Workflow to an existing Spring Boot project

Dependency versions come from [dapr-versions.md](../dapr-shared/dapr-versions.md) — change a pin there, not here.
The workflow, activity, record and controller code comes from the shared Java templates; this file covers what
is different in an existing project: detection, the plan, the edits and the run doc.

## Detection

| What | How |
|---|---|
| Scope | The folder the user named; otherwise the current directory, confirmed in one line. |
| Build tool (gate) | `Glob` `pom.xml` in the scope folder, then `**/pom.xml` below it. None, but `build.gradle`, `build.gradle.kts` or `settings.gradle*` → stop with the **Gradle** message. Neither → stop with the **No Maven project** message. |
| Maven project | The `pom.xml` whose `<parent>` is `org.springframework.boot:spring-boot-starter-parent`, or that imports `org.springframework.boot:spring-boot-dependencies` in `dependencyManagement`. In a multi-module build (`<modules>` in the root `pom.xml`) the application module is the one with the `@SpringBootApplication` class; several → ask. |
| Spring Boot version (gate) | The parent's `<version>`, or the imported `spring-boot-dependencies` version; resolve a `${...}` property from `<properties>`. 4.0.x → continue. 3.x → stop with the **Spring Boot 3** message. Anything else (2.x, 4.1 or later), or a company parent that hides the version → stop with the **Other Spring Boot version** message. |
| Web starter (gate) | A `<dependency>` on `spring-boot-starter-webmvc` or `spring-boot-starter-web` → continue. Only `spring-boot-starter-webflux`, or no web starter → stop with the **No Spring MVC** message. |
| Application class | `Grep` `@SpringBootApplication` under `src/main/java`; its package is the base package (`<javaPackage>`). `@EnableDaprWorkflows` already on it → do not add it again. |
| Existing Dapr | `<groupId>io.dapr</groupId>` and `<groupId>io.dapr.spring</groupId>` in `pom.xml`: the `dapr-spring-bom` import and its version (a literal or a property such as `${dapr.version}`), `dapr-spring-boot-4-starter` (1.18 only), artifacts with their own `<version>`. Any version below 1.19.1 → **newer version available**. |
| Existing workflows | `Grep` `implements Workflow` and `implements WorkflowActivity` under `src/main/java`. Reuse the package layout they use. |
| App port | `server.port` in `src/main/resources/application.properties` (`server.port=8090`), or `server:` → `port:` in `application.yml` / `application.yaml`. A placeholder (`${PORT:8090}`) → use its default. None → 8080, Spring Boot's default. Profile files (`application-<profile>.*`) do not count. |
| Endpoint style | `@RestController` classes; a class-level `@RequestMapping` prefix or method-level paths. |
| Trigger endpoint | A `@PostMapping` (or `@RequestMapping(method = POST)`) handler that creates the workflow's subject. Remember the class, the handler and its route. |
| Tests calling it | Test classes under `src/test/java` that use `MockMvc`, `@WebMvcTest`, `@AutoConfigureMockMvc`, `TestRestTemplate`, `RestTestClient` or `WebTestClient` and send a request to the trigger route. |
| Dapr files | `dapr.yaml` in the project folder or a parent folder up to the repository root; the folder its `resourcesPath` names; component files whose metadata `actorStateStore` is `"true"` or `true` (both forms count); the `appPort` and `daprHTTPPort` of every app entry. |
| Port collision | Another app entry in `dapr.yaml` (not this app) has `appPort` equal to the app port. |
| Tests | Any class under `src/test/java`. |
| Slice tests | Test classes annotated with a Spring Boot test slice: `@WebMvcTest`, `@DataJpaTest`, `@DataJdbcTest`, `@JsonTest`, `@RestClientTest`, `@JdbcTest`, or any other `@...Test` imported from a `org.springframework.boot.*.test.autoconfigure` package. Any → `@EnableDaprWorkflows` goes on a new `DaprWorkflowConfiguration` class, not on the application class. `@SpringBootTest` is not a slice. |

### Stop messages

Use these, filled in, as the whole answer when a gate fails. Change nothing and show no plan.

- **Gradle**: "`<project-path>` builds with Gradle (`build.gradle.kts`). add-workflow-java supports Maven projects (`pom.xml`) only. You can move the build to Maven, or create a separate workflow service with `create-workflow-java` and call it from this app."
- **No Maven project**: "I found no `pom.xml` in `<project-path>`. add-workflow-java adds Dapr Workflow to an existing Spring Boot 4 Maven project; for a new one use `create-workflow-java`."
- **Spring Boot 3**: "`<project-path>` uses Spring Boot <version>. This skill adds Dapr Java SDK 1.19.1, which needs Spring Boot 4.0.x; Spring Boot 3 projects use Dapr Java SDK 1.18.x. You can upgrade the project to Spring Boot 4.0.x first, or create a separate workflow service with `create-workflow-java`."
- **Other Spring Boot version**: "`<project-path>` uses Spring Boot <version> (or: I could not find the Spring Boot version). This skill supports Spring Boot 4.0.x, the version Dapr Java SDK 1.19.1 is built and tested against. You can create a separate workflow service with `create-workflow-java`."
- **No Spring MVC**: "`<project-path>` has no Spring MVC web starter (`spring-boot-starter-webmvc`)<, it uses WebFlux>. The workflow management endpoints this skill adds are Spring MVC controllers that block on `DaprWorkflowClient` calls. You can create a separate workflow service with `create-workflow-java`."

## Add Workflow Plan template

```markdown
## Add Workflow Plan — <ProjectName>

**Target:** `<project-path>` (Spring Boot <4.0.x>, Maven, Java <java.version>, base package `<javaPackage>`)
**Workflow:** <WorkflowName> — <one-line description, pattern>
**App port:** <port> (`server.port` in `<application.properties | application.yml>` | default 8080, no `server.port` set)

### Dependencies (`pom.xml`)
- Import `io.dapr.spring` `dapr-spring-bom` 1.19.1 in `dependencyManagement`
- Add `io.dapr.spring` `dapr-spring-boot-starter` (no version)
- <`dapr-spring-bom` 1.18.1 → 1.19.1; `dapr-spring-boot-4-starter` → `dapr-spring-boot-starter` (question 1)>

### New files
- `<path>` — <purpose>

### Edited files
- `<path>` — <one-line edit description>
- <`<Application>.java` — `@EnableDaprWorkflows` | `DaprWorkflowConfiguration.java` (new) — `@EnableDaprWorkflows`, because `<TestClass>` is a slice test>

### Dapr wiring
- <dapr.yaml: new in `<project-path>` | append app entry to `<path>` | unchanged>; appPort <port>, Dapr HTTP <port>
- State store: <new `<resources folder>/statestore.yaml` | reuse existing `<component name>` in `<path>`>

### Left unchanged
- `README.md`, `server.port`, existing controllers (except the trigger endpoint, question 2), existing components, tests

### Checks
- Baseline test run before changes: yes (reply "no baseline" to skip)
- <Port collision: `<other app>` in `<path to dapr.yaml>` also uses appPort <port>. The two apps cannot run together with `dapr run -f .`; change one port before running. This plan does not change `server.port`.>
- <Uncommitted changes found: the edits will mix with them.>

### Questions
1. A newer Dapr version is available: <`dapr-spring-bom` 1.18.1 → 1.19.1, `dapr-spring-boot-4-starter` → `dapr-spring-boot-starter`>. Update? **Default: yes, update.** (No stops the skill: the workflow code needs 1.19.1.)
2. The workflow always gets its own start route, `POST /workflows/<workflow-route>/start`. Should `<POST /loans>` also start `<WorkflowName>` after it saves the <loan>? **Default: yes.** <Default no when a test calls the endpoint, with the Risk line below.>
   <**Risk:** `<TestClass>` calls `<POST /loans>` through <MockMvc>. If the endpoint also starts the workflow, that test needs a running Dapr sidecar or a `@MockitoBean DaprWorkflowClient`, so the default is no.>

<Leave out a question that does not apply and renumber the rest, so a plan with only the endpoint question numbers it 1 and the user answers "1: no". Without a trigger endpoint, write instead: No existing endpoint starts the workflow; use the new start route.>

Reply **yes** to apply with the defaults, answer a question differently (for example "1: no"), list items to drop, or **stop**.
```

## pom.xml edits

- No `<dependencyManagement>` yet: add one after `<properties>` (or after `<name>`/`<description>` when there are no properties) with the BOM import from [`../dapr-shared/java-workflow-project.md`](../dapr-shared/java-workflow-project.md):

  ```xml
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>io.dapr.spring</groupId>
        <artifactId>dapr-spring-bom</artifactId>
        <version>1.19.1</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>
  ```

- An existing `<dependencyManagement>`: add the `<dependency>` above inside its `<dependencies>`, after the entries already there.
- Add the starter as the first entry of `<dependencies>`, with no `<version>`:

  ```xml
  <dependency>
    <groupId>io.dapr.spring</groupId>
    <artifactId>dapr-spring-boot-starter</artifactId>
  </dependency>
  ```

- Dependency updates (question 1, default yes): change the version where it is declared — the BOM import's `<version>`, or the property it reads (`<dapr.version>`). Replace `dapr-spring-boot-4-starter` with `dapr-spring-boot-starter` in place (1.19 has no separate Boot 4 starter), and likewise `dapr-spring-boot-4-starter-test` with `dapr-spring-boot-starter-test`. An `io.dapr` artifact with its own `<version>` gets 1.19.1 in the same line.
- Never add a version to `dapr-spring-boot-starter`, never change the Spring Boot parent and never run `mvn` goals that edit the `pom.xml` (`versions:*`).

## Dapr wiring

- No `dapr.yaml`: create one in the Maven project folder:

  ```yaml
  version: 1
  common:
    resourcesPath: ./resources
  apps:
    - appID: <app-id>
      appDirPath: .
      appPort: <app-port>
      daprHTTPPort: <free port, default 3555>
      command: ["mvn", "spring-boot:run"]
  ```

  `<app-id>` is the `spring.application.name` when set, otherwise the Maven `artifactId`, in lowercase kebab case. `<app-port>` is the app port from Phase 1. Add `resources/statestore.yaml` from [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md). No `dapr.client.*` properties: the SDK reads the ports `dapr run` exports.
- `dapr.yaml` exists with this app: leave it unchanged. If its `appPort` differs from the app port, say so in the plan and in `DAPR-WORKFLOW.md`; do not change either.
- `dapr.yaml` exists without this app: append an entry under `apps:` with `appDirPath` relative to the `dapr.yaml` folder, `appPort` set to the app port, a `daprHTTPPort` no other entry uses, and `command: ["mvn", "spring-boot:run"]`. Keep every other entry as it is.
- An existing component has `actorStateStore: "true"`: reuse it and do not create another state store. Workflow state goes to that store.
- Components exist but none has `actorStateStore: "true"`: add `statestore.yaml` from [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md) to that existing folder (not a new `resources/` folder). If a component already uses its name, pick another (for example `workflow-store`). Without an actor state store the app builds but every workflow fails at runtime.
- `dapr run -f .` writes `.dapr/logs/` into the app folder. When the project has a `.gitignore` that does not list `.dapr/`, append `.dapr/` to it (a plan item). Do not create a `.gitignore`.

## Controller placement

- Put the workflow, activities, records and controller in the base package. When the base package already has a class named like one of them (`StatusResponse` is the usual clash), put the workflow code in a sub-package such as `<javaPackage>.workflow` instead.
- The controller is the one in [`../dapr-shared/java-workflow-endpoints.md`](../dapr-shared/java-workflow-endpoints.md) with `@RequestMapping("/workflows/<workflow-route>")` on the class. Keep its start route as the template has it: it answers 409 Conflict, with the instance id in the body, when an instance with that id is still `RUNNING`, `PENDING` or `SUSPENDED`, so a repeated start never becomes a 500.
- Include the raise-event handler only when the workflow calls `waitForExternalEvent`.

## Requests file

Use [`../dapr-shared/java-local-http.md`](../dapr-shared/java-local-http.md) with every route under the `/workflows/<workflow-route>` prefix (for example `POST {{host}}/workflows/loan-review/start`) and `@host` on the app port. Append the requests to an existing `*.http` file in the Maven project folder under a `### Dapr Workflow` heading, or create `workflow.http` there.

## DAPR-WORKFLOW.md template

```markdown
# Dapr Workflow in <ProjectName>

## What was added
- <bullet per added or edited file, one line each>

## Run it
`dapr run -f .` from `<folder that holds dapr.yaml>` — starts <ProjectName> with `mvn spring-boot:run` on port <app-port> and its Dapr sidecar. The first start downloads the Maven dependencies.
<Port collision: `<other app>` also uses port <port> in dapr.yaml; change one of them before running both.>

## Try it
<When the trigger endpoint starts the workflow (question 2 yes): one line saying that `<POST /loans>` now starts `<WorkflowName>` with the <loan> id as instance id, and a curl example for it. Then curl examples for start and status under /workflows/<workflow-route>; a second start with the same id while the run is active answers 409. Link to the .http file.>

<Diagrid Dapr Dev Dashboard section from the README section of [../dapr-shared/dev-dashboard.md](../dapr-shared/dev-dashboard.md)>

## Run with Diagrid
<Content from [../dapr-shared/running-with-catalyst.md](../dapr-shared/running-with-catalyst.md), with `<ProjectName>` replaced by the app id.>

## Next steps
- Review the new workflow code with `review-workflow-determinism`, `review-workflow-activity` and `review-workflow-management`.
- Unit-test the activities and the workflow logic with a mocked `WorkflowContext` (JUnit 5 and Mockito from `spring-boot-starter-test`).
```

## Edge cases

- Dependency updates declined (question 1 answered no): stop without changes. Say that the generated code needs Dapr Java SDK 1.19.1 and that the BOM sets one version for every Dapr artifact, so the project cannot mix 1.18 and 1.19.
- Trigger endpoint declined (question 2 answered no): leave it unchanged and add a "Start the workflow from `<endpoint>`" next step to `DAPR-WORKFLOW.md`, with the test caveat when a test calls the endpoint.
- The trigger handler already takes the workflow's subject id from the server (a generated id): schedule with the id of the saved entity, never with the request's id.
- `@EnableDaprWorkflows` already present and workflows exist: add the new workflow next to them and reuse their package; do not add the annotation again.
- Slice tests (`@WebMvcTest` and the like): `@EnableDaprWorkflows` goes on a new `@Configuration` class, see **Adding to an existing project** in [`../dapr-shared/java-workflow-endpoints.md`](../dapr-shared/java-workflow-endpoints.md). On the application class it fails their context with `No qualifying bean of type 'io.dapr.workflows.runtime.WorkflowRuntimeBuilder'`.
- A `@SpringBootTest` test class: it keeps passing without a sidecar. The workflow worker logs `The sidecar at address 127.0.0.1:50001 is unavailable. Will continue retrying.` in the background; that is expected.
- Windows: run `mvn` as written; `mvn` resolves to `mvn.cmd`. Report path-length errors during the build and suggest a shorter path; never move build output.

## Worked example

For a loan service (`loan-service`, Spring Boot 4.0.8, `server.port=8085` in `application.properties`, `LoanController` with `POST /loans` and `GET /loans/{id}`, `LoanServiceTest` testing `LoanService` directly):

- Plan: target `loan-service`, base package `com.example.loans`, workflow `LoanReviewWorkflow` (task chaining: check credit, assess risk, decide), app port 8085 from `application.properties`.
- `pom.xml`: a new `dependencyManagement` with the `dapr-spring-bom` 1.19.1 import, and `dapr-spring-boot-starter` as the first dependency.
- New files: `LoanReviewWorkflow.java`, `CheckCreditActivity.java`, `AssessRiskActivity.java`, `DecideLoanActivity.java`, their input and output records, `StatusResponse.java`, `LoanReviewWorkflowController.java` (all in `src/main/java/com/example/loans/`), `workflow.http`, `dapr.yaml` (appID `loan-service`, appDirPath `.`, appPort 8085, daprHTTPPort 3555), `resources/statestore.yaml`, `DAPR-WORKFLOW.md`.
- Edited: `pom.xml`, `LoanApplication.java` (`@EnableDaprWorkflows`), `LoanController.java` (question 2, yes by default because no test calls `POST /loans` over HTTP): `DaprWorkflowClient` becomes a constructor parameter and `final` field, and `create` calls `workflowClient.scheduleNewWorkflow(LoanReviewWorkflow.class, new LoanReviewInput(created.id(), created.applicant()), created.id())` after `loans.add(application)`; its `ResponseEntity.created(...)` response is unchanged.
- Questions: no newer Dapr version (the project has no Dapr dependency), so only the endpoint question, numbered 1.
- Builds: `mvn -q -DskipTests package` after each step, then `mvn -q test` at the end.
