from pydantic import BaseModel


class Invoice(BaseModel):
    invoice_id: str
    amount: float
