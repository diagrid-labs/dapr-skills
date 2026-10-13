# Reference: Python Agent Application

This reference covers the per-framework detail needed to scaffold a Python agent project. Structural files (`dapr.yaml`, component YAMLs, tracing, docker-compose) live in `../dapr-shared/`; this file covers what differs per framework and per topology.

Two paths, and they are not interchangeable:

| | native | wrapper |
| --- | --- | --- |
| Distribution | [`dapr-agents`](https://pypi.org/project/dapr-agents/) (Apache-2.0) | [`diagrid`](https://pypi.org/project/diagrid/) with one extra (BUSL-1.1, see "Licence and usage analytics") |
| You write | a `DurableAgent` | an agent in the wrapped framework, handed to a Diagrid runner |
| LLM reached via | Dapr conversation component | the wrapped framework's own provider client |
| Conversation history | `ConversationDaprStateMemory` in the `state=` store, one key per workflow instance | the workflow history of the run |
| Multi-agent | coordinator dispatches through the agent registry as child workflows | a native coordinator dispatches to wrapper specialists the same way, or wrappers exchange events over pub/sub |

Neither path carries conversation history from one run to the next by default. Each `POST /agent/run` starts a new workflow instance, and both paths keep history per instance. See "Memory" below before promising cross-session memory in a README.

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
    "dapr-agents>=1.0.9",
    "fastapi>=0.118",
    "uvicorn[standard]>=0.37",
    "pydantic>=2.12,<3",
    "opentelemetry-api>=1.37",
    "opentelemetry-sdk>=1.37",
]
```

Drop the `opentelemetry-*` entries if observability is opt-out.

`requires-python` mirrors the `>=3.11,<3.14` bound `dapr-agents` itself declares — widening it produces a project that cannot resolve. `1.0.9` is the floor because it is the release every native API in this file was checked against (`AgentObservabilityConfig`, the auto-wired component names, the registry dispatch, `call_agent` / `trigger_agent`).

## pyproject.toml (Diagrid framework wrapper)

```toml
[project]
name = "<project-name>-agent"
version = "0.1.0"
requires-python = ">=3.11,<3.14"
dependencies = [
    "diagrid[<extra>]>=0.5.3",
    "fastapi>=0.129",
    "uvicorn[standard]>=0.41",
    # plus the provider package, if the extra does not bundle it — see "LLM provider (wrappers)"
]
```

- `diagrid[<extra>]` already brings `fastapi`, `uvicorn` and `dapr-agents` in through its `agent-core` base; the explicit entries above only raise the floors, they are not what installs them.
- `0.5.3` is the floor: it fixes LangGraph tool calls and is the release the entry-point table below was read from.

### Resolving `<extra>`

There is one source of truth: the `[project.optional-dependencies]` table in [`diagridio/python-ai`'s `pyproject.toml`](https://github.com/diagridio/python-ai/blob/main/pyproject.toml). PyPI republishes it as the distribution's `provides_extra` metadata, so a single command answers "which frameworks are supported right now":

```shell
curl -s https://pypi.org/pypi/diagrid/json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['info']['version']); print('\n'.join(e for e in d['info']['provides_extra'] if e not in ('agent-core','all','identity','holmesgpt')))"
```

Run that instead of trusting the table below. Extras are normalised by PyPI, so the hyphenated form it prints (`openai-agents`) and the underscored form in the repo's `pyproject.toml` (`openai_agents`) are the same extra — both work with `pip` and `uv`.

Filtered out, because none of them is a framework this skill can scaffold:

- `agent-core` — the shared base every extra pulls in.
- `all` — a meta-extra.
- `identity` — runtime dependencies of `diagrid.identity` (verified caller identity on Catalyst), not an agent framework.
- `holmesgpt` — **not supported for scaffolding.** `diagrid[holmesgpt]` does not resolve from PyPI: HolmesGPT pins `uvicorn<0.41`, while `agent-core` requires `uvicorn>=0.41`. It only resolves inside the `python-ai` repository, whose dependency overrides a consumer project does not inherit. If the user asks for HolmesGPT, say so and offer another framework.

### Entry-point snapshot

The one thing the PyPI metadata does *not* give you is which runner class each extra exposes. This table maps extra → module → runner and was read from tag **`v0.5.3`** of `diagridio/python-ai` on **2026-10-12** (`diagrid` 0.5.3). Read a release tag, not `main`: `main` can carry unreleased constructor arguments. Regenerate it with (set `V` to the version the PyPI command printed):

```shell
V=0.5.3
for m in $(curl -s "https://api.github.com/repos/diagridio/python-ai/git/trees/v$V?recursive=1" \
    | python3 -c "import sys,json;[print(t['path'].split('/')[2]) for t in json.load(sys.stdin)['tree'] if t['type']=='tree' and t['path'].startswith('diagrid/agent/') and t['path'].count('/')==2]"); do
  printf '%s\t' "$m"
  curl -s "https://raw.githubusercontent.com/diagridio/python-ai/v$V/diagrid/agent/$m/__init__.py" | grep -oE '"DaprWorkflow[A-Za-z]*Runner"' | head -1
