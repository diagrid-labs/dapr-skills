import os

from agents import Agent, function_tool
from dapr.clients import DaprClient
from diagrid.agent.openai_agents import DaprWorkflowAgentRunner


@function_tool
def request_venues(task: str) -> str:
    """Ask the venue specialist to shortlist venues for the event."""
    with DaprClient() as client:
        client.publish_event(pubsub_name="agent-pubsub", topic_name="venue-tasks", data=task, data_content_type="text/plain")
    return "Venue request sent."


@function_tool
def request_catering(task: str) -> str:
    """Ask the catering specialist to propose menus for the event."""
    with DaprClient() as client:
        client.publish_event(pubsub_name="agent-pubsub", topic_name="catering.requests", data=task, data_content_type="text/plain")
    return "Catering request sent."


@function_tool
def request_music(task: str) -> str:
    """Ask the music specialist to book a band or DJ for the event."""
    with DaprClient() as client:
        client.publish_event(pubsub_name="agent-pubsub", topic_name="music.requests", data=task, data_content_type="text/plain")
    return "Music request sent."


agent = Agent(
    name="coordinator",
    instructions=(
        "You plan company events. Split the request into venue, catering and music tasks "
        "and hand each one to the matching specialist with the request_* tools."
    ),
    model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
    tools=[request_venues, request_catering, request_music],
)

runner = DaprWorkflowAgentRunner(agent=agent, name="coordinator", max_iterations=15)

runner.serve(
    port=int(os.getenv("APP_PORT", "8000")),
    subscribe_topic="coordinator.requests",
)
