from agents import Agent, function_tool
from diagrid.agent.openai_agents import DaprWorkflowAgentRunner
from diagrid.agent.openai_agents.state import DaprMemoryStore


@function_tool
def lookup_order(order_id: str) -> str:
    """Return the shipping status of an order. Use when the customer asks where their order is."""
    return f"Order {order_id} shipped on 2026-10-01."


agent = Agent(
    name="support_agent",
    instructions="You answer customer questions about their orders. Remember what the customer told you earlier.",
    model="gpt-4o-mini",
    tools=[lookup_order],
)

# Keep the conversation between /agent/run calls so returning customers don't repeat themselves.
memory = DaprMemoryStore()

runner = DaprWorkflowAgentRunner(agent=agent, name="support-agent")
runner.serve(port=5001)
