# Existing Spring Boot projects: shared rules for the add-*-java skills

`add-workflow-java` and `add-pubsub-java` both follow this file for the parts of an existing Maven project
that do not depend on the building block: which module is the app, where the port and properties come from,
where the Dapr dependencies go, how the project is built and run, how an existing `dapr.yaml` and its
components are read, and what Spring Security changes. `<module>` is the application module folder's path
relative to the root folder (`orders-app`).

## The application module folder

- **Single-module project:** the Maven project folder (the one whose `pom.xml` has the Spring Boot parent or
  imports `spring-boot-dependencies`) is also the application module folder and the root folder.
- **Multi-module project:** a `pom.xml` with `<modules>` (usually `<packaging>pom</packaging>`) is the root
  aggregator; its folder is the **root folder**. Read the Spring Boot version from the root pom or the
  module's parent chain, and the web starter from the module's own pom (or a parent it inherits
  dependencies from). The **application module folder** is the module that has a `@SpringBootApplication`
  class under `src/main/java` and the web starter. Several modules qualify → write the plan for the one whose
  name best matches the request (else the first in `<modules>` order) and ask in the plan's **Questions**
  which module gets the change; a different answer means a new plan.
- Use the application module folder for: the properties file and the app port, `src/main/java` (base
  package, new files), `src/test/java` (tests, slice tests, tests that call the trigger endpoint), the
  `dapr-spring-boot-starter` dependency (its `pom.xml`), the `appDirPath` of its `dapr.yaml` entry, the
  `.http` requests file and the run doc (`DAPR-WORKFLOW.md` or `DAPR-PUBSUB.md`). Never add the starter to the root
  aggregator: every module would inherit it.
- **BOM import (`dapr-spring-bom`):** an existing import stays where it is (only its version changes).
  Otherwise add it to the pom that already has a `<dependencyManagement>` section, the root pom first, then
  the application module's pom; when neither has one, add a new section to the application module's pom.
- **Building:** run `mvn -q -DskipTests package` and `mvn -q test` from the **root folder**, so sibling
  modules build first and their tests run too. They match the skill's allowed commands when the session's
  working directory is the root folder. Otherwise (for example a shell whose working directory resets between
  calls) run `mvn -q -f "<root folder>/pom.xml" -DskipTests package` and `mvn -q -f "<root folder>/pom.xml"
  test` with the root folder's absolute path: an `allowed-tools` rule without `*` matches only that exact
  command, so the `-f` form is not pre-approved and the user approves each run. Never use `-pl`, `-am`
  or `install` in the skill's own commands. A test that fails in a sibling module counts like any other
  (baseline first).
- **Running a multi-module app:** `mvn -pl <module> -am spring-boot:run` does not work: Maven runs the goal on
  the aggregator pom too, which fails with `Unable to find a suitable main class` (observed with Spring Boot
  4.0.8). Install the modules first instead: `mvn install -DskipTests` from the root folder, then
  `mvn spring-boot:run` in the application module folder resolves the sibling modules from the local Maven
  repository. The `dapr.yaml` entry keeps `command: ["mvn", "spring-boot:run"]` with `appDirPath` set to
  the module (the Dapr CLI runs the command in `appDirPath`), and the run doc says to run
  `mvn install -DskipTests` from the root folder before `dapr run -f .`, and again after any change to a
  sibling module. A new `dapr.yaml` goes in the root folder with `appDirPath: ./<module>`.

## Properties file and app port

- The properties file is `src/main/resources/application.properties`, `application.yml` or
  `application.yaml` in the application module folder. Profile files (`application-<profile>.*`) do not
  count. When both a `.properties` and a YAML file exist, `.properties` wins for a key both set (Spring Boot
  loads both and gives `.properties` precedence), and new keys go into `.properties`.
- The app port is `server.port` from those files (`server.port=8090`, or `server:` → `port:` in YAML); a
  placeholder (`${PORT:8090}`) gives its default. None → 8080, Spring Boot's default. The plan says which
  file it came from. Never change `server.port`.

## An existing dapr.yaml

- **Finding it:** `dapr.yaml` in the application module folder, then in each parent folder up to and
  including the git repository root (the nearest folder with a `.git` entry); without a git repository, at
  most two parent folders above the root folder. Use the nearest one found.
