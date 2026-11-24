# Java pub/sub project files

Resolve every placeholder from the specification interview before copying this file; the vocabulary is in
[pubsub-placeholders.md](pubsub-placeholders.md). Package versions come from
[dapr-versions.md](dapr-versions.md).

Spring Boot 4 applications built with Maven: an aggregator `pom.xml` in `<ProjectRoot>` and one Maven
project per app, `publisher/` and `subscriber/`. Each app owns its `<EventName>` record; there is no shared
module. A single-role project keeps the aggregator with one `<module>`.

## Aggregator pom.xml

Create `pom.xml` in the `<ProjectRoot>` folder:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>com.example</groupId>
  <artifactId><root-kebab></artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <packaging>pom</packaging>
  <name><root-kebab></name>

  <modules>
    <module>publisher</module>
    <module>subscriber</module>
  </modules>
</project>
```

### Key points

- `mvn -q -DskipTests package` in `<ProjectRoot>` builds every app in one run.
- The aggregator is not a parent: each app's `pom.xml` has the Spring Boot parent, so `mvn spring-boot:run`
  (the `dapr.yaml` command) works in each app folder on its own.
- List only the modules that exist: `publisher` or `subscriber` alone for a single role.

## App pom.xml

Create `pom.xml` in the `publisher` folder with `<artifactId><root-kebab>-publisher</artifactId>`, and in
the `subscriber` folder with `<root-kebab>-subscriber`. The two files are otherwise identical:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>4.0.8</version>
    <relativePath/>
  </parent>

  <groupId>com.example</groupId>
  <artifactId><root-kebab>-publisher</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name><root-kebab>-publisher</name>

  <properties>
    <java.version>17</java.version>
  </properties>

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

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-webmvc</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
    <dependency>
      <groupId>io.dapr.spring</groupId>
      <artifactId>dapr-spring-boot-starter</artifactId>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

### Key points

- `dapr-spring-bom` 1.19.1 is imported in `dependencyManagement`, so `dapr-spring-boot-starter` takes its
  version from the BOM and has no `<version>` of its own. Never add a version to a Dapr artifact.
- The starter brings the autoconfigured `DaprClient`, `DaprClientBuilder`, the `@Topic` subscription
  endpoint (`GET /dapr/subscribe`) and `CloudEvent`.
- Every subscriber type keeps `spring-boot-starter-webmvc`, the streaming one included: the declarative and
  programmatic subscribers receive HTTP pushes, and the web server keeps the streaming subscriber's JVM
  running.
- `java.version` 17 compiles to Java 17 class files. Maven only, without the Maven wrapper.

## Application.java

Create `src/main/java/<javaPackage>/publisher/Application.java` in the publisher, with one folder per
package segment (`com.example.shiptrack.publisher` gives `src/main/java/com/example/shiptrack/publisher/`):

```java
package <javaPackage>.publisher;

import io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(DaprPubSubProperties.class)
public class Application {

  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
```

The subscriber's `src/main/java/<javaPackage>/subscriber/Application.java`:

```java
package <javaPackage>.subscriber;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {

  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
```

### Key points

- `@EnableConfigurationProperties(DaprPubSubProperties.class)` binds `dapr.pubsub.name` to the
  `DaprPubSubProperties` bean the publisher takes through its constructor. The subscriber reads the same
  property through `${dapr.pubsub.name}` placeholders and does not need it.
- Every other class of an app lives in that app's package (`<javaPackage>.publisher` or
  `<javaPackage>.subscriber`), so component scanning finds it.

## application.properties

Create `src/main/resources/application.properties` in each app. Publisher:

```properties
spring.application.name=<root-kebab>-publisher
server.port=8001
dapr.pubsub.name=pubsub
app.topic=<TopicName>
```

Subscriber:

```properties
spring.application.name=<root-kebab>-subscriber
server.port=8002
dapr.pubsub.name=pubsub
app.topic=<TopicName>
app.dead-letter-topic=<DeadLetterTopicName>
```

### Key points

- Use `application.properties`, not `application.yml`.
- `server.port` equals the app's `appPort` in `dapr.yaml`: 8001 for the publisher, 8002 for the subscriber.
  A streaming subscriber has no `appPort`; it keeps `server.port=8002`, which serves only the actuator
  endpoints and is never given to Dapr.
- Add no `dapr.client.*` properties: the SDK reads the ports `dapr run` exports (`DAPR_HTTP_PORT`,
  `DAPR_GRPC_PORT`).
- `dapr.pubsub.name` is the component name, `pubsub`. The code reads it, the topic and the dead-letter topic
  from these properties and never hard-codes them, so switching the broker or renaming a topic is a
  one-line change.
- With several events, add one `app.<name>-topic` / `app.<name>-dead-letter-topic` pair per topic, named
  after the topic.

## .gitignore

Create `.gitignore` in the `<ProjectRoot>` folder:

```gitignore
# Maven build output
target/

# Dapr logs (appLogDestination: fileAndConsole writes .dapr/logs/ in each app folder)
.dapr/

# IDE files
.idea/
*.iml
.vscode/
```

### Key points

- `.dapr/` has no leading slash, so it also matches the `.dapr/logs/` folder `dapr run` creates inside
  `publisher/` and `subscriber/`.
