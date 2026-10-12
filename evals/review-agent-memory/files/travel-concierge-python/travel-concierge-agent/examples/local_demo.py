# dev memory only: quick local demo without Dapr state, not used by main.py
from dapr_agents import DurableAgent
from dapr_agents.agents.configs import AgentMemoryConfig
from dapr_agents.llm import DaprChatClient
from dapr_agents.memory import ConversationListMemory

demo_agent = DurableAgent(
    name="TravelConciergeDemo",
    role="Travel Concierge (demo)",
    instructions=["Answer travel questions for a local demo."],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationListMemory()),
)
