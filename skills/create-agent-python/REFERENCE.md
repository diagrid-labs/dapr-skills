# Reference: Dapr Agents Python Application

This reference covers every per-framework detail needed to scaffold an agent project. Structural files (`dapr.yaml`, component YAMLs, tracing, docker-compose) live in `../shared/`; this file covers what differs per framework and per topology.

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

## pyproject.toml (native `dapr-agents`)

```toml
[project]
name = "<project-name>-agent"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "dapr-agents==1.0.1",
    "fastapi==0.118.2",
    "uvicorn[standard]==0.37.0",
    "pydantic==2.12.0",
    "opentelemetry-api==1.37.0",
    "opentelemetry-sdk==1.37.0",
]
```

Drop the `opentelemetry-*` entries if observability is opt-out.

## pyproject.toml (Diagrid framework wrapper)

```toml
[project]
name = "<project-name>-agent"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "diagrid[<framework>]==0.3.0",
    "fastapi==0.135.1",
    "uvicorn[standard]==0.41.0",
]
```

Valid `<framework>` extras: `openai_agents`, `langgraph`, `crewai`, `pydantic_ai`, `adk`, `strands`, `deepagents`.

### Model selection

All framework-wrapper examples below read the model name from `AGENT_MODEL` with a sensible default, so operators can swap providers / model versions without code edits:

```python
import os
# in the agent constructor
model=os.getenv("AGENT_MODEL", "gpt-4o-mini")
```

For the native `dapr-agents` path, model selection happens in the `llm-provider.yaml` component — not in Python source — so this pattern does not apply there.

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

See [`../shared/agent-tools-python.md`](../shared/agent-tools-python.md) for the canonical `@tool` pattern. Framework-specific tool imports:

| Framework     | Tool decorator / factory                                  |
| ------------- | --------------------------------------------------------- |
| `dapr-agents` | `from dapr_agents import tool`                            |
| `openai-agents` | `from agents import function_tool`                      |
| `langgraph`   | `from langchain_core.tools import tool`                   |
| `crewai`      | `from crewai.tools import tool`                           |
| `pydantic-ai` | `from pydantic_ai import Tool` (use via `tools=[...]` arg)|
| `adk`         | `from google.adk.agents import FunctionTool`              |
| `strands`     | `from strands.tools import tool`                          |
| `deepagents`  | `from deepagents import tool`                             |

## main.py — native `dapr-agents` (augmented-llm pattern)

```python
from dapr_agents import DurableAgent
from dapr_agents.agents.configs import AgentMemoryConfig, AgentStateConfig
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
)

runner = AgentRunner()
runner.serve(agent, port=8001)
```

### Key points

- `DurableAgent` runs on top of Dapr Workflow; every `runner.serve(...)` call spins up a FastAPI server that exposes `POST /agent/run` and `GET /agent/instances/{id}`.
- `DaprChatClient(component_name="llm-provider")` routes LLM calls through the Dapr Conversation building block. Swap the provider by swapping `llm-provider.yaml` (OpenAI, Anthropic, Ollama).
- `ConversationDaprStateMemory(store_name="agent-memory")` persists conversation history. Without it, each request starts with an empty context.
- `StateStoreService(store_name="agent-workflow")` holds workflow execution state. The component it references must have `actorStateStore: "true"`.

## main.py — framework wrappers

### openai-agents

```python
import os
from agents import Agent, function_tool
from diagrid import DaprWorkflowAgentRunner


@function_tool
def get_weather(location: str) -> str:
    """Return the current weather for a city."""
    return f"{location}: 18°C, partly cloudy"


agent = Agent(
    name="WeatherAgent",
    instructions="Help users with weather. Use get_weather for lookups.",
    tools=[get_weather],
    model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
)

runner = DaprWorkflowAgentRunner(
    agent=agent,
    agent_name="weather",
    agent_role="Weather Assistant",
    agent_goal="Answer user questions about current weather.",
    max_iterations=10,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="weather.requests",
    publish_topic="weather.results",
)
```

### langgraph

```python
import os
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent
from diagrid import DaprWorkflowGraphRunner


@tool
def get_weather(location: str) -> str:
    """Return the current weather for a city."""
    return f"{location}: 18°C, partly cloudy"


graph = create_react_agent(model="openai:gpt-4o-mini", tools=[get_weather])

runner = DaprWorkflowGraphRunner(
    graph=graph,
    agent_name="weather",
    agent_role="Weather Assistant",
    agent_goal="Answer user questions about current weather.",
    max_iterations=10,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="weather.requests",
    publish_topic="weather.results",
)
```

### crewai

```python
import os
from crewai import Agent, Crew, Task
from crewai.tools import tool
from diagrid import DaprWorkflowAgentRunner


@tool("get_weather")
def get_weather(location: str) -> str:
    """Return the current weather for a city."""
    return f"{location}: 18°C, partly cloudy"


agent = Agent(
    role="Weather Assistant",
    goal="Answer weather questions accurately.",
    backstory="You are a friendly weather helper.",
    tools=[get_weather],
)
crew = Crew(agents=[agent], tasks=[
    Task(description="{task}", expected_output="A short weather summary.", agent=agent),
])

runner = DaprWorkflowAgentRunner(
    agent=crew,
    agent_name="weather",
    agent_role="Weather Assistant",
    agent_goal="Answer user questions about current weather.",
    max_iterations=10,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="weather.requests",
    publish_topic="weather.results",
)
```

### pydantic-ai

