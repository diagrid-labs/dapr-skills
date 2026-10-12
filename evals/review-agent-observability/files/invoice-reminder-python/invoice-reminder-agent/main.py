from logging_config import configure_logging

configure_logging()

from dapr_agents import DurableAgent  # noqa: E402
from dapr_agents.agents.configs import (  # noqa: E402
    AgentExecutionConfig,
    AgentMemoryConfig,
    AgentStateConfig,
)
from dapr_agents.llm import DaprChatClient  # noqa: E402
from dapr_agents.memory import ConversationDaprStateMemory  # noqa: E402
from dapr_agents.storage.daprstores.stateservice import StateStoreService  # noqa: E402
from dapr_agents.workflow.runners import AgentRunner  # noqa: E402

from tools import draft_reminder, list_overdue_invoices  # noqa: E402

agent = DurableAgent(
    name="InvoiceReminder",
    role="Accounts Receivable Assistant",
    instructions=[
        "You help the finance team chase overdue invoices.",
        "Use list_overdue_invoices first, then draft_reminder for each overdue invoice.",
    ],
    tools=[list_overdue_invoices, draft_reminder],
    llm=DaprChatClient(component_name="llm-provider"),
    memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory")),
    state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow")),
    execution=AgentExecutionConfig(max_iterations=10),
)

runner = AgentRunner()
runner.serve(agent, port=8001)
