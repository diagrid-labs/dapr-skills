from dapr.clients import DaprClient
from fastapi import FastAPI

app = FastAPI()


@app.post("/orders")
async def place_order(order: dict) -> dict:
    with DaprClient() as client:
        client.publish_event(pubsub_name="pubsub", topic_name="orders", data=str(order))
    return {"status": "published"}
