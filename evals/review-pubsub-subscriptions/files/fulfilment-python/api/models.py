from pydantic import BaseModel


class OrderPlaced(BaseModel):
    order_id: str
    customer_id: str
    amount: float
