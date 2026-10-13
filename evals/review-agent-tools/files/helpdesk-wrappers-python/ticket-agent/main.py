import os

import httpx
from agents import Agent, function_tool
from agents.tool_context import ToolContext

from diagrid.agent.openai_agents import DaprWorkflowAgentRunner

HELPDESK_URL = "https://helpdesk.internal.example.com/api"


@function_tool
def create_ticket(subject: str, description: str) -> dict:
    """Open a new helpdesk ticket for the customer and return its id."""
    response = httpx.post(
        f"{HELPDESK_URL}/tickets",
        json={"subject": subject, "description": description},
        timeout=10,
    )
    response.raise_for_status()
    return {"ticket_id": response.json()["id"]}


@function_tool
def add_ticket_comment(ctx: ToolContext, ticket_id: str, comment: str) -> dict:
    """Add a comment to an existing helpdesk ticket."""
    response = httpx.post(
        f"{HELPDESK_URL}/tickets/{ticket_id}/comments",
        json={"comment": comment},
        headers={"Idempotency-Key": ctx.tool_call_id},
        timeout=10,
    )
    response.raise_for_status()
    return {"status": "added"}


agent = Agent(
    name="ticket_agent",
    instructions="You open and update helpdesk tickets for customers.",
    model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
    tools=[create_ticket, add_ticket_comment],
)

runner = DaprWorkflowAgentRunner(agent=agent, name="ticket-agent")
runner.serve(port=5001)
