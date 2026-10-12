import os

from crewai import Agent
from diagrid.agent.crewai import DaprWorkflowAgentRunner

writer = Agent(
    role="Blog Writer",
    goal="Turn a list of facts into a 300-word blog post.",
    backstory="You write clear, friendly technical blog posts.",
    llm=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
)

runner = DaprWorkflowAgentRunner(agent=writer, name="writer")

runner.serve(port=int(os.getenv("APP_PORT", "8002")))
