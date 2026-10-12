from pydantic import BaseModel


class TicketInput(BaseModel):
    id: str
    customer_email: str
    subject: str
    body: str


class TicketOutput(BaseModel):
    ticket_id: str
    assigned_to: str


class CrmTicketRequest(BaseModel):
    ticket_id: str
    customer_email: str
    subject: str


class CrmTicketResult(BaseModel):
    crm_case_id: str


class ArticleQuery(BaseModel):
    ticket_id: str
    subject: str


class ArticleSuggestions(BaseModel):
    article_ids: list[str]


class AssignmentRequest(BaseModel):
    ticket_id: str
    subject: str


class AssignmentResult(BaseModel):
    agent_id: str


class AckEmail(BaseModel):
    ticket_id: str
    customer_email: str
    crm_case_id: str


class AckResult(BaseModel):
    sent: bool
