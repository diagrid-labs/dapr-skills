from pydantic import BaseModel


class LoanApplication(BaseModel):
    id: str
    applicant_id: str
    amount: float
    term_months: int


class CreditCheck(BaseModel):
    applicant_id: str
    score: int


class LoanDecision(BaseModel):
    application_id: str
    status: str


class EventPayload(BaseModel):
    event_name: str
    data: dict | None = None
