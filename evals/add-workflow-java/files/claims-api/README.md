# claims-api

A small Spring Boot API that records insurance claims.

- `POST /claims` submits a claim and returns it with status `SUBMITTED`.
- `GET /claims/{id}` returns a claim.

Run it with `mvn spring-boot:run`; it listens on port 8082. Run the tests with `mvn test`.