done
```

| Extra | Module | Runner class | Constructor (after `*` everything is keyword-only) |
| --- | --- | --- | --- |
| `openai-agents` | `diagrid.agent.openai_agents` | `DaprWorkflowAgentRunner` | `(agent: agents.Agent, *, name, max_iterations=25, registry_config=None, state_store=None)` |
| `langgraph` | `diagrid.agent.langgraph` | `DaprWorkflowGraphRunner` | `(graph: CompiledStateGraph, *, name, max_steps=100, role=None, goal=None, registry_config=None)`; `serve()` also takes `input_mapper=` |
| `langchain` | `diagrid.agent.langchain` | `DaprWorkflowAgentRunner` | `(model: BaseChatModel, tools=(), *, name, system_prompt="", max_iterations=25, registry_config=None, state_store=None)` — no agent object |
| `crewai` | `diagrid.agent.crewai` | `DaprWorkflowAgentRunner` | `(agent: crewai.Agent, *, name, max_iterations=None, registry_config=None, state_store=None)` |
| `pydantic-ai` | `diagrid.agent.pydantic_ai` | `DaprWorkflowAgentRunner` | `(agent: pydantic_ai.Agent, *, name, max_iterations=25, registry_config=None, state_store=None)` |
| `adk` | `diagrid.agent.adk` | `DaprWorkflowAgentRunner` | `(agent: google.adk.agents.LlmAgent, *, name, max_iterations=100, registry_config=None, state_store=None)` |
| `strands` | `diagrid.agent.strands` | `DaprWorkflowAgentRunner` | `(agent: strands.Agent, *, name, max_iterations=None, registry_config=None, state_store=None)` |
| `smolagents` | `diagrid.agent.smolagents` | `DaprWorkflowAgentRunner` | `(agent: smolagents.ToolCallingAgent, *, name, max_iterations=None, registry_config=None, state_store=None)` |
| `claude-agents` | `diagrid.agent.claude_agents` | `DaprWorkflowAgentRunner` | `(*, name, options: ClaudeAgentOptions=None, tools=None, model=None, system_prompt=None, max_tokens=4096, max_iterations=25, registry_config=None, state_store=None)` — no agent object |
| `deepagents` | `diagrid.agent.deepagents` | `DaprWorkflowDeepAgentRunner` | `(agent: CompiledStateGraph, *, name, max_steps=100, role=None, goal=None, registry_config=None)` |

Every runner also takes `host=None, port=None` (the Dapr sidecar address, see below).

`diagrid.agent.strands` additionally exports `DurableAgent(agent, *, name)`: an in-process wrapper you call as `durable("task")`. It has no `serve()`, no HTTP endpoints and no telemetry setup, and its loop is fixed at 10 iterations. Scaffold the `DaprWorkflowAgentRunner` instead unless the user explicitly wants an in-process call.

Notes that matter when scaffolding:

- Import from the framework's own module (`from diagrid.agent.langgraph import DaprWorkflowGraphRunner`). There is no re-export at the `diagrid` top level.
- **Do not write the tool decorator or agent constructor for a wrapper from memory.** Each wrapped framework has its own (`@function_tool`, `@tool`, `FunctionTool(...)`, plain functions in `tools=[...]`, …) and they move. Every runner class carries a runnable `Example:` block in its class docstring under `diagrid/agent/<module>/runner.py` — that is the one source every module has. Some modules also ship a `README.md` (`adk`, `claude_agents`, `crewai`, `langchain`, `langgraph`, `smolagents`, `strands`); `openai_agents`, `pydantic_ai` and `deepagents` do not. The `examples/<module>/` folder of the repository has a runnable `simple_agent.py` per framework. Follow those, then wire in the Dapr pieces below.
- The docstring examples call `runner.start()` and `run_async(...)`. For a scaffolded service use `serve()` instead (see below): it is what sets up telemetry and the default workflow input that registry dispatch relies on.

## Wrapper `main.py` — the shape

Every runner follows the same three-part shape. This example is `openai-agents`, based on the runner's own docstring; substitute the module, runner class and framework-native agent from the table above.

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

runner = DaprWorkflowAgentRunner(agent=agent, name="weather-agent", max_iterations=10)

runner.serve(port=int(os.getenv("APP_PORT", "8001")))
```

