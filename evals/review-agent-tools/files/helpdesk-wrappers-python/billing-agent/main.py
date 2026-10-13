import os

import httpx
from pydantic_ai import Agent, RunContext

from diagrid.agent.pydantic_ai import DaprWorkflowAgentRunner

BILLING_URL = "https://billing.internal.example.com/api"

agent = Agent(
    os.getenv("AGENT_MODEL", "openai:gpt-4o-mini"),
    system_prompt="You answer billing questions using the invoice tools.",
)


@agent.tool
async def get_invoice(ctx: RunContext[None], invoice_id: str) -> dict:
    """Fetch the amount and due date of an invoice by its id."""
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(f"{BILLING_URL}/invoices/{invoice_id}")
    response.raise_for_status()
    data = response.json()
    return {"amount": data["amount"], "due_date": data["due_date"]}


@agent.tool_plain
def get_refund_policy() -> str:
    """Return the current refund policy text shown to customers."""
    return "Refunds are possible within 30 days of purchase."


runner = DaprWorkflowAgentRunner(agent=agent, name="billing-agent")
runner.serve(port=5003)
