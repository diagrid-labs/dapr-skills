# Reference: add Dapr pub/sub to an existing Spring Boot project

Dependency versions come from [dapr-versions.md](../dapr-shared/dapr-versions.md) — change a pin there, not here.
The publisher, handler and subscriber code comes from the shared Java templates; this file covers what is
different in an existing project: detection, the plan, the edits and the run doc. The SDK behaviour behind
every rule is recorded in [gotchas.md](../dapr-shared/references/java/gotchas.md) §1, §2, §3, §6 and §8.

## Detection

| What | How |
|---|---|
| Scope | The folder the user named; otherwise the current directory, confirmed in one line. |
| Build tool (gate) | `Glob` `pom.xml` in the scope folder, then `**/pom.xml` below it. None, but `build.gradle`, `build.gradle.kts` or `settings.gradle*` → stop with the **Gradle** message. Neither → stop with the **No Maven project** message. |
| Maven project | The `pom.xml` whose `<parent>` is `org.springframework.boot:spring-boot-starter-parent`, or that imports `org.springframework.boot:spring-boot-dependencies` in `dependencyManagement`. In a multi-module build (`<modules>` in the root `pom.xml`) the application module is the one with the `@SpringBootApplication` class; several → ask. |
| Spring Boot version (gate) | The parent's `<version>`, or the imported `spring-boot-dependencies` version; resolve a `${...}` property from `<properties>`. 4.0.x → continue. 3.x → stop with the **Spring Boot 3** message. Anything else (2.x, 4.1 or later), or a company parent that hides the version → stop with the **Other Spring Boot version** message. |
| Web starter (gate) | A `<dependency>` on `spring-boot-starter-webmvc` or `spring-boot-starter-web` → continue. Only `spring-boot-starter-webflux`, or no web starter → stop with the **No Spring MVC** message. |
| Application class | `Grep` `@SpringBootApplication` under `src/main/java`; its package is the base package (`<javaPackage>`). Note an existing `@EnableConfigurationProperties(...)` on it and the classes it lists. |
| Existing Dapr | `<groupId>io.dapr</groupId>` and `<groupId>io.dapr.spring</groupId>` in `pom.xml`: the `dapr-spring-bom` import and its version (a literal or a property such as `${dapr.version}`), `dapr-spring-boot-4-starter` (1.18 only), artifacts with their own `<version>`. Any version below 1.19.1 → **newer version available**. |
| Existing subscriptions | Programmatic: `@Topic(` methods; read `name` and `pubsubName`, resolving `${...}` from the properties file. Streaming: `subscribeToTopic(` and `subscribeToEvents(` calls; read the pub/sub and topic arguments (constants, `@Value` fields or literals). Declarative: YAML with `kind: Subscription` in the resources folder whose `scopes` include this app's id, or that has no `scopes`. Record every `(pubsub, topic)` pair, its type, and the class or file that declares it. |
| Existing pub/sub code | `publishEvent(` and `DaprMessagingTemplate` (leave both unchanged; a `DaprMessagingTemplate` is reported in the plan, see **Clashes and mixed types**), a `@Bean` returning `DaprPreviewClient`, and classes named `TopicEventStatus`, `ProcessedEvents`, `InMemoryProcessedEvents` or `UnreadableEventAdvice`. Reuse them; never add a second one. |
| Properties file | `src/main/resources/application.properties`, else `application.yml` / `application.yaml`. Profile files (`application-<profile>.*`) do not count. Record `dapr.pubsub.name` and every key that holds a topic name (`app.topic`, `app.<name>-topic`, or the keys the `@Topic` placeholders read). |
| App port | `server.port` in the properties file (`server.port=8090`), or `server:` → `port:` in YAML. A placeholder (`${PORT:8090}`) → use its default. None → 8080, Spring Boot's default. |
| App id | The `appID` of this app's entry in `dapr.yaml`; otherwise `spring.application.name`; otherwise the Maven `artifactId`, in lowercase kebab case. |
| Endpoint style | `@RestController` classes; a class-level `@RequestMapping` prefix or method-level paths. |
| Trigger endpoint | A `@PostMapping` (or `@RequestMapping(method = POST)`) handler that creates or accepts the event's subject. Remember the class, the handler, its route and the variable that holds the saved result. |
| Tests calling it | Test classes under `src/test/java` that use `MockMvc`, `@WebMvcTest`, `@AutoConfigureMockMvc`, `TestRestTemplate`, `RestTestClient` or `WebTestClient` and send a request to the trigger route. For a `@WebMvcTest`, whether it already has a `@MockitoBean DaprClient` field. |
| Dapr files | `dapr.yaml` in the Maven project folder, then in each parent folder up to and including the git repository root (the nearest folder with a `.git` entry); without a git repository, look in at most two parent folders. Use the nearest one found; the folder its `resourcesPath` names; component files with `type: pubsub.` (name, type, `scopes`); `kind: Resiliency` files and their `targets.components`; the `appID`, `appDirPath`, `appPort` and `daprHTTPPort` of every app entry. This app's entry is the one whose `appDirPath` resolves to the Maven project folder. |
| Port collision | Another app entry in `dapr.yaml` (not this app) has `appPort` equal to the app port. |
| Tests | Any class under `src/test/java`. |
| Bare `@WebMvcTest` | A `@WebMvcTest` with no controllers listed (not `@WebMvcTest(ShipmentController.class)` or `@WebMvcTest(controllers = ...)`). It loads every `@Controller` in the app, including the new ones: the publish controller needs a `DaprClient` bean and the declarative or programmatic events controller needs the `<EventName>Handler` bean, and no slice creates either → the plan gets the **bare `@WebMvcTest`** Risk line. |
| Git | `git status` only (read-only). |

