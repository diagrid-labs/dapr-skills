import os

from agents import Agent, function_tool
from diagrid.agent.openai_agents import DaprWorkflowAgentRunner


@function_tool
def search_venues(city: str, guests: int) -> str:
    """Return up to three venues in a city that fit the number of guests."""
    return f"{city}: Harbour Loft (cap. {guests + 20}), Old Mill (cap. {guests + 50})"


agent = Agent(
    name="venue",
    instructions="You shortlist event venues. Use search_venues and return at most three options with capacity.",
    model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
    tools=[search_venues],
)

runner = DaprWorkflowAgentRunner(agent=agent, name="venue")

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="venue-tasks",
    publish_topic="venue.results",
)
