# Reference: review-agent-tools

Worked example of the report this skill produces.

## Sample input

Project under `/Users/x/my-agent/` with a single Python native `dapr-agents` agent. `tools.py` contains:

```python
from dapr_agents import tool
import requests

@tool
def charge_customer(customer_id: str, amount: float):
    response = requests.post(f"https://billing/api/charge/{customer_id}", json={"amount": amount})
    return response.json()
```

## Sample report

```
# Dapr review — review-agent-tools

Target: /Users/x/my-agent/my-agent-agent/tools.py
Language: python
Found: 1 critical, 3 warnings, 1 suggestion, 0 to verify

## Critical
- [DAG-TOOL-001] `my-agent-agent/tools.py:5` — charge_customer calls requests.post without an idempotency key
  Why: Dapr Workflow may retry the activity; without an idempotency key the side effect runs more than once.
  Fix: Accept an `idempotency_key` arg (or read `taskExecutionId`) and include it as a header on the outbound call.

## Warnings
- [DAG-TOOL-002] `my-agent-agent/tools.py:5` — charge_customer has no docstring
  Why: The LLM routes tool calls by docstring; a vague docstring silently degrades agent behaviour.
  Fix: Write a one-line sentence describing what the tool does and when to call it.
- [DAG-TOOL-003] `my-agent-agent/tools.py:7` — return response.json() has no size cap
  Why: Large returns bloat the agent context and can exhaust the LLM token budget.
  Fix: Truncate, summarize, or return a reference id the agent can fetch selectively.
- [DAG-TOOL-006] `my-agent-agent/tools.py:4` — charge_customer has no args_model
  Why: Inputs are unvalidated; malformed tool calls reach the function body.
  Fix: Define a Pydantic BaseModel and pass it via @tool(args_model=...).

## Suggestions
- [DAG-TOOL-005] `my-agent-agent/tools.py:4` — charge_customer is not type-hinted on the return value
  Why: The framework-generated JSON schema is weaker; arg validation degrades.
  Fix: Add a return type annotation (e.g. `-> dict`).

## Next steps
- Run `review-agent-memory` next for the same scope.
- Re-run this skill after applying the DAG-TOOL-001 fix.
```

The report is deterministic: identical inputs produce byte-identical reports so consecutive runs can be diffed.
