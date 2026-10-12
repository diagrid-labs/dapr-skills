from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentExecutionConfig,
    AgentMemoryConfig,
    AgentPubSubConfig,
    AgentStateConfig,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.memory import ConversationDaprStateMemory
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner

agent = DurableAgent(
    name="VenueScout",
    role="Venue Scout",
    instructions=["Search and recommend venues for parties."],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory")),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    pubsub=AgentPubSubConfig(
        pubsub_name="agent-pubsub",
        agent_topic="venue-tasks",
        broadcast_topic="agents.broadcast",
    ),
    execution=AgentExecutionConfig(max_iterations=10),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
