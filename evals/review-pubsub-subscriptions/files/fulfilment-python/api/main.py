import logging

import requests
import uvicorn
from dapr.ext.fastapi import DaprApp
from fastapi import Body, FastAPI, HTTPException

from models import OrderPlaced

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")

app = FastAPI()
dapr_app = DaprApp(app)


@dapr_app.subscribe(pubsub="pubsub", topic="orders", route="/events/pubsub/orders",
                    dead_letter_topic="orders-deadletter")
def handle_orders(order: OrderPlaced) -> dict:  # SEED DPS-SUB-002
    if order.customer_id == "unknown":
        raise HTTPException(status_code=404)  # SEED DPS-SUB-004
    try:
        requests.post("http://billing:8080/charge", json={"order_id": order.order_id, "amount": order.amount})  # SEED DPS-SUB-006
    except Exception:
        return {"status": "SUCCESS"}  # SEED DPS-SUB-005
    return {"status": "FAIL"}  # SEED DPS-SUB-007


@dapr_app.subscribe(pubsub="pubsub", topic="orders-deadletter", route="/events/pubsub/orders-deadletter")
def handle_orders_dead_letter(event: dict = Body(...)) -> dict:
    logger.error("Dead-lettered order event %s", event.get("id"))
    return {"status": "SUCCESS"}


@dapr_app.subscribe(pubsub="pubsub", topic="refunds", route="/events/pubsub/refunds")
def handle_refunds(event: dict = Body(...)) -> dict:
    data = event.get("data") or {}
    if not data.get("refund_id"):
        return {"status": "RETRY"}  # SEED DPS-SUB-008
    return {"status": "SUCCESS"}


@app.post("/events/pubsub/payments")
def handle_payments(event: dict = Body(...)) -> dict:
    logger.info("Payment event %s received", event.get("id"))
    return {"status": "SUCCESS"}


@app.post("/orders/replay")
def replay_order() -> dict:
    handle_orders({})  # SEED DPS-SUB-011
    return {"status": "replayed"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8011)
