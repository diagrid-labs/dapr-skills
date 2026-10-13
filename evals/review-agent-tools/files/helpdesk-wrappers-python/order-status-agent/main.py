import os

import httpx
from claude_agent_sdk import ClaudeAgentOptions, tool

from diagrid.agent.claude_agents import DaprWorkflowAgentRunner

ORDERS_URL = "https://orders.internal.example.com/api"


@tool("get_order_status", "Look up the shipping status of an order by its order id.", {"order_id": str})
async def get_order_status(args):
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(f"{ORDERS_URL}/orders/{args['order_id']}")
    response.raise_for_status()
    status = response.json()["status"]
    return {"content": [{"type": "text", "text": str(status)[:100]}]}


options = ClaudeAgentOptions(
    system_prompt="You answer questions about order shipping status.",
    model=os.getenv("AGENT_MODEL", "claude-sonnet-4-6"),
)

runner = DaprWorkflowAgentRunner(
    name="order-status-agent",
    options=options,
    tools=[get_order_status],
)
runner.serve(port=5002)