### Stop messages

Use these, filled in, as the whole answer when a gate fails. Change nothing and show no plan.

- **Gradle**: "`<project-path>` builds with Gradle (`build.gradle.kts`). add-pubsub-java supports Maven projects (`pom.xml`) only. You can move the build to Maven, or create a separate pub/sub service with `create-pubsub-java` and call it from this app."
- **No Maven project**: "I found no `pom.xml` in `<project-path>`. add-pubsub-java adds Dapr pub/sub to an existing Spring Boot 4 Maven project; for a new one use `create-pubsub-java`."
- **Spring Boot 3**: "`<project-path>` uses Spring Boot <version>. This skill adds Dapr Java SDK 1.19.1, which needs Spring Boot 4.0.x; Spring Boot 3 projects use Dapr Java SDK 1.18.x. You can upgrade the project to Spring Boot 4.0.x first, or create a separate pub/sub service with `create-pubsub-java`."
- **Other Spring Boot version**: "`<project-path>` uses Spring Boot <version> (or: I could not find the Spring Boot version). This skill supports Spring Boot 4.0.x, the version Dapr Java SDK 1.19.1 is built and tested against. You can create a separate pub/sub service with `create-pubsub-java`."
- **No Spring MVC**: "`<project-path>` has no Spring MVC web starter (`spring-boot-starter-webmvc`)<, it uses WebFlux>. The subscriber routes and the publish endpoint this skill adds are Spring MVC controllers, and the publisher blocks on `DaprClient` calls. You can create a separate pub/sub service with `create-pubsub-java`."

## Resolving the placeholders