### Key points

- The runner constructor is keyword-only after the wrapped object (see the table). `name` is **required** — it is not `agent_name`, and there is no `agent_role` / `agent_goal` parameter. `role` and `goal` exist only on the graph-based runners (`langgraph`, `deepagents`).
- `name` becomes the Dapr workflow name `dapr.<framework>.<TitleCaseName>.workflow` (for example `name="weather-agent"` → `dapr.openai.WeatherAgent.workflow`). Renaming the agent changes the workflow name, so in-flight instances started under the old name can no longer be resumed. Keep `name` a literal.
- Leave the runner's `host` / `port` unset. They are the **Dapr sidecar** gRPC address, and when unset the Dapr SDK reads `DAPR_GRPC_PORT`, which `dapr run` sets per app. Hardcoding them breaks multi-app runs where each sidecar has its own gRPC port. The port the agent listens on is the one you pass to `serve()`.
- The loop bound is `max_iterations` on most runners and `max_steps` on the graph-based ones. Defaults: `openai-agents`, `langchain`, `pydantic-ai`, `claude-agents` 25; `adk` 100; `langgraph`, `deepagents` `max_steps=100`; `crewai`, `strands`, `smolagents` default to `None`, which falls back to the framework's own value (`crewai.Agent.max_iter`, 25 when unset; 25 for Strands; `ToolCallingAgent.max_steps` for smolagents). Set it explicitly anyway so the bound is visible in review.
- `serve(*, port=5001, host="0.0.0.0", pubsub_name=None, subscribe_topic=None, publish_topic=None)` exposes:
  - `POST /agent/run` — **synchronous**: it starts the workflow and returns only when it has completed or failed. The body is `{"task": "..."}` plus an optional `session_id` (or `thread_id`); the response carries `instance_id` and the completion event. The LangGraph runner maps the body to graph input through `serve(input_mapper=...)`.
  - `GET /agent/run/{workflow_id}` — workflow status (`404` when unknown).
- The default port is `5001`. Pass `port=` explicitly and keep it equal to `appPort` in `dapr.yaml`; `dapr run` exports it as `APP_PORT`.
- `serve()` also sets up OpenTelemetry (see "Observability") and registers the default workflow input that lets the workflow accept a bare `{"task": ...}` — which is what a native coordinator sends. A process that only calls `start()` / `run_async()` gets neither.
- The pub/sub arguments are only for the event-driven variant (see "Wrapper pub/sub"). Omit all three otherwise.

### Model selection

The scaffold reads the model name from `AGENT_MODEL` with a default, so operators can swap model versions without code edits:

```python
import os
# in the framework-native agent constructor
model=os.getenv("AGENT_MODEL", "gpt-4o-mini")
```

`AGENT_MODEL` is this skill's convention. The `diagrid` examples use framework-specific names instead (`OPENAI_MODEL`, `CLAUDE_MODEL`, `CREWAI_LLM`, `MODEL`); say so in the README if the user copies code from them.

For the native `dapr-agents` path this does not apply — model selection happens in `resources/llm-provider.yaml`, not in Python source.

### LLM provider (wrappers)

Wrapper projects call the provider directly with the wrapped framework's client, reading the API key from the environment (`dapr run` passes the shell environment to the app). Most extras bundle only an OpenAI client, so another provider needs its package in `pyproject.toml`:

