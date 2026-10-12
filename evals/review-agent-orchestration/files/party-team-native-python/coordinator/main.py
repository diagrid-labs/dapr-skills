from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentExecutionConfig,
    AgentPubSubConfig,
    AgentStateConfig,
    OrchestrationMode,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner

agent = DurableAgent(
    name="PartyCoordinator",
    role="Party Planning Coordinator",
    instructions=[
        "You coordinate the venue and catering specialists to plan a party.",
        "Delegate each subtask to the specialist most suited to it.",
    ],
    llm=DaprChatClient(component_name="llm-provider"),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    pubsub=AgentPubSubConfig(
        pubsub_name="agent-pubsub",
        agent_topic="agents.broadcast",
        broadcast_topic="agents.broadcast",
    ),
    execution=AgentExecutionConfig(
        orchestration_mode=OrchestrationMode.AGENT,
    ),
)

runner = AgentRunner()
runner.serve(agent, port=8000)