- **This app's entry** is the one whose `appDirPath`, resolved against the `dapr.yaml` folder, is the
  application module folder.
- **App id:** that entry's `appID` when it exists; otherwise `spring.application.name`; otherwise the
  application module's `artifactId`, in lowercase kebab case.
- **Port collision:** another entry (not this app) has an `appPort` equal to the app port. Report it in the
  plan and the run doc; never fix it.
- **The resources folders this app's sidecar loads.** The Dapr CLI picks one source, in this order
  (`resolveResourcesFilePath` in dapr/cli `pkg/runfileconfig/run_file_config_parser.go`):
  1. this app's own `resourcesPaths` list and `resourcesPath` (both count; relative to its `appDirPath`);
  2. `<appDirPath>/.dapr/resources`, when that folder exists;
  3. `common.resourcesPaths` and `common.resourcesPath` (both count; relative to the `dapr.yaml` folder);
  4. the Dapr default, `~/.dapr/components` (`%USERPROFILE%\.dapr\components` on Windows), filled by
     `dapr init`.

  Read the components in every folder of the source that applies; those are the components this app sees.
  New component files go into the first folder of that source. Without a `dapr.yaml`, the skill creates one
  in the root folder with `common.resourcesPath: ./resources`, so new component files go into
  `<root folder>/resources/`, next to that `dapr.yaml` (not into the application module folder). When the source is the Dapr default, read
  it (it is outside the project) and reuse what fits; `dapr init` puts a Redis `pubsub` and a `statestore`
  with `actorStateStore: "true"` there. When something the change needs is missing there, add
  `resourcesPath: ./resources` to this app's entry and the new components to `<module>/resources` (a plan
  item), and say in the plan that the app then stops loading `~/.dapr/components`, naming the components
  there that its code uses. Never write to `~/.dapr`.
- **`.gitignore`.** `dapr run -f .` writes `.dapr/logs/` into each app's `appDirPath`. The plan item that
  ignores it edits the `.gitignore` in the git repository root (the root folder without a git repository),
  or the application module folder's own `.gitignore` when only that one exists; never create one. A pattern
  without a slash before its end, such as `.dapr/`, matches a `.dapr` folder at any depth below its
  `.gitignore`, so a root `.dapr/` entry already covers `<module>/.dapr/`. Add `.dapr/` when no `.gitignore`
  from the application module folder up to the git root lists it. When the resources source is
  `<appDirPath>/.dapr/resources`, `.dapr/` would hide new component files from git: add `**/.dapr/logs/`
  instead (`.dapr/logs/` with its inner slash would match only next to the `.gitignore`), and when an
  existing entry already ignores `.dapr/`, say in the plan that the new component files there are not
  tracked by git; do not change that entry.
- **Scopes on a reused component.** A component with `scopes` is loaded only by the sidecars of the app ids
  it lists. When a reused pub/sub component or actor state store has `scopes` without this app id, add the
  app id to its `scopes` list (a plan item, listed under **Edited files**); without it the sidecar never
  loads the component, and every publish, subscription or workflow on it fails at runtime.

## Spring Security

**Detection:** `spring-boot-starter-security` in the application module's pom (or a parent it inherits
dependencies from), or a `@Bean` method returning `SecurityFilterChain` under `src/main/java`. Either one
means every route needs a login and every `POST` needs a CSRF token, unless the app's own configuration
permits it. Read the existing `SecurityFilterChain` beans, if any: a route they already `permitAll()` with
CSRF ignored needs nothing.

**Plan:** a **Risk** line under **Checks** that names the routes that would be blocked. Every request the
run doc and the `.http` file send gets a 401 without a login, and every `POST` a 403 without a CSRF token,
even with a login (`curl -u <user>:<password>` alone is not enough; verified with Spring Boot 4.0.8 and
`httpBasic`).

- pub/sub, subscriber with HTTP delivery (declarative or programmatic): the routes the sidecar calls,
  `/dapr/subscribe` and `/dapr/config` (the sidecar reads them when it starts; with a 401 on
  `/dapr/subscribe`, programmatic subscriptions never load) and `/events/<pubsub>/**` (each delivery gets a
  401 or 403, which Dapr retries and then dead-letters; the dead-letter route is blocked too);
