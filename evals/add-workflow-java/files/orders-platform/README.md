# orders-platform

Order intake, built with Maven as two modules:

- `orders-domain` — the `Order` record and the validation rules (a plain library).
- `orders-app` — the Spring Boot API that uses them: `POST /orders` places an order, `GET /orders/{id}` returns one.

Build and test everything from this folder with `mvn test`. To run the API, install the modules once with `mvn install -DskipTests` from this folder, then run `mvn spring-boot:run` in `orders-app`; it listens on port 8087.
