# Reference: review-agent-tools

Worked example of the report this skill produces.

## Sample input

Project under `/Users/x/my-agent/` with a single Python native `dapr-agents` agent. `tools.py` contains:

```python
from dapr_agents import tool
import requests


@tool
def charge_customer(customer_id: str, amount: float) -> dict:
    """Charge."""
    response = requests.post(f"https://billing/api/charge/{customer_id}", json={"amount": amount}, timeout=10)
    return response.json()


@tool
def find_invoices(customer_id, **kwargs) -> list:
    """Find a customer's invoices, filtered by any extra fields the caller passes."""
    response = requests.get(f"https://billing/api/invoices/{customer_id}", params=kwargs, timeout=10)
    return [{"id": i["id"], "total": i["total"]} for i in response.json()[:20]]
```

## Sample report

```
# Dapr review — review-agent-tools

Target: /Users/x/my-agent/my-agent-agent/tools.py
Language: python
Found: 1 critical, 4 warnings, 1 suggestion, 0 to verify

## Critical
- [DAG-TOOL-001] `my-agent-agent/tools.py:8` — charge_customer calls requests.post without an idempotency key
  Why: Tools run as at-least-once workflow activities: a crash or retry after the charge runs it again.
  Fix: Accept an LLM-supplied `idempotency_key` arg and send it as an `Idempotency-Key` header on the call.

## Warnings
- [DAG-TOOL-002] `my-agent-agent/tools.py:7` — charge_customer has a one-word docstring ("Charge.")
  Why: The LLM routes tool calls by docstring; a vague docstring silently degrades agent behaviour.
  Fix: Write a one-line sentence describing what the tool does and when to call it.
- [DAG-TOOL-003] `my-agent-agent/tools.py:9` — return response.json() has no size cap
  Why: The full message history is the input to every LLM activity and is stored in workflow state.
  Fix: Truncate, summarize, or return a reference id the agent can fetch selectively.
- [DAG-TOOL-006] `my-agent-agent/tools.py:13` — find_invoices accepts **kwargs and has no args_model
  Why: Inputs are unvalidated; malformed tool calls reach the function body.
  Fix: Define a Pydantic BaseModel with the supported filters and pass it via @tool(args_model=...).
- [DAG-TOOL-013] `my-agent-agent/tools.py:9` — charge_customer returns the billing API response body verbatim
  Why: Adversarial content in the response can override the agent's instructions on the next turn.
  Fix: Return a typed Pydantic model with only the fields the agent needs.

## Suggestions
- [DAG-TOOL-005] `my-agent-agent/tools.py:13` — find_invoices parameter customer_id is not type-hinted
  Why: The framework-generated JSON schema is weaker; arg validation degrades.
  Fix: Annotate it (`customer_id: str`) and add a `Field(description=...)` when possible.

## Next steps
- Run `review-agent-memory` next for the same scope.
- Re-run this skill after applying the DAG-TOOL-001 fix.
```

Not reported: the return-type annotations (`-> dict`, `-> list`) are not part of DAG-TOOL-005, which covers parameters only; `charge_customer` has typed parameters and no `**kwargs`, so it does not trigger DAG-TOOL-006 (native `@tool` infers its schema from the hints); `find_invoices` uses a read-only GET and caps its return, so DAG-TOOL-001 and DAG-TOOL-003 do not apply.

## Wrapper example

A `diagrid[pydantic_ai]` app in `billing-agent/main.py` (flavor `wrapper`, tool file found through the `@<agent>.tool` marker):

```python
@agent.tool
async def get_invoice(ctx: RunContext[None], invoice_id: str) -> dict:
    """Fetch the amount and due date of an invoice by its id."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{BILLING_URL}/invoices/{invoice_id}")
        response.raise_for_status()
    except Exception:
        return {"error": "unavailable"}
    return {"amount": response.json()["amount"]}
```

Report body:

```
## Warnings
- [DAG-TOOL-004] `billing-agent/main.py:23` — get_invoice swallows every exception and returns a placeholder
  Why: pydantic_ai under the wrapper already returns tool exceptions to the LLM; swallowing hides the cause.
  Fix: Let the exception propagate (catch-and-return framework); the LLM then sees the real error.
- [DAG-TOOL-016] `billing-agent/main.py:17` — get_invoice is an @agent.tool whose first parameter is RunContext
  Why: The wrapper calls the tool as function(**args) with no context, so every call fails.
  Fix: Use @agent.tool_plain and drop the RunContext parameter.
```

For a re-raise framework (langchain, smolagents, langgraph, deepagents) the DAG-TOOL-004 `Fix:` instead says to raise only transient errors and return an error value for permanent ones, because a raised exception fails the activity, is retried 3 times and then fails the workflow.

## No tool definitions in scope

When `tool_files` is empty the skill does not apply the checklist. The report carries the generic nothing-to-review line from `review-report-format.md` (no rule id, not counted in `Found:`), then `## Next steps`.

The report is deterministic: identical inputs produce byte-identical reports so consecutive runs can be diffed.