| Extra | Bundled | For another provider |
| --- | --- | --- |
| `openai-agents` | `openai` | see the OpenAI Agents SDK docs for non-OpenAI models |
| `langgraph` | none (only `langchain-core`) | add the LangChain chat-model package: `langchain-openai`, `langchain-anthropic`, `langchain-google-genai`, `langchain-ollama` |
| `langchain`, `deepagents` | `langchain-openai` | add `langchain-anthropic`, `langchain-google-genai`, `langchain-ollama` |
| `crewai` | `litellm` | no package needed; use a LiteLLM model string (`anthropic/claude-sonnet-4-6`, `gemini/gemini-2.0-flash`, `ollama/llama3.2`) |
| `pydantic-ai` | `pydantic-ai-slim[openai]` | add `pydantic-ai-slim[anthropic]` or `pydantic-ai-slim[google]` |
| `strands` | `openai` | add `strands-agents[anthropic]` (or the provider extra the Strands docs name) |
| `smolagents` | none of its own | pick a model class from the smolagents docs (`OpenAIServerModel`, `LiteLLMModel`, …) |
| `adk` | Gemini through `google-adk` | set `GOOGLE_API_KEY` |
| `claude-agents` | `anthropic` | Anthropic only; set `ANTHROPIC_API_KEY` |

Local Ollama with a framework that uses the OpenAI client: set `OPENAI_BASE_URL=http://localhost:11434/v1` and `OPENAI_API_KEY=ollama` (any non-empty value) in the app's `env:` block in `dapr.yaml` and use an Ollama model name.

Never write a key into source, `dapr.yaml` or a committed `.env`; tell the user which variable to export.

## Memory

**Native.** Conversation history is stored by `ConversationDaprStateMemory` under the key `<agent-name>:_memory_<workflow-instance-id>`. In `dapr-agents` 1.0.9, whenever the agent has a `state=` store (passed explicitly, or auto-wired from a component named `agent-workflow`), the memory is placed in **that** store and any `memory=` argument is replaced. The scaffold therefore passes `state=` and no `memory=`, and generates no `agent-memory.yaml`. Because the key contains the workflow instance id, history lives for one run: a second `POST /agent/run` starts a new instance with an empty history. For context across runs, pass it in the task, or keep it in your own store keyed by a user/session id.

**Wrappers.** Within a run, the workflow history is what makes the conversation durable; replay rebuilds it after a crash. The runner's `state_store=` argument (and the `agent-memory` component the runner discovers) is only recorded in the agent's registry metadata — the runner does not read or write conversation history through it. A `session_id` / `thread_id` in the request body becomes part of the workflow instance id but does not load earlier history. Cross-run memory needs the framework helper in the module's `state.py` (`DaprMemoryStore`, `DaprSessionStore`, `DaprStateSessionManager`, `DaprMemoryCheckpointer`) **and** code that uses it: these helpers are not wired in automatically, and LangGraph's `DaprMemoryCheckpointer` is a plain class with `save_checkpoint` / `load_checkpoint`, not a LangGraph checkpointer. Their default store names differ — `statestore` for most, `agent-memory` for `langgraph` and `strands` — so add a matching component only when the generated code uses a helper. The scaffold does not.

## Tools

See [`../dapr-shared/agent-tools-python.md`](../dapr-shared/agent-tools-python.md) for the canonical native `@tool` pattern.

For a wrapper project the tool decorator belongs to the wrapped framework, not to `dapr_agents` — read the runner's `Example:` block or the framework's own documentation for the current import. The list is deliberately not duplicated here; see the note in the entry-point snapshot above.

## main.py — native `dapr-agents` (augmented-llm pattern)

```python
from logging_config import configure_logging  # observability on

configure_logging()  # observability on

from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentExecutionConfig,
    AgentObservabilityConfig,  # observability on
    AgentStateConfig,
    AgentTracingExporter,  # observability on
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner

from tools import get_weather


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
    state=AgentStateConfig(
        store=StateStoreService(store_name="agent-workflow"),
    ),
    execution=AgentExecutionConfig(max_iterations=10),
    agent_observability=AgentObservabilityConfig(  # observability on
        enabled=True,
        tracing_enabled=True,
        tracing_exporter=AgentTracingExporter.ZIPKIN,
        endpoint="http://localhost:9411",
        service_name="weather-agent",
    ),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
```

### Key points

