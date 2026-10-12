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

## Key points

- `secretstores.local.env` reads secrets directly from environment variables — no extra infrastructure to run locally, and no secret material committed to the repo. It is meant for local development only.
- The secret key **is** the environment variable name, unchanged: `client.secret.get("secretstore", "PAYMENT_API_KEY")` reads the `PAYMENT_API_KEY` environment variable and returns `{ "PAYMENT_API_KEY": "<value>" }`. There is no name mapping (no lower-casing, no `-` to `_` conversion), so use the exact variable name, `PAYMENT_API_KEY`, as the secret key. Matching is case-sensitive on macOS and Linux and case-insensitive on Windows.
- The optional `prefix` metadata field (e.g. `MYAPP_`) limits the store to variables with that prefix and strips it from the secret name: with `prefix: MYAPP_`, the secret `PAYMENT_API_KEY` reads the `MYAPP_PAYMENT_API_KEY` variable. The scaffold does not set a prefix.
- The component runs inside the Dapr sidecar (`daprd`), so it reads the **sidecar's** environment, not the app's. `dapr run -f .` starts each sidecar with the environment of the shell that runs it; the per-app `env:` map in `dapr.yaml` is passed to the app process only. Set the variable in that shell before starting the apps:
  - macOS/Linux (bash/zsh): `export PAYMENT_API_KEY="sk-test-demo-51199"`
  - Windows (PowerShell): `$env:PAYMENT_API_KEY = "sk-test-demo-51199"`
- Variables named `APP_API_TOKEN` or starting with `DAPR_` cannot be read through this component.
- Replace the demo value with a real one, or swap the component `type:` to a production-grade secret store, before deploying anywhere beyond a local machine. The application code does not change.
