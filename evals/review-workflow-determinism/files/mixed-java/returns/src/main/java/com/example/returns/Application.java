package com.example.returns;

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