- `DurableAgent` runs on Dapr Workflow; `runner.serve(agent, port=...)` starts a FastAPI app exposing `POST /agent/run` (schedules the workflow and returns `instance_id` and `status_url` right away) and `GET /agent/instances/{instance_id}`. The default port is `8001`; keep it equal to `appPort` in `dapr.yaml`.
- `DaprChatClient(component_name="llm-provider")` routes LLM calls through the Dapr Conversation building block. Swap the provider by swapping `llm-provider.yaml` (OpenAI, Anthropic, Google AI, Ollama) — no code change.
- `StateStoreService(store_name="agent-workflow")` holds the agent's workflow state **and** its conversation memory (see "Memory"). Do not add `memory=`: in 1.0.9 it is replaced whenever `state=` is set. The component must have `actorStateStore: "true"` because Dapr Workflow runs on it.
- The constructor contacts the Dapr sidecar to discover components and raises `AgentError` when the sidecar is unreachable. Start the app with `dapr run -f .`, not with `uv run main.py` alone.
- `AgentExecutionConfig.max_iterations` is the agent's loop bound (default `10`). Set it explicitly.
- `DurableAgent.__init__` is keyword-only. Every configuration knob is a `*Config` dataclass from `dapr_agents.agents.configs`; passing loose keywords like `max_iterations=` directly to `DurableAgent` is a `TypeError`.
- Observability (only when enabled): agent, LLM and tool spans are **off** by default. `enabled=True` and `tracing_enabled=True` are both required. `AgentTracingExporter.ZIPKIN` with `endpoint="http://localhost:9411"` sends the spans to the same Zipkin as the sidecar (`/api/v2/spans` is appended). A non-console exporter without an `endpoint` raises `ValueError` at construction. For an OTLP collector use `AgentTracingExporter.OTLP_GRPC` and `endpoint="http://localhost:4317"` (the `http://` scheme makes the gRPC exporter connect without TLS). The explicit config wins over the environment; `AgentObservabilityConfig.from_env()` reads the standard variables instead (`OTEL_SDK_DISABLED=false`, `OTEL_TRACING_ENABLED=true`, `OTEL_TRACES_EXPORTER=zipkin|otlp_grpc|otlp_http|console`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`). Drop the `# observability on` lines when observability is opt-out.
- `configure_logging()` replaces the root log handlers, so call it before the agent is constructed.

## Multi-agent orchestration (native `dapr-agents`)

For a coordinator + specialists setup, put each agent in its own subfolder with its own `main.py` and `pyproject.toml`, and give each its own app in `dapr.yaml`.

How the pieces connect in 1.0.9:

- Every agent with a registry writes its entry (name, role, goal, Dapr app id, workflow name) into the shared `agent-registry` store at construction.
- The coordinator reads the registry at run time and **dispatches each subtask as a child workflow on the specialist's app** (`ctx.call_child_workflow` with the registry's `appid` and `metadata.workflow_name`). Dispatch does not use pub/sub.
- Pub/sub gives each agent a topic it can be triggered on (`<name>.topic`) and a team topic (`agents.broadcast`) on which the coordinator broadcasts its final result to the team when it finishes; specialists record those broadcasts in their memory.

### coordinator/main.py

```python
from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentExecutionConfig,
    AgentPubSubConfig,
    AgentRegistryConfig,
    AgentStateConfig,
    OrchestrationMode,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner


agent = DurableAgent(
    name="Coordinator",
    role="Event Planner Coordinator",
    instructions=[
        "You coordinate a team of specialist agents to plan events.",
        "Delegate each subtask to the specialist most suited to it.",
    ],
    llm=DaprChatClient(component_name="llm-provider"),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    registry=AgentRegistryConfig(store=StateStoreService(store_name="agent-registry")),
    pubsub=AgentPubSubConfig(
        pubsub_name="agent-pubsub",
        agent_topic="coordinator.topic",
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
    AgentPubSubConfig,
    AgentRegistryConfig,
    AgentStateConfig,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner

from tools import search_venues


agent = DurableAgent(
    name="VenueScout",
    role="Venue Scout",
    goal="Find and recommend venues for events.",
    instructions=["Search and recommend venues for events."],
    tools=[search_venues],
    llm=DaprChatClient(component_name="llm-provider"),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    registry=AgentRegistryConfig(store=StateStoreService(store_name="agent-registry")),
    pubsub=AgentPubSubConfig(
        pubsub_name="agent-pubsub",
        agent_topic="venuescout.topic",
        broadcast_topic="agents.broadcast",
    ),
    execution=AgentExecutionConfig(max_iterations=10),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
```

### Key points — multi-agent

