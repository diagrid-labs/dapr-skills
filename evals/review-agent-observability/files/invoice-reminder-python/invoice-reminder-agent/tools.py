from dapr_agents import tool
from pydantic import BaseModel, Field

OPEN_INVOICES = {
    "ACME": [{"number": "INV-2026-104", "amount_eur": 1250.0, "days_overdue": 12}],
    "GLOBEX": [],
}


class CustomerArgs(BaseModel):
    customer: str = Field(description="Customer code, e.g. 'ACME'.")


class ReminderArgs(BaseModel):
    invoice_number: str = Field(description="Invoice number, e.g. 'INV-2026-104'.")


@tool(args_model=CustomerArgs)
def list_overdue_invoices(customer: str) -> list[dict]:
    """Return the overdue invoices for a customer code. Use before drafting a reminder."""
    invoices = OPEN_INVOICES.get(customer.upper(), [])
    print(f"found {len(invoices)} overdue invoices for {customer}")
    return invoices[:10]


@tool(args_model=ReminderArgs)
def draft_reminder(invoice_number: str) -> str:
    """Draft a polite payment reminder text for an overdue invoice. Does not send anything."""
    return f"Dear customer, our records show invoice {invoice_number} is overdue. Could you arrange payment?"
