# invoices-api

A small Spring Boot API that issues invoices.

- `POST /invoices` issues an invoice and returns it with status `ISSUED`.
- `GET /invoices/{id}` returns an invoice.

Run it with `mvn spring-boot:run`; it listens on port 8084. Run the tests with `mvn test`.
