# Java workflow project files

Resolve every placeholder from the specification interview before copying this file; the vocabulary is in
[workflow-placeholders.md](workflow-placeholders.md). `<app-id>` is `<ProjectName>` in lowercase, and
`<app-port>` is the `appPort` in `dapr.yaml`.

A Spring Boot 4 application built with Maven. Package versions come from [dapr-versions.md](dapr-versions.md).

## pom.xml

Create `pom.xml` in the `<ProjectName>` folder:

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
  <artifactId><app-id></artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name><app-id></name>

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

- The parent `spring-boot-starter-parent` 4.0.8 manages the Spring dependencies and the
  `spring-boot-maven-plugin`, which `mvn spring-boot:run` (the `dapr.yaml` command) uses.
- `dapr-spring-bom` 1.19.1 is imported in `dependencyManagement`, so `dapr-spring-boot-starter` takes its
  version from the BOM and has no `<version>` of its own. Never add a version to a Dapr artifact.
- `java.version` 17 compiles to Java 17 class files, so the app runs on any JDK 17 or newer.
- Maven only, without the Maven wrapper: the user runs the installed `mvn`.

## Application.java

Create `src/main/java/<javaPackage>/Application.java`, with one folder per package segment
(`com.example.loanreview` gives `src/main/java/com/example/loanreview/`):

```java
package <javaPackage>;

import io.dapr.spring.workflows.config.EnableDaprWorkflows;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@EnableDaprWorkflows
public class Application {

  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
```

### Key points

- `@EnableDaprWorkflows` goes on the `@SpringBootApplication` class, once. It finds every `Workflow` and
  `WorkflowActivity` bean, registers each under its canonical class name and starts the workflow runtime.
  The `DaprWorkflowClient` bean the controller takes comes from the `dapr-spring-boot-starter`
  autoconfiguration.
- Every other class of the app lives in the same package, `<javaPackage>`, so component scanning finds the
  workflow, activity and controller classes.

## application.properties

Create `src/main/resources/application.properties`:

```properties
spring.application.name=<app-id>
server.port=<app-port>
```

### Key points

- Use `application.properties`, not `application.yml`.
- `server.port` must equal `appPort` in `dapr.yaml` and the port in the `@host` line of `local.http`.
- Add no `dapr.client.*` properties: the SDK reads the ports `dapr run` exports (`DAPR_HTTP_PORT`,
  `DAPR_GRPC_PORT`).

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

- `.dapr/` has no leading slash, so it also matches the `.dapr/logs/` folder that `dapr run` creates inside
  `<ProjectName>`.
