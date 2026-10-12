# resources/secretstore.yaml

Create a `secretstore.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: secretstore
spec:
  type: secretstores.local.env
  version: v1
  metadata: []
```

- `secretstores.local.env` reads secrets directly from the process's own environment variables — no extra infrastructure to run locally, and no secret material committed to the repo.
- A secret named `payment-api-key` is read via `client.secret.get("secretstore", "payment-api-key")`, which reads the `payment-api-key` environment variable of the app process.
- Set the environment variable before running the app. The generated `dapr.yaml` sets a placeholder value for local development via the app's `env:` map — replace it with a real value (or a `secretKeyRef` to a production-grade secret store) before deploying anywhere beyond a local machine.
