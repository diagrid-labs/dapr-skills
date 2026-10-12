import os

from crewai import Agent
from diagrid.agent.crewai import DaprWorkflowAgentRunner

researcher = Agent(
    role="Topic Researcher",
    goal="Collect five key facts about a topic for a blog post.",
    backstory="You research topics quickly and cite your sources.",
    llm=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
)

runner = DaprWorkflowAgentRunner(agent=researcher, name="researcher")

runner.serve(port=int(os.getenv("APP_PORT", "8001")))
