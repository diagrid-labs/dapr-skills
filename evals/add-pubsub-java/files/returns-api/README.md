# returns-api

Customer returns, behind HTTP basic auth (`SecurityConfiguration`).

- `POST /returns` records a return request and returns it with status `REQUESTED`.
- `GET /returns/{id}` returns one.

Run it with `mvn spring-boot:run`; it listens on port 8089. Run the tests with `mvn test`.
