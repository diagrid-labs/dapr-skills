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

from tools import (
    get_customer,
    get_loyalty_points,
    issue_refund,
    list_notes,
    read_web_page,
    send_welcome_email,
)

agent = DurableAgent(
    name="CrmAssistant",
    role="Customer Success Assistant",
    instructions=[
        "You help customer success managers with account questions.",
        "Look customers up with get_customer before answering.",
        "Only call issue_refund after the manager confirmed the amount.",
    ],
    tools=[
        get_customer,
        issue_refund,
        send_welcome_email,
        list_notes,
        get_loyalty_points,
        read_web_page,
    ],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory")),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    execution=AgentExecutionConfig(max_iterations=10),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
