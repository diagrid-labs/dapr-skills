from dapr_agents import DurableAgent
from dapr_agents.agents.configs import (
    AgentMemoryConfig,
    AgentPubSubConfig,
    AgentStateConfig,
)
from dapr_agents.llm import DaprChatClient
from dapr_agents.memory import ConversationDaprStateMemory
from dapr_agents.storage.daprstores.stateservice import StateStoreService
from dapr_agents.workflow.runners import AgentRunner

agent = DurableAgent(
    name="SupportInbox",
    role="Support Inbox Triage",
    instructions=[
        "You read incoming support e-mails and reply with a category and a one-line summary.",
    ],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory")),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    pubsub=AgentPubSubConfig(
        pubsub_name="agent-pubsub",
        agent_topic="support_inbox",
    ),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
