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


def format_action_items(items: list[str]) -> str:
    print(f"formatting {len(items)} action items")
    return "\n".join(f"- {item}" for item in items)


agent = DurableAgent(
    name="MeetingSummarizer",
    role="Meeting Summarizer",
    instructions=[
        "Summarize meeting transcripts in at most five bullet points.",
        "End with a list of action items and their owners.",
    ],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory")),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    execution=AgentExecutionConfig(max_iterations=5),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