- **Topic convention**: each agent's own topic is `<name>.topic`, with the name lower-cased and spaces turned into dashes (`VenueScout` → `venuescout.topic`), and the team topic is `agents.broadcast`. These are the values `DurableAgent` auto-wires when it finds a component named `agent-pubsub` and no `pubsub=` is passed; the scaffold passes them explicitly so they are visible. Pub/sub settings live on the **agent** (`AgentPubSubConfig`), not on `runner.serve()`.
- **Dispatch**: the coordinator plans with its LLM and calls the chosen specialist as a child workflow on the specialist's app. The specialist must be running (its app registered the workflow) when the coordinator dispatches; otherwise the dispatch fails with an error naming the app id and workflow name.
- **Broadcast**: `agents.broadcast` carries the coordinator's final result to the team. It is not how agents announce themselves; registration goes through the registry store.
- **Registry**: pass `AgentRegistryConfig(store=StateStoreService(store_name="agent-registry"))` on every agent. Without a registry the coordinator fails with `RuntimeError: registry_state must be provided to use agent registry`. `DurableAgent` would auto-wire a component named exactly `agent-registry`, but only under that exact name.
- `OrchestrationMode.AGENT` (set via `execution=AgentExecutionConfig(orchestration_mode=...)`) makes the agent an orchestrator that plans with its LLM. `RANDOM` and `ROUNDROBIN` are the other options. Orchestrators are excluded from the list of agents they can dispatch to.
- A non-orchestrator agent with a registry treats every other registered non-orchestrator agent as a callable tool, loaded at the start of each run. Specialists in the same registry can therefore call each other; their `max_iterations` bounds that.
- `AgentRunner()` takes no `mode` argument — orchestration mode lives on the agent, not the runner.

## Multi-agent with framework wrappers

`diagrid` runners do not look other agents up and do not dispatch. The coordinator + specialists topology for wrappers is therefore **mixed**:

- **Coordinator**: a native `dapr-agents` `DurableAgent` orchestrator — the `coordinator/main.py` above, in a folder whose `pyproject.toml` uses the native template (`dapr-agents>=1.0.9`). It needs `llm-provider.yaml`. Drop its `pubsub=` argument and do not generate `agent-pubsub.yaml`: dispatch does not use pub/sub, and no wrapper subscribes to `agents.broadcast`. With observability on, give it `agent_observability=` with `AgentTracingExporter.OTLP_GRPC` and `endpoint="http://localhost:4317"`, so its spans reach the same Jaeger as the specialists'.
- **Specialists**: wrapper runners, one app each, started with `serve(port=...)` and no pub/sub arguments.

A wrapper runner registers itself in a component named exactly `agent-registry` (team `default`) when it is constructed, even without `registry_config=`. The entry carries the specialist's Dapr app id and its workflow name (`dapr.<framework>.<TitleCaseName>.workflow`), which is what the native coordinator dispatches to. The coordinator sends `{"task": "<instruction>"}` as the child-workflow input; the wrapper workflow accepts that shape only after `serve()` has run, so do not start specialists with `start()` alone. Give each specialist a `role` / `goal` where the runner accepts them (`langgraph`, `deepagents`) or a precise agent description in the framework's own agent definition, because the coordinator's planner sees the registry entry.

```python
# <specialist>/main.py — a LangGraph specialist registered for a native coordinator
import os

from diagrid.agent.langgraph import DaprWorkflowGraphRunner

from graph import build_graph  # the compiled StateGraph for this specialist

runner = DaprWorkflowGraphRunner(
    graph=build_graph(),
    name="venue-scout",
    role="Venue Scout",
    goal="Find and recommend venues for events.",
    max_steps=50,
)

runner.serve(port=int(os.getenv("APP_PORT", "8001")))
```

> **Verify this end to end.** Native-coordinator → wrapper-specialist dispatch is built from both sources (the registry entry the wrapper writes, the child-workflow call the coordinator makes, the `{"task": ...}` input the wrapper workflow accepts) but has not been run end to end for every framework. After `dapr run -f .`, send one task to the coordinator and confirm in the coordinator's log and in the Diagrid Dev Dashboard that a child workflow named `dapr.<framework>.<TitleCaseName>.workflow` ran on the specialist's app and that its result came back. Say this in the generated README.

### Wrapper pub/sub (event-driven variant)

When the user wants wrapper agents that react to events rather than a coordinator, each wrapper subscribes to one topic and publishes its result to another:

```python
runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="venue.requests",
    publish_topic="venue.results",
)
```

