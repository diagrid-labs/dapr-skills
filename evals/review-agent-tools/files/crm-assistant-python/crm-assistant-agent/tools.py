import logging

import httpx
import requests
from dapr_agents import tool
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

CRM_BASE_URL = "https://crm.internal.example.com/api"


class CustomerArgs(BaseModel):
    customer_id: str = Field(description="CRM customer id, e.g. 'C-1042'.")


class RefundArgs(BaseModel):
    order_id: str = Field(description="Order id to refund.")
    amount: float = Field(description="Refund amount in EUR.")


class WelcomeEmailArgs(BaseModel):
    customer_id: str = Field(description="CRM customer id.")
    idempotency_key: str = Field(description="Unique key for this send; reuse it on retries.")


class PageArgs(BaseModel):
    url: str = Field(description="Address of the page the customer referenced.")


@tool(args_model=CustomerArgs)
def get_customer(customer_id: str) -> dict:
    """Look up a customer's name, tier and open ticket count by CRM id. Use before answering account questions."""
    response = httpx.get(f"{CRM_BASE_URL}/customers", params={"id": customer_id}, timeout=10)
    response.raise_for_status()
    data = response.json()
    return {"name": data["name"], "tier": data["tier"], "open_tickets": int(data["open_tickets"])}


@tool(args_model=RefundArgs)
def issue_refund(order_id: str, amount: float) -> dict:
    """Issue a refund for an order. Use only after the manager confirmed the amount."""
    response = requests.post(
        f"{CRM_BASE_URL}/refunds",
        json={"order_id": order_id, "amount": amount},
        timeout=10,
    )
    response.raise_for_status()
    return {"refund_id": response.json()["refund_id"], "status": "issued"}


@tool(args_model=WelcomeEmailArgs)
def send_welcome_email(customer_id: str, idempotency_key: str) -> dict:
    """Send the welcome email to a new customer. Safe to retry with the same idempotency_key."""
    response = requests.post(
        f"{CRM_BASE_URL}/emails/welcome",
        json={"customer_id": customer_id},
        headers={"Idempotency-Key": idempotency_key},
        timeout=10,
    )
    response.raise_for_status()
    logger.info("welcome email queued for %s", customer_id)
    return {"status": "queued"}


@tool(args_model=CustomerArgs)
def list_notes(customer_id: str) -> list[str]:
    response = httpx.get(f"{CRM_BASE_URL}/notes", params={"customer": customer_id}, timeout=10)
    response.raise_for_status()
    return [note["text"][:200] for note in response.json()["notes"][:20]]


@tool(args_model=CustomerArgs)
async def get_loyalty_points(customer_id: str) -> str:
    """Return the loyalty point balance for a customer as a string."""
    response = requests.get(f"{CRM_BASE_URL}/loyalty", params={"customer": customer_id}, timeout=10)
    try:
        response.raise_for_status()
        return str(int(response.json()["points"]))
    except Exception:
        return "unknown"


@tool(args_model=PageArgs)
def read_web_page(url: str) -> str:
    """Download a web page the customer referenced and return its first 2000 characters."""
    response = httpx.get(url, timeout=10, follow_redirects=True)
    response.raise_for_status()
    return response.text[:2000]
