from dapr_agents import DurableAgent
from dapr_agents.agents.configs import AgentExecutionConfig, AgentMemoryConfig
from dapr_agents.llm import DaprChatClient
from dapr_agents.memory import ConversationDaprStateMemory
from dapr_agents.workflow.runners import AgentRunner

from tools import search_flights

agent = DurableAgent(
    name="TravelConcierge",
    role="Travel Concierge",
    instructions=[
        "You help employees plan business trips.",
        "Use search_flights to find flights and keep answers short.",
    ],
    tools=[search_flights],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory")),
    execution=AgentExecutionConfig(max_iterations=10),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
