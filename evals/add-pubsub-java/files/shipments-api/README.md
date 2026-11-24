# shipments-api

A small Spring Boot API that records shipments.

- `POST /shipments` creates a shipment and returns it with status `CREATED`.
- `GET /shipments/{id}` returns a shipment.

Run it with `mvn spring-boot:run`; it listens on port 8083. Run the tests with `mvn test`.