- pub/sub, publisher only or streaming subscriber only: no sidecar route (a streaming subscription is a gRPC
  stream the app opens); the Risk line names only the run doc's requests, `POST /pubsub/<TopicName>` and the
  trigger endpoint when it publishes;
- workflow: `/workflows/<workflow-route>/**` for local runs (the curl examples and the `.http` file; the
  workflow itself runs, because the app connects to the sidecar over gRPC, and the sidecar never calls
  these routes).

For the sidecar's routes only (pub/sub with HTTP delivery), the Risk line says that the safer option is
Dapr's app API token: set `APP_API_TOKEN` for the sidecar, and the sidecar sends it to the app in the
`dapr-api-token` header, which the app's security can check instead of opening the routes. The run doc
repeats the note. Never suggest the app API token for routes only people call (`/workflows/**`,
`POST /pubsub/<TopicName>`): the sidecar never sends it there.

**Optional plan item (default no):** only when the Risk line names routes that would be opened (the
sidecar's pub/sub routes, or `/workflows/<workflow-route>/**`), a question in the plan, "Add `DaprSecurityConfiguration`, a
`SecurityFilterChain` that lets <the routes above> through without a login and without CSRF, and leaves every
other route as it is? **Default: no.**" Never edit, add or remove security configuration without that item
approved: not the existing `SecurityFilterChain` beans, not `spring.security.*` properties, not the
dependency. With **no**, the run doc says which routes fail and why.

With **yes**, add this class to the base package, with the routes from the Risk line in `securityMatcher`
(the pub/sub form shown; the workflow form lists `"/workflows/<workflow-route>/**"` instead of the three
pub/sub patterns):

```java
package <javaPackage>;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * The routes the Dapr sidecar calls answer without a login or a CSRF token; every other route keeps the
 * app's own security.
 */
@Configuration
public class DaprSecurityConfiguration {

  @Bean
  @Order(Ordered.HIGHEST_PRECEDENCE)
  SecurityFilterChain daprSidecarRoutes(HttpSecurity http) throws Exception {
    return http
        .securityMatcher("/dapr/subscribe", "/dapr/config", "/events/<pubsub>/**")
        .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
        .csrf(csrf -> csrf.disable())
        .build();
  }
}
```

When the app has **no `SecurityFilterChain` bean of its own** (it relies on Spring Boot's default), add a
second bean to the same class: any `SecurityFilterChain` bean switches the default chain off, so without it
every other route would be open. It is Spring Boot's default chain, written out (add
`import static org.springframework.security.config.Customizer.withDefaults;`):

```java
  /** Spring Boot's default chain, which any SecurityFilterChain bean switches off: every other route. */
  @Bean
  SecurityFilterChain defaultRoutes(HttpSecurity http) throws Exception {
    return http
        .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
        .formLogin(withDefaults())
        .httpBasic(withDefaults())
        .build();
  }
```

Key points:

- `securityMatcher` limits the chain to the listed routes, and `@Order(Ordered.HIGHEST_PRECEDENCE)` makes it
  match before the app's chains; CSRF is off only in this chain. No order comes before
  `HIGHEST_PRECEDENCE`. When an existing chain also has `@Order(Ordered.HIGHEST_PRECEDENCE)` and matches
  the Dapr routes too (no `securityMatcher` of its own means it matches any request), the app can fail to
  start (`UnreachableFilterChainException`, seen with Spring Boot 4.0.8 and Spring Security 7) or the Dapr
  chain is never reached: the optional plan item then also
  changes that chain to `@Order(Ordered.HIGHEST_PRECEDENCE + 1)`, says so in its question and lists the
  file under **Edited files**. An existing chain with its own `securityMatcher` that does not cover the
  Dapr routes needs no change.
- Verified with Spring Boot 4.0.8 (Spring Security 7) and a MockMvc test, both with and without an app
  `SecurityFilterChain`: `POST /events/pubsub/shipments` without a login or CSRF token → 200, `GET
  /dapr/subscribe` → 200, while `GET /shipments/1` → 401 and `POST /shipments` → 403 as before. Without the
  class, the same delivery → 403 and `/dapr/subscribe` → 401.
- Anyone who can reach the app can call the listed routes. Use it for local runs, or check the
  `dapr-api-token` header (`APP_API_TOKEN`) before production.