Resolve the domain placeholders as [`../dapr-shared/pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md)
defines them (Java forms), with these values that differ in an existing project:

| Placeholder or name | Value in an existing project |
|---|---|
| `<javaPackage>` | The base package of the existing application, never a derived one. The templates' `package <javaPackage>.publisher;` and `package <javaPackage>.subscriber;` both become `package <javaPackage>;`: one app, one copy of the `<EventName>` record. When the base package already has a class with the same name as a new one (other than the pub/sub classes the app already has, which are reused), put all new pub/sub classes in `<javaPackage>.pubsub` instead. |
| `<SubscribeRoute>`, `<DeadLetterRoute>` | `/events/<pubsub>/<TopicName>` and `/events/<pubsub>/<DeadLetterTopicName>`, where `<pubsub>` is the component name. |
| `<PublishRoute>` | `pubsub/<TopicName>`, so the new endpoint is `POST /pubsub/<TopicName>` and never clashes with the app's own routes. The class is `<PublishResource>PublishController`. |
| Topic property keys | `app.topic` and `app.dead-letter-topic`, as the templates use them, when the properties file has neither key and the app has no other topic keys. Otherwise `app.<TopicName>-topic` and `app.<TopicName>-dead-letter-topic`; replace `${app.topic}` and `${app.dead-letter-topic}` in the template code with the chosen keys. |
| `dapr.pubsub.name` | The existing value when the file sets it; otherwise the name of the reused pub/sub component, or `pubsub` for a new one. |
| `<EventName>` | A new record, or an existing domain record when it fits and has an identifying component (`<idField>`). |

## Add Pub/Sub Plan template

```markdown
## Add Pub/Sub Plan — <ProjectName>

**Target:** `<project-path>` (Spring Boot <4.0.x>, Maven, Java <java.version>, base package `<javaPackage>`)
**Role:** <publisher | subscriber | both>
**Subscription type:** <declarative | programmatic | streaming> — <default | follows existing @Topic subscriptions | follows existing `<path>/subscription.yaml` | follows existing subscribeToTopic streams | requested>
**App port:** <port> (`server.port` in `<application.properties | application.yml>` | default 8080, no `server.port` set)

### Existing subscriptions
| Pub/sub | Topic | Type | Declared in |
|---|---|---|---|
| <pubsub> | <topic> | <type> | <class or file> |
<Or: None.>

### Topics
| Pub/sub | Topic | Type | Route or handler | Dead-letter |
|---|---|---|---|---|
| <pubsub> | <TopicName> | <type> | <`<SubscribeRoute>` | `<TopicResource>StreamingSubscriber`> | <DeadLetterTopicName> |

### Dependencies (`pom.xml`)
- Import `io.dapr.spring` `dapr-spring-bom` 1.19.1 in `dependencyManagement`
- Add `io.dapr.spring` `dapr-spring-boot-starter` (no version)
- <`dapr-spring-bom` 1.18.1 → 1.19.1; `dapr-spring-boot-4-starter` → `dapr-spring-boot-starter` (question 1)>
- <Or: unchanged, the project already has `dapr-spring-boot-starter` with `dapr-spring-bom` 1.19.1.>

### New files
- `<path>` — <purpose>

### Edited files
- `<path>` — <one-line edit description>
- `<properties file>` — append `dapr.pubsub.name` and the topic keys
- <`<Application>.java` — `@EnableConfigurationProperties(DaprPubSubProperties.class)` (publisher roles)>
- <`<TriggerController>.java` — `<POST /shipments>` also publishes `<EventName>` (question 2)>

### Dapr wiring
- <dapr.yaml: new in `<project-path>` | append app entry to `<path>` | unchanged | add `appPort` to the existing entry>; app id `<app-id>`, appPort <port>, Dapr HTTP <port>
- Component: <new `<resources folder>/pubsub.yaml` | reuse existing `<component name>` in `<path>`>
- Resiliency: <new `<resources folder>/resiliency.yaml` | append to existing `<path>` | unchanged, `<path>` already targets the component>
- Subscription: <new `<resources folder>/subscription.yaml` scoped to `<app-id>` | none: code subscription>

### Left unchanged
- `README.md`, `server.port`, existing controllers (except the trigger endpoint, question 2), existing subscriptions, components and tests

### Checks
- Baseline test run before changes: yes (reply "no baseline" to skip)
- Build after every step: `mvn -q -DskipTests package`
- <Port collision: `<other app>` in `<path to dapr.yaml>` also uses appPort <port>. The two apps cannot run together with `dapr run -f .`; change one port before running. This plan does not change `server.port`.>
- <Uncommitted changes found: the edits will mix with them.>
- <Streaming: the streaming API acknowledges every event it hands to the app, so the handler cannot choose RETRY or DROP; a failed handler loses the event, and only a body that cannot be deserialized is dead-lettered.>
- <**Risk:** `<TestClass>` is a `@WebMvcTest` that names no controllers, so it also loads the new `<PublishResource>PublishController` (needs a `DaprClient` bean) and `<TopicResource>EventsController` (needs `<EventName>Handler`), which slice tests do not create. After this change it fails with `No qualifying bean of type ...` until the test gets `@MockitoBean` fields for `DaprClient` and `<EventName>Handler`, or lists its controllers (`@WebMvcTest(<Controller>.class)`). This skill does not edit tests.>

### Questions
1. A newer Dapr version is available: <`dapr-spring-bom` 1.18.1 → 1.19.1, `dapr-spring-boot-4-starter` → `dapr-spring-boot-starter`>. Update? **Default: yes, update.** (No stops the skill: the pub/sub code needs 1.19.1.)
2. The event always gets its own publish endpoint, `POST /pubsub/<TopicName>`. Should `<POST /shipments>` also publish `<EventName>` after it saves the <shipment>? **Default: yes.** <Default no when the request does not ask to publish from this action and a test calls the endpoint.>
   <**Risk:** `<TestClass>` calls `<POST /shipments>` through <MockMvc>. If the endpoint also publishes, that test needs a running Dapr sidecar or a `@MockitoBean DaprClient` whose `publishEvent(...)` returns `Mono.empty()`. This skill does not edit tests.>

<Leave out a question that does not apply and renumber the rest, so a plan with only the endpoint question numbers it 1 and the user answers "1: no". Without a trigger endpoint, write instead: No existing endpoint publishes the event; use the new publish endpoint.>

Reply **yes** to apply with the defaults, answer a question differently (for example "1: no"), list items to drop, or **stop**.
```

## pom.xml edits

- No `<dependencyManagement>` yet: add one after `<properties>` (or after `<name>`/`<description>` when there are no properties) with the BOM import from [`../dapr-shared/java-pubsub-project.md`](../dapr-shared/java-pubsub-project.md):

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

- An existing `<dependencyManagement>`: add the `<dependency>` above inside its `<dependencies>`, after the entries already there. When it already imports `dapr-spring-bom`, add no second import; only its version changes (see the dependency updates below).
- When the project has no Dapr starter yet (neither `dapr-spring-boot-starter` nor `dapr-spring-boot-4-starter`), add the starter as the first entry of `<dependencies>`, with no `<version>`. When it already has one, add nothing here: an existing `dapr-spring-boot-starter` stays where it is, and a `dapr-spring-boot-4-starter` is replaced in place by the dependency updates below, so the project never has two Dapr starters. The starter brings `DaprClient`, `DaprClientBuilder`, `@Topic`, `CloudEvent`, `DaprPubSubProperties` and `DaprPreviewClient`; pub/sub needs no other Dapr artifact.

  ```xml
  <dependency>
    <groupId>io.dapr.spring</groupId>
    <artifactId>dapr-spring-boot-starter</artifactId>
  </dependency>
  ```

- Dependency updates (question 1, default yes): change the version where it is declared — the BOM import's `<version>`, or the property it reads (`<dapr.version>`). Replace the `<artifactId>` of `dapr-spring-boot-4-starter` with `dapr-spring-boot-starter` in place, keeping the dependency where it is (1.19 has no separate Boot 4 starter), and likewise `dapr-spring-boot-4-starter-test` with `dapr-spring-boot-starter-test`. An `io.dapr` artifact with its own `<version>` gets 1.19.1 in the same line.
- Never add a version to `dapr-spring-boot-starter`, never add `dapr-spring-messaging` (it only brings `DaprMessagingTemplate`), never change the Spring Boot parent and never run `mvn` goals that edit the `pom.xml` (`versions:*`).

## Dapr wiring

- No `dapr.yaml`: create one in the Maven project folder:

  ```yaml
  version: 1
  common:
    resourcesPath: ./resources
  apps:
    - appID: <app-id>
      appDirPath: .
      appPort: <port>
      daprHTTPPort: <free port, default 3555>
      command: ["mvn", "spring-boot:run"]
  ```

  `<app-id>` is the app id from **Detection** and `<port>` the app port. Keep `appPort` for every subscription type, streaming included: the app still serves its own HTTP API (see [`../dapr-shared/pubsub-dapr-yaml.md`](../dapr-shared/pubsub-dapr-yaml.md) → **Port and appPort rules**). No `dapr.client.*` properties: the SDK reads the ports `dapr run` exports.
- `dapr.yaml` exists with this app: leave the entry unchanged. When it has no `appPort` and the new subscription is declarative or programmatic, add `appPort: <port>` to that entry (a plan item): the sidecar cannot deliver to the app without it. When its `appPort` differs from the app port, say so in the plan and in `DAPR-PUBSUB.md`; do not change either.
- `dapr.yaml` exists without this app: append an entry under `apps:` with `appDirPath` relative to the `dapr.yaml` folder, `appPort` set to the app port, a `daprHTTPPort`, and `command: ["mvn", "spring-boot:run"]`. The `daprHTTPPort` is 3555 when no entry uses it as an `appPort`, `daprHTTPPort` or `daprGRPCPort`; otherwise count up from 3555 (3556, 3557, …) to the first port none of them uses. It must also differ from this app's port. Keep every other entry as it is.
- Pub/sub component: an existing `type: pubsub.*` component is reused, and its `metadata.name` is the `dapr.pubsub.name` value; several → ask which one. None → add `pubsub.yaml` from [`../dapr-shared/dapr-pubsub-redis.md`](../dapr-shared/dapr-pubsub-redis.md) to the `resourcesPath` folder (`resources/` for a new `dapr.yaml`). When another component is already named `pubsub` (a state store, for example), name the new one `messages-pubsub` and say so in the plan.
- Resiliency: none → add `resiliency.yaml` from [`../dapr-shared/dapr-pubsub-resiliency.md`](../dapr-shared/dapr-pubsub-resiliency.md) to the same folder, with the target named after the component. An existing `kind: Resiliency` file → append the policy and target per **Appending to an existing Resiliency** in that file; a target for the component that already exists stays unchanged.
- Declarative only: add `subscription.yaml` from [`../dapr-shared/dapr-pubsub-subscription.md`](../dapr-shared/dapr-pubsub-subscription.md) (both documents, the topic's and its dead-letter topic's) to the same folder, with `pubsubname` set to the component name and `scopes` exactly the app id. When `subscription.yaml` already exists, name the new file `<TopicName>-subscription.yaml`.
- `dapr run -f .` writes `.dapr/logs/` into the app folder. When the project has a `.gitignore` that does not list `.dapr/`, append `.dapr/` to it (a plan item). Do not create a `.gitignore`.

## Properties

Append to the existing properties file with `Edit`, after its last line; never reorder or change existing lines,
and never create an `application.properties` next to an existing `application.yml`.

`application.properties` (keys from **Resolving the placeholders**; drop `dapr.pubsub.name` when it is already
set, and the dead-letter key when the user declined the dead-letter topic):

```properties
dapr.pubsub.name=pubsub
app.topic=<TopicName>
app.dead-letter-topic=<DeadLetterTopicName>
```

`application.yml` / `application.yaml`: the same keys in YAML. Add them under an existing top-level `dapr:` or
`app:` block when the file has one; otherwise append the blocks at the end:

```yaml
dapr:
  pubsub:
    name: pubsub
app:
  topic: <TopicName>
  dead-letter-topic: <DeadLetterTopicName>
```

Publisher roles also need the `DaprPubSubProperties` bean: add `@EnableConfigurationProperties(DaprPubSubProperties.class)`
(imports `io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties` and
`org.springframework.boot.context.properties.EnableConfigurationProperties`) to the `@SpringBootApplication`
class, as [`../dapr-shared/java-pubsub-project.md`](../dapr-shared/java-pubsub-project.md) does. When the class
already has `@EnableConfigurationProperties({...})`, add `DaprPubSubProperties.class` to its list: the annotation
cannot appear twice. A slice test still loads with it, because it only binds properties.

## Subscriber in an existing app

Copy the files from the shared templates with the values from **Resolving the placeholders**:

| Type | Files |
|---|---|
| Declarative | `<EventName>`, `TopicEventStatus`, `ProcessedEvents`, `InMemoryProcessedEvents`, `<EventName>Handler` ([`java-pubsub-handler.md`](../dapr-shared/java-pubsub-handler.md)), `<TopicResource>EventsController` ([`java-pubsub-subscriber-declarative.md`](../dapr-shared/java-pubsub-subscriber-declarative.md)), the scoped `UnreadableEventAdvice` below, and `subscription.yaml` |
| Programmatic | The same handler files and scoped advice, and `<TopicResource>EventsController` from [`java-pubsub-subscriber-programmatic.md`](../dapr-shared/java-pubsub-subscriber-programmatic.md), with the `@Topic` placeholders pointing at the chosen property keys |
| Streaming | The handler files without `UnreadableEventAdvice`, `StreamingConfiguration` and `<TopicResource>StreamingSubscriber` from [`java-pubsub-subscriber-streaming.md`](../dapr-shared/java-pubsub-subscriber-streaming.md), with its `@Value` keys pointing at the chosen property keys |

- **`UnreadableEventAdvice` is scoped to the subscriber controllers.** The template's advice applies to every
  controller; in an existing app it would turn a malformed request to the app's own endpoints (a 400 today)
  into 200 `{"status": "DROP"}`. Add `assignableTypes` so it only answers for the event routes:

  ```java
  package <javaPackage>;

  import org.slf4j.Logger;
  import org.slf4j.LoggerFactory;
  import org.springframework.http.ResponseEntity;
  import org.springframework.http.converter.HttpMessageNotReadableException;
  import org.springframework.web.bind.annotation.ExceptionHandler;
  import org.springframework.web.bind.annotation.RestControllerAdvice;

  /**
   * A CloudEvent whose data cannot be bound to the record makes Spring answer 400, which Dapr retries.
   * Answer DROP instead: retrying a malformed message never helps. Scoped to the subscriber routes, so the
   * app's own endpoints keep answering 400.
   */
  @RestControllerAdvice(assignableTypes = <TopicResource>EventsController.class)
  public class UnreadableEventAdvice {

    private static final Logger logger = LoggerFactory.getLogger(UnreadableEventAdvice.class);

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<TopicEventStatus> onUnreadable(HttpMessageNotReadableException e) {
      logger.warn("Dropping an event that cannot be read: {}", e.getMostSpecificCause().getMessage());
      return ResponseEntity.ok(TopicEventStatus.DROP);
    }
  }
  ```

  With several events controllers, list them all (`assignableTypes = {AEventsController.class, BEventsController.class}`).
  When the app already has an `UnreadableEventAdvice`, add the new controller to its `assignableTypes` instead of
  adding a second advice; an unscoped existing one already covers it.
- **The streaming subscriber qualifies its `DaprPreviewClient`.** The autoconfigured `DaprClient` bean also
  implements `DaprPreviewClient`, so in an app that injects `DaprClient` anywhere (a publisher, an existing
  service) the template's constructor finds two candidates and the context fails to start
  (`NoUniqueBeanDefinitionException`, gotchas §3). Write the parameter as
  `@Qualifier("daprPreviewClient") DaprPreviewClient previewClient` and import
  `org.springframework.beans.factory.annotation.Qualifier`; do this in every existing app, whether or not it
  publishes today.
- A topic handled by an existing class: never add a second subscription for that `(pubsub, topic)` pair.
- An existing `DaprPreviewClient` bean: reuse it, skip `StreamingConfiguration`, and use that bean's name in
  the `@Qualifier`.
- An existing `<EventName>Handler`-style class that already handles the event's domain: keep it; the new
  handler may call it as its `<HandlerBody>`.
- Existing `TopicEventStatus` / `ProcessedEvents`: reuse them. When the app's own status record has another
  name, use it in the new controller instead of adding `TopicEventStatus`.

## Publishing from an existing endpoint

When question 2 was answered yes, edit the trigger controller with the smallest change:

- Add `DaprClient daprClient`, `DaprPubSubProperties pubSubProperties` and `@Value("${app.topic}") String topic`
  (with the chosen topic key) as constructor parameters after the existing ones, each assigned to a new
  `private final` field. Add the imports `io.dapr.client.DaprClient`,
  `io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties` and
  `org.springframework.beans.factory.annotation.Value`.
- In the handler, publish after the existing work succeeds and before the existing `return`, from the saved
  result, not from the request (the saved entity carries the server-generated id):

  ```java
  daprClient.publishEvent(pubSubProperties.getName(), topic,
      new <EventName>(<fields from the saved result>)).block();
  ```

- Leave the existing response unchanged. A failed publish throws `DaprException`, so the endpoint answers 500
  after its work was saved; say so in `DAPR-PUBSUB.md` (the work and the event are not one transaction).
- Never catch the publish exception to return a 2xx (DPS-PUB-002), and never use `DaprMessagingTemplate`
  (gotchas §2).

The new `<PublishResource>PublishController` is the **Publish endpoint** from
[`../dapr-shared/java-pubsub-publisher.md`](../dapr-shared/java-pubsub-publisher.md) with
`@PostMapping("/pubsub/<TopicName>")`, the class name from **Resolving the placeholders** and the chosen topic key.

## Requests file

Use [`../dapr-shared/pubsub-local-http.md`](../dapr-shared/pubsub-local-http.md) with camelCase JSON keys (the
record component names). One app plays both roles, so `@publisherHost` and `@subscriberHost` are both
`http://localhost:<port>` (the app port) and `@daprHost` is this app's `daprHTTPPort`. The publish request goes
to `/pubsub/<TopicName>`; add a request for the trigger endpoint when question 2 was answered yes. Keep only the
requests for the role and type (the variants in that file). Append them to an existing `*.http` file in the Maven
project folder under a `### Dapr pub/sub` heading, or create `pubsub.http` there.

## Add Pub/Sub run doc

Use [`../dapr-shared/pubsub-run-doc.md`](../dapr-shared/pubsub-run-doc.md) with these values:

- `<StartCommand>`: `dapr run -f .` from the folder that holds `dapr.yaml`; it starts the app with
  `mvn spring-boot:run` on the app port and its sidecar. The first start downloads the Maven dependencies.
  Add the port-collision line when the plan had one.
- Topics table: every existing subscription from the plan and every new one.
- Try it: curl and PowerShell examples for `POST /pubsub/<TopicName>` on the app port and, when question 2 was
  answered yes, for the trigger endpoint, then the log line the handler writes. Link to the `.http` file.
- How the subscription works: declarative and programmatic as the template says. Streaming: the app opens a
  gRPC stream to the sidecar with `DaprPreviewClient.subscribeToTopic(...)`, started and stopped with the app.
- Delivery semantics, declarative and programmatic (gotchas §1): success → 200 `{"status": "SUCCESS"}`; the
  handler throws → delivered 6 times, 5s apart, then dead-lettered; an invalid or unreadable message → 200
  `{"status": "DROP"}`, not redelivered, and sent to the dead-letter topic at once; duplicates (an `<idField>`
  already processed) are acknowledged and skipped. Streaming (gotchas §3): the preview API acknowledges every
  event it hands to the app, so the app cannot choose RETRY or DROP; a failed handler loses the event (the
  handler catches the exception so the stream stays open), and only a body that cannot be deserialized is
  dead-lettered. The dedupe key is `<idField>`.
- Say that the publisher uses `DaprClient.publishEvent(...).block()` and not `DaprMessagingTemplate`, whose
  fixed 10-second TTL would expire a failing message before it reaches the dead-letter topic.
- When the trigger endpoint publishes: a failed publish answers 500 after the work was saved.
- Tests: tests that call a publishing endpoint need a running sidecar or a `@MockitoBean DaprClient` whose
  `publishEvent(...)` returns `Mono.empty()`; tests that slice the web layer need `@MockitoBean` fields for the
  beans the new controllers take.
- Before production: also "Replace `InMemoryProcessedEvents` with a Dapr state store." (already in the template).
- The Diagrid section is included (this skill always uses `dapr run`).
- Next steps: the three review skills; "Publish from `<endpoint>`" when question 2 was answered no.

## Clashes and mixed types

| Situation | Behaviour |
|---|---|
| Existing pub/sub component (any `pubsub.*`) | Reuse it; its name becomes `dapr.pubsub.name`. Several → ask which. |
| A component named `pubsub` that is not a pub/sub | Name the new component `messages-pubsub` and say so in the plan. |
| Mixed subscription types already in the app | Allowed. Ask which type the new topic uses (default: the most used type). The plan lists the type per topic. |
| Same `(pubsub, topic)` already subscribed, any type | Never add a second subscription. Ask whether to extend the existing handler or use another topic. |
| Declarative YAML exists but its `scopes` do not include this app id | It does not subscribe this app. Do not reuse it; add a new Subscription file scoped to this app and report the mismatch in the plan. |
| Existing `@Topic` methods with hard-coded names | Leave them; the new subscription still reads its names from properties. |
| Existing `DaprMessagingTemplate` | Leave it unchanged; never use it in new code. Add a plan line that it publishes with a fixed 10-second TTL (gotchas §2) and suggest `review-pubsub-publishing` (DPS-PUB-013). |
| Existing `dapr.yaml` or resiliency file | Append to it; never replace it. |
| Role `both` in one app | Allowed. The plan notes that the app receives its own events. |
| An existing global `@RestControllerAdvice` that maps an exception to 404 or 2xx | It also applies to the new subscriber routes: a 404 makes Dapr drop the message. Report it in the plan; do not change it. |

## Edge cases

- Dependency updates declined (question 1 answered no): stop without changes. Say that the generated code needs Dapr Java SDK 1.19.1 and that the BOM sets one version for every Dapr artifact, so the project cannot mix 1.18 and 1.19.
- Trigger endpoint declined (question 2 answered no): leave it unchanged and add a "Publish from `<endpoint>`" next step to `DAPR-PUBSUB.md`, with the test caveat when a test calls the endpoint.
- Trigger endpoint covered by an HTTP test and question 2 yes: the plan carries the Risk line. A `@WebMvcTest` on that controller fails to load (no `DaprClient` bean in the slice); a `@SpringBootTest` that calls it gets a 500 at once, because the publish finds no sidecar (`java.net.ConnectException: Connection refused`, observed; there is no long wait). In Phase 6 report that failure as caused by the change, with the fix (`@MockitoBean DaprClient` whose `publishEvent(...)` returns `Mono.empty()`), not as pre-existing.
- A bare `@WebMvcTest` (no controllers listed): it loads the new controllers too and fails for the missing `DaprClient` or `<EventName>Handler` bean, because the slice excludes the Dapr autoconfiguration and `@Service` classes. The plan carries the **Risk** line; never edit the test.
- A `@SpringBootTest` test class: it keeps passing without a sidecar. A streaming subscription logs `Streaming subscription to <TopicName> failed; resubscribing` in the background; that is expected.
- Declarative or programmatic subscriber and an existing `dapr.yaml` entry without `appPort`: add it (see **Dapr wiring**).
- A `HotReload: false` Configuration: say in the run doc that declarative changes need a restart.
- Routing, TTL and raw payload: only when asked, per `create-pubsub-java`'s rules in the shared templates (`@Rule` for programmatic, `rules` in `subscription.yaml` for declarative, `ttlInSeconds` / `rawPayload` metadata on the publish). Routing with streaming: offer declarative.
- Windows: run `mvn` as written; `mvn` resolves to `mvn.cmd`. Report path-length errors during the build and suggest a shorter path; never move build output.
- Edits keep the existing line endings of each file.

## Worked example

For a shipments service (`shipments-api`, Spring Boot 4.0.8, `server.port=8083` in `application.properties`,
`ShipmentController` with `POST /shipments` and `GET /shipments/{id}`, `ShipmentServiceTest` testing
`ShipmentService` directly and a `@SpringBootTest` `contextLoads`), role both, declarative, event
`ShipmentCreated(String shipmentId, String carrier, String destination)` on topic `shipments`:

- Plan: target `shipments-api`, base package `com.example.shipments`, **Subscription type:** declarative — default, app port 8083 from `application.properties`, no existing subscriptions.
- `pom.xml`: a new `dependencyManagement` with the `dapr-spring-bom` 1.19.1 import, and `dapr-spring-boot-starter` as the first dependency.
- `application.properties`: `dapr.pubsub.name=pubsub`, `app.topic=shipments`, `app.dead-letter-topic=shipments-deadletter` appended; `ShipmentsApplication.java` gains `@EnableConfigurationProperties(DaprPubSubProperties.class)`.
- New files in `src/main/java/com/example/shipments/`: `ShipmentCreated.java`, `TopicEventStatus.java`, `ProcessedEvents.java`, `InMemoryProcessedEvents.java`, `ShipmentCreatedHandler.java`, `ShipmentsEventsController.java` (`POST /events/pubsub/shipments` and `/events/pubsub/shipments-deadletter`), `UnreadableEventAdvice.java` (`assignableTypes = ShipmentsEventsController.class`), `ShipmentsPublishController.java` (`POST /pubsub/shipments`). Also `dapr.yaml` (appID `shipments-api`, appDirPath `.`, appPort 8083, daprHTTPPort 3555), `resources/pubsub.yaml`, `resources/resiliency.yaml`, `resources/subscription.yaml` (`scopes: [shipments-api]`), `pubsub.http`, `DAPR-PUBSUB.md`.
- Edited: `pom.xml`, `application.properties`, `ShipmentsApplication.java`, `.gitignore` (`.dapr/`), and `ShipmentController.java` (question 2, yes by default because no test calls `POST /shipments` over HTTP): `DaprClient`, `DaprPubSubProperties` and the topic become constructor parameters and `final` fields, and `create` calls `daprClient.publishEvent(pubSubProperties.getName(), topic, new ShipmentCreated(created.id(), created.carrier(), created.destination())).block()` after `shipments.create(shipment)`; its `ResponseEntity.created(...)` response is unchanged.
- Questions: no newer Dapr version (the project has no Dapr dependency), so only the endpoint question, numbered 1.
- Builds: `mvn -q -DskipTests package` after each step, then `mvn -q test` at the end (3 tests pass without a sidecar).
