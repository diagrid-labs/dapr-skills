# Reference: Python Agent Application

This reference covers the per-framework detail needed to scaffold a Python agent project. Structural files (`dapr.yaml`, component YAMLs, tracing, docker-compose) live in `../shared/`; this file covers what differs per framework and per topology.

Two paths, and they are not interchangeable:

| | native | wrapper |
| --- | --- | --- |
| Distribution | [`dapr-agents`](https://pypi.org/project/dapr-agents/) | [`diagrid`](https://pypi.org/project/diagrid/) with one extra |
| You write | a `DurableAgent` | an agent in the wrapped framework, handed to a Diagrid runner |
| LLM reached via | Dapr conversation component | the wrapped framework's own provider client |
| Memory | `ConversationDaprStateMemory` on `agent-memory` | the runner's `state_store` / the framework's own checkpointer |

## .gitignore

```
.venv/
__pycache__/
*.py[cod]
*.egg-info/
.env
.DS_Store
.dapr/
```

Do **not** add `uv.lock` — it is the reproducibility artifact and belongs in version control.

## Dependency pinning

Both `pyproject.toml` templates below use `>=` floors rather than `==` pins:

- A floor states the real requirement — "this code needs at least this API" — and does not need a manual bump every time a dependency ships a patch.
- Reproducibility comes from `uv.lock`, which `uv sync` writes during Verify and which records the exact resolved version of every direct and transitive dependency. That is the artifact that makes a checkout reproduce byte-for-byte; a `==` in `pyproject.toml` would only pin the direct dependencies and would still leave the transitive set floating.

Regenerate the lock deliberately with `uv lock --upgrade` when you want newer versions.

## pyproject.toml (native `dapr-agents`)

```toml
[project]
name = "<project-name>-agent"
version = "0.1.0"
requires-python = ">=3.11,<3.14"
dependencies = [
    "dapr-agents>=1.0",
    "fastapi>=0.118",
    "uvicorn[standard]>=0.37",
    "pydantic>=2.12,<3",
    "opentelemetry-api>=1.37",
    "opentelemetry-sdk>=1.37",
]
```

Drop the `opentelemetry-*` entries if observability is opt-out.

`requires-python` mirrors the `>=3.11,<3.14` bound `dapr-agents` itself declares — widening it produces a project that cannot resolve.

## pyproject.toml (Diagrid framework wrapper)

```toml
[project]
name = "<project-name>-agent"
version = "0.1.0"
requires-python = ">=3.11,<3.14"
dependencies = [
    "diagrid[<extra>]>=0.4",
    "fastapi>=0.129",
    "uvicorn[standard]>=0.41",
]
```

`diagrid[<extra>]` already brings `fastapi` and `uvicorn` in through its `agent-core` base; the explicit entries above only raise the floors, they are not what installs them.

### Resolving `<extra>`

There is one source of truth: the `[project.optional-dependencies]` table in [`diagridio/python-ai`'s `pyproject.toml`](https://github.com/diagridio/python-ai/blob/main/pyproject.toml). PyPI republishes it as the distribution's `provides_extra` metadata, so a single command answers "which frameworks are supported right now":

```shell
curl -s https://pypi.org/pypi/diagrid/json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['info']['version']); print('\n'.join(e for e in d['info']['provides_extra'] if e not in ('agent-core','all')))"
```

Run that instead of trusting the table below. Extras are normalised by PyPI, so the hyphenated form it prints (`openai-agents`) and the underscored form in the repo's `pyproject.toml` (`openai_agents`) are the same extra — both work with `pip` and `uv`.

### Entry-point snapshot

The one thing the PyPI metadata does *not* give you is which runner class each extra exposes. This table maps extra → module → runner and was read from `diagridio/python-ai@main` on **2026-08-23**, against `diagrid` 0.4.3. Regenerate it with:

```shell
for m in $(curl -s https://api.github.com/repos/diagridio/python-ai/git/trees/main?recursive=1 \
    | python3 -c "import sys,json;[print(t['path'].split('/')[2]) for t in json.load(sys.stdin)['tree'] if t['type']=='tree' and t['path'].startswith('diagrid/agent/') and t['path'].count('/')==2]"); do
  printf '%s\t' "$m"
  curl -s "https://raw.githubusercontent.com/diagridio/python-ai/main/diagrid/agent/$m/__init__.py" | grep -oE '"DaprWorkflow[A-Za-z]*Runner"' | head -1
done
```

| Extra | Module | Runner class | Wrapped object |
| --- | --- | --- | --- |
| `openai-agents` | `diagrid.agent.openai_agents` | `DaprWorkflowAgentRunner` | `agents.Agent` |
| `langgraph` | `diagrid.agent.langgraph` | `DaprWorkflowGraphRunner` | a compiled `StateGraph` |
| `langchain` | `diagrid.agent.langchain` | `DaprWorkflowAgentRunner` | a chat model + tools (no agent object) |
| `crewai` | `diagrid.agent.crewai` | `DaprWorkflowAgentRunner` | `crewai.Agent` |
| `pydantic-ai` | `diagrid.agent.pydantic_ai` | `DaprWorkflowAgentRunner` | `pydantic_ai.Agent` |
| `adk` | `diagrid.agent.adk` | `DaprWorkflowAgentRunner` | `google.adk.agents.LlmAgent` |
| `strands` | `diagrid.agent.strands` | `DaprWorkflowAgentRunner` | `strands.Agent` |
| `smolagents` | `diagrid.agent.smolagents` | `DaprWorkflowAgentRunner` | `smolagents.ToolCallingAgent` |
| `claude-agents` | `diagrid.agent.claude_agents` | `DaprWorkflowAgentRunner` | none — configured on the runner |
| `deepagents` | `diagrid.agent.deepagents` | `DaprWorkflowDeepAgentRunner` | a compiled deep-agent graph |
| `holmesgpt` | `diagrid.agent.holmesgpt` | `DaprWorkflowHolmesRunner` | none — configured on the runner |

Notes that matter when scaffolding:

- Import from the framework's own module (`from diagrid.agent.langgraph import DaprWorkflowGraphRunner`). There is no re-export at the `diagrid` top level.
- `holmesgpt` is deliberately excluded from the `all` meta-extra because its transitive pins conflict with the other frameworks. Install it in a dedicated environment.
- **Do not write the tool decorator or agent constructor for a wrapper from memory.** Each wrapped framework has its own (`@function_tool`, `@tool`, `FunctionTool(...)`, `@agent.tool_plain`, …) and they move. Read `diagrid/agent/<module>/README.md` in `diagridio/python-ai` — most modules ship one, and every runner class carries a runnable `Example:` block in its class docstring. Follow that, then wire in the Dapr pieces below.

## Wrapper `main.py` — the shape

Every runner follows the same three-part shape. This example is `openai-agents`, taken from the runner's own docstring; substitute the module, runner class and framework-native agent from the table above.

```python
import os

from agents import Agent, function_tool
from diagrid.agent.openai_agents import DaprWorkflowAgentRunner


@function_tool
def get_weather(city: str) -> str:
    """Return the current weather for a city."""
    return f"{city}: 18°C, partly cloudy"


agent = Agent(
    name="weather_agent",
    instructions="Help users with weather. Use get_weather for lookups.",
    model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
    tools=[get_weather],
)

runner = DaprWorkflowAgentRunner(agent=agent, name="weather-agent")

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",       # multi-agent only
    subscribe_topic="weather.requests",  # multi-agent only
    publish_topic="weather.results",     # multi-agent only
)
```

### Key points

- The runner constructor is keyword-only after the wrapped object: `(<object>, *, name, host=None, port=None, …)`. `name` is **required** and is the workflow name — it is not `agent_name`, and there is no `agent_role` / `agent_goal` parameter. `role` and `goal` exist only on the graph-based runners (`langgraph`, `deepagents`).
- The runner's `host` / `port` are the **Dapr sidecar** address (defaults `localhost:50001`). The port the agent listens on is the one you pass to `serve()`. Do not conflate them.
- The loop bound is `max_iterations` on most runners and `max_steps` on the graph-based ones (`langgraph`, `deepagents`, `holmesgpt`). Both default to a non-`None` value, so an unbounded loop is not the default — but set it explicitly anyway so the bound is visible in review.
- `serve()` exposes `POST /agent/run` and `GET /agent/run`, and starts the workflow runtime. The pub/sub arguments are optional; pass them only for the coordinator + specialists topology. Omit all three for a single agent.
- `serve()` needs `fastapi` and `uvicorn`; they come in via `diagrid[agent-core]`.

### Model selection

The wrapper examples read the model name from `AGENT_MODEL` with a default, so operators can swap model versions without code edits:

```python
import os
# in the framework-native agent constructor
model=os.getenv("AGENT_MODEL", "gpt-4o-mini")
```

For the native `dapr-agents` path this does not apply — model selection happens in `resources/llm-provider.yaml`, not in Python source.

## models.py

Pydantic types for agent input/output:

```python
from pydantic import BaseModel


class AgentRequest(BaseModel):
    task: str
    session_id: str | None = None


class AgentResponse(BaseModel):
    output: str
    workflow_instance_id: str
```

## Tools

See [`../shared/agent-tools-python.md`](../shared/agent-tools-python.md) for the canonical native `@tool` pattern.

For a wrapper project the tool decorator belongs to the wrapped framework, not to `dapr_agents` — read that framework's own documentation for the current import. The list is deliberately not duplicated here; see the note in the entry-point snapshot above.

## main.py — native `dapr-agents` (augmented-llm pattern)

```python
from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentExecutionConfig,
    AgentMemoryConfig,
    AgentStateConfig,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.memory import ConversationDaprStateMemory
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner

from logging_config import configure_logging  # observability on
from tools import get_weather


configure_logging()  # observability on

agent = DurableAgent(
    name="WeatherAgent",
    role="Weather Assistant",
    instructions=[
        "You help users with weather questions.",
        "Use the get_weather tool whenever a location is mentioned.",
        "Respond in a short, friendly tone.",
    ],
    tools=[get_weather],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(
        store=ConversationDaprStateMemory(store_name="agent-memory"),
    ),
    state=AgentStateConfig(
        store=StateStoreService(store_name="agent-workflow"),
    ),
    execution=AgentExecutionConfig(max_iterations=10),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
```

### Key points

- `DurableAgent` runs on Dapr Workflow; `runner.serve(agent, port=...)` starts a FastAPI app exposing `POST /agent/run` and `GET /agent/instances/{instance_id}`.
- `DaprChatClient(component_name="llm-provider")` routes LLM calls through the Dapr Conversation building block. Swap the provider by swapping `llm-provider.yaml` (OpenAI, Anthropic, Ollama) — no code change.
- `ConversationDaprStateMemory(store_name="agent-memory")` persists conversation history. Without it, each request starts with an empty context.
- `StateStoreService(store_name="agent-workflow")` holds workflow execution state. The component it references must have `actorStateStore: "true"`.
- `AgentExecutionConfig.max_iterations` is the agent's loop bound (default `10`). Set it explicitly.
- `DurableAgent.__init__` is keyword-only. Every configuration knob is a `*Config` dataclass from `dapr_agents.agents.configs`; passing loose keywords like `max_iterations=` directly to `DurableAgent` is a `TypeError`.

## Multi-agent orchestration (native `dapr-agents`)

For a coordinator + specialists setup, put each agent in its own subfolder with its own `main.py` and `pyproject.toml`. Each specialist serves on a distinct port and subscribes to its own `<domain>.requests` topic.

Topics are configured on the **agent**, via `AgentPubSubConfig` — not on `serve()`, which only takes the HTTP surface.

### coordinator/main.py

```python
from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentExecutionConfig,
    AgentMemoryConfig,
    AgentPubSubConfig,
    AgentRegistryConfig,
    AgentStateConfig,
    OrchestrationMode,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.memory import ConversationDaprStateMemory
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner


agent = DurableAgent(
    name="Coordinator",
    role="Event Planner Coordinator",
    instructions=[
        "You coordinate a team of specialist agents to plan events.",
        "Discover specialists via the agent registry.",
        "Delegate each subtask to the specialist most suited to it.",
    ],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory")),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    registry=AgentRegistryConfig(store=StateStoreService(store_name="agent-registry")),
    pubsub=AgentPubSubConfig(
        pubsub_name="agent-pubsub",
        agent_topic="coordinator.requests",
        broadcast_topic="agents.broadcast",
    ),
    execution=AgentExecutionConfig(
        orchestration_mode=OrchestrationMode.AGENT,
        max_iterations=20,
    ),
)

runner = AgentRunner()
runner.serve(agent, port=8000)
```

### <specialist>/main.py (native pattern)

```python
from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentExecutionConfig,
    AgentMemoryConfig,
    AgentPubSubConfig,
    AgentRegistryConfig,
    AgentStateConfig,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.memory import ConversationDaprStateMemory
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner

from tools import search_venues


agent = DurableAgent(
    name="VenueScout",
    role="Venue Scout",
    instructions=["Search and recommend venues for events."],
    tools=[search_venues],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory")),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    registry=AgentRegistryConfig(store=StateStoreService(store_name="agent-registry")),
    pubsub=AgentPubSubConfig(
        pubsub_name="agent-pubsub",
        agent_topic="venue.requests",
        broadcast_topic="agents.broadcast",
    ),
    execution=AgentExecutionConfig(max_iterations=10),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
```

### Key points — multi-agent

- **Topic convention**: every specialist subscribes to `<domain>.requests` and publishes to `<domain>.results`. The coordinator publishes to each specialist's request topic.
- **Broadcast topic**: `agents.broadcast` is used by specialists to announce availability; the coordinator listens to it to populate `agent-registry`.
- **Registry**: `AgentRegistryConfig(store=StateStoreService(store_name="agent-registry"))` is an explicit argument on each agent. It is not inferred from the component name — an agent without it does not register and will not be discovered.
- `OrchestrationMode.AGENT` (set via `execution=AgentExecutionConfig(orchestration_mode=...)`) tells the coordinator to use its LLM to plan and dispatch. `RANDOM` and `ROUNDROBIN` are the other options. Leaving it `None` means no multi-agent orchestration.
- `AgentRunner()` takes no `mode` argument — orchestration mode lives on the agent, not the runner.

## Patterns (single-agent)

The single-agent `main.py` above is the `augmented-llm` pattern. Other patterns use the Dapr Workflow SDK directly, calling `DurableAgent` or LLM APIs from inside workflow activities.

### prompt-chaining

Two or more `DurableAgent`s (or simple LLM calls) chained via a parent workflow. Output of step N feeds step N+1. Good for content pipelines (draft → edit → format).

### routing

A classifier agent picks a specialist; the workflow branches. Reuses the multi-agent scaffold but with a single specialist invoked per input.

### parallelization

A workflow fans out to N agent activities via `wfapp.when_all([...])`, then aggregates. Good for independent sub-tasks (per-document analysis, multi-source lookup).

### orchestrator-workers

A coordinator agent uses its LLM to dynamically decide which worker activities to spawn; workers may be other agents or plain tools. Pick this pattern when the work can't be decomposed up-front.

### evaluator-optimizer

A generator agent produces output; an evaluator agent scores it; loop until a threshold is met or `max_iterations` is reached. Good for iterative refinement (plans, code, designs).

Each pattern lives in the parent workflow file; the agent bodies stay unchanged.

## local.http

```
### Start the agent
POST http://localhost:8001/agent/run
Content-Type: application/json

{
  "task": "What is the weather in London today?"
}

### Get workflow state
GET http://localhost:8001/agent/instances/{{instance_id}}
```

Wrapper projects expose `POST /agent/run` and `GET /agent/run` from `BaseWorkflowRunner.serve()`; they do not expose the native `/agent/instances/{id}` status path.

## Observability (native only)

When observability is enabled, the scaffold wires the Dapr tracing Configuration and the local compose stack. In `main.py`, call `configure_logging()` from `logging_config.py` before any `dapr_agents` import, and use `logging.getLogger(__name__)` inside tools rather than `print`.

### Observability files produced

- `resources/tracing.yaml` — see [`../shared/agent-tracing-zipkin.md`](../shared/agent-tracing-zipkin.md)
- `docker-compose.observability.yaml` — see [`../shared/agent-observability-stack.md`](../shared/agent-observability-stack.md)
- `logging_config.py` — see [`../shared/agent-logging-python.md`](../shared/agent-logging-python.md)
- `observability/prometheus.yml` + `observability/grafana-datasources.yaml` + `observability/dashboards/dapr-agents.json` — see [`../shared/agent-metrics-prometheus.md`](../shared/agent-metrics-prometheus.md)

### What users get at runtime

Everything in this list is started by the generated `docker-compose.observability.yaml`:

- Zipkin UI at `http://localhost:9411` — trace for every agent run, threaded under the root workflow span
- Grafana at `http://localhost:3000` — pre-seeded dashboard covering workflow throughput, conversation-API call rate, and activity latency
- Prometheus at `http://localhost:9099` — raw metrics (ad-hoc queries)

Separately, and **not** provisioned by `dapr init` or by the compose file, the [Diagrid Dev Dashboard](https://www.diagrid.io/blog/improving-the-local-dapr-workflow-experience-diagrid-dashboard) gives a Dapr-native workflow inspector at `http://localhost:8080`. The reader starts it themselves:

```shell
docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest
```

`dapr init` provisions four containers — `dapr_scheduler`, `dapr_placement`, `dapr_redis` and `dapr_zipkin` — and nothing else. Say so in the generated README rather than listing the dashboard alongside the containers the project brings up for itself.

## Running locally

See [`../shared/running-locally-dapr.md`](../shared/running-locally-dapr.md).

## Running with Diagrid Catalyst

See [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md).

On Catalyst, the `agent-registry` component is what backs the **Agents** view, and writing to it can succeed while the agent stays invisible: the view is populated by a sidecar interceptor bound to the component named exactly `agent-registry`, scoped to the App IDs declared by an `Agent` resource. An App ID outside that scope gets a successful write and no entry in the view, with no error to catch. `diagrid component list` is not evidence of scope — it renders `agent-registry` as available to all app identities either way. Confirm the agent appears in the Agents view, and check that the project has `agent-registry` at all: the `agent-*` components are not provisioned on every project.