- `<domain>.requests` / `<domain>.results` is a suggestion for naming, not a convention either library enforces.
- `pubsub_name` is required: without it, `subscribe_topic` and `publish_topic` are silently ignored. `serve()` does not use the `agent-pubsub` component it discovers on its own.
- The event's `data` is the request body (`{"task": ...}`; any other object is passed as a JSON string task). The agent runs inside the delivery request, and the result is published after the workflow finishes, outside the workflow. If the broker redelivers, a new run starts; include a stable `session_id` in the event when duplicates matter, and treat this path as at-least-once.
- Something still has to publish the first event and consume the results — say so in the README.

## Patterns (single-agent)

The single-agent `main.py` above is the `augmented-llm` pattern. The other patterns use the Dapr Workflow SDK directly (`import dapr.ext.workflow as wf`), calling agents from a parent workflow with `dapr_agents.call_agent(ctx, "<AgentName>", input={...}, app_id="<app-id>")`, which schedules the agent's workflow as a child workflow and must be yielded. Outside a workflow, `dapr_agents.trigger_agent("<AgentName>", input={...}, app_id="<app-id>")` starts an agent and blocks until it completes.

### prompt-chaining

Two or more agents (or simple LLM calls) chained via a parent workflow. Output of step N feeds step N+1. Good for content pipelines (draft → edit → format).

### routing

A classifier agent picks a specialist; the workflow branches. Reuses the multi-agent scaffold but with a single specialist invoked per input.

### parallelization

A workflow fans out to N agent calls and waits with `yield wf.when_all([...])`, then aggregates. Good for independent sub-tasks (per-document analysis, multi-source lookup).

### orchestrator-workers

A coordinator agent uses its LLM to dynamically decide which workers to call; workers may be other agents or plain tools. Pick this pattern when the work can't be decomposed up-front. This is what `OrchestrationMode.AGENT` provides.

### evaluator-optimizer

A generator agent produces output; an evaluator agent scores it; loop until a threshold is met or a fixed round limit is reached. Good for iterative refinement (plans, code, designs).

Each pattern lives in the parent workflow file; the agent bodies stay unchanged.

## local.http

Native `dapr-agents`:

```http
@host=http://localhost:8001

### Start the agent (returns immediately with the instance id)
# @name run
POST {{host}}/agent/run
Content-Type: application/json

{
  "task": "What is the weather in London today?"
}

### Get workflow state
GET {{host}}/agent/instances/{{run.response.body.$.instance_id}}
```

`diagrid` wrapper:

```http
@host=http://localhost:8001

### Run the agent (waits until the workflow has finished)
# @name run
POST {{host}}/agent/run
Content-Type: application/json

{
  "task": "What is the weather in London today?"
}

### Get workflow status
GET {{host}}/agent/run/{{run.response.body.$.instance_id}}
```

- `@host` must use the agent's `appPort` from `dapr.yaml`. In a multi-agent project, send tasks to the coordinator's port.
- The wrapper `POST` blocks until the agent finishes, so long runs need a generous client timeout. Add `"session_id": "..."` to the body to control the id prefix of the workflow instance.

## Observability

When observability is enabled, the scaffold wires the Dapr tracing `Configuration`, the local compose stack and `logging_config.py`. Use `logging.getLogger(__name__)` inside tools rather than `print`.

### Native

- `resources/tracing.yaml` — see [`../dapr-shared/agent-tracing-zipkin.md`](../dapr-shared/agent-tracing-zipkin.md) (sidecar spans: workflow, activities, state, pub/sub).
- `agent_observability=AgentObservabilityConfig(...)` in `main.py` — app spans for the agent, LLM calls and tool calls, exported to the same Zipkin (see the native `main.py` above).
- `docker-compose.observability.yaml` — see [`../dapr-shared/agent-observability-stack.md`](../dapr-shared/agent-observability-stack.md).
- `logging_config.py` — see [`../dapr-shared/agent-logging-python.md`](../dapr-shared/agent-logging-python.md).
- `observability/prometheus.yml` + `observability/grafana-datasources.yaml` + `observability/dashboards/dapr-agents.json` — see [`../dapr-shared/agent-metrics-prometheus.md`](../dapr-shared/agent-metrics-prometheus.md).

### Wrappers

