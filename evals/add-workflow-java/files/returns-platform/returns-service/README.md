# returns-service

Records product returns and keeps them in the Dapr state store `returns-store`.

- `POST /returns` registers a return and answers 201 with the stored return.
- `GET /returns/{id}` reads a return.

Run the tests with `mvn test`.