```python
import os
from pydantic_ai import Agent
from diagrid import DaprWorkflowAgentRunner


agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt="Answer weather questions using the get_weather tool.",
)


@agent.tool_plain
def get_weather(location: str) -> str:
    """Return the current weather for a city."""
    return f"{location}: 18°C, partly cloudy"


runner = DaprWorkflowAgentRunner(
    agent=agent,
    agent_name="weather",
    agent_role="Weather Assistant",
    agent_goal="Answer user questions about current weather.",
    max_iterations=10,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="weather.requests",
    publish_topic="weather.results",
)
```

### adk (Google Agent Development Kit)

```python
import os
from google.adk.agents import LlmAgent, FunctionTool
from diagrid import DaprWorkflowAgentRunner


def get_weather(location: str) -> str:
    """Return the current weather for a city."""
    return f"{location}: 18°C, partly cloudy"


agent = LlmAgent(
    name="weather",
    model="gemini-2.0-flash",
    instruction="Answer weather questions using the get_weather tool.",
    tools=[FunctionTool(get_weather)],
)

runner = DaprWorkflowAgentRunner(
    agent=agent,
    agent_name="weather",
    agent_role="Weather Assistant",
    agent_goal="Answer user questions about current weather.",
    max_iterations=10,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="weather.requests",
    publish_topic="weather.results",
)
```

### strands

```python
import os
from strands import Agent
from strands.tools import tool
from diagrid import DaprWorkflowAgentRunner


@tool
def get_weather(location: str) -> str:
    """Return the current weather for a city."""
    return f"{location}: 18°C, partly cloudy"


agent = Agent(
    model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
    tools=[get_weather],
    system_prompt="Answer weather questions using the get_weather tool.",
)

runner = DaprWorkflowAgentRunner(
    agent=agent,
    agent_name="weather",
    agent_role="Weather Assistant",
    agent_goal="Answer user questions about current weather.",
    max_iterations=10,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="weather.requests",
    publish_topic="weather.results",
)
```

### deepagents

```python
import os
from deepagents import create_deep_agent, tool
from diagrid import DaprWorkflowAgentRunner


@tool
def get_weather(location: str) -> str:
    """Return the current weather for a city."""
    return f"{location}: 18°C, partly cloudy"


agent = create_deep_agent(
    tools=[get_weather],
    instructions="Answer weather questions using the get_weather tool.",
    model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
)

runner = DaprWorkflowAgentRunner(
    agent=agent,
    agent_name="weather",
    agent_role="Weather Assistant",
    agent_goal="Answer user questions about current weather.",
    max_iterations=10,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="weather.requests",
    publish_topic="weather.results",
)
```

## Multi-agent orchestration (native `dapr-agents`)

For a coordinator + specialists setup, put each agent in its own subfolder with its own `main.py` and `pyproject.toml`. Each specialist serves on a distinct port and subscribes to its own `<domain>.requests` topic.

### coordinator/main.py

```python
from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentMemoryConfig, AgentPubSubConfig, AgentRegistryConfig, AgentStateConfig,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.memory import ConversationDaprStateMemory
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner, OrchestrationMode


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
    pubsub=AgentPubSubConfig(pubsub_name="agent-pubsub", broadcast_topic="agents.broadcast"),
)

runner = AgentRunner(mode=OrchestrationMode.AGENT)
runner.serve(agent, port=8000, pubsub_name="agent-pubsub", agent_topic="coordinator.requests")
```

### <specialist>/main.py (native pattern)

```python
from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentMemoryConfig, AgentPubSubConfig, AgentRegistryConfig, AgentStateConfig,
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
    pubsub=AgentPubSubConfig(pubsub_name="agent-pubsub", broadcast_topic="agents.broadcast"),
)

runner = AgentRunner()
runner.serve(
    agent,
    port=8001,
    pubsub_name="agent-pubsub",
    agent_topic="venue.requests",
)
```

### Key points — multi-agent

- **Topic convention**: every specialist subscribes to `<domain>.requests` and publishes to `<domain>.results`. The coordinator publishes to each specialist's request topic.
- **Broadcast topic**: `agents.broadcast` is used by specialists to announce availability; the coordinator listens to it to populate `agent-registry` automatically.
- **Registry**: the `agent-registry` component allows the coordinator to discover specialists at runtime rather than hard-coding them.
- `OrchestrationMode.AGENT` tells the runner to use the agent's LLM to plan and dispatch tasks (rather than following a fixed workflow graph).

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

For framework wrappers, the endpoint is `/run` instead of `/agent/run`.

## Observability (native only)

When observability is enabled, the scaffold wires the Dapr tracing Configuration and the local compose stack. In `main.py`, call `configure_logging()` from `logging_config.py` before any `dapr_agents` import, and use `logging.getLogger(__name__)` inside tools rather than `print`.

### Observability files produced

- `resources/tracing.yaml` — see [`../shared/agent-tracing-zipkin.md`](../shared/agent-tracing-zipkin.md)
- `docker-compose.observability.yaml` — see [`../shared/agent-observability-stack.md`](../shared/agent-observability-stack.md)
- `logging_config.py` — see [`../shared/agent-logging-python.md`](../shared/agent-logging-python.md)
- `observability/prometheus.yml` + `observability/grafana-datasources.yaml` + `observability/dashboards/dapr-agents.json` — see [`../shared/agent-metrics-prometheus.md`](../shared/agent-metrics-prometheus.md)

### What users get at runtime

- Zipkin UI at `http://localhost:9411` — trace for every agent run, threaded under the root workflow span
- Grafana at `http://localhost:3000` — pre-seeded dashboard covering workflow throughput, LLM request rate, and activity latency
- Prometheus at `http://localhost:9099` — raw metrics (ad-hoc queries)
- Diagrid Dev Dashboard at `http://localhost:8080` — Dapr-native workflow inspector

## Running locally

See [`../shared/running-locally-dapr.md`](../shared/running-locally-dapr.md).

## Running with Diagrid Catalyst

See [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md).
