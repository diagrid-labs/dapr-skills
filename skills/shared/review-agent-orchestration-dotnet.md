# Agent Orchestration Checklist — .NET

Apply each rule below when `topology == orchestrator`. Single-agent .NET projects receive zero findings from this skill.

Rule source: see [`../create-agent-dotnet/REFERENCE.md`](../create-agent-dotnet/REFERENCE.md) — section "Program.cs (coordinator + specialists)".

## Rule-id map (Python vs .NET)

See [`review-agent-orchestration-python.md`](./review-agent-orchestration-python.md) for the full rule-id map. Rules listed in this file with the same id as Python carry the same semantics. `DAG-ORCH-001`, `DAG-ORCH-006`, and `DAG-ORCH-008` are reserved Python-only ids — do not reuse them for .NET-specific rules; add new `DAG-ORCH-NNN` ids above `009` if .NET-only rules are needed.

| Rule id      | Severity | What to detect                                                                                                       | Why it matters                                                                        | Suggested fix                                                                                |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| DAG-ORCH-002 | info     | No turn bound anywhere: `WithAgent(...)` exposes no iteration parameter, and neither `CreateSessionAsync(..., maxTurns:)` nor an `AgentRunOptions` limit is set | A tool-calling loop is bounded only by the wrapped MAF agent's own options. Do not report the absence of a `WithAgent` parameter — there is none to set. | Pass `maxTurns:` to `CreateSessionAsync`, or set the bound on the MAF agent / `AgentRunOptions` handed to `RunAgentAsync`. |
| DAG-ORCH-003 | warning  | Pub/sub topic strings (in `DaprClient.PublishEventAsync` / `[Topic]` attributes) do not match `<domain>.(requests\|results)` | Breaks discovery conventions shared with Python agents.                               | Rename topics to the convention.                                                             |
| DAG-ORCH-004 | warning  | Coordinator publishes to a topic whose `<domain>` prefix does not match any specialist app declared in `dapr.yaml`    | Messages are dropped silently.                                                        | Ensure every target domain has a declared specialist app.                                    |
| DAG-ORCH-005 | info     | Coordinator hardcodes specialist topics *and* the project has no `.WithCatalyst(...)` call                              | .NET has no local agent-registry path: `Diagrid.AI.Microsoft.AgentFramework` only writes a registry when `.WithCatalyst(...)` opts in, and that targets Catalyst. Static topics are the correct local design — this is informational, not a defect. | If runtime discovery is wanted, run on Catalyst and add `.WithCatalyst(...)`. Note that a registry write can succeed while the agent stays absent from the Agents view if the App ID is outside the `agent-registry` component's scope. |
| DAG-ORCH-007 | warning  | `dapr.yaml` has duplicate `appID` / port numbers across apps                                                           | Second sidecar fails to bind; race condition during `dapr run`.                       | Assign unique ports per app.                                                                 |
| DAG-ORCH-009 | warning  | Any agent component YAML has `redisPassword: ""` AND the project references Redis endpoints other than `localhost` / `127.0.0.1` | Unauthenticated Redis outside localhost; pub/sub is open to any reachable process.    | Set `redisPassword` via `secretKeyRef`; configure Redis AUTH / ACLs.                         |

## Cross-reference

Tool-level rules: `review-agent-tools-dotnet.md`. Memory rules: `review-agent-memory-dotnet.md`.