`diagrid` runners have built-in OpenTelemetry, set up by `serve()`. It is off until an endpoint is set, and the exporter speaks **OTLP over gRPC only** (a receiver that only speaks OTLP/HTTP, such as `:4318`, does not work; a trailing `/v1/traces` is stripped) and always connects without TLS, so keep the receiver local or behind a collector. The runners take no observability argument; configure them through the app's `env:` block in `dapr.yaml`:

```yaml
    env:
      OTEL_EXPORTER_OTLP_ENDPOINT: http://localhost:4317
      OTEL_SERVICE_NAME: <app-id>
```

- Set `OTEL_SERVICE_NAME` per app: without it, every app reports the runner class name, and most runners are called `DaprWorkflowAgentRunner`.
- Zipkin cannot receive OTLP, so the wrapper stack uses Jaeger for both the app spans and the sidecar spans: `resources/tracing.yaml` from [`../dapr-shared/agent-tracing-otlp.md`](../dapr-shared/agent-tracing-otlp.md) and the wrapper variant of [`../dapr-shared/agent-observability-stack.md`](../dapr-shared/agent-observability-stack.md). Prometheus, Grafana and `logging_config.py` are the same as for native.
- When the endpoint is set, the runner also exports Python logs over OTLP by adding a handler to the root logger.
- LLM-call metrics (`dapr_component_conversation_*`) are not emitted for wrappers, because they bypass the conversation building block.

### What users get at runtime

Everything in this list is started by the generated `docker-compose.observability.yaml`:

- Zipkin UI at `http://localhost:9411` (native) or Jaeger UI at `http://localhost:16686` (wrappers) — a trace for every agent run
- Grafana at `http://localhost:3000` — pre-seeded dashboard covering workflow throughput, conversation-API call rate (native only), and activity latency
- Prometheus at `http://localhost:9099` — raw metrics (ad-hoc queries)

The generated README gets the **Diagrid Dapr Dev Dashboard** section from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md): an optional tool the reader installs (install command per OS), not something `dapr init` or the compose file provides. It is started in a second terminal with `diagrid-dev-dashboard` and opens http://localhost:9090.

`dapr init` provisions four containers — `dapr_scheduler`, `dapr_placement`, `dapr_redis` and `dapr_zipkin` — and nothing else. Say so in the generated README rather than listing the dashboard alongside the containers the project brings up for itself.

## Licence and usage analytics (wrappers)

Put both in the generated README of a wrapper project (and of a mixed project, for the specialists):

- **Licence.** `diagrid` is licensed under the Business Source License 1.1 with an Additional Use Grant that defines when production use is allowed without a commercial licence; each version converts to Apache-2.0 on its Change Date (2030-03-01 at the latest). Point the reader to the `LICENSE.md` in [`diagridio/python-ai`](https://github.com/diagridio/python-ai). `dapr-agents` is Apache-2.0.
- **Usage analytics.** Every `diagrid` runner sends one anonymous usage event per process when it is constructed (package and framework versions, OS, architecture, Python version, whether it targets Catalyst or a plain sidecar, whether it runs in CI — no prompts, app data, app ids or hostnames). It runs on a background thread and never blocks or fails the app. To opt out, set any of `DO_NOT_TRACK=1`, `SCARF_NO_ANALYTICS=1` or `DIAGRID_NO_ANALYTICS=1` (in the shell, or in the app's `env:` block in `dapr.yaml`). The scaffold does not set an opt-out by default.

## Running locally

See [`../dapr-shared/running-locally-dapr.md`](../dapr-shared/running-locally-dapr.md).

## Running with Diagrid Catalyst

See [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md).

On Catalyst, the `agent-registry` component is what backs the **Agents** view, and writing to it can succeed while the agent stays invisible: the view is populated by a sidecar interceptor bound to the component named exactly `agent-registry`, scoped to the App IDs declared by an `Agent` resource. An App ID outside that scope gets a successful write and no entry in the view, with no error to catch. `diagrid component list` is not evidence of scope — it renders `agent-registry` as available to all app identities either way. Confirm the agent appears in the Agents view, and check that the project has `agent-registry` at all: the `agent-*` components are not provisioned on every project.

Alternative for wrapper projects: the `diagrid` package ships a `diagridpy` CLI, and `diagridpy init <project> --framework <framework>` bootstraps a Catalyst project, a local kind cluster, a Helm chart and a framework template in one command. It needs a Catalyst account, `kind` and Helm. Mention it in the README as an alternative, not as the way to run the scaffolded project.
