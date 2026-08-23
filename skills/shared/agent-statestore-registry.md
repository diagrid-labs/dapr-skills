# resources/agent-registry.yaml

> **WARNING:** The `redisPassword: ""` below is safe **only** with `dapr init`'s local Redis container (bound to `127.0.0.1`). Broadcast-based discovery via `agents.broadcast` assumes a trusted network perimeter — any process that can reach Redis can publish a crafted broadcast and register itself as a specialist. Protect the Redis instance with AUTH + ACLs, or use mTLS between Dapr sidecars, in any environment beyond a single developer's machine.

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

- The component name `agent-registry` is passed **explicitly**, not inferred: native `dapr-agents` agents take `registry=AgentRegistryConfig(store=StateStoreService(store_name="agent-registry"))`, `diagrid` wrapper runners take `registry_config=`, and the .NET package writes to `DiagridCatalystOptions.Registry.ResourceName` (default `agent-registry`) only after you opt in with `.WithCatalyst(...)`. An agent that omits the argument does not register and will not be discovered — with no error.
- `keyPrefix: none` is required — each agent writes its registration under its own key and cannot use the default `appID`-prefixed scheme.
- For single-agent projects, omit this file entirely.
- **On Diagrid Catalyst this component behaves differently.** There, `agent-registry` is a managed component whose writes are intercepted by the sidecar to populate the Agents view, and it is scoped to the App IDs named by an `Agent` resource. An App ID outside that scope still gets a **successful** write and never appears in the view. `diagrid component list` shows `agent-registry` as available to all app identities regardless of the real scope, so it is not evidence either way — confirm in the Agents view. `agent-*` components are also not provisioned on every Catalyst project; check that it exists before relying on it.
- Redis connection fields (`redisHost`, `redisPassword`) mirror the sibling state-store files (`agent-statestore-memory.md`, `agent-statestore-workflow.md`) and the pub/sub file (`agent-pubsub-redis.md`). Update them together if you change the host or password.
