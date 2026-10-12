import os

from agents import Agent, function_tool
from diagrid.agent.openai_agents import DaprWorkflowAgentRunner


@function_tool
def list_menus(guests: int, dietary: str) -> str:
    """Return catering menus that fit the guest count and dietary requirements."""
    return f"Buffet for {guests} ({dietary}): EUR 32 pp; Walking dinner: EUR 45 pp"


agent = Agent(
    name="catering",
    instructions="You propose catering. Use list_menus and return two options with price per person.",
    model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
    tools=[list_menus],
)

runner = DaprWorkflowAgentRunner(agent=agent, name="catering", max_iterations=10)

runner.serve(
    port=int(os.getenv("APP_PORT", "8002")),
    pubsub_name="agent-pubsub",
    subscribe_topic="catering.requests",
    publish_topic="catering.requests",
)
