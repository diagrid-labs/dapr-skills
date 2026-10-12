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
  Why: Dapr Workflow may retry the activity; without an idempotency key the side effect runs more than once.
  Fix: Accept an `idempotency_key` arg (or read `taskExecutionId`) and include it as a header on the outbound call.

## Warnings
- [DAG-TOOL-002] `my-agent-agent/tools.py:7` — charge_customer has a one-word docstring ("Charge.")
  Why: The LLM routes tool calls by docstring; a vague docstring silently degrades agent behaviour.
  Fix: Write a one-line sentence describing what the tool does and when to call it.
- [DAG-TOOL-003] `my-agent-agent/tools.py:9` — return response.json() has no size cap
  Why: Large returns bloat the agent context and can exhaust the LLM token budget.
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

## No tool definitions in scope

When `tool_files` is empty the skill does not apply the checklist. The report carries the generic nothing-to-review line from `review-report-format.md` (no rule id, not counted in `Found:`), then `## Next steps`.

The report is deterministic: identical inputs produce byte-identical reports so consecutive runs can be diffed.
