import logging
import os
from datetime import datetime, timezone

import requests

from runtime import wfr
from models import (
    AckEmail,
    AckResult,
    ArticleQuery,
    ArticleSuggestions,
    AssignmentRequest,
    AssignmentResult,
    CrmTicketRequest,
    CrmTicketResult,
)

logger = logging.getLogger(__name__)

CRM_URL = os.getenv("CRM_URL", "https://crm.example.com/api")
KB_URL = os.getenv("KB_URL", "https://kb.example.com/api")
MAIL_URL = os.getenv("MAIL_URL", "https://mail.example.com/api")

_agent_load: dict[str, int] = {}


@wfr.activity(name="create_crm_ticket_activity")
def create_crm_ticket_activity(ctx, request: CrmTicketRequest) -> CrmTicketResult:
    response = requests.post(
        f"{CRM_URL}/cases",
        json={"email": request.customer_email, "subject": request.subject},
        timeout=10,
    )
    response.raise_for_status()
    return CrmTicketResult(crm_case_id=response.json()["id"])


@wfr.activity(name="suggest_articles_activity")
async def suggest_articles_activity(ctx, query: ArticleQuery) -> ArticleSuggestions:
    response = requests.get(f"{KB_URL}/search", params={"q": query.subject}, timeout=10)
    response.raise_for_status()
    return ArticleSuggestions(article_ids=[a["id"] for a in response.json()["results"]])


@wfr.activity(name="assign_agent")
def assign_agent_activity(ctx, request: AssignmentRequest) -> AssignmentResult:
    agent_id = min(["agent-1", "agent-2", "agent-3"], key=lambda a: _agent_load.get(a, 0))
    _agent_load[agent_id] = _agent_load.get(agent_id, 0) + 1
    print(f"Assigned ticket {request.ticket_id} to {agent_id}")
    return AssignmentResult(agent_id=agent_id)


@wfr.activity(name="send_acknowledgement_activity")
def send_acknowledgement_activity(ctx, email: AckEmail) -> AckResult:
    sent_at = datetime.now(timezone.utc).isoformat()
    try:
        response = requests.post(
            f"{MAIL_URL}/send",
            json={"to": email.customer_email, "template": "ticket-ack", "case": email.crm_case_id, "sent_at": sent_at},
            headers={"Idempotency-Key": f"ack-{email.ticket_id}"},
            timeout=10,
        )
        response.raise_for_status()
    except Exception:
        pass
    return AckResult(sent=True)
