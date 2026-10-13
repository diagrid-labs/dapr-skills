import os

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from diagrid.agent.langchain import DaprWorkflowAgentRunner


@tool
def classify_story(headline: str) -> str:
    """Classify a news headline as politics, business, sport or other."""
    return "business" if "market" in headline.lower() else "other"


runner = DaprWorkflowAgentRunner(
    ChatOpenAI(model=os.getenv("AGENT_MODEL", "gpt-4o-mini")),
    [classify_story],
    name="intake",
    system_prompt="Classify each incoming story and pass it on with its category.",
    max_iterations=10,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8001")),
    pubsub_name="agent-pubsub",
    subscribe_topic="intake.requests",
    publish_topic="summarizer.requests",
)
