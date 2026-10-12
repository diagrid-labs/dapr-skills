import os

from crewai import Agent
from crewai.tools import tool
from diagrid.agent.crewai import DaprWorkflowAgentRunner


@tool("Competitor lookup")
def lookup_competitors(market: str) -> str:
    """Return the three largest competitors in a market segment."""
    print(f"looking up competitors for {market}")
    return f"{market}: Contoso, Fabrikam, Northwind"


analyst = Agent(
    role="Market Analyst",
    goal="Summarize the competitive landscape for a market segment in five bullet points.",
    backstory="You are a concise analyst at a B2B software company.",
    tools=[lookup_competitors],
    llm=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
)

runner = DaprWorkflowAgentRunner(agent=analyst, name="market-research", max_iterations=8)

runner.serve(port=int(os.getenv("APP_PORT", "8001")))
