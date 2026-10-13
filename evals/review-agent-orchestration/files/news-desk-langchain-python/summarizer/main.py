import os

from langchain_openai import ChatOpenAI
from diagrid.agent.langchain import DaprWorkflowAgentRunner

runner = DaprWorkflowAgentRunner(
    ChatOpenAI(model=os.getenv("AGENT_MODEL", "gpt-4o-mini")),
    name="summarizer",
    system_prompt="Summarize the classified story in three sentences.",
    max_iterations=8,
)

runner.serve(
    port=int(os.getenv("APP_PORT", "8002")),
    pubsub_name="agent-pubsub",
    subscribe_topic="summarizer.requests",
    publish_topic="summarizer.results",
)
