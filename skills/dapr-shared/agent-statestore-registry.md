# resources/agent-registry.yaml

> **WARNING:** The `redisPassword: ""` below is safe **only** with `dapr init`'s local Redis container (bound to `127.0.0.1`). Registry-based discovery assumes a trusted network perimeter — any process that can reach Redis can write a crafted entry and register itself as a specialist the coordinator will dispatch to. Protect the Redis instance with AUTH + ACLs, or use mTLS between Dapr sidecars, in any environment beyond a single developer's machine.

Multi-agent systems use a shared state store component named `agent-registry` for agent discovery. Only needed when the project has more than one agent (coordinator + specialists). Create an `agent-registry.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: agent-registry
spec:
  type: state.redis
  version: v1
  metadata:
  - name: redisHost
    value: localhost:6379
  - name: redisPassword
    value: ""
  - name: keyPrefix
    value: none
```

- Python native `dapr-agents`: pass `registry=AgentRegistryConfig(store=StateStoreService(store_name="agent-registry"))` on every agent. Without `registry=`, `DurableAgent` auto-wires a component named exactly `agent-registry` (team `default`); with a differently named component it has no registry, and a coordinator then fails with `RuntimeError: registry_state must be provided to use agent registry`. The constructor needs the sidecar to be up and raises `AgentError` otherwise.
- Python `diagrid` wrappers: each runner registers itself when it is constructed into a component named exactly `agent-registry` (team `default`), even without `registry_config=`. The entry records the app id and the workflow name `dapr.<framework>.<TitleCaseName>.workflow`, which is what a native coordinator dispatches to. Pass `registry_config=` (a `dapr_agents` `AgentRegistryConfig`) only to use another store or team. Wrappers never read the registry themselves. If the sidecar does not answer at construction, the runner logs a warning and does not register.
- .NET: the package writes to `DiagridCatalystOptions.Registry.ResourceName` (default `agent-registry`) only after you opt in with `.WithCatalyst(...)`. A .NET agent without it does not register and will not be discovered — with no error.
- `keyPrefix: none` is required — every app reads and writes the same `agents:<team>:...` keys, which the default `appID`-prefixed scheme would split per app.
- For single-agent projects, omit this file entirely.
- **On Diagrid Catalyst this component behaves differently.** There, `agent-registry` is a managed component whose writes are intercepted by the sidecar to populate the Agents view, and it is scoped to the App IDs named by an `Agent` resource. An App ID outside that scope still gets a **successful** write and never appears in the view. `diagrid component list` shows `agent-registry` as available to all app identities regardless of the real scope, so it is not evidence either way — confirm in the Agents view. `agent-*` components are also not provisioned on every Catalyst project; check that it exists before relying on it.
- Redis connection fields (`redisHost`, `redisPassword`) mirror the sibling state-store files (`agent-statestore-memory.md`, `agent-statestore-workflow.md`) and the pub/sub file (`agent-pubsub-redis.md`). Update them together if you change the host or password.
