from fastapi import FastAPI, HTTPException

from app.models import Order

app = FastAPI()

orders: dict[str, Order] = {}


@app.post("/orders", status_code=201)
def create_order(order: Order) -> Order:
    orders[order.order_id] = order
    return order


@app.get("/orders/{order_id}")
def get_order(order_id: str) -> Order:
    order = orders.get(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
